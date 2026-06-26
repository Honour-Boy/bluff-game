// ============================================================
// Tests for online-mode card play (validateAndPlayCard).
//
// The turn-action UI lets a player play / call bluff / activate a
// power card in ANY order, so the only authoritative guard against
// playing two cards in one turn lives in the engine. These tests pin
// that guard: one shape card per turn, regardless of UI state.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createRoom, createPlayer, validateAndPlayCard, MODES } from '../gameEngine.js';

function setupOnlineRoom() {
  const room = createRoom('host-socket', MODES.ONLINE);
  room.players.push(createPlayer('p0', 'Alice', 'sock-0'));
  room.turnOrder = ['p0'];
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.cardPlayedThisTurn = false;
  room.playedPile = [];
  room.hands = new Map([
    ['p0', [
      { id: 'c1', type: 'shape', shape: 'circle', number: 3 },
      { id: 'c2', type: 'shape', shape: 'square', number: 5 },
    ]],
  ]);
  return room;
}

describe('validateAndPlayCard - one card per turn', () => {
  it('plays the first card and marks cardPlayedThisTurn', () => {
    const room = setupOnlineRoom();
    const result = validateAndPlayCard(room, 'p0', 'c1');
    expect(result.ok).toBe(true);
    expect(result.card.id).toBe('c1');
    expect(room.cardPlayedThisTurn).toBe(true);
    expect(room.hands.get('p0').map(c => c.id)).toEqual(['c2']);
  });

  it('rejects a second play in the same turn (no double-play)', () => {
    const room = setupOnlineRoom();
    expect(validateAndPlayCard(room, 'p0', 'c1').ok).toBe(true);
    const second = validateAndPlayCard(room, 'p0', 'c2');
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already played a card/i);
    // The second card stays in hand; the played pile holds only the first.
    expect(room.hands.get('p0').map(c => c.id)).toEqual(['c2']);
    expect(room.playedPile.map(c => c.id)).toEqual(['c1']);
  });

  it('allows a play again once cardPlayedThisTurn is cleared (next turn)', () => {
    const room = setupOnlineRoom();
    expect(validateAndPlayCard(room, 'p0', 'c1').ok).toBe(true);
    // Turn advance / spin resets this flag server-side.
    room.cardPlayedThisTurn = false;
    const result = validateAndPlayCard(room, 'p0', 'c2');
    expect(result.ok).toBe(true);
    expect(result.card.id).toBe('c2');
  });
});
