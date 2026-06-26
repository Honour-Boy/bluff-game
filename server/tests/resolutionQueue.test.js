// ============================================================
// Tests for #119 - Unified Event Resolution Engine
//
// These pin the NEW guarantees of the typed, tiered ResolutionQueue
// that replaced the implicit-ordering stage array:
//   1. Every resolution produces a typed GameEvent (outcome.event).
//   2. Tier-4 Redirection (Mirror) gates on event.redirectable, so a
//      FORCED_ELIMINATION is refused without a pairwise card override.
//   3. APNAP tie-breaker orders same-tier conflicts clockwise from the
//      active player.
//   4. resumeAfterSwap re-enters the queue at Tier 3 (Tiers 1-2 skipped).
//
// Behaviour parity with the old pipeline is covered by
// bluffPipeline.test.js + clashResolution.test.js; this file only
// asserts the architecture the issue mandates.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  ROLES,
  MODES,
} from '../gameEngine.js';
import { RESOLUTION_TIERS, GAME_EVENT_TYPES } from '../engine/constants.js';
import { resolveBluff, resumeAfterSwap, _internal } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(enabled = {}) {
  const cfg = defaultRoomConfig();
  for (const k of Object.keys(cfg.powerCards.enabled)) {
    cfg.powerCards.enabled[k] = !!enabled[k];
  }
  return cfg;
}

/**
 * 2-player online room: p0 = accused (just played), p1 = accuser
 * (current turn). Defaults to a wrong bluff (matching card on the
 * table) so the accuser is the default spin target.
 */
function buildScenario({
  accusedArmed = null,
  accuserArmed = null,
  accusedRole = ROLES.BAREHAND,
  accuserRole = ROLES.BAREHAND,
  lastPlayedShape = 'circle',
  currentCardType = 'circle',
} = {}) {
  const room = createRoom('host', MODES.ONLINE, configWith({
    shield: true, mirror: true, swap: true, assassin: true,
  }));
  const p0 = createPlayer('p0', 'Accused', 'sock-0');
  const p1 = createPlayer('p1', 'Accuser', 'sock-1');
  p0.role = accusedRole;
  p1.role = accuserRole;
  room.players.push(p0, p1);
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 1;
  room.phase = 'playing';
  room.discardPile = [];
  room.hands = new Map([['p0', []], ['p1', []]]);
  room.powerCardSlot = {};

  const playedCard = { id: 'played-1', type: 'shape', shape: lastPlayedShape, number: 7 };
  room.playedPile = [playedCard];
  room.lastPlayedCard = playedCard;
  room.currentCardType = currentCardType;
  room.challengeableCard = playedCard;
  room.challengeableCardType = currentCardType;

  function arm(player, armed) {
    if (!armed) { room.powerCardSlot[player.id] = []; return; }
    const card = {
      id: armed.cardId || `${armed.power}-${player.id}`,
      type: 'power',
      power: armed.power,
      armed: true,
      ...(armed.power === 'swap' ? { swapPendingPlayerIds: [] } : {}),
    };
    room.powerCardSlot[player.id] = [card];
    player.armedPowerCard = { power: armed.power, cardId: card.id, activatedAtTurn: 0, activatedAtRound: 1 };
  }
  arm(p0, accusedArmed);
  arm(p1, accuserArmed);

  return { room, p0, p1 };
}

// ─── 1. Typed GameEvent surface ──────────────────────────────

describe('#119 / typed GameEvent', () => {
  it('a default bluff resolves to a redirectable SPIN_CONSEQUENCE event', () => {
    const { room } = buildScenario({ lastPlayedShape: 'square', currentCardType: 'circle' });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.type).toBe(GAME_EVENT_TYPES.SPIN_CONSEQUENCE);
    expect(outcome.event.type).toBe(GAME_EVENT_TYPES.SPIN_CONSEQUENCE);
    expect(outcome.event.redirectable).toBe(true);
    expect(outcome.event.target).toBe(outcome.spinTargetId);
  });

  it('Shield yields a non-preventable BLUFF_BLOCKED event', () => {
    const { room } = buildScenario({ accusedArmed: { power: 'shield', cardId: 's-A' } });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('blocked');
    expect(outcome.event.type).toBe(GAME_EVENT_TYPES.BLUFF_BLOCKED);
  });

  it('a wrong bluff vs Assassin yields a non-redirectable, preventable FORCED_ELIMINATION', () => {
    const { room } = buildScenario({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle', // matching → wrong bluff
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.event.type).toBe(GAME_EVENT_TYPES.FORCED_ELIMINATION);
    // #120 clash contract: Mirror MUST refuse it; Shield MAY cancel it.
    expect(outcome.event.redirectable).toBe(false);
    expect(outcome.event.preventable).toBe(true);
    expect(outcome.event.target).toBe('p1');
  });
});

// ─── 2. Tier-4 Redirection gates on event.redirectable ───────

