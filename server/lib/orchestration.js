// ============================================================
// SOCKET LIB — Mid-flow orchestration (pauses, post-elim hooks)
// ============================================================
// Pure-ish state mutators that handlers call to drive the game
// through Sniper/Medic pauses, bluff outcomes, post-elim system
// transitions, Mirror Match follow-ups, and leaver-pending cleanup.

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const {
  bettingTimers,
  ghostVoteTimers,
  getRoom,
  saveRoom,
  _clearBettingTimer,
  _clearGhostVoteTimer,
} = require('./state');
const { broadcastRoomState, emitPowerCardEvents } = require('./broadcast');

/**
 * Compute the alive Sniper's eligible redirect targets — every
 * alive player EXCEPT the Sniper themselves and any current Mirror
 * holder.
 */
function _sniperEligibleTargets(room, sniperId) {
  return room.players
    .filter(p =>
      p.status === 'alive'
      && p.id !== sniperId
      && p.armedPowerCard?.power !== 'mirror'
    )
    .map(p => p.id);
}

function maybeStartSniperPause(io, room, outcome) {
  // Only a redirectable spin consequence can be sniped — eliminations,
  // blocks, backfires and swap-pauses are off-limits.
  if (!outcome || outcome.type !== engine.GAME_EVENT_TYPES.SPIN_CONSEQUENCE) return false;
  const sniper = engine.findAvailableSniper(room);
  if (!sniper) return false;

  const eligible = _sniperEligibleTargets(room, sniper.id);
  if (eligible.length === 0) return false;

  const originalTarget = room.players.find(p => p.id === outcome.spinTargetId);
  room.phase = 'sniper_pending';
  room.pendingSniperRedirect = {
    sniperId: sniper.id,
    originalSpinTargetId: outcome.spinTargetId,
    originalSpinTargetName: originalTarget?.username || null,
    eligibleTargetIds: eligible,
    deferredOutcome: outcome,
  };
  room.lastAction = {
    type: 'sniper_pending',
    sniperId: sniper.id,
    originalSpinTargetId: outcome.spinTargetId,
    originalSpinTargetName: originalTarget?.username || null,
  };

  if (sniper.socketId) {
    io.to(sniper.socketId).emit('sniper_redirect_pending', {
      originalSpinTargetId: outcome.spinTargetId,
      originalSpinTargetName: originalTarget?.username || null,
      eligibleTargetIds: eligible,
    });
  }
  return true;
}

function maybeStartMedicPause(io, room, eliminatedPlayerId, source, finaliseFn) {
  const medic = engine.findAvailableMedic(room);
  if (!medic) return false;

  const eliminated = room.players.find(p => p.id === eliminatedPlayerId);
  room.phase = 'medic_pending';
  room.pendingMedicSave = {
    medicId: medic.id,
    eliminatedPlayerId,
    eliminatedPlayerName: eliminated?.username || null,
    source,
    finaliseFn,
  };

  if (medic.socketId) {
    io.to(medic.socketId).emit('medic_save_pending', {
      eliminatedPlayerId,
      eliminatedPlayerName: eliminated?.username || null,
      source,
    });
  }
  return true;
}

function finaliseAssassinElimination(room, outcome) {
  const eliminatedId = outcome.eliminatedPlayerId;
  if (eliminatedId) {
    const eliminated = room.players.find(p => p.id === eliminatedId);
    if (eliminated) {
      eliminated.status = 'eliminated';
      eliminated.isSpectator = true;
    }
    engine.eliminateFromTurnOrder(room, eliminatedId);
    engine.newCardType(room);
  }
  room.phase = 'playing';
  room.spinTargetId = null;
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room.lastAction = {
    type: 'assassin_strike',
    eliminatedId,
    eliminatedName: room.players.find(p => p.id === eliminatedId)?.username || null,
    assassinHolderId: outcome.accusedId,
    assassinHolderName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
  };
  const gameOverWinner = engine.checkGameOver(room);
  if (gameOverWinner) {
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
  }
}

function _bountyOnSurvival(room, playerId) {
  return engine.onSurvivalForBounty(room, playerId);
}

function _bountyOnElimination(room, playerId) {
  engine.onEliminationForBounty(room, playerId);
}

function _decidePostElimSystemPhase(room) {
  if (engine.shouldEnterLastStand(room)) return { kind: 'last_stand' };
  if (engine.shouldOpenGhostVote(room)) return { kind: 'ghost_vote' };
  return null;
}

/**
 * Open a 10s betting window if betting is enabled. Schedules the
 * close via setTimeout; on fire, closes the window and broadcasts.
 */
