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
} = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { runMirrorMatchSpin } = require('../lib/orchestration');

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
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

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

      delete room.groupLeaderboardWinnerRecorded;
      engine.startGame(room);

      // #116 — online games run a pre_game phase (private role reveal
      // then per-player bonus-card selection) before play. startGame
      // has already dealt + assigned roles; beginPreGame just flips the
      // phase to 'pre_game' and builds the selection pools. Physical
      // mode keeps the direct lobby → playing transition.
      const runsPreGame = room.mode === engine.MODES.ONLINE;
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
      callback({ success: true, mirrorMatchAutoDisabled });

      if (mirrorMatchAutoDisabled) {
        io.to(roomCode).emit('power_card_triggered', {
          kind: 'system_notice',
          title: 'Mirror Match disabled',
          subtitle: 'requires an even player count',
        });
      }

      // Kick off the pre_game sequence: private role reveals now, then
      // open selection once the reveal display window elapses.
      if (runsPreGame) {
        await emitRoleReveals(io, room);
        schedulePreGameSelectionOpen(io, roomCode);
      }
    } catch (err) {
      callback({ success: false, error: err.message });
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
      callback?.({ success: true, pendingCount: result.pendingCount });

      // Last player in → resolve immediately and cancel the timer so
      // there's no race between the final pick and the 15s auto-resolve.
      if (result.allReady) {
        _clearPreGameTimer(code);
        await finalizePreGameAndBroadcast(io, code);
      }
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

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true, card: result.card });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Activate a power card (v2 Phase B) ──────────
  socket.on('activate_power_card', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const result = engine.activatePowerCard(room, socket.userId);
      if (!result.ok) return callback?.({ success: false, error: result.error });

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

  // ─── Spectate a player's hand (#81) ─────────────────────
  socket.on('spectate_player', async ({ roomCode, targetPlayerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const isHost = room.hostUserId === socket.userId;
      const isMember = room.players.some(p => p.id === socket.userId);
      if (!isHost && !isMember) return callback?.({ success: false, error: 'Not a member of this room' });

      if (!targetPlayerId) {
        if (socket.data) socket.data.spectatingTargetId = null;
        return callback?.({ success: true, hand: [] });
      }

      const hand = room.hands?.get(targetPlayerId);
      if (!hand) return callback?.({ success: false, error: 'Player has no hand' });

      socket.data = socket.data || {};
      socket.data.spectatingTargetId = targetPlayerId;

      callback?.({ success: true, hand });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Spin result acknowledgement (synced overlay dismiss) ─
  socket.on('spin_acknowledged', async ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase();
    if (!code) return;

    const room = await getRoom(code);
    if (room?.pendingGameOver) {
      const { id, name } = room.pendingGameOver;
      room.phase = 'game_over';
      room.lastAction = { type: 'game_over', winnerId: id, winnerName: name };
      delete room.pendingGameOver;
      delete room.pendingMirrorMatchSpin;
      await maybeRecordGroupWinner(io, room, leaderboardRepo);
      await saveRoom(room);
      io.to(code).emit('spin_acknowledged');
      await broadcastRoomState(io, code);
      return;
    }

    if (room?.pendingMirrorMatchSpin) {
      const pending = room.pendingMirrorMatchSpin;
      delete room.pendingMirrorMatchSpin;
      await runMirrorMatchSpin(io, room, pending);
      io.to(code).emit('spin_acknowledged');
      return;
    }

    io.to(code).emit('spin_acknowledged');
  });
}

module.exports = { register };
