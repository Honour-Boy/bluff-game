// ============================================================
// Tests for Phase B power-card foundation.
//
// Pure plumbing — card data model, deck distribution, hand cap,
// activation event, survive-and-reset. NO triggered EFFECTS yet
// (Shield blocking, Mirror reflecting, etc. live in Phase C).
//
// Spec ambiguities resolved here:
//  - copiesPerDeck SCALES with double deck. Single deck × 1 copy
//    of each enabled type; double deck × 2 copies; copiesPerDeck=2
//    doubles those again.
//  - Initial deal hand-cap normalisation uses option (b): deal
//    naturally, then move extras to discardPile and replace with
//    shape cards from the top of the remaining deck.
// ============================================================

import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  buildDeck,
  buildPowerCards,
  defaultRoomConfig,
  generateDeck,
  createRoom,
  createPlayer,
  startGame,
  drawCardForPlayer,
  resetHandOnSurvival,
  spinGun,
  activatePowerCard,
  isSwapActivatable,
  advanceTurn,
  POWER_TYPES,
  MODES,
} from '../gameEngine.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(enabled = {}, copiesPerDeck = 1) {
  const cfg = defaultRoomConfig();
  for (const k of Object.keys(cfg.powerCards.enabled)) {
    cfg.powerCards.enabled[k] = !!enabled[k];
  }
  cfg.powerCards.copiesPerDeck = copiesPerDeck;
  return cfg;
}

function makeOnlineRoomWithPlayers(playerCount, configOverrides = null) {
  const cfg = configOverrides || defaultRoomConfig();
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  for (let i = 0; i < playerCount; i++) {
    const id = `p${i}`;
    room.players.push(createPlayer(id, `Player${i}`, `socket-${i}`));
  }
  return room;
}

// ─── Card data model ─────────────────────────────────────────

describe('card data model', () => {
  it('shape cards have type: "shape", a shape, and a number', () => {
    const deck = generateDeck();
    for (const card of deck) {
      expect(card.type).toBe('shape');
      expect(typeof card.shape).toBe('string');
      expect(typeof card.number).toBe('number');
    }
  });

  it('whot cards still match shape === "whot" (no breaking change)', () => {
    const deck = generateDeck();
    const whots = deck.filter(c => c.shape === 'whot');
    expect(whots).toHaveLength(1);
    expect(whots[0].type).toBe('shape');
    expect(whots[0].number).toBe(20);
  });

  it('power cards have type: "power", a power slug, no shape, no number', () => {
    const cards = buildPowerCards(configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }), 2);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.type).toBe('power');
      expect(POWER_TYPES).toContain(card.power);
      expect(card.shape).toBeUndefined();
      expect(card.number).toBeUndefined();
      expect(typeof card.id).toBe('string');
      expect(card.id.length).toBeGreaterThan(0);
    }
  });

  it('power-card "shape === \\"whot\\"" check is naturally false (no false positives)', () => {
    const [card] = buildPowerCards(configWith({ shield: true }), 2);
    expect(card.shape === 'whot').toBe(false);
  });

  it('every power card id is unique', () => {
    const cards = buildPowerCards(configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }), 2);
    const ids = new Set(cards.map(c => c.id));
    expect(ids.size).toBe(cards.length);
  });
});

// ─── buildDeck honours config ────────────────────────────────

