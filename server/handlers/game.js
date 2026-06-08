// ============================================================
// HANDLERS — Game lifecycle (start/next/end) + card play
// ============================================================
// Covers: start_game, next_turn, round_win, end_turn, play_card,
// play_card_online, activate_power_card, spectate_player,
// spin_acknowledged. Phase-F system events live in handlers/systems.js.

const engine = require('../gameEngine');
const {
  getRoom,
  saveRoom,
  pregameTimers,
  _clearPreGameTimer,
  _clearGameOverTimer,
  logTurnState,
} = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const { socketRateLimit } = require('../lib/rateLimiter');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { runMirrorMatchSpin, resolvePendingGameOver, beginRedemption } = require('../lib/orchestration');
const { _beginPowerClinic, advanceClinic } = require('../lib/tutorialDirector');

// ─── Pre-game selection orchestration (#116) ─────────────────
// Pure phase/state logic lives in engine/pregame.js; these helpers
// own the socket I/O + the two chained server timers (role-reveal
// display → 15s selection auto-resolve). One timer per room at a time,
// registered in lib/state's `pregameTimers`. Mirrors the betting /
// ghost-vote timer pattern in lib/orchestration.js.

async function emitRoleReveals(io, room) {
  const aliveCount = room.players.filter(p => p.status === 'alive').length;
  const barehandVisible = engine.isBarehandVisible(aliveCount);
  const sockets = await io.in(room.code).fetchSockets();
  for (const s of sockets) {
    const player = room.players.find(p => p.socketId === s.id);
    if (!player) continue;
    s.emit('role_reveal', { role: player.role || 'barehand', barehandVisible });
  }
}

async function finalizePreGameAndBroadcast(io, code) {
  const room = await getRoom(code);
  if (!room || room.phase !== 'pre_game') return;
  const result = engine.finalizePreGame(room);
  if (!result.ok) return;
  await saveRoom(room);
  io.to(code).emit('pre_game_complete');
  await broadcastRoomState(io, code);
}

function schedulePreGameFinalize(io, code) {
  _clearPreGameTimer(code);
  const handle = setTimeout(async () => {
    pregameTimers.delete(code);
    await finalizePreGameAndBroadcast(io, code);
  }, engine.PRE_GAME_SELECTION_TIMEOUT_MS);
  pregameTimers.set(code, handle);
}

// #2 — when the pre-game selection is skipped (0–1 powers enabled) there is no
// picker to open. Still honour the role-reveal display window, then finalize
// straight into play. Mirrors the timing of schedulePreGameSelectionOpen but
// without ever opening selection.
function schedulePreGameSkipFinalize(io, code) {
  _clearPreGameTimer(code);
  const handle = setTimeout(async () => {
    pregameTimers.delete(code);
    await finalizePreGameAndBroadcast(io, code);
  }, engine.ROLE_REVEAL_DISPLAY_MS);
  pregameTimers.set(code, handle);
}

function schedulePreGameSelectionOpen(io, code) {
  _clearPreGameTimer(code);
  const handle = setTimeout(async () => {
    pregameTimers.delete(code);
    const room = await getRoom(code);
    if (!room || room.phase !== 'pre_game') return;
    engine.startPreGameSelection(room);
    await saveRoom(room);
    const sockets = await io.in(code).fetchSockets();
    for (const s of sockets) {
      const player = room.players.find(p => p.socketId === s.id);
      if (!player) continue;
      s.emit('pre_game_selection_start', {
        pool: room.pregamePools?.[player.id] || [],
        deadline: room.pregameSelectionDeadline,
      });
    }
    await broadcastRoomState(io, code);
    schedulePreGameFinalize(io, code);
  }, engine.ROLE_REVEAL_DISPLAY_MS);
  pregameTimers.set(code, handle);
}

