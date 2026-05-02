// ============================================================
// BLUFF PIPELINE — Phase C
// ============================================================
//
// `call_bluff` used to live as a procedural blob inside the socket
// handler. With v2's bluff-time power cards (Shield / Mirror / Swap /
// Assassin) and the upcoming Phase D roles (Sheriff exempts the
// caller from Assassin) it has to grow several conditional branches
// AND several short-circuits — exactly the shape that gets messy
// fast in inline code.
//
// This module hosts a single entry point — `resolveBluff(room, accuserId)`
// — that runs the resolution as a series of small, named stages. Each
// stage is a pure-ish function: it can read the room, append events,
// mutate `state` (the per-pipeline scratch), and either return to
// continue OR set `state.shortCircuit = true` to stop the run.
//
// Side effects (announce-banner socket emits, room phase mutation,
// chamber spinning, hand reset) are performed by the *caller* —
// `socketHandlers.js`. The pipeline is pure logic + a list of
// `events` for the caller to broadcast.
//
// Public surface:
//
//   resolveBluff(room, accuserId)
//     → {
//         events:  PowerCardEvent[],   // announce-banner payloads
//         outcome: {
//           kind: 'spin' | 'blocked' | 'eliminated' | 'swap_pending',
//           // for 'spin':
//           spinTargetId?: string,
//           bluffIsCorrect?: boolean,
//           accuserId?: string,
//           accusedId?: string,
//           revealedCard?: Card | null,
//           // for 'blocked':
//           // (no extras — caller advances turn normally)
//           // for 'eliminated' (Assassin path):
//           eliminatedPlayerId?: string,
//           eliminatedReason?: 'assassin',
//           // for 'swap_pending':
//           swapHolderId?: string,
//         },
//       }
//
// Pipeline stages, in order:
//   1. Shield check on accused → blocked (consume Shield)
//   2. Assassin check on accused → eliminate accuser (consume Assassin)
//      • Sheriff role exemption hook (Phase D)
//   3. Determine bluff correctness
//   4. Mirror check on accused → redirect spin to accuser (consume Mirror)
//   5. Swap check on accused → return swap_pending (caller pauses for pick)
//   6. Default: spin target = correct caller or wrong caller per existing rules
//
// Phase D entry points:
//   • Sheriff (player.role === 'sheriff') is checked in the Assassin
//     stage — see `_isSheriff(...)`. Today returns false; Phase D
//     flips the body on once roles ship.
//   • Bounty / role-driven mods bolt on as new stages between (3) and
//     (6) without touching existing ones.
// ============================================================

const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];

// ─── Tiny helpers ─────────────────────────────────────────────

function _findPlayer(room, playerId) {
  return room.players.find(p => p.id === playerId) || null;
}

function _consumeArmedCard(room, player) {
  if (!player) return null;
  const armed = player.armedPowerCard;
  if (!armed) return null;
  const hand = room.hands?.get(player.id);
  if (hand) {
    const idx = hand.findIndex(c => c?.id === armed.cardId);
    if (idx !== -1) {
      const [card] = hand.splice(idx, 1);
      if (!room.discardPile) room.discardPile = [];
      room.discardPile.push(card);
    }
  }
  player.armedPowerCard = null;
  return armed;
}

function _accusedPrev(room) {
  const len = room.turnOrder.length;
  if (!len) return null;
  const prevIdx = (room.currentTurnIndex - 1 + len) % len;
  return _findPlayer(room, room.turnOrder[prevIdx]);
}

function _isBluffCorrect(room) {
  const revealed = room.lastPlayedCard;
  if (!revealed) return true; // No card played → "the previous player can't have told the truth"
  if (revealed.shape === 'whot') return false;
  return revealed.shape !== room.currentCardType;
}

// Phase D hook — Sheriff role exempts the accuser from Assassin's
// strike. Now LIVE: reads `player.role === 'sheriff'` (set at
// startGame by engine.assignRoles when alive count >= 9). The
// Sheriff also gains a passive risk-drop on correct bluff calls
// — that lives in stage 6 below.
function _isSheriff(room, playerId) {
  return _findPlayer(room, playerId)?.role === 'sheriff';
}

function _isGambler(room, playerId) {
  return _findPlayer(room, playerId)?.role === 'gambler';
}

