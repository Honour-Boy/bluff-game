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
  spinPendingTimers,
  gameOverTimers,
  redemptionTimers,
  getRoom,
  saveRoom,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearBluffInterceptTimer,
  _clearSpinPendingTimer,
  _clearGameOverTimer,
  _clearRedemptionTimer,
  logTurnState,
} = require('./state');
const { broadcastRoomState, emitPowerCardEvents } = require('./broadcast');
const { maybeRecordGroupWinner, maybeAwardGameXp } = require('./roomBuilders');

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
  // Pass the just-eliminated id so a Medic eliminated by THIS spin can still be
  // found to save themselves (spinGun already flipped them to 'eliminated').
  const medic = engine.findAvailableMedic(room, eliminatedPlayerId);
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

  // #121 — the whole room must know the game is paused awaiting a Medic
  // decision, not just the Medic. Broadcast a public `medic_deciding`
  // announcement to every client; the Medic additionally gets the
  // private save prompt below.
  io.to(room.code).emit('power_card_triggered', {
    kind: 'medic_deciding',
    medicId: medic.id,
    eliminatedPlayerId,
    eliminatedPlayerName: eliminated?.username || null,
    source,
  });

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
  // §1.1 — do NOT clear the turn-action ledger here. This resolves a bluff
  // mid-turn; the accuser is still the on-turn player. Clearing cardPlayedThisTurn
  // would re-open a second card play (the post-bluff double-play exploit). The
  // ledger is cleared only by advanceTurn when the turn genuinely changes.
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
    // §1.1 — global hand reshuffle + target-card cycle on this resolved bluff.
    const reshuffle = engine.applyGlobalBluffReshuffle(room);
    room.lastAction = {
      type: 'bluff_blocked',
      // §1.3 — the Shield holder is the event target (the accused for a
      // Tier-1 block, the accuser for an Assassin-strike block).
      shieldHolderId: outcome.shieldHolderId ?? outcome.accusedId,
      accuserId: outcome.accuserId,
      ...(reshuffle.reshuffled ? { globalReshuffle: true, newCardType: reshuffle.cardType } : {}),
    };
    return outcome;
  }

  if (eventType === E.FORCED_ELIMINATION) {
    finaliseAssassinElimination(room, outcome);
    // §1.1 — reshuffle once the strike has settled, unless the elimination
    // already ended the game (no point re-dealing a finished table).
    if (room.phase !== 'game_over') engine.applyGlobalBluffReshuffle(room);
    return outcome;
  }

  if (eventType === E.ASSASSIN_BACKFIRE) {
    room.phase = 'playing';
    room.spinTargetId = null;
    // §1.1 — global hand reshuffle + target-card cycle on this resolved bluff.
    const reshuffle = engine.applyGlobalBluffReshuffle(room);
    // §1.1 turn-action ledger intentionally preserved (see
    // finaliseAssassinElimination): the on-turn player keeps their used-up
    // play/bluff so they can't act twice after the bluff resolves.
    room.lastAction = {
      type: 'assassin_backfire',
      accusedId: outcome.accusedId,
      accusedName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
      accuserId: outcome.accuserId,
      accuserName: room.players.find(p => p.id === outcome.accuserId)?.username || null,
      cardsDrawn: outcome.cardsToDrawForAccused || 0,
      ...(reshuffle.reshuffled ? { globalReshuffle: true, newCardType: reshuffle.cardType } : {}),
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

// ─── Spin resolution + state-machine safety timeouts ─────────
//
// `applySpinAndBroadcast` is the shared spin pipeline: pull the trigger for
// `player`, run the full post-spin flow (Mirror Match queue, Bounty/Betting,
// Medic pause, post-elim systems, global reshuffle), stamp the spin_result
// lastAction and broadcast. The interactive `player_spin` handler calls it after
// its own validation + betting gate; the spin_pending auto-resolve timer calls
// it server-side when the target never spins. Keeping ONE implementation means
// an auto-spin produces byte-for-byte the same result as a manual one.

// #6 — Highlight callouts. Updates the per-player survival streak and returns
// banner events to surface. Emitted over the same `power_card_triggered` channel
// as bounty/betting so they queue AFTER the spin overlay resolves. Only a
// RESOLVED outcome counts — a Medic-pending elimination is deferred (the streak
// is decided when Medic acts). (First-blood callout removed per design.)
function _computeSpinHighlights(room, player, spinResult, medicPaused) {
  if (medicPaused) return [];
  const events = [];
  if (spinResult.eliminated) {
    player.survivalStreak = 0;
  } else {
    player.survivalStreak = (player.survivalStreak || 0) + 1;
    const s = player.survivalStreak;
    // Escalating milestones: survive 3, 5, then every odd count from 7 up.
    if (s === 3 || s === 5 || (s >= 7 && s % 2 === 1)) {
      events.push({ kind: 'survival_streak', holderName: player.username, streak: s });
    }
  }
  return events;
}

/**
 * Run a spin for `player` and broadcast the result. Assumes the caller has
 * already validated phase/target. Returns the raw spinResult.
 */
// #237 — Russian Roulette auto-end-of-turn. Under Russian Roulette a failed bluff
// fires an IMMEDIATE spin (no manual "Pull the Trigger" step), so the on-turn
// player's turn must also end on its own once the spin lands — otherwise play
// hangs forever waiting for an End Turn the modifier deliberately removed. Mirrors
// the end_turn handler (freeze consume → advanceTurn → sudden-death tick) and is
// gated tightly so it only fires for the genuine RR auto-spin in online play.
//
// `onTurnIdBefore` is whoever's turn it was when the spin began:
//   • survived, or the spin eliminated someone EARLIER in the order → they are
//     still the current turn-taker, so we advance off them.
//   • THEY were the one eliminated → eliminateFromTurnOrder already moved the
//     pointer to the next player, so advancing again would skip a turn. Skip it.
function _maybeAutoEndTurnAfterImmediateSpin(room, onTurnIdBefore) {
  if (room.mode !== engine.MODES.ONLINE) return null;
  if (!room.config?.riskModifiers?.russianRoulette) return null;
  if (room.phase !== 'playing') return null;       // last_stand / ghost_vote / swap own the flow
  if (room.pendingGameOver) return null;           // decided match — let the game-over reveal run
  if (room.pendingMirrorMatchSpin) return null;    // a mirror spin is still queued
  if (room.pendingRedemption) return null;         // a redemption spin is still queued
  const onTurnPlayer = room.players.find(p => p.id === onTurnIdBefore);
  if (!onTurnPlayer || onTurnPlayer.status !== 'alive') return null; // was eliminated → pointer already moved
  if (!room.turnOrder.includes(onTurnIdBefore)) return null;

  const freezeTrigger = engine.consumeFreezeOnTurnEnd(room, onTurnIdBefore);
  engine.advanceTurn(room); // NOTE: this nulls room.lastAction — the caller re-stamps spin_result after.
  const suddenDeathBanner = engine.tickSuddenDeath(room);
  return { freezeTrigger, suddenDeathBanner };
}

async function applySpinAndBroadcast(io, code, room, player, leaderboardRepo) {
  // Auto-spin path: a betting window may still be open (the 10s window is
  // shorter than the spin timeout, but close it defensively so the spin can
  // proceed exactly as the interactive handler does once betting clears).
  if (room.betting && !room.betting.closed) {
    engine.closeBettingWindow(room);
    _clearBettingTimer(code);
  }

  // #237 — Russian Roulette auto-ends the turn after the immediate spin. Capture
  // who was on-turn BEFORE the spin can shuffle the order (eliminateFromTurnOrder
  // below moves the pointer when the spinner is themselves eliminated).
  const onTurnIdBefore = room.turnOrder[room.currentTurnIndex] || null;

  const riskLevelBefore = player.riskLevel;
  const chamberBefore = [...player.chamber];
  const spinResult = engine.spinGun(player, engine.getSpinModifiers(room));

  // Tutorial CLINIC bot only (lesson 'powers'): the reflected Mirror/Swap spin
  // must show a LOADED cylinder for drama, yet the bot can NEVER die here — a
  // stray death would end the round (and the clinic) before the Assassin drill,
  // the one place the bot is meant to be eliminated. So FORCE a survival that
  // lands on an empty slot and keep a live round visible in a non-landing slot.
  // Gated to the clinic so the BASICS bot (a normal chamber) still accumulates +
  // can die, letting the learner win the Basics round.
  if (room.isTutorial && room.tutorialLesson === 'powers' && player.isBot) {
    const emptySlots = chamberBefore.reduce((acc, s, i) => { if (s == null) acc.push(i); return acc; }, []);
    const landing = emptySlots.length ? emptySlots[Math.floor(Math.random() * emptySlots.length)] : 0;
    const survived = [...chamberBefore];
    // Click one more live round into a NON-landing empty slot (mirrors a normal
    // survival's +1) so the cylinder visibly loads up over the drill AND the
    // landing slot stays empty — keeping the invariant
    // (chamber[spinIndex]==='bullet' iff eliminated) intact.
    const nonLandingEmpties = emptySlots.filter(i => i !== landing);
    if (nonLandingEmpties.length) {
      survived[nonLandingEmpties[Math.floor(Math.random() * nonLandingEmpties.length)]] = 'bullet';
    }
    player.status = 'alive';
    player.isSpectator = false;
    player.chamber = survived;
    player.riskLevel = survived.filter(s => s === 'bullet').length;
    spinResult.eliminated = false;
    spinResult.spinIndex = landing;
    spinResult.chamber = survived;
    spinResult.riskLevel = player.riskLevel;
  }

  // v2 Phase E2 — Mirror Match: queue an opposite-player spin.
  if (
    room.mirrorMatchActive
    && !room._mirrorMatchInFlight
    && room.mode === engine.MODES.ONLINE
  ) {
    const oppositeId = engine.getMirrorMatchOpposite(room, player.id);
    if (oppositeId && oppositeId !== player.id) {
      room.pendingMirrorMatchSpin = { targetId: oppositeId, triggeredBy: player.id };
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
      // NOTE (bugfix): do NOT deal the current player an extra card here. The
      // §1.1 global reshuffle below re-deals EVERY alive player's hand to its
      // CURRENT size, so an extra draw here inflates the on-turn player by one.
      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        // Stamp the deferred game-over AND arm its safety timeout. Running this
        // inside finalise covers the deferred Medic-decline path too (medic_decide
        // calls this same closure).
        _stampPendingGameOver(io, room, gameOverWinner, leaderboardRepo);
      }
    };

    medicPaused = maybeStartMedicPause(io, room, player.id, 'spin', finalise);
    if (!medicPaused) finalise();
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

  // §1.1 — global bluff reshuffle once the spin (the bluff's tail) settles:
  // re-deal EVERY alive player's hand + cycle the target card. Skipped while a
  // Medic is deciding, when the game is ending, or after Last Stand / Ghost Vote
  // (those own their hand handling).
  let reshuffle = { reshuffled: false, cardType: room.currentCardType };
  if (
    !medicPaused
    && room.mode === engine.MODES.ONLINE
    && room.phase === 'playing'
    && !room.pendingGameOver
  ) {
    reshuffle = engine.applyGlobalBluffReshuffle(room);
  }

  room.spinTargetId = null;
  // §1.1 — a spin only happens as the tail of a bluff the on-turn player already
  // called. Mark the bluff used; do NOT clear cardPlayedThisTurn (the turn has
  // not advanced — re-opening it would allow a post-bluff double play). The
  // ledger clears only on advanceTurn (end_turn).
  room.bluffUsedThisTurn = true;
  logTurnState(code, room.turnOrder[room.currentTurnIndex], 'bluff_resolved_spin', room, { spunBy: player.id, eliminated: spinResult.eliminated });

  // Redemption Spin (Phase E1) — queue an offer for the just-eliminated player
  // to fire once this spin is acknowledged (see beginRedemption). Mirrors the
  // Mirror Match queue so it never interleaves with the spin overlay.
  let redemptionPending = false;
  if (spinResult.eliminated && !medicPaused && _redemptionEligible(room, player.id)) {
    room.pendingRedemption = { playerId: player.id, playerName: player.username };
    redemptionPending = true;
  }

  // #237 — Russian Roulette: end the turn automatically now the auto-spin landed.
  // Done BEFORE stamping lastAction because advanceTurn nulls lastAction; we then
  // re-stamp spin_result so every client still animates the cylinder.
  const autoEnd = _maybeAutoEndTurnAfterImmediateSpin(room, onTurnIdBefore);

  room.lastAction = {
    type: 'spin_result',
    // Monotonic per-room id so the client keys each spin uniquely. Two spins can
    // share a target AND an identical pre-spin chamber (e.g. the tutorial bot's
    // empty chamber across drills), which would otherwise collide the client's
    // dedup key and skip the second animation.
    spinSeq: (room.spinSeq = (room.spinSeq || 0) + 1),
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
    ...(redemptionPending ? { redemptionPending: true } : {}),
    ...(reshuffle.reshuffled
      ? { globalReshuffle: true, newCardType: reshuffle.cardType }
      : (spinResult.eliminated && !medicPaused ? { newCardType: room.currentCardType } : {})),
  };

  // #6 — highlight callouts (first blood / survival streak). Computed before
  // save so the streak counter + first-blood flag persist; emitted after.
  const highlightEvents = _computeSpinHighlights(room, player, spinResult, medicPaused);

  await saveRoom(room);
  console.log(`[Room ${code}] ${player.username} spun slot ${spinResult.spinIndex} → ${spinResult.eliminated ? (medicPaused ? 'ELIM (Medic deciding)' : 'ELIMINATED') : 'survived'}`);
  await broadcastRoomState(io, code);
  // Post-spin banners (bounty + betting streak + highlights) AFTER broadcast.
  for (const ev of bountyEvents) io.to(code).emit('power_card_triggered', ev);
  for (const ev of betEvents) io.to(code).emit('power_card_triggered', ev);
  for (const ev of highlightEvents) io.to(code).emit('power_card_triggered', ev);
  // #237 — turn-end side effects from the Russian Roulette auto-advance (freeze
  // skip / sudden-death tick), emitted on the same channel as the other banners.
  if (autoEnd?.freezeTrigger) io.to(code).emit('power_card_triggered', autoEnd.freezeTrigger);
  if (autoEnd?.suddenDeathBanner) io.to(code).emit('power_card_triggered', autoEnd.suddenDeathBanner);
  return spinResult;
}

/**
 * Issue 1 — arm the spin_pending auto-resolve timer. If the target never emits
 * player_spin within SPIN_PENDING_TIMEOUT_MS (and the room is still parked on
 * the same spin), the server performs the spin itself. Cleared on player_spin
 * and on room teardown. Idempotent: re-arming clears any prior handle.
 */
function _scheduleSpinPendingTimeout(io, code, leaderboardRepo) {
  _clearSpinPendingTimer(code);
  const handle = setTimeout(async () => {
    spinPendingTimers.delete(code);
    try {
      const room = await getRoom(code);
      // Only auto-spin if still genuinely waiting on the same spin.
      if (!room || room.phase !== 'spin_pending') return;
      const player = room.players.find(p => p.id === room.spinTargetId);
      if (!player || player.status !== 'alive') return;
      console.log(`[Room ${code}] spin_pending TIMED OUT — auto-spinning for ${player.username} server-side.`);
      await applySpinAndBroadcast(io, code, room, player, leaderboardRepo);
    } catch (err) {
      console.error('[spin_pending timeout]', err);
    }
  }, engine.SPIN_PENDING_TIMEOUT_MS);
  spinPendingTimers.set(code, handle);
}

/**
 * Stamp room.pendingGameOver and arm its auto-finalise timer (Issue 2). The
 * game-over reveal is deferred to the client's spin_acknowledged so it lands in
 * sync with the spin overlay; this timer guarantees it still resolves if that
 * ack never arrives.
 */
function _stampPendingGameOver(io, room, winner, leaderboardRepo) {
  room.pendingGameOver = { id: winner.id, name: winner.username };
  _scheduleGameOverTimeout(io, room.code, leaderboardRepo);
}

function _scheduleGameOverTimeout(io, code, leaderboardRepo) {
  _clearGameOverTimer(code);
  const handle = setTimeout(async () => {
    gameOverTimers.delete(code);
    try {
      const room = await getRoom(code);
      if (!room || !room.pendingGameOver) return;
      console.log(`[Room ${code}] pendingGameOver auto-finalised — spin_acknowledged never arrived.`);
      await resolvePendingGameOver(io, room, leaderboardRepo);
    } catch (err) {
      console.error('[pendingGameOver timeout]', err);
    }
  }, engine.PENDING_GAME_OVER_TIMEOUT_MS);
  gameOverTimers.set(code, handle);
}

/**
 * Transition a held pendingGameOver into the final game_over state. The single
 * implementation shared by the spin_acknowledged handler (client-driven) and
 * the pendingGameOver safety timer (server-driven) — identical behaviour either
 * way.
 */
async function resolvePendingGameOver(io, room, leaderboardRepo) {
  const code = room.code;
  _clearGameOverTimer(code);
  const { id, name } = room.pendingGameOver;
  room.phase = 'game_over';
  room.lastAction = { type: 'game_over', winnerId: id, winnerName: name };
  delete room.pendingGameOver;
  delete room.pendingMirrorMatchSpin;
  await maybeAwardGameXp(room);   // self-resolves defaultXpRepo
  await maybeRecordGroupWinner(io, room, leaderboardRepo);
  await saveRoom(room);
  io.to(code).emit('spin_acknowledged');
  await broadcastRoomState(io, code);
}

// ─── Redemption Spin (Phase E1) ──────────────────────────────
//
// User decision: trigger AT ELIMINATION. When a spin eliminates a player and
// the modifier is on, that player is offered ONE redemption spin — survive and
// rejoin (fresh chamber + 3 cards, pushed back into turn order); take the
// bullet and stay out. To avoid interleaving with the eliminating spin's
// overlay (the documented spin-overlay fragility), the offer is QUEUED on the
// room (room.pendingRedemption) and only fired once that spin is acknowledged,
// exactly like the Mirror Match follow-up. The redemption spin's own result is
// then surfaced as a normal `spin_result` (flagged `redemption: true`) so it
// reuses the battle-tested spin overlay + ack path for its animation.

/**
 * Is `playerId` eligible to be offered a redemption spin right now? Scoped to
 * spin eliminations in a live online game; skipped during Last Stand / Mirror
 * Match, when the player already used their one-shot, and when the elimination
 * ended the match (nothing to rejoin).
 */
function _redemptionEligible(room, playerId) {
  if (!room || room.mode !== engine.MODES.ONLINE) return false;
  if (!room.config?.riskModifiers?.redemptionSpin) return false;
  if (room.lastStandActive) return false;
  if (room.pendingMirrorMatchSpin || room._mirrorMatchInFlight) return false;
  if (room.pendingGameOver) return false;
  const p = room.players.find(pp => pp.id === playerId);
  if (!p || p.status !== 'eliminated' || p._redemptionConsumed) return false;
  // At least two players must remain alive — otherwise the elimination decided
  // the match and there's no game left to rejoin.
  const alive = room.players.filter(pp => pp.status === 'alive').length;
  return alive >= 2;
}

/**
 * Transition the room into redemption_pending for the queued candidate and arm
 * the safety timeout. Caller emits the follow-up spin_acknowledged. If the
 * candidate is no longer eligible (state moved on), fall back to playing.
 */
async function beginRedemption(io, room, leaderboardRepo) {
  const code = room.code;
  const pending = room.pendingRedemption;
  delete room.pendingRedemption;

  if (!pending || !_redemptionEligible(room, pending.playerId)) {
    if (room.phase === 'redemption_pending') room.phase = 'playing';
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return;
  }

  room.phase = 'redemption_pending';
  room.redemption = {
    playerId: pending.playerId,
    playerName: pending.playerName,
    deadline: Date.now() + engine.REDEMPTION_PENDING_TIMEOUT_MS,
  };
  _scheduleRedemptionTimeout(io, code, leaderboardRepo);
  await saveRoom(room);
  await broadcastRoomState(io, code);
}

/**
 * Run the offered redemption spin and return the room to play. Shared by the
 * redemption_spin handler (player-driven) and the safety timeout
 * (server-driven). The outcome is broadcast as a `spin_result` flagged
 * `redemption: true` so the existing spin overlay animates it.
 */
async function resolveRedemption(io, code, room, leaderboardRepo) {
  _clearRedemptionTimer(code);
  const pending = room.redemption;
  room.redemption = null;
  if (!pending) {
    if (room.phase === 'redemption_pending') room.phase = 'playing';
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return null;
  }

  const player = room.players.find(p => p.id === pending.playerId);
  const result = engine.runRedemptionSpin(room, pending.playerId);
  room.phase = 'playing';

  if (!result) {
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return null;
  }

  room.lastAction = {
    type: 'spin_result',
    spinSeq: (room.spinSeq = (room.spinSeq || 0) + 1),
    redemption: true,
    spinTargetId: result.playerId,
    spinTargetName: player?.username || pending.playerName || null,
    spinIndex: result.spinIndex,
    chamber: result.chamber,
    chamberAfter: result.chamberAfter,
    roll: result.spinIndex,
    eliminated: result.eliminated,
    riskLevel: result.riskLevel,
    riskLevelBefore: result.riskLevel,
  };

  // A redemption can only KEEP someone out or bring them back — it can't end
  // the game. Re-check defensively all the same.
  const winner = engine.checkGameOver(room);
  if (winner) _stampPendingGameOver(io, room, winner, leaderboardRepo);

  await saveRoom(room);
  console.log(`[Room ${code}] redemption spin for ${result.playerId} → ${result.eliminated ? 'STAYS OUT' : 'REJOINS'}`);
  await broadcastRoomState(io, code);
  return result;
}

function _scheduleRedemptionTimeout(io, code, leaderboardRepo) {
  _clearRedemptionTimer(code);
  const handle = setTimeout(async () => {
    redemptionTimers.delete(code);
    try {
      const room = await getRoom(code);
      if (!room || room.phase !== 'redemption_pending' || !room.redemption) return;
      console.log(`[Room ${code}] redemption_pending TIMED OUT — spinning server-side for ${room.redemption.playerId}.`);
      await resolveRedemption(io, code, room, leaderboardRepo);
    } catch (err) {
      console.error('[redemption_pending timeout]', err);
    }
  }, engine.REDEMPTION_PENDING_TIMEOUT_MS);
  redemptionTimers.set(code, handle);
}

/**
 * v2 Phase E2 — Mirror Match second-spin runner.
 * Called from spin_acknowledged after the primary spin's overlay is
 * dismissed. Runs an additional engine.spinGun against the queued
 * opposite-player target, broadcasts a spin_result lastAction, and
 * handles game-over hold-back identically to the primary path.
 */
async function runMirrorMatchSpin(io, room, pending, leaderboardRepo) {
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
        // NOTE (bugfix): no extra draw for the current player on elimination —
        // it inflates their hand by one (the "re-deal adds cards" bug). Hand
        // refresh is owned by the survival reset / §1.1 global reshuffle.
        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          _stampPendingGameOver(io, room, gameOverWinner, leaderboardRepo);
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
      spinSeq: (room.spinSeq = (room.spinSeq || 0) + 1),
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
    // #121 — the Medic vanished, so the suppressed death is now final.
    // Release the deferred announcement (or the generic skip notice).
    const deferred = Array.isArray(pending.deferredBanners) ? pending.deferredBanners : [];
    if (deferred.length > 0) {
      for (const b of deferred) io.to(code).emit('power_card_triggered', b);
    } else {
      io.to(code).emit('power_card_triggered', {
        kind: 'medic_skipped',
        medicId: pending.medicId,
        eliminatedPlayerId: pending.eliminatedPlayerId,
        eliminatedPlayerName: pending.eliminatedPlayerName,
      });
    }
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
  // §1.1 — a leaver in an open interception window. If the accused OR the
  // accuser is the one leaving, the pending bluff is moot: cancel the window
  // cleanly so the (immediate) leave-elimination + turn advance proceed, and
  // the 8s timer can't later resolve against a changed turn order. A third
  // party leaving leaves the window untouched.
  if (
    room.phase === 'bluff_intercept_pending'
    && room.pendingBluffIntercept
    && (room.pendingBluffIntercept.accusedId === playerId
      || room.pendingBluffIntercept.accuserId === playerId)
  ) {
    _clearBluffInterceptTimer(code);
    room.pendingBluffIntercept = null;
    room.phase = 'playing';
  }
}

// ─── Shared online bluff resolution ──────────────────────────
// The full post-`resolveBluff` flow (Sniper/Medic pauses, Assassin backfire,
// outcome application, post-elim hooks, betting, broadcast). Shared by the
// interactive `call_bluff` path, the §1.1 interception resume, AND the
// server-driven bot opponent (lib/bots.js) so every challenger — human or bot —
// resolves identically. Performs its own save + emit + broadcast; the caller (if
// any) only acks. Lives here, alongside every helper it calls, so it can be
// reused without dragging handler scope around.
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
    await maybeAwardGameXp(room);   // self-resolves defaultXpRepo
    await maybeRecordGroupWinner(io, room, leaderboardRepo);
  }

  // Russian Roulette — a failed bluff fires an IMMEDIATE spin: no manual
  // "pull the trigger" pause, no betting window. Emit the bluff power events
  // first, then run the spin pipeline (which saves + broadcasts itself).
  if (engine.shouldImmediateSpin(room)) {
    const target = room.players.find(p => p.id === room.spinTargetId);
    await saveRoom(room);
    emitPowerCardEvents(io, code, events);
    await applySpinAndBroadcast(io, code, room, target, leaderboardRepo);
    return;
  }

  if (room.phase === 'spin_pending') {
    _maybeOpenBetting(io, room);
    // Issue 1 — guard against a spin that never gets performed.
    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
  }

  await saveRoom(room);
  emitPowerCardEvents(io, code, events);
  await broadcastRoomState(io, code);
}

module.exports = {
  _sniperEligibleTargets,
  _resolveOnlineBluff,
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
  applySpinAndBroadcast,
  _scheduleSpinPendingTimeout,
  _stampPendingGameOver,
  resolvePendingGameOver,
  runMirrorMatchSpin,
  resolveLeaverPendingPauses,
  _redemptionEligible,
  beginRedemption,
  resolveRedemption,
};
