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
//  - After startGame, power cards live in room.powerCardSlot[pid]
//    (not room.hands). Hands contain shape cards only.
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
import { _powerCardCapForPlayer } from '../engine/handHelpers.js';

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
    room.powerCardSlot = { p0: [], p1: [] };
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
    // Power card routes to slot, not hand.
    expect(room.powerCardSlot['p0']).toHaveLength(1);
    expect(room.hands.get('p0')).toHaveLength(0);
    expect(room.discardPile).toHaveLength(0);
  });

  it('discards a second power card and gives a shape replacement', () => {
    const room = setupRoomWithDeckHead([
      // p0 already holds a power in slot → next power should be discarded.
      { id: 'p-shield-B', type: 'power', power: 'shield' },
    ]);
    // Pre-load p0 slot with one power card so the next draw collides.
    room.powerCardSlot['p0'].push({ id: 'pre-power', type: 'power', power: 'shield' });
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn?.type).toBe('shape');
    expect(room.discardPile.find(c => c.id === 'p-shield-B')).toBeTruthy();
    // Slot still has exactly one power card; hand received a shape.
    expect(room.powerCardSlot['p0']).toHaveLength(1);
    expect(room.hands.get('p0').filter(c => c.type === 'shape')).toHaveLength(1);
  });

  it('discards multiple consecutive power cards then deals a shape', () => {
    const room = setupRoomWithDeckHead([
      { id: 'p-1', type: 'power', power: 'shield' },
      { id: 'p-2', type: 'power', power: 'mirror' },
      { id: 'p-3', type: 'power', power: 'peek' },
    ]);
    room.powerCardSlot['p0'].push({ id: 'pre', type: 'power', power: 'shield' });
    const drawn = drawCardForPlayer(room, 'p0');
    expect(drawn?.type).toBe('shape');
    // All three head power cards landed in the discard pile.
    expect(room.discardPile.map(c => c.id).sort()).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('returns null when deck has no eligible card and the player is capped', () => {
    const room = makeOnlineRoomWithPlayers(2);
    room.hands = new Map();
    room.hands.set('p0', []);
    room.hands.set('p1', []);
    // p0 slot is at cap (1 power card); deck has only more power cards.
    room.powerCardSlot = {
      p0: [{ id: 'pre', type: 'power', power: 'shield' }],
      p1: [],
    };
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
      // Hands contain shape cards only after extraction.
      expect(hand.filter(c => c.type === 'power')).toHaveLength(0);
      const player = room.players.find(p => p.id === pid);
      const slot = room.powerCardSlot?.[pid] || [];
      // Cap is per-player: a Collector (assigned at 3+ alive since #198) lifts
      // the cap to 3; everyone else is gated at 1.
      expect(slot.length).toBeLessThanOrEqual(_powerCardCapForPlayer(player));
    }
  });

  // #139 — the power card lives in its own slot and must not decrement the
  // playable hand. After the deal every player holds a full 6 shape cards
  // PLUS their separate power slot (7 cards at round start), not 5 + 1.
  it('deals 6 shape cards plus a separate power slot (#139)', () => {
    const cfg = configWith({ shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true }, 2);
    const room = makeOnlineRoomWithPlayers(3, cfg);
    startGame(room);

    for (const [pid, hand] of room.hands.entries()) {
      // The playable hand is always 6 shape cards — power cards never count.
      expect(hand.filter(c => c.type === 'shape')).toHaveLength(6);
      expect(hand).toHaveLength(6);
      // Power card is held separately: at least the guaranteed one (#77), up to
      // the player's cap — a Collector (assigned at 3+ alive since #198) may hold
      // more than one.
      const player = room.players.find(p => p.id === pid);
      const slot = room.powerCardSlot?.[pid] || [];
      expect(slot.length).toBeGreaterThanOrEqual(1);
      expect(slot.length).toBeLessThanOrEqual(_powerCardCapForPlayer(player));
      expect(slot.every(c => c.type === 'power')).toBe(true);
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

  it('configures swapPendingPlayerIds for any Swap card that lands in a slot', () => {
    // Across many shuffled startGames with swap enabled, every Swap
    // card that ends up in a slot should have a snapshot stamped on
    // it. Probabilistic but stable — 30 trials, 3 players each.
    let trialsWithSwapInSlot = 0;
    let trialsTotal = 0;
    for (let trial = 0; trial < 30; trial++) {
      const cfg = configWith({ swap: true }, 2);
      const room = makeOnlineRoomWithPlayers(3, cfg);
      startGame(room);
      trialsTotal++;
      // After extraction, swap cards live in powerCardSlot.
      for (const [pid, slot] of Object.entries(room.powerCardSlot || {})) {
        for (const card of slot) {
          if (card?.power === 'swap') {
            trialsWithSwapInSlot++;
            expect(Array.isArray(card.swapPendingPlayerIds)).toBe(true);
            expect(card.swapPendingPlayerIds).not.toContain(pid);
          }
        }
      }
    }
    expect(trialsTotal).toBeGreaterThan(0);
    // We don't assert a minimum hit count — it's probabilistic. We
    // just verify that whenever a Swap landed in a slot, the snapshot
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
        // Power cards live in slot after extraction; hand has shapes only.
        const slot = room.powerCardSlot?.[p.id] || [];
        const powerCount = slot.length;
        if (powerCount < 1) everyoneHasOne = false;
        if (p.role === 'barehand') {
          barehandTotal++;
          if (powerCount >= 1) barehandWithPower++;
        }
        // #139 — the playable hand is always a full 6 shape cards; the
        // power card sits in its own slot and never decrements it.
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
    // 12 alive → 6 unique specials + 1 extra Gambler, leaving exactly 5
    // Barehand fillers per trial — the scenario reported in #77.
    const { barehandWithPower, barehandTotal } = runDealInitialHandsGuarantees(
      50, { players: 12, copiesPerDeck: 2 },
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
      const slot = room.powerCardSlot?.[collector.id] || [];
      const powerCount = slot.length;
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
      const slot = room.powerCardSlot?.[p.id] || [];
      expect(slot.filter(c => c?.type === 'power').length).toBe(0);
      expect(hand.length + slot.length).toBe(6);
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
      const slot = room.powerCardSlot?.[p.id] || [];
      return slot.some(c => c?.type === 'power');
    });
    expect(covered.length).toBeGreaterThanOrEqual(1);
    // #139 — every hand tops up to a full 6 shape cards regardless of
    // whether the power-card guarantee could reach that player.
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
      ['p0', []],
      ['p1', []],
    ]);
    // Power cards live in powerCardSlot, not hands.
    room.powerCardSlot = {
      p0: holding ? [holding] : [],
      p1: [],
    };
    room.deck = [];
    room.playedPile = [];
    room.discardPile = [];
    room.lastPlayedCard = lastPlayedCard;
    // Peek reveals the previous player's play — the turn-boundary snapshot.
    room.challengeableCard = lastPlayedCard;
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

  it('arms the player when activating shield (card stays in slot, marked armed)', () => {
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
    // Card is still in slot and marked armed.
    const slot = room.powerCardSlot['p0'];
    expect(slot).toContain(card);
    expect(card.armed).toBe(true);
  });

  it('Collector: activates the specific held card named by cardId, not slot[0] (#197)', () => {
    const room = setupActiveRoom();
    const shield = { id: 'c-shield', type: 'power', power: 'shield' };
    const mirror = { id: 'c-mirror', type: 'power', power: 'mirror' };
    const assassin = { id: 'c-assassin', type: 'power', power: 'assassin' };
    room.powerCardSlot.p0 = [shield, mirror, assassin];

    // Pick the THIRD card, which slot[0]-only activation could never reach.
    const result = activatePowerCard(room, 'p0', 'c-assassin');
    expect(result.ok).toBe(true);
    expect(result.power).toBe('assassin');
    expect(result.cardId).toBe('c-assassin');

    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toEqual(expect.objectContaining({
      power: 'assassin',
      cardId: 'c-assassin',
    }));
    expect(assassin.armed).toBe(true);
    // The other held cards are untouched.
    expect(shield.armed).toBeUndefined();
    expect(mirror.armed).toBeUndefined();
  });

  it('falls back to slot[0] when no cardId is supplied (legacy / single-card holders) (#197)', () => {
    const room = setupActiveRoom();
    const shield = { id: 'c-shield', type: 'power', power: 'shield' };
    const mirror = { id: 'c-mirror', type: 'power', power: 'mirror' };
    room.powerCardSlot.p0 = [shield, mirror];

    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.cardId).toBe('c-shield');
  });

  it('rejects when cardId names a card the player does not hold (#197)', () => {
    const room = setupActiveRoom({ holding: { id: 'a', type: 'power', power: 'shield' } });
    const result = activatePowerCard(room, 'p0', 'not-in-slot');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no power card/i);
  });

  it('peek is consumed-on-use, returns lastPlayedCard, removes the card from slot', () => {
    const card = { id: 'pk', type: 'power', power: 'peek' };
    const lastPlayed = { id: 'shape-1', type: 'shape', shape: 'circle', number: 4 };
    const room = setupActiveRoom({ holding: card, lastPlayedCard: lastPlayed });
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(true);
    expect(result.peekedCard).toEqual(lastPlayed);

    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toBeNull();
    // Card removed from slot, moved to discard.
    expect(room.powerCardSlot['p0']).not.toContain(card);
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

  // Playtest §1.1 — turn-flow flexibility. Arming a power card AFTER a normal
  // card has been played in the same turn is now allowed (previously the UI
  // locked to nothing but "End Turn"). Arming a defensive Shield/Mirror after
  // your play is the intended set-up against the next player's bluff.
  it('allows activation after a card was already played this turn (§1.1)', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    room.cardPlayedThisTurn = true;
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.power).toBe('shield');
    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toEqual(expect.objectContaining({ power: 'shield', cardId: 'a' }));
  });

  // Turn actions are order-independent: activating a power card after calling a
  // bluff in the same turn is now allowed. Mid-resolution is excluded by the
  // phase guard (room stays 'playing' only when the bluff/spin has settled back
  // on this turn), not by a bluffUsedThisTurn block.
  it('allows activation after a bluff was already called this turn (any order)', () => {
    const card = { id: 'a', type: 'power', power: 'shield' };
    const room = setupActiveRoom({ holding: card });
    room.bluffUsedThisTurn = true;
    const result = activatePowerCard(room, 'p0');
    expect(result.ok).toBe(true);
    expect(result.power).toBe('shield');
    const player = room.players.find(p => p.id === 'p0');
    expect(player.armedPowerCard).toEqual(expect.objectContaining({ power: 'shield', cardId: 'a' }));
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
  it('removes the finishing player from every Swap card in any slot', () => {
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
      ['p0', []],
      ['p1', []],
      ['p2', []],
    ]);
    // Swap card lives in powerCardSlot, not hands.
    room.powerCardSlot = {
      p0: [swap],
      p1: [],
      p2: [],
    };
    advanceTurn(room); // p0 finished
    expect(swap.swapPendingPlayerIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(swap.swapPendingPlayerIds).not.toContain('p0');
  });
});