// v2 Phase D — Gambler: when a bluff is correctly called on the
// Gambler, their risk level jumps to 4 BEFORE the spin happens.
// This is implemented by re-shaping their chamber array to hold
// exactly 4 bullets at random positions (preserving the spec's
// "risk level = bullet count" invariant). External modifiers
// (Sudden Death, etc.) still affect Gambler's risk normally because
// they read `player.chamber`/`player.riskLevel` like everyone else.
function _bumpGamblerRiskToFour(player) {
  const TARGET = 4;
  const SIZE = player.chamber.length;
  const filled = new Array(SIZE).fill(null);
  // Random-distinct slot sampling.
  const indices = [];
  while (indices.length < TARGET) {
    const idx = Math.floor(Math.random() * SIZE);
    if (!indices.includes(idx)) indices.push(idx);
  }
  for (const i of indices) filled[i] = 'bullet';
  player.chamber = filled;
  player.riskLevel = TARGET;
}

// ─── Stage 1: Shield ──────────────────────────────────────────
//
// Shield blocks the bluff outright. Per spec, the bluff "never
// officially registers" — so subsequent stages, including Assassin,
// don't fire. Accuser loses their bluff-call opportunity and must
// just play a card and end turn normally (the caller flips
// `bluffUsedThisTurn` so the game gates reflect this).
function _stageShield(room, state) {
  const { accused } = state;
  if (!accused?.armedPowerCard || accused.armedPowerCard.power !== 'shield') return;

  _consumeArmedCard(room, accused);
  state.events.push({
    kind: 'shield_blocked',
    holderId: accused.id,
    holderName: accused.username,
  });
  state.outcome = {
    kind: 'blocked',
    accuserId: state.accuser?.id || null,
    accusedId: accused.id,
  };
  state.shortCircuit = true;
}

// ─── Stage 2: Assassin ────────────────────────────────────────
//
// Assassin fires regardless of whether the bluff was correct. Caller
// is eliminated. Spec note: Shield > Assassin (handled by stage 1
// short-circuiting before we reach this stage). Sheriff > Assassin
// is wired in as a Phase D hook below.
function _stageAssassin(room, state) {
  const { accuser, accused } = state;
  if (!accused?.armedPowerCard || accused.armedPowerCard.power !== 'assassin') return;

  // Phase D Sheriff exemption hook — Sheriff cannot be killed by
  // Assassin. Phase C: stays armed, no effect (function returns
  // false). Phase D: this branch fires the role's protection banner.
  if (_isSheriff(room, accuser?.id)) {
    // Phase D: emit a Sheriff-protection event here, leave Assassin
    // armed, do NOT mark bluff as resolved (the bluff still
    // proceeds normally to stage 3+). For now, flag the future hook:
    // eslint-disable-next-line no-unused-vars
    const PHASE_D_SHERIFF_HOOK = true;
    return;
  }

  _consumeArmedCard(room, accused);
  state.events.push({
    kind: 'assassin_strike',
    holderId: accused.id,
    holderName: accused.username,
    eliminatedId: accuser?.id || null,
    eliminatedName: accuser?.username || null,
  });
  state.outcome = {
    kind: 'eliminated',
    eliminatedPlayerId: accuser?.id || null,
    eliminatedReason: 'assassin',
    accuserId: accuser?.id || null,
    accusedId: accused.id,
  };
  state.shortCircuit = true;
}

// ─── Stage 3: Determine bluff correctness ────────────────────
//
// Cached on state so stages 4 and 6 can read it without recomputing.
function _stageBluffCorrectness(room, state) {
  state.bluffIsCorrect = _isBluffCorrect(room);
  state.revealedCard = room.lastPlayedCard || null;
}

