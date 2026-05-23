// ============================================================
// HANDLERS — Bluff resolution + spin pipeline
// ============================================================
// Covers: resolve_bluff (physical host), player_spin, call_bluff,
// swap_pick. These share the orchestration pipeline
// (maybeStart*Pause, applyBluffOutcome, applyPostElimSystemHooks).

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const {
  getRoom,
  saveRoom,
  _clearBettingTimer,
  bluffInterceptTimers,
  _clearBluffInterceptTimer,
} = require('../lib/state');
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

// ─── Shared online bluff resolution ──────────────────────────
// The full post-`resolveBluff` flow (Sniper/Medic pauses, Assassin backfire,
// outcome application, post-elim hooks, betting, broadcast). Shared by the
// immediate `call_bluff` path and the §1.1 interception resume so both behave
// identically. Performs its own save + emit + broadcast; the caller only acks.
async function _resolveOnlineBluff(io, code, room, accuserId, leaderboardRepo) {
  const { events, outcome } = bluffPipeline.resolveBluff(room, accuserId);
  const E = engine.GAME_EVENT_TYPES;

  // v2 Phase D — Sniper interception (only a spin can be sniped).
  if (outcome.type === E.SPIN_CONSEQUENCE && maybeStartSniperPause(io, room, outcome)) {
    await saveRoom(room);
    emitPowerCardEvents(io, code, events);
    await broadcastRoomState(io, code);
    return;
  }

  // v2 Phase D — Medic interception (Assassin path).
  if (outcome.type === E.FORCED_ELIMINATION) {
    const medicStarted = maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
      finaliseAssassinElimination(room, outcome);
      applyPostElimSystemHooks(io, room);
    });
    if (medicStarted) {
      // #121 — hold the death announcement until the Medic resolves.
      const deferred = events.filter(e => e?.kind === 'assassin_strike');
      const immediate = events.filter(e => e?.kind !== 'assassin_strike');
      if (room.pendingMedicSave) room.pendingMedicSave.deferredBanners = deferred;
      await saveRoom(room);
      emitPowerCardEvents(io, code, immediate);
      await broadcastRoomState(io, code);
      return;
    }
  }

  // #63 — Assassin backfire penalty before applyBluffOutcome.
  if (outcome.type === E.ASSASSIN_BACKFIRE && outcome.accusedId) {
    engine.applyAssassinBackfirePenalty(room, outcome.accusedId, outcome.cardsToDrawForAccused || 3);
  }

  applyBluffOutcome(room, outcome);

  if (outcome.type === E.FORCED_ELIMINATION) {
    if (outcome.eliminatedPlayerId) _bountyOnElimination(room, outcome.eliminatedPlayerId);
    applyPostElimSystemHooks(io, room);
    await maybeRecordGroupWinner(io, room, leaderboardRepo);
  }

  if (room.phase === 'spin_pending') _maybeOpenBetting(io, room);

  await saveRoom(room);
  emitPowerCardEvents(io, code, events);
  await broadcastRoomState(io, code);
}

