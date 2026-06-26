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
  _clearBluffInterceptTimer,
  _clearSpinPendingTimer,
  logTurnState,
} = require('../lib/state');
const { broadcastRoomState, emitPowerCardEvents } = require('../lib/broadcast');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const {
  _resolveOnlineBluff,
  _scheduleBluffInterceptTimeout,
  maybeOpenBluffIntercept,
  maybeStartSniperPause,
  maybeStartMedicPause,
  finaliseAssassinElimination,
  applyBluffOutcome,
  applyPostElimSystemHooks,
  applySpinAndBroadcast,
  _scheduleSpinPendingTimeout,
  _bountyOnElimination,
  _maybeOpenBetting,
  resolveRedemption,
} = require('../lib/orchestration');

// ─── Shared online bluff resolution ──────────────────────────
// `_resolveOnlineBluff`, the §1.1 interception window opener
// (`maybeOpenBluffIntercept`) and its timeout all live in lib/orchestration.js
// (alongside every helper they call), so the human `call_bluff` path, the §1.1
// interception resume, and the server-driven bot opponent (lib/bots.js) all
// challenge + resolve identically. Imported above.

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

      // Russian Roulette — failed bluff fires an immediate spin (no host/player
      // "pull the trigger" step).
      if (engine.shouldImmediateSpin(room)) {
        await applySpinAndBroadcast(io, room.code, room, spinTarget, leaderboardRepo);
        return callback({ success: true });
      }

      // Issue 1 — guard against a spin that never gets performed.
      _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);

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

      // A real spin arrived — cancel the spin_pending auto-resolve safety timer
      // (Issue 1) before running the shared spin pipeline.
      _clearSpinPendingTimer(room.code);
      const spinResult = await applySpinAndBroadcast(io, code, room, player, leaderboardRepo);
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Take the offered redemption spin (Phase E1) ─────
  socket.on('redemption_spin', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.phase !== 'redemption_pending') return callback?.({ success: false, error: 'No redemption pending' });
      if (room.redemption?.playerId !== socket.userId) {
        return callback?.({ success: false, error: 'Not your redemption spin' });
      }
      const result = await resolveRedemption(io, code, room, leaderboardRepo);
      callback?.({ success: true, result });
    } catch (err) {
      callback?.({ success: false, error: err.message });
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
      // Tutorial clinic — own-turn drills (Peek/Freeze/Assassin) disable Call Bluff
      // so the learner stays on script. (The client also hides the button.)
      if (room.tutorialScenario?.lockBluff) {
        return callback({ success: false, error: 'Not part of this lesson step' });
      }

      // Covenant — The Pact. Partners can NEVER call each other's bluffs. Reject
      // privately (no table-visible event) WITHOUT consuming the caller's bluff
      // for this turn (return before bluffUsedThisTurn is set).
      if (room.mode === engine.MODES.ONLINE) {
        const accusedId = engine.getPreviousTurnPlayerId(room);
        if (engine.isPactBluffBlocked(room, playerId, accusedId)) {
          io.to(socket.id).emit('pact_bluff_blocked', {});
          return callback({ success: false, error: 'pact_bluff_blocked' });
        }
      }

      // Covenant — Blood Debt. A caller carrying a debt fires an EXTRA "debt
      // spin" on themselves after the primary resolution. Queue it now (don't
      // consume the flag yet — that happens when the debt spin actually fires,
      // from spin_acknowledged). Online only; the flag is Covenant-exclusive.
      if (room.mode === engine.MODES.ONLINE && engine.checkCallerHasBloodDebt(room, playerId)) {
        room.pendingBloodDebtSpin = { debtorId: playerId };
      }

      room.bluffUsedThisTurn = true;
      const callerPlayer = room.players.find(p => p.id === playerId);
      logTurnState(code, playerId, 'call_bluff', room, { accusedId: engine.getPreviousTurnPlayerId(room) });

      if (room.mode === engine.MODES.ONLINE) {
        // §1.1 — interception window. If the accused (the previous player, who
        // is OFF-turn) still holds an un-armed defensive power card, pause and
        // let them arm it in response BEFORE the bluff resolves. The resolution
        // queue reads the freshly-armed card when we resume — no pipeline
        // change is needed. On arm/pass/timeout we run `_resolveOnlineBluff`.
        if (await maybeOpenBluffIntercept(io, code, room, playerId, leaderboardRepo)) {
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
      // §1.2 — close the window WITHOUT ending any turn. Whether the accused
      // armed a defence or passed, the on-turn accuser keeps priority; we only
      // restore `playing` + clear the pending state and let the bluff resolve.
      // Passing here never routes into an implicit turn-end.
      const onTurnBefore = room.turnOrder?.[room.currentTurnIndex] ?? null;
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
      } else {
        console.log(`[Room ${code}] ${pending.accusedName || socket.userId} PASSED the bluff-intercept — on-turn player ${onTurnBefore} retains the turn; resolving bluff.`);
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
        // Issue 1 — guard against a spin that never gets performed.
        _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
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
