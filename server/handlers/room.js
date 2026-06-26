// ============================================================
// HANDLERS - Room lifecycle (create/join/reconnect/leave/restart)
// ============================================================

const engine = require('../gameEngine');
const {
  rooms,
  getRoom,
  saveRoom,
  hostDisconnectTimers,
  playerDisconnectTimers,
  dcKey,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
  _clearSpinPendingTimer,
  _clearGameOverTimer,
  _clearRedemptionTimer,
  _clearBloodDebtTimer,
  _clearPactVolunteerTimer,
  _clearSpeedModeTimer,
  _clearIdleTurnTimer,
  _clearBotTimer,
  _clearTutorialTimer,
  logRoomDeletion,
} = require('../lib/state');
const { socketRateLimit } = require('../lib/rateLimiter');
const { broadcastRoomState, emitHostChanged } = require('../lib/broadcast');
const {
  buildAdHocRoom,
  buildPersistentGroupRoom,
  maybeRecordGroupWinner,
  stampCosmeticsInBackground,
} = require('../lib/roomBuilders');
const { resolveLeaverPendingPauses } = require('../lib/orchestration');
const { discardLobbyIdleState } = require('../lib/idleSweep');
const { rollBotCallRate } = require('../engine/botStrategy');
const { seatedElsewhere } = require('../lib/sessions');
const { tierMismatchMessage } = require('../groupsRepo');

// Defense-in-depth for the single-device policy: an account already seated at
// a table via a different live socket can never create or join a second seat.
// Near-unreachable once the authenticate gate is in place (one socket per
// account), but it directly encodes the owner's "one account, one table" ask
// and survives any future auth-path regression. Guests have a per-browser id
// and no account to contest, so they're exempt.
const SEATED_ELSEWHERE_MSG =
  'This account is already at a table on another device. Finish that game first.';