// ─── Stage 4: Mirror ─────────────────────────────────────────
//
// Two scenarios, but both happen at this stage of the *incoming*
// bluff resolution (the one we're processing here). The "outgoing"
// scenario — Mirror holder calling a wrong bluff on someone else —
// is also routed through this same code path: the accuser/accused
// flip is a function of who holds Mirror, NOT a separate pipeline.
//
// Concretely:
//   • Scenario 1 (incoming): accused holds Mirror → spin redirected
//     to accuser regardless of correctness. Accused's turn ends.
//   • Scenario 2 (outgoing): accuser holds Mirror AND bluff is wrong
//     (accuser would normally spin) → spin redirected to accused.
//     Accuser's turn does NOT end.
//
// Stage 1 (Shield) and stage 2 (Assassin) already short-circuited.
// Stage 5 (Swap) runs AFTER us — see clash priority "Swap > Mirror"
// in the spec — but Swap re-runs bluff correctness AND re-runs the
// pipeline against the swapped card, so Mirror still gets a chance
// to fire on the post-swap world.
function _stageMirror(room, state) {
  const { accuser, accused } = state;

  // Scenario 1: accused holds Mirror — incoming reflection.
  if (accused?.armedPowerCard?.power === 'mirror') {
    _consumeArmedCard(room, accused);
    state.events.push({
      kind: 'mirror_reflected',
      holderId: accused.id,
      holderName: accused.username,
      redirectedToId: accuser?.id || null,
      redirectedToName: accuser?.username || null,
      scenario: 'incoming',
    });
    state.spinTargetId = accuser?.id || null;
    state.mirrorEndsAccusedTurn = true; // caller advances turn after spin
    return;
  }

  // Scenario 2: accuser holds Mirror AND bluff would normally spin
  // them (i.e. the bluff was wrong).
  if (accuser?.armedPowerCard?.power === 'mirror' && state.bluffIsCorrect === false) {
    _consumeArmedCard(room, accuser);
    state.events.push({
      kind: 'mirror_reflected',
      holderId: accuser.id,
      holderName: accuser.username,
      redirectedToId: accused?.id || null,
      redirectedToName: accused?.username || null,
      scenario: 'outgoing',
    });
    state.spinTargetId = accused?.id || null;
    state.mirrorEndsAccuserTurn = false; // caller does NOT advance turn
    return;
  }
}

// ─── Stage 5: Swap ───────────────────────────────────────────
//
// If the accused holds an *activatable* armed Swap, we pause the
// pipeline and ask the holder to pick a card from the played pile.
// Caller resumes the pipeline via `resumeAfterSwap(room, accuserId,
// pickedCardId)`.
//
// Clash priority: Swap > Mirror. So even if Mirror just set a
// redirect, Swap takes precedence and forces a re-run of the bluff
// resolution with the swapped card. We achieve that by short-
// circuiting here, then re-entering via `resumeAfterSwap`, which
// re-runs stages 3 + 4 + 6.
function _stageSwap(room, state) {
  const { accused } = state;
  if (!accused?.armedPowerCard || accused.armedPowerCard.power !== 'swap') return;

  // Find the swap card in the hand to verify activatability.
  const hand = room.hands?.get(accused.id) || [];
  const swapCard = hand.find(c => c?.id === accused.armedPowerCard.cardId);
  // Phase B's isSwapActivatable considers an unset pendingPlayerIds
  // as "no gate, activatable". By Phase C we only ever arm a Swap
  // through activatePowerCard which itself enforces the gate, so by
  // the time we get here the gate is satisfied. Nonetheless we
  // double-check here for defensive correctness — if somehow the gate
  // isn't met, we don't pause the pipeline (Mirror/default proceed).
  const stillGated = swapCard
    && Array.isArray(swapCard.swapPendingPlayerIds)
    && swapCard.swapPendingPlayerIds.length > 0;
  if (stillGated) return;

  state.outcome = {
    kind: 'swap_pending',
    swapHolderId: accused.id,
    accuserId: state.accuser?.id || null,
    accusedId: accused.id,
  };
  state.shortCircuit = true;
}

// ─── Stage 6: Default spin target ────────────────────────────
//
// If no earlier stage decided the spin target, fall back to the
// existing behaviour: bluff correct → accused spins; bluff wrong →
// accuser spins.
function _stageDefaultSpin(room, state) {
  if (state.spinTargetId !== undefined && state.spinTargetId !== null) return;
  state.spinTargetId = state.bluffIsCorrect
    ? state.accused?.id || null
    : state.accuser?.id || null;
}

