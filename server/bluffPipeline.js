// ============================================================
// BLUFF PIPELINE — Unified Event Resolution Engine (#119)
// ============================================================
//
// `call_bluff` resolution used to be a procedural blob, then a fixed
// array of stage functions whose priority was *implicit in array
// position*. #119 replaces that with a declarative, typed engine:
//
//   • Every effect is represented as a typed `GameEvent`
//     (see constants.js `GAME_EVENT_TYPES` + the `GameEvent` typedef).
//   • A single `GameEvent` is pushed through a `ResolutionQueue` of
//     exactly six ordered priority tiers (constants.js
//     `RESOLUTION_TIERS`). No tier runs until the previous one has
//     fully resolved.
//   • Each tier handler receives the event and returns the same event
//     (pass-through), a mutated / re-typed event, or `null` (cancelled).
//   • Clash priorities are NO LONGER encoded by ordering. They fall out
//     of the event flags: a non-`redirectable` event is one Tier-4
//     redirectors (Mirror / Sniper) must leave untouched — that is how
//     "Assassin > Mirror" is honoured without an `if assassin && mirror`
//     pairwise override.
//
//   Tier 1 Prevention      → Shield (Freeze has no bluff-time effect)
//   Tier 2 Modification     → Swap   (Peek has no bluff-time effect)
//   Tier 3 Bluff Validation → truth of the played card + consequence typing
//   Tier 4 Redirection      → Mirror (Sniper handled by the orchestrator)
//   Tier 5 Consequence      → spin target / Assassin FORCED_ELIMINATION
//   Tier 6 Post-Resolution   → Gambler, Sheriff relief, Bounty
//
// NOTE on Assassin placement: the Assassin's consequence is *typed*
// during Tier 3, because its branch is a function of bluff correctness
// AND because Tier-4 Mirror must be able to see a non-`redirectable`
// FORCED_ELIMINATION in order to refuse it. Tier 5 then *materialises*
// that consequence (consume the card, emit the strike). This keeps the
// "Assassin > Mirror" clash purely flag-driven.
//
// Side effects (announce-banner socket emits, room phase mutation,
// chamber spinning, hand reset, Sniper/Medic pauses) are still
// performed by the *callers* — `handlers/bluff.js` + `lib/orchestration.js`.
// The pipeline is pure logic + a list of `events` for the caller to
// broadcast.
//
// Public surface (UNCHANGED — callers + tests rely on `outcome.kind`):
//
//   resolveBluff(room, accuserId)     → { events, outcome }
//   resumeAfterSwap(room, accuserId, pickedCardId) → { events, outcome }
//
//   outcome.kind ∈ 'spin' | 'blocked' | 'eliminated' | 'assassin_backfire'
//                | 'swap_pending' | 'error'
//   outcome.event is the terminal typed GameEvent (for consumers that
//   prefer the typed surface; `outcome.kind` maps 1:1 to event.type).
// ============================================================

const {
  RESOLUTION_TIERS,
  GAME_EVENT_TYPES,
} = require('./engine/constants');
const { isBluffCorrect, buildBluffValidationEvent } = require('./engine/bluff');

// ─── Tiny helpers ─────────────────────────────────────────────

function _findPlayer(room, playerId) {
  return room.players.find(p => p.id === playerId) || null;
}