function register(io, socket, deps) {
  const { groupsRepo, groupSettingsRepo, leaderboardRepo } = deps;

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', async ({ mode, config } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });
    if (!socketRateLimit(socket, 'create_room', 5, 60_000).allowed) {
      return callback({ success: false, error: 'Rate limit exceeded' });
    }
    if (!socket.isGuest && seatedElsewhere(io, rooms, socket.userId, socket.id)) {
      return callback({ success: false, error: SEATED_ELSEWHERE_MSG });
    }

    try {
      const roomMode = mode === engine.MODES.ONLINE ? engine.MODES.ONLINE : engine.MODES.PHYSICAL;

      // ─── Tier gate (Progression & Covenant overhaul) ─────────
      // The host's tier (derived from their level) decides which mechanics the
      // room may use. Room creation is the SOLE gating point: the requested
      // config is capped here and can't be re-escalated at runtime. Guests are
      // always level 1 → Streets, so no DB fetch is needed for them.
      let tier = 'streets';
      if (!socket.isGuest && typeof leaderboardRepo?.getLevel === 'function') {
        try {
          tier = engine.tierForLevel(await leaderboardRepo.getLevel(socket.userId));
        } catch (err) {
          console.error('[Room] tier lookup failed, defaulting to streets', err);
        }
      }
      const requestedConfig = engine.normalizeRoomConfig(config || engine.defaultRoomConfig());
      const cappedConfig = engine.applyTierCapsToConfig(requestedConfig, tier);
      const capsApplied = JSON.stringify(cappedConfig) !== JSON.stringify(requestedConfig);

      const room = await buildAdHocRoom(socket, roomMode, cappedConfig, groupsRepo);
      room.hostUserId = socket.userId;
      engine.applyTierFlags(room, tier);
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      room.powerActivatedThisTurn = false;
      await saveRoom(room);

      socket.join(room.code);
      console.log(`[Room ${room.code}] Created by ${socket.username} (mode: ${roomMode}, tier: ${tier})`);

      if (roomMode === engine.MODES.ONLINE) {
        const player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        // #205 - dress the seat with the player's equipped cosmetics
        // (non-blocking; pops in on the follow-up broadcast).
        stampCosmeticsInBackground(io, leaderboardRepo, room.code, player);
        await saveRoom(room);
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode, playerId: socket.userId, tier, capsApplied });
      } else {
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode, tier, capsApplied });
      }

      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── Tutorial / Practice: solo room vs. a bot ────────────
  // A frictionless single-human online room seeded with a practice bot. No code
  // to share, no second player to wait for - the human lands in the lobby as host
  // with the bot already seated, presses Start, and the bot autoplays via the
  // server-side bot driver (lib/bots.js). Powers / modifiers / systems are all
  // OFF (the all-false defaultRoomConfig), and at 2 players no secret roles are
  // assigned, so the room teaches the clean core loop. Works for guests too.
  socket.on('create_tutorial_room', async ({ lesson, sandbox } = {}, callback) => {
    if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
    if (!socketRateLimit(socket, 'create_tutorial_room', 5, 60_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }

    try {
      // Lesson → house rules. 'basics' is the all-off core loop (null config →
      // normalizeRoomConfig fills the all-off defaults). 'powers' seeds two
      // beginner-friendly power cards - Peek (see the last card) and Shield (block
      // a bluff) - so the player learns to hold, activate, and defend with one.
      // startGame guarantees each seat at least one power card. Roles/modifiers
      // stay off (secret roles need 3+ seats AND bot prompt-handling - deferred).
      const isSandbox = sandbox === true;
      const chosenLesson = lesson === 'powers' ? 'powers' : 'basics';
      let config = null;
      if (!isSandbox && chosenLesson === 'powers') {
        config = engine.defaultRoomConfig();
        config.powerCards.enabled.peek = true;
        config.powerCards.enabled.shield = true;
      }
      // (Module 5) Sandbox = unguided free play vs the bot. Powers now default ON:
      // the practice bot holds / activates / defends with power cards in free play
      // (engine/botStrategy.js + lib/bots.js), so a powers-on game plays to
      // completion without stalling. The local-host learner can still toggle any
      // power off in the lobby (PreGameSettingsPanel). Risk/Room/Systems stay off.
      if (isSandbox) {
        config = engine.defaultRoomConfig();
        for (const k of Object.keys(config.powerCards.enabled)) {
          config.powerCards.enabled[k] = true;
        }
      }

      const room = await buildAdHocRoom(socket, engine.MODES.ONLINE, config, groupsRepo);
      room.isTutorial = true;
      room.tutorialLesson = chosenLesson;
      // (Module 5) Sandbox is uncoached - the client suppresses every guide overlay
      // (the existing `coachingOff` path in TutorialLayer).
      if (isSandbox) { room.tutorialCoaching = false; room.sandbox = true; }
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      room.powerActivatedThisTurn = false;
      // Tutorial "≥2 bluff calls per game" guarantee counter (botStrategy).
      room.botBluffCallsThisGame = 0;

      // Seat the human as a normal player - NOT the host. A newbie shouldn't hold
      // the room controls; the bot "hosts" the table and the server drives it.
      const human = engine.createPlayer(socket.userId, socket.username, socket.id);
      room.players.push(human);
      // #205 - even a practice table shows your own felt/card back.
      stampCosmeticsInBackground(io, leaderboardRepo, room.code, human);

      // Seat the practice bot. The id is namespaced so it can never collide with
      // a Supabase user id or a guest id; socketId is null (it never connects).
      const bot = engine.createPlayer('bot:1', 'Dealer Bot', null);
      bot.isBot = true;
      room.players.push(bot);

      // Bot is host-of-record. It has no socket, so hostSocketId is null - which
      // makes the human's `amHost` false in serializeRoom (host controls hidden)
      // and routes every host-gated event away from the human. The learner can
      // still start the game via the tutorial bypass in `start_game`, and the
      // human dropping is torn down by the tutorial paths in leave_room/disconnect.
      if (isSandbox) {
        // (Module 5) Local host privileges: the learner owns config + Start in the
        // sandbox (so they can toggle power cards into the deck).
        room.hostUserId = socket.userId;
        room.hostSocketId = socket.id;
      } else {
        room.hostUserId = bot.id;
        room.hostSocketId = null;
      }

      await saveRoom(room);
      socket.join(room.code);
      console.log(`[Room ${room.code}] ${isSandbox ? 'Sandbox' : `Tutorial (${chosenLesson})`} created by ${socket.username} (vs Dealer Bot)`);

      callback?.({
        success: true,
        roomCode: room.code,
        isHost: isSandbox, // sandbox: the human is local host; basics/powers: the bot hosts
        mode: engine.MODES.ONLINE,
        playerId: socket.userId,
        isTutorial: true,
        lesson: chosenLesson,
        sandbox: isSandbox,
      });

      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Join an existing room ──────────────────────
  socket.on('join_room', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });
    if (!socketRateLimit(socket, 'join_room', 10, 60_000).allowed) {
      return callback({ success: false, error: 'Rate limit exceeded' });
    }

    try {
      const code = roomCode?.toUpperCase();
      if (!code) return callback({ success: false, error: 'Room not found' });

      // Defense-in-depth: refuse if this account is already seated at a
      // DIFFERENT table via a live socket (the target room is excluded so a
      // same-device rejoin is never blocked). Guests exempt.
      if (!socket.isGuest && seatedElsewhere(io, rooms, socket.userId, socket.id, code)) {
        return callback({ success: false, error: SEATED_ELSEWHERE_MSG });
      }

      let room = await getRoom(code);
      const group = await groupsRepo.getActiveGroupByCode(code);

      if (group) {
        if (!room) {
          const settingsRecord = await groupSettingsRepo.getGroupSettings(group.id);
          const hostSocketId = group.host_user_id === socket.userId ? socket.id : null;
          room = buildPersistentGroupRoom(group, {
            hostSocketId,
            settingsRecord,
            defaultSettings: groupSettingsRepo.DEFAULT_SETTINGS,
          });
          await saveRoom(room);
        }
        room.groupId = group.id;
        room.hostUserId = group.host_user_id;
        // hostSocketId is reconciled from hostUserId AFTER the join below, so it
        // can never diverge from the host-of-record. (Setting it only for the
        // joining host left it pointing at the OLD stand-in's socket whenever a
        // non-host member refreshed after a reclaim/hand-back - server-side host
        // gates use hostSocketId while the client's amHost uses hostUserId, so a
        // split between them broke host controls for both players.)

        const allowed = await groupsRepo.isGroupMember(group.id, socket.userId);
        if (!allowed) {
          return callback({ success: false, error: 'not_a_group_member' });
        }

        // Phase 6 (G3) - tier entry gate. A group is bound to one tier; a
        // member promoted ABOVE it (XP only rises) is blocked on entry until
        // the owner re-tiers the group or hands over - block-on-entry avoids
        // surprise removals. Guests never reach group rooms. Default Streets on
        // any lookup failure so a flaky read can't silently open a higher tier.
        const requiredTier = group.required_tier || 'streets';
        let joinerTier = 'streets';
        try {
          joinerTier = engine.tierForLevel(await leaderboardRepo.getLevel(socket.userId));
        } catch (err) {
          console.error('[Room] join tier lookup failed, defaulting to streets', err);
        }
        if (joinerTier !== requiredTier) {
          return callback({
            success: false,
            error: tierMismatchMessage(requiredTier, joinerTier),
            code: 'tier_mismatch',
          });
        }
      } else if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.phase !== 'lobby') return callback({ success: false, error: 'Game already started' });

      let player = room.players.find(p => p.id === socket.userId);
      if (!player && room.players.length >= engine.MAX_PLAYERS) {
        return callback({ success: false, error: 'Room is full' });
      }
      if (player) {
        engine.reconnectPlayer(room, player.id, socket.id);
        console.log(`[Room ${code}] Reconnected: ${player.username}`);
      } else {
        const nameTaken = room.players.some(
          p => p.username.toLowerCase() === socket.username.toLowerCase()
        );
        if (nameTaken) {
          return callback({ success: false, error: 'That name is already taken in this room.' });
        }
        player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        // #205 - dress the seat with the player's equipped cosmetics
        // (non-blocking; pops in on the follow-up broadcast).
        stampCosmeticsInBackground(io, leaderboardRepo, code, player);
        console.log(`[Room ${code}] Joined: ${player.username}`);
      }

      // Reconcile the host socket with the host-of-record now that every
      // player's socketId is current. For a group room this catches up a
      // reclaim/hand-back that changed the DB host while the new host was away
      // (hostSocketId → their live socket, or null until they (re)join), and
      // guarantees hostUserId and hostSocketId never point at different people.
      if (room.groupId) engine.reconcileHostSocket(room);

      await saveRoom(room);
      socket.join(code);
      if (room.groupId) socket.join(`group:${room.groupId}`);
      callback({
        success: true,
        playerId: player.id,
        roomCode: code,
        mode: room.mode,
        isHost: room.hostUserId === socket.userId,
      });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Reconnect after refresh ──────────────────────
  socket.on('host_reconnect', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Only the original host may reseize the host seat.
      if (room.hostUserId && room.hostUserId !== socket.userId) {
        return callback({ success: false, error: 'Not the host of this room' });
      }

      // Was a teardown actually pending? Only then did the room see the host
      // drop (and get the `host_disconnecting` countdown), so only then should
      // the return be announced - this also avoids a duplicate toast if
      // host_reconnect fires twice for one reconnect.
      const wasDisconnected = hostDisconnectTimers.has(code);
      if (wasDisconnected) {
        clearTimeout(hostDisconnectTimers.get(code));
        hostDisconnectTimers.delete(code);
        console.log(`[Socket] host of ${code} reconnected within grace - teardown cancelled`);
      }

      room.hostSocketId = socket.id;
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, isHost: true, mode: room.mode });
      await broadcastRoomState(io, code);

      // #183 - pair the `host_disconnecting` countdown with a "host is back"
      // toast so the table learns the original host reclaimed controls. The
      // host may not be seated as a player (physical mode), so fall back to the
      // authenticated socket username.
      if (wasDisconnected) {
        const hostPlayer = room.players.find(p => p.id === socket.userId);
        emitHostChanged(io, code, {
          hostId: socket.userId,
          hostName: hostPlayer?.username || socket.username,
          reason: 'reclaimed',
        });
      }
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Reconnect mid-game ──────────────────────────
  socket.on('player_reconnect', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const player = room.players.find(p => p.id === socket.userId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const key = dcKey(code, socket.userId);
      if (playerDisconnectTimers.has(key)) {
        clearTimeout(playerDisconnectTimers.get(key));
        playerDisconnectTimers.delete(key);
        console.log(`[Socket] player ${socket.userId} reconnected to ${code} within grace - elimination cancelled`);
      }

      engine.reconnectPlayer(room, socket.userId, socket.id);
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── Re-pull authoritative state (#empty-hand recovery, §3.4) ──────────
  // A client whose deal/state packet was dropped (initial setup race or a
  // reconnect that landed before the broadcast) can ask for a fresh push. We
  // re-serialise for THIS socket only - so `myHand` is included - without
  // disturbing anyone else. Safe to call any time; it never mutates state.
  socket.on('request_room_state', async ({ roomCode } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const player = room.players.find(p => p.socketId === socket.id);
      const playerId = player ? player.id : null;
      const view = room.mode === engine.MODES.ONLINE
        ? engine.serializeRoom(room, playerId, {})
        : engine.serializeRoom(room);
      socket.emit('room_state', view);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── HOST: Update lobby config (#66) ──────────────────────
  socket.on('update_room_config', async ({ roomCode, config } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback?.({ success: false, error: 'Not the host' });
      if (room.phase !== 'lobby') return callback?.({ success: false, error: 'Game already started' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });

      // Re-cap on every config change so a host can't escalate past their tier
      // after creation (room.tier is fixed at create time).
      room.config = engine.applyTierCapsToConfig(config, engine.getRoomTier(room));
      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[update_room_config]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Intentional leave ───────────────────────────────────
  // §2.2 - accepts an optional ack callback so the SAME centralized cleanup is
  // used by every leave entry point (the in-game "Leave Room" buttons and the
  // lobby "Leave Game" button) and the client can confirm teardown finished.
  // The client never blocks on this ack (§2.3 fail-safe) - it's purely
  // confirmatory - but it lets a present client know the server cleaned up.
  socket.on('leave_room', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: true, alreadyGone: true });

      if (playerId) {
        const key = dcKey(code, playerId);
        if (playerDisconnectTimers.has(key)) {
          clearTimeout(playerDisconnectTimers.get(key));
          playerDisconnectTimers.delete(key);
        }
      }

      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx === -1) return callback?.({ success: true, notInRoom: true });

      const player = room.players[idx];
      const wasHost = room.hostUserId === playerId;
      const isMidGame = !['lobby', 'game_over'].includes(room.phase);

      // ─── Tutorial / Practice: leaving ends the whole session ──────────────
      // A practice room is single-human (host) + a bot. When the human leaves the
      // table the session is over: destroy the room outright rather than running
      // the normal mid-game elimination + host migration (which would otherwise
      // hand the host seat to the bot and leave a ghost room running).
      if (room.isTutorial) {
        _clearBettingTimer(code);
        _clearGhostVoteTimer(code);
        _clearPreGameTimer(code);
        _clearSpinPendingTimer(code);
        _clearGameOverTimer(code);
        _clearRedemptionTimer(code);
        _clearBloodDebtTimer(code);
        _clearPactVolunteerTimer(code);
        _clearSpeedModeTimer(code);
        _clearIdleTurnTimer(code);
        _clearBotTimer(code);
        _clearTutorialTimer(code);
        discardLobbyIdleState(code);
        socket.leave(code);
        logRoomDeletion(code, 'tutorial_left', { phase: room.phase });
        rooms.delete(code);
        console.log(`[Room ${code}] tutorial - ${player.username} left the table, room destroyed.`);
        return callback?.({ success: true, roomClosed: true });
      }

      if (isMidGame) {
        resolveLeaverPendingPauses(io, code, room, playerId);
        if (player.status !== 'eliminated') {
          player.status = 'eliminated';
          player.isSpectator = true;
          engine.eliminateFromTurnOrder(room, playerId);
        }
        room.lastAction = {
          type: 'left_game',
          playerId: player.id,
          playerName: player.username,
        };
        console.log(`[Room ${code}] ${player.username} forfeited mid-game`);

        // §2.2 - in a 2-player game this leaves a single survivor, who wins by
        // default (checkGameOver) AND inherits the host seat below.
        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.phase = 'game_over';
          room.lastAction = engine.buildGameOverLastAction(gameOverWinner);
          engine.markDualWinners(room, gameOverWinner);
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
        }
      } else {
        // Lobby or game_over: clean removal.
        room.players.splice(idx, 1);
        engine.eliminateFromTurnOrder(room, playerId);
        console.log(`[Room ${code}] ${player.username} left (${room.phase})`);
      }

      // ─── §2.2 Host migration ──────────────────────────────
      // If the acting host left while anyone is still seated, hand the in-room
      // host seat to a random remaining alive player (>2 players), or to the
      // lone survivor (2-player → they're also the winner). Persistent group
      // rooms keep the DB owner as canonical host: when the original owner
      // rejoins, join_room re-stamps room.hostUserId from group.host_user_id,
      // so this stand-in seat hands back automatically.
      if (wasHost) {
        const replacement = engine.pickReplacementHost(room, playerId);
        if (replacement) {
          room.hostUserId = replacement.id;
          room.hostSocketId = replacement.socketId || null;
          io.to(code).emit('host_migrated', {
            newHostId: replacement.id,
            newHostName: replacement.username,
          });
          console.log(`[Room ${code}] host migrated to ${replacement.username}`);
        }
      }

      socket.leave(code);

      // ─── §2.3 Ghosting teardown ───────────────────────────
      // If nobody is left to play (lobby emptied, or every player has left /
      // been eliminated), tear the in-memory room down so it can't hang in a
      // "game started" state that blocks rejoin. Ad-hoc rooms are destroyed
      // outright; persistent group rooms are dropped from memory so the next
      // join rebuilds a clean lobby from the DB-backed group - preserving the
      // group's settings and leaderboard, which live in the database, not here.
      const noOneLeft = room.players.length === 0
        || !room.players.some(p => p.status === 'alive');
      if (noOneLeft) {
        _clearBettingTimer(code);
        _clearGhostVoteTimer(code);
        _clearPreGameTimer(code);
        _clearSpinPendingTimer(code);
        _clearGameOverTimer(code);
        _clearRedemptionTimer(code);
        _clearBloodDebtTimer(code);
        _clearPactVolunteerTimer(code);
        _clearSpeedModeTimer(code);
        _clearIdleTurnTimer(code);
        discardLobbyIdleState(code);
        logRoomDeletion(code, 'last_participant_left', {
          phase: room.phase,
          groupId: room.groupId || undefined,
          rebuildable: !!room.groupId,
        });
        // §3.3 - the live room is gone; clear the directory's occupancy badge.
        if (room.groupId) {
          io.to(`group:${room.groupId}`).emit('group_room_status', {
            groupId: room.groupId,
            code,
            playerCount: 0,
            phase: 'closed',
            inLobby: false,
            players: [],
          });
        }
        rooms.delete(code);
        console.log(`[Room ${code}] last participant left - room torn down (${room.groupId ? 'group: rebuildable' : 'ad-hoc: destroyed'})`);
        return callback?.({ success: true, roomClosed: true });
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[leave_room]', err.message);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── HOST: Kick a player (#244) ──────────────────────────
  // Host-only mid-session removal of a disruptive player. Mirrors the
  // leave/disconnect removal path (mid-game → eliminate out of the turn order;
  // lobby / game_over → splice), boots the kicked socket back to landing with a
  // dedicated `kicked` event, then re-broadcasts the updated roster to everyone.
  socket.on('kick_player', async ({ roomCode, playerId } = {}, callback) => {
    if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      // Host-only: the acting host-of-record is the only one who may kick.
      if (room.hostUserId !== socket.userId) {
        return callback?.({ success: false, error: 'Only the host can kick players' });
      }
      if (!playerId) return callback?.({ success: false, error: 'No player specified' });
      if (playerId === room.hostUserId) {
        return callback?.({ success: false, error: 'The host cannot kick themselves' });
      }

      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx === -1) return callback?.({ success: false, error: 'Player not in room' });
      const target = room.players[idx];
      const targetSocketId = target.socketId;

      // Cancel any pending disconnect-grace timer for the kicked player.
      const key = dcKey(code, playerId);
      if (playerDisconnectTimers.has(key)) {
        clearTimeout(playerDisconnectTimers.get(key));
        playerDisconnectTimers.delete(key);
      }

      const isMidGame = !['lobby', 'game_over'].includes(room.phase);
      if (isMidGame) {
        // Resolve any pause the kicked player was gating so the table can't deadlock.
        resolveLeaverPendingPauses(io, code, room, playerId);
        if (target.status !== 'eliminated') {
          target.status = 'eliminated';
          target.isSpectator = true;
          engine.eliminateFromTurnOrder(room, playerId);
        }
      } else {
        // Lobby or game_over: clean removal from the roster.
        room.players.splice(idx, 1);
        engine.eliminateFromTurnOrder(room, playerId);
      }

      room.lastAction = { type: 'kicked', playerId, playerName: target.username };
      console.log(`[Room ${code}] host ${socket.username} kicked ${target.username}`);

      // Boot the kicked socket back to landing, then detach it from the room so
      // its later events can't touch this room.
      if (targetSocketId) {
        io.to(targetSocketId).emit('kicked', { reason: 'The host removed you from the room.' });
        try { io.in(targetSocketId).socketsLeave(code); } catch (_) { /* mock io / already gone */ }
      }

      // Mid-game a removal can leave a single survivor → game over.
      if (isMidGame) {
        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.phase = 'game_over';
          room.lastAction = engine.buildGameOverLastAction(gameOverWinner);
          engine.markDualWinners(room, gameOverWinner);
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
        }
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[kick_player]', err.message);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── HOST: Restart a finished room for another game ──────
  socket.on('restart_room', async ({ roomCode, coached = true } = {}, callback) => {
    if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      // Tutorial bypass - the bot "hosts" a practice room, so let the seated human
      // replay it. Otherwise only the real host can restart.
      const isTutorialRestarter = room.isTutorial
        && room.players.some(p => p.id === socket.userId && !p.isBot);
      if (room.hostUserId !== socket.userId && !isTutorialRestarter) {
        return callback?.({ success: false, error: 'Only the host can restart the room' });
      }
      if (room.phase !== 'game_over') {
        return callback?.({ success: false, error: 'Game has not ended yet' });
      }

      engine.resetRoomForReplay(room); // phase → 'lobby'; config + host + players + sandbox preserved
      if (room.sandbox) {
        // Sandbox replay = a plain online replay in the SAME room: keep the
        // learner's chosen config (incl. powers) AND local-host privileges, then
        // drop back to the LOBBY (NO startGame) so they can tweak settings before
        // dealing again - mirroring the first sandbox game's lobby → "Open the
        // Game" flow. Reseed the bot's per-game bluff personality; no coaching.
        room.hostSocketId = socket.id;
        room.botBluffCallsThisGame = 0;
        room.tutorialScenario = null;
        room.tutorialStage = null;
        room.cardPlayedThisTurn = false;
        room.bluffUsedThisTurn = false;
        room.powerActivatedThisTurn = false;
        room.botCallRate = rollBotCallRate();
      } else if (room.isTutorial) {
        // Replay the whole journey from Basics: all-off config, fresh counters,
        // no staged clinic. The bot stays host-of-record (no socket) so the
        // learner never inherits host controls on a replay.
        room.tutorialLesson = 'basics';
        room.config = engine.defaultRoomConfig();
        room.botBluffCallsThisGame = 0;
        room.tutorialScenario = null;
        room.tutorialStage = null;
        room.cardPlayedThisTurn = false;
        room.bluffUsedThisTurn = false;
        room.powerActivatedThisTurn = false;
        // Replay flavour:
        //   coached   → re-run the guided journey (Basics → Power Clinic) from the
        //               lobby, exactly like a first-timer (client re-shows intro).
        //   uncoached → a plain practice game vs the bot, NO guide overlays and no
        //               clinic. Powers stay OFF: engine/botStrategy.js has no
        //               power-play logic outside the scripted clinic, so a
        //               powers-on free game would stall on a bot left holding only
        //               power cards. Deal straight in (no lobby/intro to surface,
        //               since the client renders no coaching when coaching is off).
        room.tutorialCoaching = coached !== false;
        if (!room.tutorialCoaching) engine.startGame(room);
      } else {
        room.hostSocketId = socket.id;
      }

      await saveRoom(room);
      callback?.({ success: true });
      await broadcastRoomState(io, code);
      console.log(`[Room ${code}] Restarted by host (${socket.username})`);
    } catch (err) {
      console.error('[restart_room]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── GROUP HOST: Reset the room (boot everyone, fresh table, same cipher) ──
  // Triggered from the group's detail screen. Tears the live in-memory room
  // down and boots every connected participant back to the landing screen. The
  // group's permanent cipher (code) is untouched - the next join rebuilds a
  // clean lobby from the DB-backed group (settings + leaderboard live in the
  // DB, so they survive). Only the group host-of-record may do this.
  socket.on('reset_room', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
    try {
      const code = roomCode?.toUpperCase();
      if (!code) return callback?.({ success: false, error: 'Room not found' });

      const group = await groupsRepo.getActiveGroupByCode(code);
      if (!group) return callback?.({ success: false, error: 'No such group room' });
      if (group.host_user_id !== socket.userId) {
        return callback?.({ success: false, error: 'Only the host can reset the room' });
      }

      const room = await getRoom(code);
      if (!room) {
        // Nothing live to reset - the next join already builds a fresh lobby.
        return callback?.({ success: true, roomClosed: true });
      }

      _clearBettingTimer(code);
      _clearGhostVoteTimer(code);
      _clearPreGameTimer(code);
      _clearSpinPendingTimer(code);
      _clearGameOverTimer(code);
      _clearRedemptionTimer(code);
      _clearBloodDebtTimer(code);
      _clearPactVolunteerTimer(code);
      _clearSpeedModeTimer(code);
      _clearIdleTurnTimer(code);
      discardLobbyIdleState(code);

      // Boot everyone in the live room back to landing (mirrors game_ended).
      io.to(code).emit('game_ended', { reason: 'The host reset the room.' });
      io.in(code).socketsLeave(code);

      // §3.3 - clear the directory's occupancy badge for this group.
      if (room.groupId) {
        io.to(`group:${room.groupId}`).emit('group_room_status', {
          groupId: room.groupId,
          code,
          playerCount: 0,
          phase: 'closed',
          inLobby: false,
          players: [],
        });
      }

      logRoomDeletion(code, 'host_reset', {
        phase: room.phase,
        groupId: room.groupId || undefined,
        rebuildable: true,
      });
      rooms.delete(code);
      console.log(`[Room ${code}] Reset by group host (${socket.username}) - all booted, room torn down (rebuildable).`);
      callback?.({ success: true, roomClosed: true });
    } catch (err) {
      console.error('[reset_room]', err.message);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