// ─── Stage 7 (Phase D): Role-driven post-bluff effects ───────
//
// Two role-passives that fire AFTER bluff correctness + spin target
// have been determined:
//
//   • Gambler — if a bluff is CORRECTLY called against them, their
//     risk level jumps immediately to 4 (chamber rewritten to hold
//     4 bullets) BEFORE the spin. Both Mirror-redirected and direct
//     spin-on-Gambler paths trigger this when the accused = Gambler
//     and bluff was correct.
//
//   • Sheriff — every correct bluff call BY the Sheriff drops their
//     risk level by 1 (one bullet removed from chamber). Permanent
//     passive — fires every time, not once per game. Fires regardless
//     of spin outcome (the elimination of the accused doesn't matter
//     for the Sheriff's chamber).
function _stageRoleEffects(room, state) {
  if (state.bluffIsCorrect !== true) return;

  // Gambler — accused was the bluffer and got caught. Spin happens
  // AFTER this stage (caller's player_spin handler), so by bumping
  // chamber here the spin will land in a 4-bullet chamber.
  if (state.accused && _isGambler(room, state.accused.id)) {
    _bumpGamblerRiskToFour(state.accused);
    state.events.push({
      kind: 'gambler_caught',
      holderId: state.accused.id,
      holderName: state.accused.username,
    });
  }

  // Sheriff — accuser made a correct call. Drop a bullet.
  if (state.accuser && _isSheriff(room, state.accuser.id)) {
    const chamber = state.accuser.chamber;
    const bulletIndices = chamber
      .map((s, i) => (s === 'bullet' ? i : -1))
      .filter(i => i !== -1);
    if (bulletIndices.length > 0) {
      const removeIdx = bulletIndices[Math.floor(Math.random() * bulletIndices.length)];
      const next = [...chamber];
      next[removeIdx] = null;
      state.accuser.chamber = next;
      state.accuser.riskLevel = next.filter(s => s === 'bullet').length;
      state.events.push({
        kind: 'sheriff_relief',
        holderId: state.accuser.id,
        holderName: state.accuser.username,
        riskLevel: state.accuser.riskLevel,
      });
    }
  }
}

// ─── Pipeline driver ─────────────────────────────────────────

function _runStages(room, state, stages) {
  for (const stage of stages) {
    if (state.shortCircuit) break;
    stage(room, state);
  }
}

/**
 * Resolve a bluff call. See module-level docs for full contract.
 *
 * The room is mutated in-place for power-card consumption (cards
 * leave the hand and land in `room.discardPile`, `armedPowerCard`
 * is cleared). The CALLER (socketHandlers.js) is still responsible
 * for spinning the chamber, eliminating losers, broadcasting state,
 * and emitting `power_card_triggered` events from the returned list.
 */
function resolveBluff(room, accuserId) {
  const accuser = _findPlayer(room, accuserId);
  const accused = _accusedPrev(room);

  const state = {
    events: [],
    accuser,
    accused,
    spinTargetId: undefined,
    bluffIsCorrect: undefined,
    revealedCard: null,
    outcome: null,
    shortCircuit: false,
    // Mirror-specific flags — caller reads these to decide turn flow.
    mirrorEndsAccusedTurn: false,
    mirrorEndsAccuserTurn: false,
  };

  _runStages(room, state, [
    _stageShield,
    _stageAssassin,
    _stageBluffCorrectness,
    _stageMirror,
    _stageSwap,
    _stageDefaultSpin,
    _stageRoleEffects,
  ]);

  if (!state.outcome) {
    state.outcome = {
      kind: 'spin',
      spinTargetId: state.spinTargetId,
      bluffIsCorrect: state.bluffIsCorrect,
      accuserId: accuser?.id || null,
      accusedId: accused?.id || null,
      revealedCard: state.revealedCard,
      // Surface the Mirror flag so the caller knows whether to end
      // the accused's turn after the spin.
      mirrorEndsAccusedTurn: state.mirrorEndsAccusedTurn,
      mirrorEndsAccuserTurn: state.mirrorEndsAccuserTurn,
    };
  }

  return { events: state.events, outcome: state.outcome };
}

