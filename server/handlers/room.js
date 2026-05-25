// ============================================================
// HANDLERS — Room lifecycle (create/join/reconnect/leave/restart)
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
  logRoomDeletion,
} = require('../lib/state');
const { socketRateLimit } = require('../lib/rateLimiter');
const { broadcastRoomState } = require('../lib/broadcast');
const {
  buildAdHocRoom,
  buildPersistentGroupRoom,
  maybeRecordGroupWinner,
} = require('../lib/roomBuilders');
const { resolveLeaverPendingPauses } = require('../lib/orchestration');
const { discardLobbyIdleState } = require('../lib/idleSweep');

function register(io, socket, deps) {
  const { groupsRepo, groupSettingsRepo, leaderboardRepo } = deps;

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', async ({ mode, config } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });
    if (!socketRateLimit(socket, 'create_room', 5, 60_000).allowed) {
      return callback({ success: false, error: 'Rate limit exceeded' });
    }

    try {
      const roomMode = mode === engine.MODES.ONLINE ? engine.MODES.ONLINE : engine.MODES.PHYSICAL;
      const room = await buildAdHocRoom(socket, roomMode, config, groupsRepo);
      room.hostUserId = socket.userId;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      room.powerActivatedThisTurn = false;
      await saveRoom(room);

      socket.join(room.code);
      console.log(`[Room ${room.code}] Created by ${socket.username} (mode: ${roomMode})`);

      if (roomMode === engine.MODES.ONLINE) {
        const player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        await saveRoom(room);
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode, playerId: socket.userId });
      } else {
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode });
      }

      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
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
        if (group.host_user_id === socket.userId) {
          room.hostSocketId = socket.id;
        }

        const allowed = await groupsRepo.isGroupMember(group.id, socket.userId);
        if (!allowed) {
          return callback({ success: false, error: 'not_a_group_member' });
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
        console.log(`[Room ${code}] Joined: ${player.username}`);
      }

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

      if (hostDisconnectTimers.has(code)) {
        clearTimeout(hostDisconnectTimers.get(code));
        hostDisconnectTimers.delete(code);
        console.log(`[Socket] host of ${code} reconnected within grace — teardown cancelled`);
      }

      room.hostSocketId = socket.id;
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, isHost: true, mode: room.mode });
      await broadcastRoomState(io, code);
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
        console.log(`[Socket] player ${socket.userId} reconnected to ${code} within grace — elimination cancelled`);
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
  // re-serialise for THIS socket only — so `myHand` is included — without
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

      room.config = engine.normalizeRoomConfig(config);
      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[update_room_config]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Intentional leave ───────────────────────────────────
  // §2.2 — accepts an optional ack callback so the SAME centralized cleanup is
  // used by every leave entry point (the in-game "Leave Room" buttons and the
  // lobby "Leave Game" button) and the client can confirm teardown finished.
  // The client never blocks on this ack (§2.3 fail-safe) — it's purely
  // confirmatory — but it lets a present client know the server cleaned up.
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

        // §2.2 — in a 2-player game this leaves a single survivor, who wins by
        // default (checkGameOver) AND inherits the host seat below.
        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.phase = 'game_over';
          room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
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
      // join rebuilds a clean lobby from the DB-backed group — preserving the
      // group's settings and leaderboard, which live in the database, not here.
      const noOneLeft = room.players.length === 0
        || !room.players.some(p => p.status === 'alive');
      if (noOneLeft) {
        _clearBettingTimer(code);
        _clearGhostVoteTimer(code);
        _clearPreGameTimer(code);
        _clearSpinPendingTimer(code);
        _clearGameOverTimer(code);
        discardLobbyIdleState(code);
        logRoomDeletion(code, 'last_participant_left', {
          phase: room.phase,
          groupId: room.groupId || undefined,
          rebuildable: !!room.groupId,
        });
        // §3.3 — the live room is gone; clear the directory's occupancy badge.
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
        console.log(`[Room ${code}] last participant left — room torn down (${room.groupId ? 'group: rebuildable' : 'ad-hoc: destroyed'})`);
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

  // ─── HOST: Restart a finished room for another game ──────
  socket.on('restart_room', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.hostUserId !== socket.userId) {
        return callback?.({ success: false, error: 'Only the host can restart the room' });
      }
      if (room.phase !== 'game_over') {
        return callback?.({ success: false, error: 'Game has not ended yet' });
      }

      engine.resetRoomForReplay(room);
      room.hostSocketId = socket.id;

      await saveRoom(room);
      callback?.({ success: true });
      await broadcastRoomState(io, code);
      console.log(`[Room ${code}] Restarted by host (${socket.username})`);
    } catch (err) {
      console.error('[restart_room]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
