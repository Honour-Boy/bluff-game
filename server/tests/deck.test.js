// ============================================================
// Tests for deck construction + dealing.
//
// Pin the Whot-style deck shape so v2 power-card distribution can
// be added on top without accidentally changing how the existing
// 71 shape cards are produced.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  generateDeck,
  buildDeck,
  shuffleDeck,
  dealCards,
  SHAPES,
} from '../gameEngine.js';

describe('generateDeck', () => {
  it('produces 71 cards: 5 shapes × numbers 1..14, plus one whot 20', () => {
    const deck = generateDeck();
    expect(deck).toHaveLength(SHAPES.length * 14 + 1);
    expect(deck.filter((c) => c.shape === 'whot')).toHaveLength(1);
    for (const shape of SHAPES) {
      expect(deck.filter((c) => c.shape === shape)).toHaveLength(14);
    }
  });

  it('every card has a unique id', () => {
    const deck = generateDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });
});

describe('buildDeck', () => {
  it('uses one deck for ≤10 players', () => {
    expect(buildDeck(2)).toHaveLength(71);
    expect(buildDeck(10)).toHaveLength(71);
  });

  it('doubles the deck for >10 players', () => {
    expect(buildDeck(11)).toHaveLength(142);
    expect(buildDeck(15)).toHaveLength(142);
  });
});

describe('shuffleDeck', () => {
  it('returns a new array of the same length and contents', () => {
    const deck = generateDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).not.toBe(deck);
    expect(shuffled).toHaveLength(deck.length);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(deck.map((c) => c.id)));
  });
});

describe('dealCards', () => {
  it('hands every player exactly cardsPerPlayer cards and returns the rest', () => {
    const deck = generateDeck();
    const ids = ['a', 'b', 'c'];
    const { hands, remainingDeck } = dealCards(deck, ids, 6);
    for (const id of ids) {
      expect(hands.get(id)).toHaveLength(6);
    }
    expect(remainingDeck).toHaveLength(deck.length - ids.length * 6);
  });

  it('does not duplicate cards across hands or the remaining deck', () => {
    const deck = generateDeck();
    const ids = ['a', 'b', 'c'];
    const { hands, remainingDeck } = dealCards(deck, ids, 6);
    const allIds = [
      ...hands.get('a').map((c) => c.id),
      ...hands.get('b').map((c) => c.id),
      ...hands.get('c').map((c) => c.id),
      ...remainingDeck.map((c) => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