// ─── #163 — stale armed power card reset on turn cycle ───────

describe('stale armed power card resets at the holder next turn (#163)', () => {
  function armedRoom(power) {
    const room = makeOnlineRoomWithPlayers(2);
    room.phase = 'playing';
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 0;
    const card = { id: `c-${power}`, type: 'power', power, armed: true };
    if (power === 'swap') card.swapPendingPlayerIds = ['p1'];
    room.hands = new Map([['p0', []], ['p1', []]]);
    room.powerCardSlot = { p0: [card], p1: [] };
    room.players.find(p => p.id === 'p0').armedPowerCard = {
      power, cardId: card.id, activatedAtTurn: 0, activatedAtRound: 1,
    };
    return room;
  }

  it('keeps a Shield armed while the next player can still bluff the holder', () => {
    const room = armedRoom('shield');
    advanceTurn(room); // → p1's turn; p1 can still call bluff on p0
    expect(room.players.find(p => p.id === 'p0').armedPowerCard).not.toBeNull();
  });

  it('clears an unconsumed armed Shield once the turn returns to the holder', () => {
    const room = armedRoom('shield');
    advanceTurn(room); // → p1
    advanceTurn(room); // → back to p0; the bluff window closed unused
    const p0 = room.players.find(p => p.id === 'p0');
    expect(p0.armedPowerCard).toBeNull();
    expect(room.powerCardSlot.p0[0].armed).toBe(false); // card stays, re-armable
  });

  it('does NOT reset an armed Swap (its activation spans turns)', () => {
    const room = armedRoom('swap');
    advanceTurn(room);
    advanceTurn(room);
    expect(room.players.find(p => p.id === 'p0').armedPowerCard).not.toBeNull();
  });
});