describe('buildDeck with power-card config', () => {
  it('all toggles off → no power cards in the deck', () => {
    const cfg = configWith({});
    const deck = buildDeck(4, cfg);
    expect(deck).toHaveLength(71); // baseline 5×14 + 1 whot
    expect(deck.filter(c => c.type === 'power')).toHaveLength(0);
  });

  it('shield + mirror enabled, copiesPerDeck=1, single deck → 2 power cards', () => {
    const cfg = configWith({ shield: true, mirror: true }, 1);
    const deck = buildDeck(4, cfg);
    const powers = deck.filter(c => c.type === 'power');
    expect(powers).toHaveLength(2);
    expect(powers.filter(c => c.power === 'shield')).toHaveLength(1);
    expect(powers.filter(c => c.power === 'mirror')).toHaveLength(1);
  });

  it('all 6 enabled, copiesPerDeck=1, single deck → 6 power cards', () => {
    const cfg = configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }, 1);
    const deck = buildDeck(4, cfg);
    const powers = deck.filter(c => c.type === 'power');
    expect(powers).toHaveLength(6);
    for (const power of POWER_TYPES) {
      expect(powers.filter(c => c.power === power)).toHaveLength(1);
    }
  });

  it('all 6 enabled, copiesPerDeck=1, double deck (>10 players) → 12 power cards', () => {
    const cfg = configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }, 1);
    const deck = buildDeck(12, cfg);
    const powers = deck.filter(c => c.type === 'power');
    expect(powers).toHaveLength(12);
    for (const power of POWER_TYPES) {
      expect(powers.filter(c => c.power === power)).toHaveLength(2);
    }
  });

  it('copiesPerDeck=2 doubles the per-type count (single deck)', () => {
    const cfg = configWith({ shield: true, peek: true }, 2);
    const deck = buildDeck(4, cfg);
    const powers = deck.filter(c => c.type === 'power');
    expect(powers).toHaveLength(4); // 2 types × 2 copies
    expect(powers.filter(c => c.power === 'shield')).toHaveLength(2);
    expect(powers.filter(c => c.power === 'peek')).toHaveLength(2);
  });

  it('copiesPerDeck=2 + double deck → 4 copies of each enabled type', () => {
    const cfg = configWith({ shield: true }, 2);
    const deck = buildDeck(11, cfg);
    const powers = deck.filter(c => c.type === 'power');
    expect(powers).toHaveLength(4);
    expect(powers.every(c => c.power === 'shield')).toBe(true);
  });

  it('null config (legacy call) → no power cards', () => {
    const deck = buildDeck(4);
    expect(deck.filter(c => c.type === 'power')).toHaveLength(0);
  });
});

// ─── drawCardForPlayer hand cap ─────────────────────────────

describe('drawCardForPlayer power-card hand cap', () => {
  function setupRoomWithDeckHead(headCards) {
    // A minimal hand-bearing room. We pre-populate room.deck with
    // exactly the sequence we want to test draw behaviour against,
    // followed by enough shape cards that ensureDrawPile won't reach
    // for the played pile.
    const room = makeOnlineRoomWithPlayers(2);
    room.hands = new Map();
    room.hands.set('p0', []);
    room.hands.set('p1', []);
    // Trailing shape pool — large enough to feed any test.
    const filler = generateDeck().slice(0, 30);
    room.deck = [...headCards, ...filler];
    room.playedPile = [];
    room.discardPile = [];
    return room;
  }

  it('draws and gives the card to the player when hand is empty', () => {
    const room = setupRoomWithDeckHead([
      { id: 'p-shield-A', type: 'power', power: 'shield' },
    ]);
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn).toEqual(expect.objectContaining({ type: 'power', power: 'shield' }));
    expect(room.hands.get('p0')).toHaveLength(1);
    expect(room.discardPile).toHaveLength(0);
  });

  it('discards a second power card and gives a shape replacement', () => {
    const room = setupRoomWithDeckHead([
      // p0 already holds a power → next power should be discarded.
      { id: 'p-shield-B', type: 'power', power: 'shield' },
    ]);
    // Pre-load p0 with one power card so the next draw collides.
    room.hands.get('p0').push({ id: 'pre-power', type: 'power', power: 'shield' });
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn?.type).toBe('shape');
    expect(room.discardPile.find(c => c.id === 'p-shield-B')).toBeTruthy();
    // Hand still has exactly one power card and now also a shape.
    const hand = room.hands.get('p0');
    expect(hand.filter(c => c.type === 'power')).toHaveLength(1);
    expect(hand.filter(c => c.type === 'shape')).toHaveLength(1);
  });

  it('discards multiple consecutive power cards then deals a shape', () => {
    const room = setupRoomWithDeckHead([
      { id: 'p-1', type: 'power', power: 'shield' },
      { id: 'p-2', type: 'power', power: 'mirror' },
      { id: 'p-3', type: 'power', power: 'peek' },
    ]);
    room.hands.get('p0').push({ id: 'pre', type: 'power', power: 'shield' });
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn?.type).toBe('shape');
    // All three head power cards landed in the discard pile.
    expect(room.discardPile.map(c => c.id).sort()).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('returns null when deck has no eligible card and the player is capped', () => {
    const room = makeOnlineRoomWithPlayers(2);
    room.hands = new Map();
    room.hands.set('p0', [{ id: 'pre', type: 'power', power: 'shield' }]);
    room.hands.set('p1', []);
    room.deck = [
      { id: 'p-x', type: 'power', power: 'mirror' },
      { id: 'p-y', type: 'power', power: 'peek' },
    ];
    room.playedPile = [];
    room.discardPile = [];

    // Silence the expected warn so test output stays clean.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn).toBeNull();
    spy.mockRestore();
  });
});

// ─── Initial deal normalisation ──────────────────────────────

