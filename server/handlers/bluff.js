// ============================================================
// HANDLERS — Bluff resolution + spin pipeline
// ============================================================
// Covers: resolve_bluff (physical host), player_spin, call_bluff,
// swap_pick. These share the orchestration pipeline
// (maybeStart*Pause, applyBluffOutcome, applyPostElimSystemHooks).

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const { getRoom, saveRoom, _clearBettingTimer } = require('../lib/state');
const { broadcastRoomState, emitPowerCardEvents } = require('../lib/broadcast');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const {
  maybeStartSniperPause,
  maybeStartMedicPause,
  finaliseAssassinElimination,
  applyBluffOutcome,
  applyPostElimSystemHooks,
  _bountyOnSurvival,
  _bountyOnElimination,
  _maybeOpenBetting,
  _enterLastStand,
  _openGhostVote,
} = require('../lib/orchestration');

function register(io, socket, deps) {
  const { leaderboardRepo } = deps;

  // ─── HOST: Resolve bluff (physical) ─────────────────────
  socket.on('resolve_bluff', async ({ roomCode, bluffIsCorrect } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      const currentPlayer = room.players.find(p => p.id === currentPlayerId);

      const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
      const prevPlayer = room.players.find(p => p.id === room.turnOrder[prevIdx]);

      const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;

      room.phase = 'spin_pending';
      room.spinTargetId = spinTarget.id;
      room.lastAction = {
        type: 'spin_pending',
        spinTargetId: spinTarget.id,
        spinTargetName: spinTarget.username,
        bluffCorrect: bluffIsCorrect,
      };

      await saveRoom(room);
      await broadcastRoomState(io, roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Pull the trigger ────────────────────────────
  socket.on('player_spin', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'spin_pending') return callback({ success: false, error: 'No spin pending' });
      if (room.spinTargetId !== playerId) return callback({ success: false, error: 'Not your spin' });

      // v2 Phase F — Betting window: spin target must wait until close.
      if (room.betting && !room.betting.closed) {
        const everyoneBet = room.betting.eligibleIds.every(
          id => room.betting.bets[id]
        );
        if (!everyoneBet) {
          return callback({ success: false, error: 'Betting window still open' });
        }
        engine.closeBettingWindow(room);
        _clearBettingTimer(code);
      }

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const riskLevelBefore = player.riskLevel;
      const chamberBefore = [...player.chamber];
      const spinResult = engine.spinGun(player, engine.getSpinModifiers(room));

      // v2 Phase E2 — Mirror Match: queue an opposite-player spin.
      if (
        room.mirrorMatchActive
        && !room._mirrorMatchInFlight
        && room.mode === engine.MODES.ONLINE
      ) {
        const oppositeId = engine.getMirrorMatchOpposite(room, player.id);
        if (oppositeId && oppositeId !== player.id) {
          room.pendingMirrorMatchSpin = {
            targetId: oppositeId,
            triggeredBy: player.id,
          };
        }
      }

      // v2 Phase F — Bounty + Betting evaluation.
      const bountyEvents = [];
      if (spinResult.eliminated) {
        _bountyOnElimination(room, player.id);
      } else {
        const placed = _bountyOnSurvival(room, player.id);
        if (placed) bountyEvents.push(placed);
      }
      const betEvents = engine.evaluateBets(room, spinResult.eliminated);
      _clearBettingTimer(code);

      // v2 Phase D — Medic interception for spin elimination.
      let medicPaused = false;
      if (spinResult.eliminated) {
        const finalise = () => {
          engine.eliminateFromTurnOrder(room, player.id);
          engine.newCardType(room);
          if (room.mode === engine.MODES.ONLINE) {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId) engine.drawCardForPlayer(room, currentPlayerId);
          }
          const gameOverWinner = engine.checkGameOver(room);
          if (gameOverWinner) {
            room.pendingGameOver = { id: gameOverWinner.id, name: gameOverWinner.username };
          }
        };

        medicPaused = maybeStartMedicPause(io, room, player.id, 'spin', finalise);
        if (!medicPaused) finalise();
      } else if (room.mode === engine.MODES.ONLINE) {
        // Issue #56 / Section 7 hand reset.
        engine.resetHandOnSurvival(room, player.id);
      }

      if (!medicPaused) {
        room.phase = 'playing';
        // v2 Phase F — post-elim system check.
        if (spinResult.eliminated && room.mode === engine.MODES.ONLINE) {
          if (engine.shouldEnterLastStand(room)) {
            _enterLastStand(io, room);
          } else if (engine.shouldOpenGhostVote(room)) {
            _openGhostVote(io, room);
          }
        }
      }
      room.spinTargetId = null;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = true;

      room.lastAction = {
        type: 'spin_result',
        spinTargetId: player.id,
        spinTargetName: player.username,
        spinIndex: spinResult.spinIndex,
        chamber: chamberBefore,
        chamberAfter: spinResult.chamber,
        roll: spinResult.spinIndex,
        eliminated: spinResult.eliminated,
        riskLevel: spinResult.riskLevel,
        riskLevelBefore,
        medicPending: medicPaused,
        ...(spinResult.eliminated && !medicPaused ? { newCardType: room.currentCardType } : {}),
      };

      await saveRoom(room);
      console.log(`[Room ${code}] ${player.username} spun slot ${spinResult.spinIndex} → ${spinResult.eliminated ? (medicPaused ? 'ELIM (Medic deciding)' : 'ELIMINATED') : 'survived'}`);
      await broadcastRoomState(io, code);
      // Post-spin banners (bounty + betting streak) AFTER broadcast.
      for (const ev of bountyEvents) io.to(code).emit('power_card_triggered', ev);
      for (const ev of betEvents) io.to(code).emit('power_card_triggered', ev);
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Call bluff ──────────────────────────────────
  socket.on('call_bluff', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Not in playing phase' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.bluffUsedThisTurn) return callback({ success: false, error: 'Bluff already called this turn' });
      if (room.isFirstTurn) return callback({ success: false, error: 'Cannot call bluff on the first turn' });
      if (room.bluffBlockedThisTurn) {
        return callback({ success: false, error: 'No card to challenge — last turn was frozen' });
      }

      room.bluffUsedThisTurn = true;
      const callerPlayer = room.players.find(p => p.id === playerId);

      if (room.mode === engine.MODES.ONLINE) {
        const { events, outcome } = bluffPipeline.resolveBluff(room, playerId);
        const E = engine.GAME_EVENT_TYPES;

        // v2 Phase D — Sniper interception (only a spin can be sniped).
        if (outcome.type === E.SPIN_CONSEQUENCE && maybeStartSniperPause(io, room, outcome)) {
          await saveRoom(room);
          emitPowerCardEvents(io, code, events);
          await broadcastRoomState(io, code);
          return callback({ success: true });
        }

        // v2 Phase D — Medic interception (Assassin path).
        if (
          outcome.type === E.FORCED_ELIMINATION
          && maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
            finaliseAssassinElimination(room, outcome);
            applyPostElimSystemHooks(io, room);
          })
        ) {
          await saveRoom(room);
          emitPowerCardEvents(io, code, events);
          await broadcastRoomState(io, code);
          return callback({ success: true });
        }

        // #63 — Assassin backfire penalty before applyBluffOutcome.
        if (outcome.type === E.ASSASSIN_BACKFIRE && outcome.accusedId) {
          engine.applyAssassinBackfirePenalty(
            room,
            outcome.accusedId,
            outcome.cardsToDrawForAccused || 3,
          );
        }

        applyBluffOutcome(room, outcome);

        if (outcome.type === E.FORCED_ELIMINATION) {
          if (outcome.eliminatedPlayerId) {
            _bountyOnElimination(room, outcome.eliminatedPlayerId);
          }
          applyPostElimSystemHooks(io, room);
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
        }

        if (outcome.type === E.ASSASSIN_BACKFIRE) {
          engine.advanceTurn(room);
        }

        if (room.phase === 'spin_pending') {
          _maybeOpenBetting(io, room);
        }

        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback({ success: true });
      }

      // Physical mode unchanged.
      room.phase = 'bluff_resolution';
      room.lastAction = {
        type: 'bluff_called',
        callerId: playerId,
        callerName: callerPlayer?.username || null,
      };

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Swap pick (v2 Phase C) ──────────────────────
  socket.on('swap_pick', async ({ roomCode, cardId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (room.phase !== 'swap_pending') return callback?.({ success: false, error: 'No Swap pending' });
      if (room.swapHolderId !== socket.userId) return callback?.({ success: false, error: 'Not the Swap holder' });
      if (!cardId) return callback?.({ success: false, error: 'No card picked' });

      const accuserId = room.lastAction?.accuserId;
      if (!accuserId) return callback?.({ success: false, error: 'Lost bluff context' });

      const { events, outcome } = bluffPipeline.resumeAfterSwap(room, accuserId, cardId);
      const E = engine.GAME_EVENT_TYPES;
      if (outcome?.type === E.BLUFF_ERROR) {
        return callback?.({ success: false, error: outcome.error });
      }

      room.swapHolderId = null;

      if (outcome.type === E.SPIN_CONSEQUENCE && maybeStartSniperPause(io, room, outcome)) {
        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback?.({ success: true });
      }
      if (
        outcome.type === E.FORCED_ELIMINATION
        && maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
          finaliseAssassinElimination(room, outcome);
          applyPostElimSystemHooks(io, room);
        })
      ) {
        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback?.({ success: true });
      }

      applyBluffOutcome(room, outcome);

      if (outcome.type === E.FORCED_ELIMINATION) {
        if (outcome.eliminatedPlayerId) {
          _bountyOnElimination(room, outcome.eliminatedPlayerId);
        }
        applyPostElimSystemHooks(io, room);
        await maybeRecordGroupWinner(io, room, leaderboardRepo);
      }

      if (room.phase === 'spin_pending') {
        _maybeOpenBetting(io, room);
      }

      await saveRoom(room);
      emitPowerCardEvents(io, code, events);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[swap_pick]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