function _maybeOpenBetting(io, room) {
  if (!room?.config?.systems?.betting) return false;
  if (room.phase !== 'spin_pending') return false;
  const eligibleIds = engine.startBettingWindow(room);
  if (!eligibleIds || eligibleIds.length === 0) return false;
  const code = room.code;
  _clearBettingTimer(code);
  const handle = setTimeout(async () => {
    bettingTimers.delete(code);
    const r = await getRoom(code);
    if (!r || !r.betting) return;
    engine.closeBettingWindow(r);
    await saveRoom(r);
    await broadcastRoomState(io, code);
  }, engine.BETTING_WINDOW_MS);
  bettingTimers.set(code, handle);
  io.to(code).emit('power_card_triggered', {
    kind: 'betting_open',
    spinTargetId: room.spinTargetId,
    spinTargetName: room.players.find(p => p.id === room.spinTargetId)?.username || null,
    closesAt: room.betting.closesAt,
  });
  return true;
}

function _openGhostVote(io, room) {
  const code = room.code;
  engine.startGhostVote(room);
  room.phase = 'ghost_vote_pending';
  room.lastAction = {
    type: 'ghost_vote_started',
    closesAt: room.ghostVote.closesAt,
  };
  _clearGhostVoteTimer(code);
  const handle = setTimeout(async () => {
    ghostVoteTimers.delete(code);
    const r = await getRoom(code);
    if (!r || !r.ghostVote) return;
    const banner = engine.resolveGhostVote(r);
    r.phase = 'playing';
    r.lastAction = {
      type: 'ghost_vote_resolved',
      winningOption: banner?.winningOption || null,
      applied: banner?.applied || 'noop',
    };
    await saveRoom(r);
    if (banner) io.to(code).emit('power_card_triggered', banner);
    await broadcastRoomState(io, code);
  }, engine.DMH_VOTE_WINDOW_MS);
  ghostVoteTimers.set(code, handle);
  io.to(code).emit('power_card_triggered', {
    kind: 'ghost_vote_started',
    closesAt: room.ghostVote.closesAt,
  });
}

function _enterLastStand(io, room) {
  const code = room.code;
  engine.enterLastStand(room);
  io.to(code).emit('power_card_triggered', {
    kind: 'last_stand_entered',
    finalistIds: room.lastStand?.finalistIds || [],
  });
}

/**
 * Apply a bluff-pipeline outcome to room state.
 * - 'blocked' → caller's bluff wasted; advance turn normally.
 * - 'spin' → set phase to spin_pending, store spinTargetId + lastAction.
 * - 'eliminated' → kill the named player, advance turn out of them.
 * - 'swap_pending' → set phase to swap_pending, expose swapHolderId.
 */
function applyBluffOutcome(room, outcome) {
  if (!outcome) return null;
  const E = engine.GAME_EVENT_TYPES;
  // Consume the typed GameEvent. `outcome.type` mirrors the terminal
  // event the ResolutionQueue produced; the default (no match) is a
  // normal spin consequence.
  const eventType = outcome.type;

  if (eventType === E.BLUFF_BLOCKED) {
    room.phase = 'playing';
    room.spinTargetId = null;
    room.lastAction = {
      type: 'bluff_blocked',
      shieldHolderId: outcome.accusedId,
      accuserId: outcome.accuserId,
    };
    return outcome;
  }

  if (eventType === E.FORCED_ELIMINATION) {
    finaliseAssassinElimination(room, outcome);
    return outcome;
  }

  if (eventType === E.ASSASSIN_BACKFIRE) {
    room.phase = 'playing';
    room.spinTargetId = null;
    room.cardPlayedThisTurn = false;
    room.lastAction = {
      type: 'assassin_backfire',
      accusedId: outcome.accusedId,
      accusedName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
      accuserId: outcome.accuserId,
      accuserName: room.players.find(p => p.id === outcome.accuserId)?.username || null,
      cardsDrawn: outcome.cardsToDrawForAccused || 0,
    };
    return outcome;
  }

  if (eventType === E.SWAP_PENDING) {
    room.phase = 'swap_pending';
    room.swapHolderId = outcome.swapHolderId;
    room.lastAction = {
      type: 'swap_pending',
      swapHolderId: outcome.swapHolderId,
      accuserId: outcome.accuserId,
      accusedId: outcome.accusedId,
    };
    return outcome;
  }

  // Default: spin
  room.phase = 'spin_pending';
  room.spinTargetId = outcome.spinTargetId;
  const target = room.players.find(p => p.id === outcome.spinTargetId);
  room.lastAction = {
    type: 'spin_pending',
    spinTargetId: outcome.spinTargetId,
    spinTargetName: target?.username || null,
    bluffCorrect: outcome.bluffIsCorrect,
    autoResolved: true,
    accuserId: outcome.accuserId,
    accuserName: room.players.find(p => p.id === outcome.accuserId)?.username || null,
    accusedId: outcome.accusedId,
    accusedName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
    revealedCard: outcome.revealedCard || null,
    mirrorEndsAccusedTurn: outcome.mirrorEndsAccusedTurn || false,
    mirrorEndsAccuserTurn: outcome.mirrorEndsAccuserTurn || false,
  };
  return outcome;
}

/**
 * Trampoline: post-elimination, decide what's next on the table.
 *   1. game_over   — single survivor.
 *   2. last_stand  — exactly two alive (and Last Stand enabled).
 *   3. ghost_vote  — DMH threshold crossed (and DMH enabled).
 *   4. nothing     — caller continues normal flow.
 */