describe('startGame initial-deal hand cap', () => {
  it('no player ends up with more than 1 power card after startGame', () => {
    const cfg = configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }, 2);
    const room = makeOnlineRoomWithPlayers(3, cfg);
    startGame(room);

    for (const [pid, hand] of room.hands.entries()) {
      const powers = hand.filter(c => c.type === 'power');
      expect(powers.length).toBeLessThanOrEqual(1);
      expect(hand.length).toBe(6);
    }
  });

  it('extras land in room.discardPile', () => {
    const cfg = configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }, 2);
    const room = makeOnlineRoomWithPlayers(3, cfg);
    startGame(room);
    // Discard pile is initialised either way; extras only land here
    // if a player had >1 power card from the natural deal. We can't
    // assert a specific count without controlling shuffle randomness,
    // but we can assert the array shape.
    expect(Array.isArray(room.discardPile)).toBe(true);
    for (const card of room.discardPile) {
      expect(card.type).toBe('power');
    }
  });

  it('configures swapPendingPlayerIds for any Swap card that lands in a hand', () => {
    // Across many shuffled startGames with swap enabled, every Swap
    // card that ends up in a hand should have a snapshot stamped on
    // it. Probabilistic but stable — 30 trials, 3 players each.
    let trialsWithSwapInHand = 0;
    let trialsTotal = 0;
    for (let trial = 0; trial < 30; trial++) {
      const cfg = configWith({ swap: true }, 2);
      const room = makeOnlineRoomWithPlayers(3, cfg);
      startGame(room);
      trialsTotal++;
      for (const [pid, hand] of room.hands.entries()) {
        for (const card of hand) {
          if (card?.power === 'swap') {
            trialsWithSwapInHand++;
            expect(Array.isArray(card.swapPendingPlayerIds)).toBe(true);
            expect(card.swapPendingPlayerIds).not.toContain(pid);
          }
        }
      }
    }
    expect(trialsTotal).toBeGreaterThan(0);
    // We don't assert a minimum hit count — it's probabilistic. We
    // just verify that whenever a Swap landed in a hand, the snapshot
    // existed. Hits across 30 trials are virtually guaranteed but we
    // don't gate on count to keep the test robust.
  });
});

// ─── Initial-deal guaranteed minimum (#77) ───────────────────

describe('startGame guarantees ≥1 power card per player (#77)', () => {
  // Silence the engine's "deck out of power cards" warn — some tests
  // intentionally starve the deck to exercise the best-effort branch.
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warnSpy.mockRestore());

  function runDealInitialHandsGuarantees(trials, { players, copiesPerDeck }) {
    let allCovered = 0;
    let barehandWithPower = 0;
    let barehandTotal = 0;
    for (let i = 0; i < trials; i++) {
      const cfg = configWith({
        shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true,
      }, copiesPerDeck);
      const room = makeOnlineRoomWithPlayers(players, cfg);
      startGame(room);

      let everyoneHasOne = true;
      for (const p of room.players) {
        const hand = room.hands.get(p.id) || [];
        const powerCount = hand.filter(c => c?.type === 'power').length;
        if (powerCount < 1) everyoneHasOne = false;
        if (p.role === 'barehand') {
          barehandTotal++;
          if (powerCount >= 1) barehandWithPower++;
        }
        // Hand size + cap invariants must STILL hold.
        expect(hand.length).toBe(6);
        const cap = p.role === 'collector' ? 3 : 1;
        expect(powerCount).toBeLessThanOrEqual(cap);
      }
      if (everyoneHasOne) allCovered++;
    }
    return { allCovered, barehandWithPower, barehandTotal };
  }

  it('every player at a 6-power, copies=2 table receives ≥1 power card across 50 trials', () => {
    const { allCovered } = runDealInitialHandsGuarantees(50, { players: 5, copiesPerDeck: 2 });
    expect(allCovered).toBe(50);
  });

  it('every Barehand player receives ≥1 power card across 50 trials (named bug)', () => {
    // <9 alive → assignRoles makes everyone Barehand, so this stresses
    // exactly the scenario reported in #77.
    const { barehandWithPower, barehandTotal } = runDealInitialHandsGuarantees(
      50, { players: 5, copiesPerDeck: 2 },
    );
    expect(barehandTotal).toBeGreaterThanOrEqual(50 * 5);
    expect(barehandWithPower).toBe(barehandTotal);
  });

  it('Collector still gets up to 3 power cards (cap unchanged)', () => {
    // Run enough trials that Collector lands in a hand at least once
    // (alive >= 9 → Collector role exists in the assignment).
    let collectorTrials = 0;
    for (let i = 0; i < 30; i++) {
      const cfg = configWith({
        shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true,
      }, 2);
      const room = makeOnlineRoomWithPlayers(10, cfg);
      startGame(room);
      const collector = room.players.find(p => p.role === 'collector');
      if (!collector) continue;
      collectorTrials++;
      const hand = room.hands.get(collector.id) || [];
      const powerCount = hand.filter(c => c?.type === 'power').length;
      expect(powerCount).toBeGreaterThanOrEqual(1);
      expect(powerCount).toBeLessThanOrEqual(3);
    }
    expect(collectorTrials).toBeGreaterThan(0);
  });

  it('no-op when every power-card type is disabled (no power cards anywhere)', () => {
    const cfg = configWith({}, 1); // all disabled
    const room = makeOnlineRoomWithPlayers(4, cfg);
    startGame(room);
    for (const p of room.players) {
      const hand = room.hands.get(p.id) || [];
      expect(hand.filter(c => c?.type === 'power').length).toBe(0);
      expect(hand.length).toBe(6);
    }
  });

  it('best-effort when the deck has no power cards left to draft', () => {
    // Single-deck, 1 copy each, only ONE power-card type enabled →
    // exactly 1 power card in a 4-player game. The guarantee can
    // cover at most 1 player; the rest fall through cleanly.
    const cfg = configWith({ shield: true }, 1);
    const room = makeOnlineRoomWithPlayers(4, cfg);
    startGame(room);
    const covered = room.players.filter(p => {
      const hand = room.hands.get(p.id) || [];
      return hand.some(c => c?.type === 'power');
    });
    expect(covered.length).toBeGreaterThanOrEqual(1);
    // Hand size invariant holds even when guarantee can't reach all.
    for (const p of room.players) {
      const hand = room.hands.get(p.id) || [];
      expect(hand.length).toBe(6);
    }
  });
});