// ─── §1.4 — armed cards cleared the moment their bluff window closes ──
// Stricter than the original full-cycle reset: a card armed by p0 is live
// only while p0 is the immediately-previous player. Once the turn moves
// past p0+1 the armed flag must be swept, in games of any size, so it can
// never auto-fire on a later play.

describe('stale armed power cards swept once past the bluff window (§1.4)', () => {
  function armedRoomN(n, power, holderIdx = 0) {
    const room = makeOnlineRoomWithPlayers(n);
    room.phase = 'playing';
    room.turnOrder = Array.from({ length: n }, (_, i) => `p${i}`);
    room.currentTurnIndex = holderIdx;
    const card = { id: `c-${power}`, type: 'power', power, armed: true };
    room.hands = new Map(room.turnOrder.map(id => [id, []]));
    room.powerCardSlot = Object.fromEntries(room.turnOrder.map(id => [id, []]));
    room.powerCardSlot[`p${holderIdx}`] = [card];
    room.players.find(p => p.id === `p${holderIdx}`).armedPowerCard = {
      power, cardId: card.id, activatedAtTurn: holderIdx, activatedAtRound: 1,
    };
    return room;
  }

  it('keeps a Shield armed while the holder is still the previous player (3-player)', () => {
    const room = armedRoomN(3, 'shield', 0);
    advanceTurn(room); // p0 → p1; p1 (the next player) can still bluff p0
    expect(room.players.find(p => p.id === 'p0').armedPowerCard).not.toBeNull();
  });

  it('clears the Shield the moment the turn moves past the next player (3-player)', () => {
    const room = armedRoomN(3, 'shield', 0);
    advanceTurn(room); // p0 → p1 (live window)
    advanceTurn(room); // p1 → p2; p0 can no longer be bluffed → swept
    const p0 = room.players.find(p => p.id === 'p0');
    expect(p0.armedPowerCard).toBeNull();
    expect(room.powerCardSlot.p0[0].armed).toBe(false);
  });

  it('does not strand an armed Mirror when the holder is mid-order (4-player)', () => {
    const room = armedRoomN(4, 'mirror', 1); // p1 holds, currentTurnIndex = 1
    advanceTurn(room); // p1 → p2 (p1 is prev — kept)
    expect(room.players.find(p => p.id === 'p1').armedPowerCard).not.toBeNull();
    advanceTurn(room); // p2 → p3 (p1 no longer prev — swept)
    expect(room.players.find(p => p.id === 'p1').armedPowerCard).toBeNull();
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

  it('returns surrendered shape cards to the draw pile and deals 6 fresh shapes on normal survival; retains held power cards (#62, #184)', () => {
    const room = setupSurvivor();
    const before = room.hands.get('p0').slice();
    const retainedPowers = before.filter(c => c.type === 'power');
    const shapesBefore = before.filter(c => c.type !== 'power');
    const dealt = resetHandOnSurvival(room, 'p0', 6);
    expect(dealt).toHaveLength(6);
    const after = room.hands.get('p0');
    // After = retained power cards + 6 freshly dealt shape cards.
    expect(after).toHaveLength(retainedPowers.length + 6);
    // Retained power cards are still present.
    for (const pc of retainedPowers) {
      expect(after.find(c => c.id === pc.id)).toBeTruthy();
    }
    // #184 — the surrendered SHAPE cards go back into the DRAW PILE (not the
    // discard pile, which is never recycled). Retained power cards stay in hand,
    // so they're in neither pile.
    for (const card of shapesBefore) {
      expect(room.deck.find(c => c.id === card.id)).toBeTruthy();
      expect(room.discardPile.find(c => c.id === card.id)).toBeFalsy();
    }
    for (const pc of retainedPowers) {
      expect(room.deck.find(c => c.id === pc.id)).toBeFalsy();
      expect(room.discardPile.find(c => c.id === pc.id)).toBeFalsy();
    }
  });

  it('preserves armedPowerCard on survival when the armed card is still in the slot (#62, #195)', () => {
    const room = setupSurvivor();
    const player = room.players.find(p => p.id === 'p0');
    // Power cards live in room.powerCardSlot (not room.hands) after startGame,
    // and the armed marker keys the card by `cardId`. The deal is random, so
    // inject a slot card deterministically and arm it the way production does.
    const armedCard = { id: 'pc-armed-1', type: 'power', power: 'shield' };
    room.powerCardSlot = room.powerCardSlot || {};
    room.powerCardSlot.p0 = [armedCard];
    player.armedPowerCard = { cardId: armedCard.id, power: 'shield', activatedAtTurn: 0 };
    resetHandOnSurvival(room, 'p0', 6);
    expect(player.armedPowerCard).not.toBeNull();
    expect(player.armedPowerCard.cardId).toBe(armedCard.id);
  });

  it('clears armedPowerCard if the armed card is no longer in the slot (#195)', () => {
    const room = setupSurvivor();
    const player = room.players.find(p => p.id === 'p0');
    // Armed marker points at a card that is no longer in the slot.
    room.powerCardSlot = room.powerCardSlot || {};
    room.powerCardSlot.p0 = [];
    player.armedPowerCard = { cardId: 'ghost-card-id', power: 'shield', activatedAtTurn: 0 };
    resetHandOnSurvival(room, 'p0', 6);
    expect(player.armedPowerCard).toBeNull();
  });

  it('Redemption Spin path (3 cards) — deals 3 shapes and keeps held power cards (#62)', () => {
    const room = setupSurvivor();
    const retainedPowers = room.hands.get('p0').filter(c => c.type === 'power');
    const dealt = resetHandOnSurvival(room, 'p0', 3);
    expect(dealt).toHaveLength(3);
    expect(room.hands.get('p0')).toHaveLength(retainedPowers.length + 3);
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
  // After #62, "surviving hand size" applies to the SHAPE count only —
  // power cards are kept on top of the dealt shapes.
  it('omitted cardsToDeal defaults to surviving shape count + retained power cards (#56, #62)', () => {
    const room = setupSurvivor();
    // Trim the player's hand down so we can verify size-matching.
    const trimmed = room.hands.get('p0').slice(0, 4);
    room.hands.set('p0', trimmed);
    const trimmedShapeCount = trimmed.filter(c => c.type !== 'power').length;
    const trimmedPowerCount = trimmed.filter(c => c.type === 'power').length;
    const dealt = resetHandOnSurvival(room, 'p0');
    expect(dealt).toHaveLength(trimmedShapeCount);
    expect(room.hands.get('p0')).toHaveLength(trimmedShapeCount + trimmedPowerCount);
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