// §1.1 — schedule the interception window's auto-resume. On expiry (no
// interception arrived) the bluff resolves with whatever the accused had
// armed beforehand (usually nothing). `ms` lets a rejected arm reschedule for
// the time remaining instead of a fresh full window.
function _scheduleBluffInterceptTimeout(io, code, leaderboardRepo, ms = engine.BLUFF_INTERCEPT_WINDOW_MS) {
  _clearBluffInterceptTimer(code);
  const handle = setTimeout(async () => {
    bluffInterceptTimers.delete(code);
    try {
      const room = await getRoom(code);
      if (!room || room.phase !== 'bluff_intercept_pending') return;
      const accuserId = room.pendingBluffIntercept?.accuserId || null;
      room.pendingBluffIntercept = null;
      room.phase = 'playing';
      if (!accuserId) {
        await saveRoom(room);
        await broadcastRoomState(io, code);
        return;
      }
      await _resolveOnlineBluff(io, code, room, accuserId, leaderboardRepo);
    } catch (err) {
      console.error('[bluff_intercept timeout]', err);
    }
  }, ms);
  bluffInterceptTimers.set(code, handle);
}

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

      const prevPlayer = room.players.find(p => p.id === engine.getPreviousTurnPlayerId(room));

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
        // §1.1 — interception window. If the accused (the previous player, who
        // is OFF-turn) still holds an un-armed defensive power card, pause and
        // let them arm it in response BEFORE the bluff resolves. The resolution
        // queue reads the freshly-armed card when we resume — no pipeline
        // change is needed. On arm/pass/timeout we run `_resolveOnlineBluff`.
        const accusedId = engine.getPreviousTurnPlayerId(room);

        if (accusedId && accusedId !== playerId && engine.canInterceptBluff(room, accusedId)) {
          const accusedPlayer = room.players.find(p => p.id === accusedId);
          room.phase = 'bluff_intercept_pending';
          room.pendingBluffIntercept = {
            accuserId: playerId,
            accuserName: callerPlayer?.username || null,
            accusedId,
            accusedName: accusedPlayer?.username || null,
            deadline: Date.now() + engine.BLUFF_INTERCEPT_WINDOW_MS,
            options: engine.listInterceptCards(room, accusedId).map(c => ({ cardId: c.id, power: c.power })),
          };
          room.lastAction = {
            type: 'bluff_intercept_window',
            accuserId: playerId,
            accuserName: callerPlayer?.username || null,
            accusedId,
            accusedName: accusedPlayer?.username || null,
          };
          _scheduleBluffInterceptTimeout(io, code, leaderboardRepo);

          await saveRoom(room);
          io.to(code).emit('power_card_triggered', {
            kind: 'bluff_intercept_window',
            accuserId: playerId,
            accuserName: callerPlayer?.username || null,
            accusedId,
            accusedName: accusedPlayer?.username || null,
          });
          await broadcastRoomState(io, code);
          return callback({ success: true, intercept: true });
        }

        await _resolveOnlineBluff(io, code, room, playerId, leaderboardRepo);
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

  // ─── ACCUSED: Respond to a bluff during the interception window (§1.1) ──
  // The bluffed player either arms a defensive card (`cardId` present) or
  // passes (`cardId` omitted). Either way the window closes and the bluff
  // resolves immediately via the shared resolver — which now sees any card
  // they just armed.
  socket.on('bluff_intercept', async ({ roomCode, cardId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.phase !== 'bluff_intercept_pending') {
        return callback?.({ success: false, error: 'No interception pending' });
      }
      const pending = room.pendingBluffIntercept;
      if (!pending || pending.accusedId !== socket.userId) {
        return callback?.({ success: false, error: 'Not your interception' });
      }

      _clearBluffInterceptTimer(code);

      let armedPower = null;
      if (cardId) {
        const res = engine.armInterceptCard(room, socket.userId, cardId);
        if (!res.ok) {
          // Malformed pick — keep the window open for whatever time is left.
          const remaining = Math.max(0, (pending.deadline || 0) - Date.now());
          _scheduleBluffInterceptTimeout(io, code, leaderboardRepo, remaining);
          return callback?.({ success: false, error: res.error });
        }
        armedPower = res.power;
      }

      const accuserId = pending.accuserId;
      room.pendingBluffIntercept = null;
      room.phase = 'playing';

      if (armedPower) {
        io.to(code).emit('power_card_triggered', {
          kind: 'bluff_intercept_armed',
          holderId: socket.userId,
          holderName: pending.accusedName || null,
          power: armedPower,
        });
        console.log(`[Room ${code}] ${pending.accusedName || socket.userId} intercepted with ${armedPower}`);
      }

      await _resolveOnlineBluff(io, code, room, accuserId, leaderboardRepo);
      return callback?.({ success: true, armed: armedPower });
    } catch (err) {
      callback?.({ success: false, error: err.message });
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
      if (outcome.type === E.FORCED_ELIMINATION) {
        const medicStarted = maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
          finaliseAssassinElimination(room, outcome);
          applyPostElimSystemHooks(io, room);
        });
        if (medicStarted) {
          // #121 — hold the death announcement until the Medic resolves
          // (released on decline / dropped on save by medic_decide).
          const deferred = events.filter(e => e?.kind === 'assassin_strike');
          const immediate = events.filter(e => e?.kind !== 'assassin_strike');
          if (room.pendingMedicSave) room.pendingMedicSave.deferredBanners = deferred;
          await saveRoom(room);
          emitPowerCardEvents(io, code, immediate);
          await broadcastRoomState(io, code);
          return callback?.({ success: true });
        }
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