function _consumeArmedCard(room, player) {
  if (!player) return null;
  const armed = player.armedPowerCard;
  if (!armed) return null;
  const slot = room.powerCardSlot?.[player.id];
  if (Array.isArray(slot)) {
    const idx = slot.findIndex(c => c?.id === armed.cardId);
    if (idx !== -1) {
      const [card] = slot.splice(idx, 1);
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

// Thin alias kept for the `_internal` test surface — the rule itself
// lives in engine/bluff.js so there is exactly one implementation.
const _isBluffCorrect = isBluffCorrect;

// Phase D hook — Sheriff role exempts the accuser from Assassin's
// strike (also gains a passive risk-drop on correct calls — Tier 6).
function _isSheriff(room, playerId) {
  return _findPlayer(room, playerId)?.role === 'sheriff';
}

function _isGambler(room, playerId) {
  return _findPlayer(room, playerId)?.role === 'gambler';
}

// v2 Phase D — Gambler: a correctly-called bluff jumps their risk to 4
// BEFORE the spin by rewriting the chamber to hold exactly 4 bullets at
// random positions (preserving "risk level = bullet count").
function _bumpGamblerRiskToFour(player) {
  const TARGET = 4;
  const SIZE = player.chamber.length;
  const filled = new Array(SIZE).fill(null);
  const indices = [];
  while (indices.length < TARGET) {
    const idx = Math.floor(Math.random() * SIZE);
    if (!indices.includes(idx)) indices.push(idx);
  }
  for (const i of indices) filled[i] = 'bullet';
  player.chamber = filled;
  player.riskLevel = TARGET;
}

// APNAP tie-breaker — Active Player → Non-Active Player. When two or
// more handlers in the SAME tier want to fire simultaneously, resolve
// them in clockwise turn order starting from the active player
// (`currentTurnIndex`). Returns the candidate ids re-ordered to match.
function _apnapOrder(room, candidateIds) {
  const order = room.turnOrder || [];
  const start = room.currentTurnIndex || 0;
  const len = order.length;
  const rank = new Map();
  for (let step = 0; step < len; step++) {
    rank.set(order[(start + step) % len], step);
  }
  // Unknown ids (not in turnOrder) sort last, stable among themselves.
  return [...candidateIds].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : len + candidateIds.indexOf(a);
    const rb = rank.has(b) ? rank.get(b) : len + candidateIds.indexOf(b);
    return ra - rb;
  });
}

// ─── Typed GameEvent constructor ──────────────────────────────

function _event(type, { source = null, target = null, redirectable = false, preventable = false, payload = {} } = {}) {
  return { type, source, target, redirectable, preventable, payload };
}

// ─── Tier 1 — Prevention (Shield, Freeze) ─────────────────────
//
// Shield blocks the bluff outright — per spec it "never officially
// registers", so no later tier fires. Freeze is a turn-skip mechanic
// with no bluff-resolution effect, so it is a no-op here.
function _tierPrevention(room, event, ctx) {
  const { accused } = ctx;
  if (accused?.armedPowerCard?.power === 'shield') {
    _consumeArmedCard(room, accused);
    ctx.events.push({
      kind: 'shield_blocked',
      holderId: accused.id,
      holderName: accused.username,
    });
    ctx.halt = true;
    return _event(GAME_EVENT_TYPES.BLUFF_BLOCKED, {
      source: ctx.accuser?.id || null,
      target: accused.id,
      payload: { accuserId: ctx.accuser?.id || null, accusedId: accused.id },
    });
  }
  return event;
}

// ─── Tier 2 — Modification (Swap, Peek) ───────────────────────
//
// An activatable armed Swap pauses the queue and asks the holder to
// pick a card from the played pile; the caller resumes via
// `resumeAfterSwap`, which re-enters the queue at Tier 3. Peek has no
// bluff-resolution effect.
function _tierModification(room, event, ctx) {
  const { accused } = ctx;
  if (accused?.armedPowerCard?.power !== 'swap') return event;

  const slot = room.powerCardSlot?.[accused.id] || [];
  const swapCard = slot.find(c => c?.id === accused.armedPowerCard.cardId);
  // If the activation gate is still pending we do NOT pause — fall
  // through so Tier 3+ resolve the bluff normally.
  const stillGated = swapCard
    && Array.isArray(swapCard.swapPendingPlayerIds)
    && swapCard.swapPendingPlayerIds.length > 0;
  if (stillGated) return event;

  ctx.halt = true;
  return _event(GAME_EVENT_TYPES.SWAP_PENDING, {
    source: ctx.accuser?.id || null,
    target: accused.id,
    payload: {
      swapHolderId: accused.id,
      accuserId: ctx.accuser?.id || null,
      accusedId: accused.id,
    },
  });
}

// ─── Tier 3 — Bluff Validation (+ consequence typing) ─────────
//
// Determines truth of the played card (delegated to engine/bluff.js so
// the rule lives in one place) and types the consequence event:
//   • Assassin on the accused → a non-redirectable FORCED_ELIMINATION
//     (wrong call) or a terminal ASSASSIN_BACKFIRE (correct call),
//     unless the accuser is the immune Sheriff.
//   • otherwise → the redirectable SPIN_CONSEQUENCE from engine/bluff.js.
function _tierBluffValidation(room, event, ctx) {
  const { accuser, accused } = ctx;
  const { bluffIsCorrect, revealedCard, event: spinEvent } =
    buildBluffValidationEvent(room, accuser, accused);
  ctx.bluffIsCorrect = bluffIsCorrect;
  ctx.revealedCard = revealedCard;

  if (accused?.armedPowerCard?.power === 'assassin') {
    // Sheriff is immune — Assassin stays armed, bluff falls through to
    // the normal spin consequence (a correct Sheriff call still spins
    // the accused and earns its Tier-6 risk-drop).
    if (_isSheriff(room, accuser?.id)) {
      ctx.events.push({
        kind: 'sheriff_protected',
        holderId: accuser.id,
        holderName: accuser.username,
        assassinHolderId: accused.id,
        assassinHolderName: accused.username,
      });
      return spinEvent;
    }

    // Wrong bluff (accused told the truth) → forced elimination of the
    // accuser. Per #120 the typed event is the source of truth for the
    // clash rules:
    //   redirectable: false → Mirror (Tier 4) MUST refuse it (Assassin > Mirror).
    //   preventable: true   → Shield CAN cancel it (Shield > Assassin).
    // The `preventable` flag is declarative here: a player holds at most
    // one armed power card, and an armed Shield is already consumed at
    // Tier 1 (Prevention) before this consequence is ever typed — so the
    // clash is honoured by ordering. The flag keeps the GameEvent
    // self-describing for any future tier that reads it.
    if (bluffIsCorrect === false) {
      return _event(GAME_EVENT_TYPES.FORCED_ELIMINATION, {
        source: accused.id,
        target: accuser?.id || null,
        redirectable: false,
        preventable: true,
        payload: {
          eliminatedReason: 'assassin',
          accuserId: accuser?.id || null,
          accusedId: accused.id,
        },
      });
    }

    // Correct bluff → backfire. Terminal: card consumed, holder draws
    // +3, no spin, no elimination.
    _consumeArmedCard(room, accused);
    ctx.events.push({
      kind: 'assassin_backfire',
      holderId: accused.id,
      holderName: accused.username,
      accuserId: accuser?.id || null,
      accuserName: accuser?.username || null,
      cardsDrawn: 3,
    });
    ctx.halt = true;
    return _event(GAME_EVENT_TYPES.ASSASSIN_BACKFIRE, {
      source: accused.id,
      target: accused.id,
      payload: {
        accuserId: accuser?.id || null,
        accusedId: accused.id,
        cardsToDrawForAccused: 3,
      },
    });
  }

  return spinEvent;
}

// ─── Tier 4 — Redirection (Mirror, Sniper) ────────────────────
//
// Only `redirectable` events can be retargeted. Mirror has two
// scenarios; when more than one holder could fire, candidates are
// resolved in APNAP order and the first applicable one wins (a spin is
// redirected at most once). Sniper redirection is a player-driven pause
// handled downstream by the orchestrator, not inside the queue.
function _tierRedirection(room, event, ctx) {
  if (!event.redirectable) return event;
  const { accuser, accused } = ctx;

  // Collect the Mirror holders whose scenario applies to this event.
  const candidates = [];
  if (accused?.armedPowerCard?.power === 'mirror') {
    // Scenario 1 (incoming): accused reflects the spin to the accuser,
    // regardless of correctness. Accused's turn ends after the spin.
    candidates.push({
      holderId: accused.id,
      holder: accused,
      scenario: 'incoming',
      newTarget: accuser?.id || null,
      redirectedTo: accuser,
      apply: () => { ctx.mirrorEndsAccusedTurn = true; },
    });
  }
  if (accuser?.armedPowerCard?.power === 'mirror' && ctx.bluffIsCorrect === false) {
    // Scenario 2 (outgoing): accuser would normally spin (wrong bluff)
    // → their Mirror redirects to the accused. Accuser's turn does NOT
    // end.
    candidates.push({
      holderId: accuser.id,
      holder: accuser,
      scenario: 'outgoing',
      newTarget: accused?.id || null,
      redirectedTo: accused,
      apply: () => { ctx.mirrorEndsAccuserTurn = false; },
    });
  }
  if (candidates.length === 0) return event;

  const [first] = _apnapOrder(room, candidates.map(c => c.holderId))
    .map(id => candidates.find(c => c.holderId === id));

  _consumeArmedCard(room, first.holder);
  ctx.events.push({
    kind: 'mirror_reflected',
    holderId: first.holder.id,
    holderName: first.holder.username,
    redirectedToId: first.redirectedTo?.id || null,
    redirectedToName: first.redirectedTo?.username || null,
    scenario: first.scenario,
  });
  first.apply();
  event.target = first.newTarget;
  return event;
}

// ─── Tier 5 — Consequence (Spin, Assassin elimination) ────────
//
// Materialises the typed consequence. A FORCED_ELIMINATION consumes the
// Assassin, emits the strike banner, and halts the queue (no
// post-resolution effects follow an Assassin kill). A SPIN_CONSEQUENCE
// simply carries its already-resolved target forward to Tier 6.
function _tierConsequence(room, event, ctx) {
  if (event.type === GAME_EVENT_TYPES.FORCED_ELIMINATION) {
    const { accused } = ctx;

    // Playtest §1.3 — Shield > Assassin, applied UNIVERSALLY to whoever the
    // strike lands on. A wrong call backfires onto the ACCUSER, who may have
    // armed a Shield in their own defence. Tier 1 (Prevention) only ever sees
    // the *accused's* Shield, so it cannot catch this case; without the check
    // here the Assassin would kill a shielded accuser, the Shield would stay
    // armed-but-useless, and the death banner would clash with the expected
    // block (the reported "engine lockup"). When the elimination target holds
    // an armed Shield we consume BOTH cards, emit the block banner, and resolve
    // the bluff cleanly as BLUFF_BLOCKED — nobody dies, no later tier runs.
    const target = _findPlayer(room, event.target);
    if (event.preventable && target?.armedPowerCard?.power === 'shield') {
      _consumeArmedCard(room, target);   // the Shield (intercepts)
      _consumeArmedCard(room, accused);  // the Assassin (fired, but blocked)
      ctx.events.push({
        kind: 'shield_blocked',
        holderId: target.id,
        holderName: target.username,
        blockedPower: 'assassin',
        assassinHolderId: accused?.id || null,
        assassinHolderName: accused?.username || null,
      });
      ctx.halt = true;
      return _event(GAME_EVENT_TYPES.BLUFF_BLOCKED, {
        source: accused?.id || null,
        target: target.id,
        payload: {
          accuserId: ctx.accuser?.id || null,
          accusedId: accused?.id || null,
        },
      });
    }

    _consumeArmedCard(room, accused);
    ctx.events.push({
      kind: 'assassin_strike',
      holderId: accused.id,
      holderName: accused.username,
      eliminatedId: event.target,
      eliminatedName: _findPlayer(room, event.target)?.username || null,
    });
    ctx.halt = true;
  }
  return event;
}

// ─── Tier 6 — Post-Resolution (Roles, Bounty) ─────────────────
//
// Role passives and bounty collection that fire AFTER the spin target
// is locked. Order: Gambler → Sheriff → Bounty (announcement order is
// asserted by clashResolution.test.js).
function _tierPostResolution(room, event, ctx) {
  if (event.type !== GAME_EVENT_TYPES.SPIN_CONSEQUENCE) return event;
  if (ctx.bluffIsCorrect !== true) return event;
  const { accuser, accused } = ctx;

  // Gambler — accused was caught bluffing. Chamber bumped to 4 BEFORE
  // the (caller-run) spin.
  if (accused && _isGambler(room, accused.id)) {
    _bumpGamblerRiskToFour(accused);
    ctx.events.push({
      kind: 'gambler_caught',
      holderId: accused.id,
      holderName: accused.username,
    });
  }

  // Sheriff — every correct call BY the Sheriff drops their risk by 1.
  if (accuser && _isSheriff(room, accuser.id)) {
    const dropped = _removeRandomBullet(accuser);
    if (dropped) {
      ctx.events.push({
        kind: 'sheriff_relief',
        holderId: accuser.id,
        holderName: accuser.username,
        riskLevel: accuser.riskLevel,
      });
    }
  }

  // Bounty — a correct call against a bounty carrier lets the accuser
  // collect: one bullet removed, bounty cleared, streak reset.
  if (accused?.hasBounty && room.config?.systems?.bounty) {
    accused.hasBounty = false;
    accused.consecutiveSurvivedSpins = 0;
    if (accuser) _removeRandomBullet(accuser);
    ctx.events.push({
      kind: 'bounty_collected',
      holderId: accused.id,
      holderName: accused.username || null,
      accuserId: accuser?.id || null,
      accuserName: accuser?.username || null,
      accuserRiskAfter: accuser?.riskLevel ?? null,
    });
  }

  return event;
}

// Remove one random bullet from a player's chamber (keeps riskLevel in
// sync with bullet count). Returns true if a bullet was removed.
function _removeRandomBullet(player) {
  const bulletIndices = player.chamber
    .map((s, i) => (s === 'bullet' ? i : -1))
    .filter(i => i !== -1);
  if (bulletIndices.length === 0) return false;
  const removeIdx = bulletIndices[Math.floor(Math.random() * bulletIndices.length)];
  const next = [...player.chamber];
  next[removeIdx] = null;
  player.chamber = next;
  player.riskLevel = next.filter(s => s === 'bullet').length;
  return true;
}

// ─── ResolutionQueue driver ───────────────────────────────────

const TIER_HANDLERS = [
  { tier: RESOLUTION_TIERS.PREVENTION, fn: _tierPrevention },
  { tier: RESOLUTION_TIERS.MODIFICATION, fn: _tierModification },
  { tier: RESOLUTION_TIERS.BLUFF_VALIDATION, fn: _tierBluffValidation },
  { tier: RESOLUTION_TIERS.REDIRECTION, fn: _tierRedirection },
  { tier: RESOLUTION_TIERS.CONSEQUENCE, fn: _tierConsequence },
  { tier: RESOLUTION_TIERS.POST_RESOLUTION, fn: _tierPostResolution },
];

// Run the queue from `fromTier` (inclusive). A handler returning `null`
// cancels the event and stops the queue. `ctx.halt` lets a handler stop
// the queue while keeping the event it produced.
function _runQueue(room, ctx, fromTier = RESOLUTION_TIERS.PREVENTION) {
  let event = ctx.event;
  for (const { tier, fn } of TIER_HANDLERS) {
    if (tier < fromTier) continue;
    if (ctx.halt) break;
    const next = fn(room, event, ctx);
    if (next === null) { ctx.halt = true; break; }
    event = next;
    ctx.event = event;
  }
  return event;
}

function _newCtx(accuser, accused) {
  return {
    accuser,
    accused,
    events: [],
    bluffIsCorrect: undefined,
    revealedCard: null,
    halt: false,
    mirrorEndsAccusedTurn: false,
    mirrorEndsAccuserTurn: false,
    event: _event(GAME_EVENT_TYPES.BLUFF_CALLED, {
      source: accuser?.id || null,
      preventable: true,
    }),
  };
}

// ─── Terminal event → legacy outcome mapping ──────────────────
//
// `outcome.kind` is the discriminator every caller + test relies on; it
// maps 1:1 to the terminal `event.type`. `outcome.event` exposes the
// typed event for consumers that prefer it.
function _toOutcome(event, ctx) {
  const base = { event, type: event.type };
  switch (event.type) {
    case GAME_EVENT_TYPES.BLUFF_BLOCKED:
      return {
        ...base,
        kind: 'blocked',
        // The Shield holder is always the event target — the accused for a
        // Tier-1 block, the strike target (accuser) for a §1.3 Assassin block.
        shieldHolderId: event.target,
        accuserId: event.payload.accuserId,
        accusedId: event.payload.accusedId,
      };
    case GAME_EVENT_TYPES.SWAP_PENDING:
      return {
        ...base,
        kind: 'swap_pending',
        swapHolderId: event.payload.swapHolderId,
        accuserId: event.payload.accuserId,
        accusedId: event.payload.accusedId,
      };
    case GAME_EVENT_TYPES.ASSASSIN_BACKFIRE:
      return {
        ...base,
        kind: 'assassin_backfire',
        accuserId: event.payload.accuserId,
        accusedId: event.payload.accusedId,
        cardsToDrawForAccused: event.payload.cardsToDrawForAccused,
      };
    case GAME_EVENT_TYPES.FORCED_ELIMINATION:
      return {
        ...base,
        kind: 'eliminated',
        eliminatedPlayerId: event.target,
        eliminatedReason: event.payload.eliminatedReason,
        accuserId: event.payload.accuserId,
        accusedId: event.payload.accusedId,
      };
    case GAME_EVENT_TYPES.SPIN_CONSEQUENCE:
    default:
      return {
        ...base,
        kind: 'spin',
        spinTargetId: event.target,
        bluffIsCorrect: ctx.bluffIsCorrect,
        accuserId: ctx.accuser?.id || null,
        accusedId: ctx.accused?.id || null,
        revealedCard: ctx.revealedCard,
        mirrorEndsAccusedTurn: ctx.mirrorEndsAccusedTurn,
        mirrorEndsAccuserTurn: ctx.mirrorEndsAccuserTurn,
      };
  }
}

/**
 * Resolve a bluff call. See module-level docs for the full contract.
 *
 * The room is mutated in-place for power-card consumption (cards leave
 * the slot and land in `room.discardPile`, `armedPowerCard` cleared).
 * The CALLER (handlers/bluff.js) is still responsible for spinning the
 * chamber, eliminating losers, broadcasting state, and emitting the
 * returned banner events.
 */
function resolveBluff(room, accuserId) {
  const accuser = _findPlayer(room, accuserId);
  const accused = _accusedPrev(room);

  const ctx = _newCtx(accuser, accused);
  const event = _runQueue(room, ctx);

  return { events: ctx.events, outcome: _toOutcome(event, ctx) };
}

/**
 * Resume a bluff after a Swap pick.
 *
 * Swap mechanics (locked, per spec):
 *   1. The accused (Swap holder) played a card face-down; a bluff was
 *      called. We paused and asked them to pick one of the cards in
 *      `room.playedPile` to swap with their just-played card.
 *   2. The accused's played card (top of `playedPile`) trades places
 *      with the picked card; the picked card becomes the new
 *      `lastPlayedCard`.
 *   3. Bluff correctness is re-evaluated against the swapped-in card,
 *      and Mirror gets a fresh chance on the post-swap world.
 *   4. Both cards are revealed (caller emits the reveal UI).
 *
 * Per #119 this re-enters the ResolutionQueue at **Tier 3** — Shield
 * (Tier 1) and Swap (Tier 2) do NOT re-run; they were already evaluated
 * against the original accused state and the Swap card is consumed here.
 * Returns the same `{ events, outcome }` shape as `resolveBluff`.
 */
function resumeAfterSwap(room, accuserId, pickedCardId) {
  const accuser = _findPlayer(room, accuserId);
  const accused = _accusedPrev(room);
  if (!accused) {
    return {
      events: [],
      outcome: { kind: 'spin', type: GAME_EVENT_TYPES.SPIN_CONSEQUENCE, spinTargetId: accuserId, bluffIsCorrect: false },
    };
  }

  const playedPile = room.playedPile || [];
  const originalIdx = playedPile.length - 1;
  const originalCard = playedPile[originalIdx] || null;
  const pickedIdx = playedPile.findIndex(c => c?.id === pickedCardId);

  if (pickedIdx === -1) {
    return {
      events: [],
      outcome: { kind: 'error', type: GAME_EVENT_TYPES.BLUFF_ERROR, error: 'Picked card not in played pile' },
    };
  }
  if (!originalCard) {
    return {
      events: [],
      outcome: { kind: 'error', type: GAME_EVENT_TYPES.BLUFF_ERROR, error: 'No played card to swap' },
    };
  }
  if (pickedIdx === originalIdx) {
    // Picked their own just-played card → no-op swap. Still consume the
    // Swap and fall through to a normal (post-swap == pre-swap) bluff.
  } else {
    const pickedCard = playedPile[pickedIdx];
    playedPile[pickedIdx] = originalCard;
    playedPile[originalIdx] = pickedCard;
    room.lastPlayedCard = pickedCard;
  }

  // Consume the Swap card itself.
  _consumeArmedCard(room, accused);

  const ctx = _newCtx(accuser, accused);
  // The swap reveal banner is the first event the caller broadcasts.
  ctx.events.push({
    kind: 'swap_resolved',
    holderId: accused.id,
    holderName: accused.username,
    originalCard,
    swappedCard: room.lastPlayedCard,
  });

  // Re-enter at Tier 3 (Bluff Validation) — Tiers 1 + 2 are skipped.
  const event = _runQueue(room, ctx, RESOLUTION_TIERS.BLUFF_VALIDATION);

  return { events: ctx.events, outcome: _toOutcome(event, ctx) };
}

module.exports = {
  resolveBluff,
  resumeAfterSwap,
  // Exposed for tests:
  _internal: {
    _isBluffCorrect,
    _consumeArmedCard,
    _accusedPrev,
    _apnapOrder,
    _event,
    _runQueue,
    _toOutcome,
  },
};