describe('#119 / redirectable gate (Mirror vs FORCED_ELIMINATION)', () => {
  it('Tier-4 Mirror refuses a non-redirectable Assassin elimination', () => {
    // accused Assassin + accuser Mirror, wrong bluff. The old engine
    // relied on Assassin short-circuiting before Mirror; the new one
    // lets the FORCED_ELIMINATION reach Tier 4, where Mirror must check
    // redirectable and decline.
    const { room, p0, p1 } = buildScenario({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserArmed: { power: 'mirror', cardId: 'm-A' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.event.redirectable).toBe(false);
    // Mirror neither fired nor was consumed.
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeFalsy();
    expect(p1.armedPowerCard).not.toBeNull();
    // Assassin was consumed at the Consequence tier.
    expect(p0.armedPowerCard).toBeNull();
  });

  it('a redirectable spin is still retargeted by Mirror', () => {
    // accused Mirror, correct bluff → would spin accused; Mirror
    // redirects to the accuser. Confirms the gate only blocks the
    // non-redirectable case.
    const { room } = buildScenario({
      accusedArmed: { power: 'mirror', cardId: 'm-A' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.event.type).toBe(GAME_EVENT_TYPES.SPIN_CONSEQUENCE);
    expect(outcome.spinTargetId).toBe('p1');
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeTruthy();
  });
});

// ─── 3. APNAP tie-breaker ────────────────────────────────────

describe('#119 / APNAP tie-breaker', () => {
  it('_apnapOrder sorts clockwise from the active player', () => {
    const room = { turnOrder: ['a', 'b', 'c', 'd'], currentTurnIndex: 2 };
    // Active is 'c'; clockwise ranks: c<d<a<b.
    expect(_internal._apnapOrder(room, ['a', 'd', 'b'])).toEqual(['d', 'a', 'b']);
    expect(_internal._apnapOrder(room, ['b', 'c'])).toEqual(['c', 'b']);
  });

  it('same-tier Mirror conflict resolves to the active player first', () => {
    // Pathological state (both players hold Mirror) - only reachable in
    // tests, but it exercises the tie-breaker. Wrong bluff makes BOTH
    // the accused (incoming) and accuser (outgoing) eligible to redirect.
    // APNAP from currentTurnIndex (the accuser) fires the accuser first.
    const { room, p0, p1 } = buildScenario({
      accusedArmed: { power: 'mirror', cardId: 'm-0' },
      accuserArmed: { power: 'mirror', cardId: 'm-1' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle', // wrong bluff
    });
    const { events } = resolveBluff(room, 'p1');
    const mirror = events.find(e => e.kind === 'mirror_reflected');
    expect(mirror).toBeTruthy();
    expect(mirror.scenario).toBe('outgoing'); // accuser (active) won
    expect(mirror.holderId).toBe('p1');
    expect(p1.armedPowerCard).toBeNull();      // active player's Mirror consumed
    expect(p0.armedPowerCard).not.toBeNull();  // the other Mirror untouched
  });
});

// ─── 4. resumeAfterSwap re-enters at Tier 3 ──────────────────

describe('#119 / resumeAfterSwap re-enters at Tier 3', () => {
  it('Tiers 1-2 are skipped on resume - an armed Shield no longer blocks', () => {
    // resolveBluff with a Shield blocks at Tier 1 (Prevention).
    const blocked = buildScenario({ accusedArmed: { power: 'shield', cardId: 'sh' } });
    expect(resolveBluff(blocked.room, 'p1').outcome.kind).toBe('blocked');

    // resumeAfterSwap re-enters at Tier 3, so the same armed Shield is
    // never consulted - resolution proceeds to a spin instead.
    const { room } = buildScenario({
      accusedArmed: { power: 'shield', cardId: 'sh' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const earlier = { id: 'older', type: 'shape', shape: 'star', number: 4 };
    room.playedPile = [earlier, room.playedPile[0]];

    const { events, outcome } = resumeAfterSwap(room, 'p1', earlier.id);
    expect(outcome.kind).toBe('spin');
    expect(events.find(e => e.kind === 'shield_blocked')).toBeFalsy();
    expect(events[0].kind).toBe('swap_resolved');
  });

  it('the queue driver honours the fromTier floor', () => {
    // Direct driver check: starting at REDIRECTION skips Prevention so a
    // Shield-armed accused is not blocked.
    const { room, p0 } = buildScenario({ accusedArmed: { power: 'shield', cardId: 'sh' } });
    const ctx = {
      accuser: room.players[1],
      accused: p0,
      events: [],
      bluffIsCorrect: true,
      revealedCard: room.lastPlayedCard,
      halt: false,
      mirrorEndsAccusedTurn: false,
      mirrorEndsAccuserTurn: false,
      event: _internal._event(GAME_EVENT_TYPES.SPIN_CONSEQUENCE, { target: 'p0', redirectable: true }),
    };
    _internal._runQueue(room, ctx, RESOLUTION_TIERS.REDIRECTION);
    expect(ctx.events.find(e => e.kind === 'shield_blocked')).toBeFalsy();
    expect(p0.armedPowerCard).not.toBeNull(); // Shield never consumed
  });
});