function applyPostElimSystemHooks(io, room) {
  const winner = engine.checkGameOver(room);
  if (winner) {
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: winner.id, winnerName: winner.username };
    return { transitioned: 'game_over' };
  }
  const decision = _decidePostElimSystemPhase(room);
  if (!decision) return { transitioned: null };
  if (decision.kind === 'last_stand') {
    _enterLastStand(io, room);
    return { transitioned: 'last_stand' };
  }
  if (decision.kind === 'ghost_vote') {
    _openGhostVote(io, room);
    return { transitioned: 'ghost_vote_pending' };
  }
  return { transitioned: null };
}

/**
 * v2 Phase E2 — Mirror Match second-spin runner.
 * Called from spin_acknowledged after the primary spin's overlay is
 * dismissed. Runs an additional engine.spinGun against the queued
 * opposite-player target, broadcasts a spin_result lastAction, and
 * handles game-over hold-back identically to the primary path.
 */
async function runMirrorMatchSpin(io, room, pending) {
  if (!room || !pending?.targetId) return;
  const code = room.code;
  const target = room.players.find(p => p.id === pending.targetId);
  if (!target || target.status !== 'alive') {
    await broadcastRoomState(io, code);
    return;
  }

  room._mirrorMatchInFlight = true;
  try {
    const riskLevelBefore = target.riskLevel;
    const chamberBefore = [...target.chamber];
    const spinResult = engine.spinGun(target, engine.getSpinModifiers(room));

    let medicPaused = false;
    if (spinResult.eliminated) {
      const finalise = () => {
        engine.eliminateFromTurnOrder(room, target.id);
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

      medicPaused = maybeStartMedicPause(io, room, target.id, 'spin', finalise);
      if (!medicPaused) finalise();
    } else if (room.mode === engine.MODES.ONLINE) {
      engine.resetHandOnSurvival(room, target.id);
    }

    if (!medicPaused) room.phase = 'playing';
    room.spinTargetId = null;

    room.lastAction = {
      type: 'spin_result',
      spinTargetId: target.id,
      spinTargetName: target.username,
      spinIndex: spinResult.spinIndex,
      chamber: chamberBefore,
      chamberAfter: spinResult.chamber,
      roll: spinResult.spinIndex,
      eliminated: spinResult.eliminated,
      riskLevel: spinResult.riskLevel,
      riskLevelBefore,
      medicPending: medicPaused,
      mirrorMatch: true,
      mirrorMatchTriggeredBy: pending.triggeredBy,
      ...(spinResult.eliminated && !medicPaused ? { newCardType: room.currentCardType } : {}),
    };

    await saveRoom(room);
    await broadcastRoomState(io, code);
  } finally {
    delete room._mirrorMatchInFlight;
  }
}

/**
 * Resolve any pending pause where `playerId` is the gating actor, so
 * the room doesn't deadlock when they leave or disconnect mid-pause.
 * Called from leave_room. The disconnect-grace-timer keeps an inline
 * copy for now; deduping is a follow-up.
 */
function resolveLeaverPendingPauses(io, code, room, playerId) {
  if (room.phase === 'medic_pending' && room.pendingMedicSave?.medicId === playerId) {
    const pending = room.pendingMedicSave;
    if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
    room.pendingMedicSave = null;
    if (room.phase === 'medic_pending') room.phase = 'playing';
  }
  if (room.phase === 'sniper_pending' && room.pendingSniperRedirect?.sniperId === playerId) {
    const pending = room.pendingSniperRedirect;
    const outcome = pending.deferredOutcome;
    room.pendingSniperRedirect = null;
    applyBluffOutcome(room, outcome);
  }
  if (room.phase === 'swap_pending' && room.swapHolderId === playerId) {
    const accuserId = room.lastAction?.accuserId;
    const top = room.playedPile?.[room.playedPile.length - 1];
    if (accuserId && top?.id) {
      const { events: swapEvents, outcome: swapOutcome } =
        bluffPipeline.resumeAfterSwap(room, accuserId, top.id);
      room.swapHolderId = null;
      if (swapOutcome && swapOutcome.type !== engine.GAME_EVENT_TYPES.BLUFF_ERROR) {
        applyBluffOutcome(room, swapOutcome);
      }
      emitPowerCardEvents(io, code, swapEvents);
    } else {
      room.swapHolderId = null;
      room.phase = 'playing';
    }
  }
}

module.exports = {
  _sniperEligibleTargets,
  maybeStartSniperPause,
  maybeStartMedicPause,
  finaliseAssassinElimination,
  _bountyOnSurvival,
  _bountyOnElimination,
  _decidePostElimSystemPhase,
  _maybeOpenBetting,
  _openGhostVote,
  _enterLastStand,
  applyBluffOutcome,
  applyPostElimSystemHooks,
  runMirrorMatchSpin,
  resolveLeaverPendingPauses,
};