// ─── activatePowerCard ───────────────────────────────────────

describe('activatePowerCard', () => {
  function setupActiveRoom({ holding = null, lastPlayedCard = null } = {}) {
    const cfg = configWith({ shield: true });
    const room = makeOnlineRoomWithPlayers(2, cfg);
    room.mode = MODES.ONLINE;
    room.phase = 'playing';
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 0;
    room.hands = new Map([
      ['p0', holding ? [holding] : []],
      ['p1', []],
    ]);
    room.deck = [];
    room.playedPile = [];
    room.discardPile = [];
    room.lastPlayedCard = lastPlayedCard;
    return room;
  }

  it('rejects when not the player\'s turn', () => {
    const room = setupActiveRoom({ holding: { id: 'a', type: 'power', power: 'shield' } });
    const result = activatePowerCard(room, 'p1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/turn/i);
  });

  it('rejects when the player has no power card in hand', () => {
    const room = setupActiveRoom();
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no power card/i);
  });

  it('arms the player when activating shield (card stays in hand, marked armed)', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(false);

    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toEqual(expect.objectContaining({
      power: 'shield',
      cardId: 'a',
    }));
    // Card is still in hand and marked armed.
    const hand = room.hands.get('p0');
    expect(hand).toContain(card);
    expect(card.armed).toBe(true);
  });

  it('peek is consumed-on-use, returns lastPlayedCard, removes the card from hand', () => {
    const card = { id: 'pk', type: 'power', power: 'peek' };
    const lastPlayed = { id: 'shape-1', type: 'shape', shape: 'circle', number: 4 };
    const room = setupActiveRoom({ holding: card, lastPlayedCard: lastPlayed });
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(true);
    expect(result.peekedCard).toEqual(lastPlayed);

    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toBeNull();
    expect(room.hands.get('p0')).not.toContain(card);
    expect(room.discardPile).toContain(card);
  });

  it('rejects double-activation (already armed)', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    activatePowerCard(room, 'p0');
    const second = activatePowerCard(room, 'p0');
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already armed/i);
  });

  it('rejects when card already played this turn', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    room.cardPlayedThisTurn = true;
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/card already played/i);
  });

  it('rejects when bluff already called this turn', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    room.bluffUsedThisTurn = true;
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bluff already called/i);
  });

  it('rejects swap activation while pendingPlayerIds is non-empty', () => {
    const card = {
      id: 'sw',
      type: 'power',
      power: 'swap',
      swapPendingPlayerIds: ['p1'],
    };
    const room = setupActiveRoom({ holding: card });
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/swap/i);
  });

  it('allows swap activation once pendingPlayerIds is empty', () => {
    const card = {
      id: 'sw',
      type: 'power',
      power: 'swap',
      swapPendingPlayerIds: [],
    };
    const room = setupActiveRoom({ holding: card });
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
  });
});

// ─── isSwapActivatable ───────────────────────────────────────