function register(io, socket, deps) {
  const { groupSettingsRepo, leaderboardRepo } = deps;

  // ─── HOST: Start the game ─────────────────────────────────
  socket.on('start_game', async ({ roomCode } = {}, callback) => {
    if (!socketRateLimit(socket, 'start_game', 3, 10_000).allowed) {
      return callback({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      // Tutorial bypass — the bot "hosts" a practice room (hostSocketId is null),
      // so the host check would block the lone human. Let the seated human start
      // their own practice game; everything else still requires the real host.
      const isTutorialStarter = room.isTutorial
        && !!socket.userId
        && room.players.some(p => p.id === socket.userId && !p.isBot);
      if (room.hostSocketId !== socket.id && !isTutorialStarter) {
        return callback({ success: false, error: 'Not the host' });
      }

      // v2 Phase E2 — Mirror Match auto-disable when alive count is odd.
      let mirrorMatchAutoDisabled = false;
      if (
        room.mode === engine.MODES.ONLINE
        && room.config?.roomModifiers?.mirrorMatch
        && !engine.isMirrorMatchEligibleAtStart(room)
      ) {
        room.config.roomModifiers.mirrorMatch = false;
        mirrorMatchAutoDisabled = true;
      }

      // Roulette Rotation needs 3+ players — with 2 the only repeat-free order
      // is plain alternation, so the modifier would be a no-op. Auto-disable it.
      let rouletteRotationAutoDisabled = false;
      if (
        room.mode === engine.MODES.ONLINE
        && room.config?.roomModifiers?.rouletteRotation
        && room.players.filter(p => p.status === 'alive').length < 3
      ) {
        room.config.roomModifiers.rouletteRotation = false;
        rouletteRotationAutoDisabled = true;
      }

      // Last Stand (the final-two duel) only makes sense with a real field —
      // disable it at 4 alive or fewer. Matches the lobby UI, which hides the
      // toggle under the same rule.
      let lastStandAutoDisabled = false;
      if (
        room.mode === engine.MODES.ONLINE
        && room.config?.systems?.lastStand
        && room.players.filter(p => p.status === 'alive').length < 5
      ) {
        room.config.systems.lastStand = false;
        lastStandAutoDisabled = true;
      }

      delete room.groupLeaderboardWinnerRecorded;
      engine.startGame(room);

      // #116 — online games run a pre_game phase (private role reveal
      // then per-player bonus-card selection) before play. startGame
      // has already dealt + assigned roles; beginPreGame just flips the
      // phase to 'pre_game' and builds the selection pools. Physical
      // mode keeps the direct lobby → playing transition.
      // Tutorial / Practice skips pre_game too: a 2-player table has no secret
      // roles and powers are off, so the role-reveal + selection window would
      // just stall the learner on a "you are Barehand" card. Deal straight in.
      const runsPreGame = room.mode === engine.MODES.ONLINE && !room.isTutorial;
      if (runsPreGame) engine.beginPreGame(room);

      if (room.groupId) {
        try {
          const persisted = await groupSettingsRepo.upsertGroupSettings(
            room.groupId,
            room.config,
            socket.userId,
          );
          room.groupSettingsMeta = {
            updatedAt: persisted.updatedAt,
            updatedByUserId: socket.userId,
            updatedByUsername: socket.username || null,
          };
          io.to(`group:${room.groupId}`).emit('group_settings_updated', {
            groupId: room.groupId,
            updatedAt: persisted.updatedAt,
          });
        } catch (persistErr) {
          console.error('[start_game] failed to persist group settings', persistErr);
        }

        try {
          await leaderboardRepo.recordGameStart(
            room.groupId,
            room.turnOrder.filter(Boolean),
            new Date().toISOString(),
          );
        } catch (leaderboardErr) {
          console.error('[start_game] failed to record group leaderboard participants', leaderboardErr);
        }
      }

      await saveRoom(room);
      await broadcastRoomState(io, roomCode);
      callback({ success: true, mirrorMatchAutoDisabled, rouletteRotationAutoDisabled, lastStandAutoDisabled });

      if (mirrorMatchAutoDisabled) {
        io.to(roomCode).emit('power_card_triggered', {
          kind: 'system_notice',
          title: 'Mirror Match disabled',
          subtitle: 'requires an even player count',
        });
      }

      if (rouletteRotationAutoDisabled) {
        io.to(roomCode).emit('power_card_triggered', {
          kind: 'system_notice',
          title: 'Roulette Rotation disabled',
          subtitle: 'requires at least 3 players',
        });
      }

      if (lastStandAutoDisabled) {
        io.to(roomCode).emit('power_card_triggered', {
          kind: 'system_notice',
          title: 'Last Stand disabled',
          subtitle: 'requires at least 5 players',
        });
      }

      // Kick off the pre_game sequence: private role reveals now, then
      // open selection once the reveal display window elapses.
      if (runsPreGame) {
        await emitRoleReveals(io, room);
        // #2 — skip the "Claim your edge" picker when fewer than 2 power types
        // are enabled; otherwise open it after the role-reveal window.
        if (room.pregameSelectionSkipped) {
          schedulePreGameSkipFinalize(io, roomCode);
        } else {
          schedulePreGameSelectionOpen(io, roomCode);
        }
      }
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── TUTORIAL: Skip Basics, jump straight to the Power Clinic ──────────────
  // From the in-room "Go through Basics / Skip to Power Cards" choice. Sets the
  // room up (startGame) then re-stages it as clinic drill 0. Only the seated
  // human, only from the lobby.
  socket.on('tutorial_skip_to_powers', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isTutorial) return callback?.({ success: false, error: 'Not a tutorial room' });
      if (!room.players.some(p => p.id === socket.userId && !p.isBot)) {
        return callback?.({ success: false, error: 'Not in this room' });
      }
      if (room.phase !== 'lobby') return callback?.({ success: false, error: 'Already started' });

      engine.startGame(room);   // deal + standard init (tutorial skips pre_game)
      _beginPowerClinic(room);  // lesson=powers, enable powers, stage drill 0

      await saveRoom(room);
      await broadcastRoomState(io, code);
      return callback?.({ success: true });
    } catch (err) {
      console.error('[tutorial_skip_to_powers]', err);
      return callback?.({ success: false, error: err.message });
    }
  });

  // ─── TUTORIAL: Advance past a resolved Power-Clinic drill ("I Understand") ──
  socket.on('tutorial_advance', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isTutorial) return callback?.({ success: false, error: 'Not a tutorial room' });
      if (!room.players.some(p => p.id === socket.userId && !p.isBot)) {
        return callback?.({ success: false, error: 'Not in this room' });
      }

      const advanced = advanceClinic(room);
      if (!advanced) return callback?.({ success: false, error: 'No drill to advance' });

      await saveRoom(room);
      await broadcastRoomState(io, code);
      return callback?.({ success: true });
    } catch (err) {
      console.error('[tutorial_advance]', err);
      return callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Confirm pre-game card selection (#116) ──────
  socket.on('pre_game_select', async ({ roomCode, optionId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const result = engine.applyPreGameSelection(room, socket.userId, optionId);
      if (!result.ok) return callback?.({ success: false, error: result.error });

      await saveRoom(room);
      io.to(code).emit('pre_game_waiting', {
        pendingCount: result.pendingCount,
        totalCount: result.totalCount,
      });
      await broadcastRoomState(io, code);

      // §2.1 Rule 1 — the 15s selection window ALWAYS runs to completion. We no
      // longer finalise the instant the last player confirms (that "snap
      // forward" denied late pickers their review time and felt abrupt); the
      // schedulePreGameFinalize timer is the single resolve path.
      // §2.1 Rule 2 — a late confirmation (at/after the 12s mark) earns the
      // picker a private review buffer; flag it + the duration back to them.
      callback?.({
        success: true,
        pendingCount: result.pendingCount,
        late: !!result.late,
        reviewMs: result.late ? engine.PRE_GAME_LATE_REVIEW_MS : 0,
      });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── HOST: Next turn (physical) ──────────────────────────
  socket.on('next_turn', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use end_turn in online mode' });
      if (!['playing', 'round_end'].includes(room.phase)) {
        return callback({ success: false, error: `Cannot advance turn from phase '${room.phase}'` });
      }

      engine.advanceTurn(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
        await maybeRecordGroupWinner(io, room, leaderboardRepo);
      }

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Declare round winner (physical) ───────────────
  socket.on('round_win', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const winner = engine.declareRoundWinner(room, playerId);
      if (!winner) return callback({ success: false, error: 'Player not found' });

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play card face-down (physical) ──────────────
  socket.on('play_card', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use play_card_online' });

      const physPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = { type: 'card_played', playerId, playerName: physPlayer?.username || null };
      room.cardPlayedThisTurn = true;
      logTurnState(code, playerId, 'play_card', room);

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play specific card (online) ─────────────────
  socket.on('play_card_online', async ({ roomCode, playerId, cardId, nominatedShape } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Online mode only' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });

      const cardPreview = room.hands?.get(playerId)?.find(c => c.id === cardId);
      if (cardPreview?.shape === 'whot') {
        if (!nominatedShape || !engine.SHAPES.includes(nominatedShape)) {
          return callback({ success: false, error: 'Whot card must nominate a shape' });
        }
      }

      const result = engine.validateAndPlayCard(room, playerId, cardId);
      if (!result.ok) return callback({ success: false, error: result.error });

      if (result.card.shape === 'whot') {
        room.currentCardType = nominatedShape;
      }

      const actingPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = {
        type: 'card_played_online',
        playerId,
        playerName: actingPlayer?.username || null,
      };
      logTurnState(code, playerId, 'play_card', room, { cardId });

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true, card: result.card });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Activate a power card (v2 Phase B) ──────────
  socket.on('activate_power_card', async ({ roomCode, cardId = null } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const result = engine.activatePowerCard(room, socket.userId, cardId);
      if (!result.ok) return callback?.({ success: false, error: result.error });
      logTurnState(code, socket.userId, 'activate_power', room, { power: result.power });

      await saveRoom(room);
      await broadcastRoomState(io, code);

      if (result.power === 'peek') {
        return callback?.({
          success: true,
          power: 'peek',
          consumed: true,
          peekedCard: result.peekedCard || null,
          cardId: result.cardId,
        });
      }

      return callback?.({
        success: true,
        power: result.power,
        consumed: false,
        cardId: result.cardId,
      });
    } catch (err) {
      console.error('[activate_power_card]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: End turn ────────────────────────────────────
  socket.on('end_turn', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (!room.cardPlayedThisTurn) return callback({ success: false, error: 'Play a card first' });

      if (room.mode === engine.MODES.ONLINE) {
        const hand = room.hands?.get(playerId);
        if (hand && hand.length === 0) {
          // Online mode is single-round-per-game (#70).
          const winner = room.players.find(p => p.id === playerId);
          room.phase = 'game_over';
          room.lastAction = {
            type: 'game_over',
            winnerId: playerId,
            winnerName: winner?.username || null,
          };
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
          await saveRoom(room);
          await broadcastRoomState(io, code);
          return callback({ success: true, gameOver: true });
        }
      }

      // v2 Phase C — Freeze trigger BEFORE advanceTurn.
      let freezeTrigger = null;
      if (room.mode === engine.MODES.ONLINE) {
        freezeTrigger = engine.consumeFreezeOnTurnEnd(room, playerId);
      }

      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      engine.advanceTurn(room);
      // §5 — turn ended: the ledger is cleared and the next player's window
      // opens. advanceTurn also resets powerActivatedThisTurn.
      logTurnState(code, room.turnOrder[room.currentTurnIndex], 'turn_advanced', room, { endedBy: playerId });

      // v2 Phase E2 — Sudden Death tick.
      const suddenDeathBanner = engine.tickSuddenDeath(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
        await maybeRecordGroupWinner(io, room, leaderboardRepo);
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);

      if (freezeTrigger) {
        io.to(code).emit('power_card_triggered', freezeTrigger);
      }
      if (suddenDeathBanner) {
        io.to(code).emit('power_card_triggered', suddenDeathBanner);
      }

      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── Spectate a player's hand (REMOVED — §3.2 anti-cheat lockout) ────────
  // Eliminated / dead players may no longer view any living opponent's hand.
  // The event is kept as an inert stub so older clients don't error: it never
  // stores a spectate target and always returns an empty hand. The hand is also
  // no longer present in any room_state payload (see serializeRoom §3.2).
  socket.on('spectate_player', async (_payload = {}, callback) => {
    if (socket.data) socket.data.spectatingTargetId = null;
    return callback?.({ success: true, hand: [] });
  });

  // ─── Spin result acknowledgement (synced overlay dismiss) ─
  socket.on('spin_acknowledged', async ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase();
    if (!code) return;

    // The ack arrived in time — cancel the pendingGameOver safety net (Issue 2).
    _clearGameOverTimer(code);

    const room = await getRoom(code);
    if (room?.pendingGameOver) {
      // Shared with the safety timer: identical game_over transition either way.
      await resolvePendingGameOver(io, room, leaderboardRepo);
      return;
    }

    if (room?.pendingMirrorMatchSpin) {
      const pending = room.pendingMirrorMatchSpin;
      delete room.pendingMirrorMatchSpin;
      // #241 — emit the dismiss for the PRIMARY spin's overlay BEFORE broadcasting
      // the mirror spin. Socket.IO preserves per-connection order, so clients see
      // spin_acknowledged (clears the just-finished overlay) and then the mirror
      // spin_result (which resets spinDismissed=false and starts a FRESH overlay).
      // The previous order broadcast the mirror result first, so the trailing
      // spin_acknowledged left spinDismissed=true and the mirror overlay was torn
      // down the instant its cylinder stopped — the spin appeared to play for only
      // the first player. Now BOTH the liable player and their mirror visibly spin.
      io.to(code).emit('spin_acknowledged');
      await runMirrorMatchSpin(io, room, pending, leaderboardRepo);
      return;
    }

    // Redemption Spin (Phase E1) — the eliminating spin's overlay has been
    // dismissed; now open the redemption_pending offer to the eliminated player.
    if (room?.pendingRedemption) {
      await beginRedemption(io, room, leaderboardRepo);
      io.to(code).emit('spin_acknowledged');
      return;
    }

    io.to(code).emit('spin_acknowledged');
  });
}

module.exports = { register };