/**
 * Resume a bluff after a Swap pick.
 *
 * Swap mechanics (locked, per spec):
 *   1. The accused (Swap holder) plays a card face-down. Bluff is
 *      called on them. We paused the pipeline and asked them to
 *      pick one of the cards in `room.playedPile` — anonymously,
 *      no labels — to swap with their just-played card.
 *   2. The accused's played card (currently the top of `playedPile`,
 *      i.e. `room.lastPlayedCard`) is removed from the played pile
 *      and placed in the hand of whoever held the *picked* card
 *      originally — except played-pile cards have no owner, so we
 *      simply put the original played card back into the played pile
 *      at the picked card's slot.
 *   3. The picked card replaces `lastPlayedCard` (top of pile).
 *      Bluff correctness is re-evaluated against the swapped card.
 *      Mirror gets a fresh chance on the post-swap world.
 *   4. Both cards are revealed face-up to everyone (caller emits
 *      `swap_resolved` event; revealing UI lives client-side).
 *
 * Returns the same shape as `resolveBluff` so the caller's flow
 * stays uniform.
 */
function resumeAfterSwap(room, accuserId, pickedCardId) {
  const accuser = _findPlayer(room, accuserId);
  const accused = _accusedPrev(room);
  if (!accused) {
    return { events: [], outcome: { kind: 'spin', spinTargetId: accuserId, bluffIsCorrect: false } };
  }

  // The accused's played card sits at the top of room.playedPile
  // (placed there by validateAndPlayCard during play_card_online).
  // The picked card sits somewhere earlier in the pile. We swap
  // their positions in the pile so the picked card becomes the new
  // top (and therefore the new lastPlayedCard) and the accused's
  // original card lands in the picked card's old slot.
  const playedPile = room.playedPile || [];
  const originalIdx = playedPile.length - 1;
  const originalCard = playedPile[originalIdx] || null;
  const pickedIdx = playedPile.findIndex(c => c?.id === pickedCardId);

  if (pickedIdx === -1) {
    return {
      events: [],
      outcome: { kind: 'error', error: 'Picked card not in played pile' },
    };
  }
  if (!originalCard) {
    return {
      events: [],
      outcome: { kind: 'error', error: 'No played card to swap' },
    };
  }
  if (pickedIdx === originalIdx) {
    // Picked their own just-played card → no-op swap. Treat as a
    // wasted Swap (still consume it, fall through to normal bluff).
    // Continue to consume + reuse re-resolution logic.
  } else {
    const pickedCard = playedPile[pickedIdx];
    playedPile[pickedIdx] = originalCard;
    playedPile[originalIdx] = pickedCard;
    room.lastPlayedCard = pickedCard;
  }

  // Consume the Swap card itself.
  _consumeArmedCard(room, accused);

  // After mutation, the new lastPlayedCard is the swapped-in card.
  const swapEvent = {
    kind: 'swap_resolved',
    holderId: accused.id,
    holderName: accused.username,
    originalCard,
    swappedCard: room.lastPlayedCard,
  };

  // Re-run stages 3 (correctness) + 4 (Mirror) + 6 (default spin)
  // on the post-swap world. Stages 1 (Shield) and 2 (Assassin) DO
  // NOT re-run — they were already evaluated against the original
  // accused state. Their armed cards have either been consumed or
  // were never present, so re-running would be a no-op anyway, but
  // we still skip them deliberately to keep the spec-implied
  // sequencing: "Swap resolves first, then bluff check, then Mirror".
  const state = {
    events: [swapEvent],
    accuser,
    accused,
    spinTargetId: undefined,
    bluffIsCorrect: undefined,
    revealedCard: null,
    outcome: null,
    shortCircuit: false,
    mirrorEndsAccusedTurn: false,
    mirrorEndsAccuserTurn: false,
  };

  _runStages(room, state, [
    _stageBluffCorrectness,
    _stageMirror,
    _stageDefaultSpin,
    _stageRoleEffects,
  ]);

  if (!state.outcome) {
    state.outcome = {
      kind: 'spin',
      spinTargetId: state.spinTargetId,
      bluffIsCorrect: state.bluffIsCorrect,
      accuserId: accuser?.id || null,
      accusedId: accused?.id || null,
      revealedCard: state.revealedCard,
      mirrorEndsAccusedTurn: state.mirrorEndsAccusedTurn,
      mirrorEndsAccuserTurn: state.mirrorEndsAccuserTurn,
    };
  }

  return { events: state.events, outcome: state.outcome };
}

module.exports = {
  resolveBluff,
  resumeAfterSwap,
  // Exposed for tests:
  _internal: {
    _isBluffCorrect,
    _consumeArmedCard,
    _accusedPrev,
  },
};