describe('isSwapActivatable', () => {
  it('true when pending list is empty', () => {
    expect(isSwapActivatable({ power: 'swap', swapPendingPlayerIds: [] })).toBe(true);
  });
  it('false when pending list has anyone', () => {
    expect(isSwapActivatable({ power: 'swap', swapPendingPlayerIds: ['x'] })).toBe(false);
  });
  it('true when no snapshot was ever taken', () => {
    expect(isSwapActivatable({ power: 'swap' })).toBe(true);
  });
  it('false for non-swap cards', () => {
    expect(isSwapActivatable({ power: 'shield' })).toBe(false);
  });
});

// ─── Swap pending-set shrinks as players take turns ──────────

describe('swap pending-set credit on advanceTurn', () => {
  it('removes the finishing player from every Swap card in any hand', () => {
    const room = makeOnlineRoomWithPlayers(3);
    room.turnOrder = ['p0', 'p1', 'p2'];
    room.currentTurnIndex = 0;
    const swap = {
      id: 'sw',
      type: 'power',
      power: 'swap',
      swapPendingPlayerIds: ['p0', 'p1', 'p2'],
    };
    room.hands = new Map([
      ['p0', [swap]],
      ['p1', []],
      ['p2', []],
    ]);
    advanceTurn(room); // p0 finished
    expect(swap.swapPendingPlayerIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(swap.swapPendingPlayerIds).not.toContain('p0');
  });
});

// ─── Survive-and-reset hand ──────────────────────────────────

describe('resetHandOnSurvival (Section 7)', () => {
  function setupSurvivor() {
    const cfg = configWith({ shield: true });
    const room = makeOnlineRoomWithPlayers(2, cfg);
    startGame(room);
    return room;
  }

  it('discards the existing hand and deals 6 fresh cards on normal survival', () => {
    const room = setupSurvivor();
    const before = room.hands.get('p0').slice();
    const dealt = resetHandOnSurvival(room, 'p0', 6);
    expect(dealt).toHaveLength(6);
    const after = room.hands.get('p0');
    expect(after).toHaveLength(6);
    // The new hand is composed of the dealt cards.
    expect(after).toEqual(dealt);
    // The old hand landed in the discard pile.
    for (const card of before) {
      expect(room.discardPile.find(c => c.id === card.id)).toBeTruthy();
    }
  });

  it('clears any armedPowerCard on survival (hand reset is total)', () => {
    const room = setupSurvivor();
    const player = room.players.find(p => p.id === 'p0');
    player.armedPowerCard = { power: 'shield', cardId: 'whatever', activatedAtTurn: 0 };
    resetHandOnSurvival(room, 'p0', 6);
    expect(player.armedPowerCard).toBeNull();
  });

  it('Redemption Spin path (3 cards) — parameter wired for Phase E1', () => {
    const room = setupSurvivor();
    const dealt = resetHandOnSurvival(room, 'p0', 3);
    expect(dealt).toHaveLength(3);
    expect(room.hands.get('p0')).toHaveLength(3);
  });

  it('does nothing for an eliminated player', () => {
    const room = setupSurvivor();
    const player = room.players.find(p => p.id === 'p0');
    player.status = 'eliminated';
    const before = room.hands.get('p0').slice();
    const dealt = resetHandOnSurvival(room, 'p0', 6);
    expect(dealt).toEqual([]);
    expect(room.hands.get('p0')).toEqual(before);
  });

  // Issue #56 — pre-fix this dealt 6 cards regardless of hand size,
  // so hands stayed full forever and the deck never drained.
  it('omitted cardsToDeal defaults to surviving hand size (#56)', () => {
    const room = setupSurvivor();
    // Trim the player's hand down so we can verify size-matching.
    const trimmed = room.hands.get('p0').slice(0, 4);
    room.hands.set('p0', trimmed);
    const dealt = resetHandOnSurvival(room, 'p0');
    expect(dealt).toHaveLength(4);
    expect(room.hands.get('p0')).toHaveLength(4);
  });

  it('omitted cardsToDeal with empty hand deals zero (#56 edge case)', () => {
    const room = setupSurvivor();
    room.hands.set('p0', []);
    const dealt = resetHandOnSurvival(room, 'p0');
    expect(dealt).toEqual([]);
    expect(room.hands.get('p0')).toEqual([]);
  });
});

// ─── createPlayer adds armedPowerCard field ──────────────────

describe('createPlayer', () => {
  it('initialises armedPowerCard to null', () => {
    const p = createPlayer('p1', 'Player', 'sock');
    expect(p.armedPowerCard).toBeNull();
  });
});
