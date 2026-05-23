// ============================================================
// Regression — a bluff (and Peek) always resolves against the PREVIOUS
// player's card, even when the accuser has already played their own card
// this turn.
//
// Turn actions are order-free (play / call bluff / activate power, any
// order, once each). Before the fix, playing first overwrote the live
// `lastPlayedCard` with the accuser's own card, so the bluff judged the
// accuser's play instead of the accused's — letting a guilty previous
// player escape and an innocent accuser take the spin. The card under
// accusation is now snapshotted at the turn boundary (advanceTurn) into
// `challengeableCard`, so the accuser's own same-turn play can't move it.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  validateAndPlayCard,
  activatePowerCard,
  advanceTurn,
  MODES,
} from '../gameEngine.js';
import { resolveBluff } from '../bluffPipeline.js';

// p0 (accused) plays first, then the turn advances to p1 (accuser).
// currentCardType is 'circle' for the whole scenario.
function setupAfterAccusedPlayed({ accusedShape, accuserHand = [], accuserSlot = [] }) {
  const room = createRoom('host-socket', MODES.ONLINE);
  room.players.push(createPlayer('p0', 'Accused', 'sock-0'));
  room.players.push(createPlayer('p1', 'Accuser', 'sock-1'));
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.currentCardType = 'circle';
  room.playedPile = [];
  room.discardPile = [];
  room.powerCardSlot = { p0: [], p1: accuserSlot };
  room.hands = new Map([
    ['p0', [{ id: 'p0-card', type: 'shape', shape: accusedShape, number: 7 }]],
    ['p1', accuserHand],
  ]);

  // p0 plays their (face-down) card, then ends their turn.
  expect(validateAndPlayCard(room, 'p0', 'p0-card').ok).toBe(true);
  advanceTurn(room); // → p1's turn; snapshots p0's card as challengeable

  return room;
}

describe('bluff resolves against the previous player, not the accuser\'s own play', () => {
  it('accuser plays a MATCHING card first, then calls bluff on a guilty accused → accused is the target', () => {
    // p0 bluffed (played 'square' while 'circle' was required).
    const room = setupAfterAccusedPlayed({
      accusedShape: 'square',
      accuserHand: [{ id: 'p1-card', type: 'shape', shape: 'circle', number: 2 }],
    });

    // p1 plays their own truthful (matching) card BEFORE calling bluff. If the
    // bluff judged this card, it would be "wrong" and p1 would spin.
    expect(validateAndPlayCard(room, 'p1', 'p1-card').ok).toBe(true);
    expect(room.lastPlayedCard.id).toBe('p1-card'); // live pointer moved...

    const { outcome } = resolveBluff(room, 'p1');

    // ...but the bluff still judges p0's card: guilty → correct call → p0 spins.
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);
    expect(outcome.spinTargetId).toBe('p0');
    expect(outcome.revealedCard.id).toBe('p0-card');
  });

  it('accuser plays a card first, then wrongly accuses a truthful accused → accuser is the target', () => {
    // p0 told the truth (played 'circle' which matches the required shape).
    const room = setupAfterAccusedPlayed({
      accusedShape: 'circle',
      accuserHand: [{ id: 'p1-card', type: 'shape', shape: 'square', number: 2 }],
    });

    expect(validateAndPlayCard(room, 'p1', 'p1-card').ok).toBe(true);

    const { outcome } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false); // wrong accusation
    expect(outcome.spinTargetId).toBe('p1');    // accuser takes the spin
    expect(outcome.revealedCard.id).toBe('p0-card');
  });

  it('Peek after playing reveals the previous player\'s card, not the accuser\'s own', () => {
    const room = setupAfterAccusedPlayed({
      accusedShape: 'square',
      accuserHand: [{ id: 'p1-card', type: 'shape', shape: 'circle', number: 2 }],
      accuserSlot: [{ id: 'peek-1', type: 'power', power: 'peek' }],
    });

    // p1 plays their own card first, then peeks.
    expect(validateAndPlayCard(room, 'p1', 'p1-card').ok).toBe(true);
    const result = activatePowerCard(room, 'p1');

    expect(result.ok).toBe(true);
    expect(result.power).toBe('peek');
    expect(result.peekedCard.id).toBe('p0-card'); // the accused's card, not p1's
  });
});
