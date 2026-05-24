// ============================================================
// §1.1 — Global hand rotation + target-card reshuffle on bluff resolution.
//
// The moment a Bluff ("Block") challenge resolves, EVERY alive player's shape
// hand is re-dealt (power cards retained) and the match's required card type
// cycles to a fresh random shape — uniformly, not just for the player in the
// specific interaction. These tests pin both the engine helper and its
// integration via the orchestration's applyBluffOutcome.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  MODES,
  SHAPES,
  applyGlobalBluffReshuffle,
  eliminateFromTurnOrder,
  GAME_EVENT_TYPES,
} from '../gameEngine.js';
import { applyBluffOutcome } from '../lib/orchestration.js';

function onlineRoom(ids) {
  const room = createRoom('host', MODES.ONLINE);
  for (const id of ids) room.players.push(createPlayer(id, `U-${id}`, `s-${id}`));
  room.turnOrder = [...ids];
  room.currentTurnIndex = ids.length - 1;
  room.phase = 'playing';
  room.discardPile = [];
  room.playedPile = [];
  room.powerCardSlot = {};
  // A generous deck of DISTINCT shape cards to deal fresh hands from.
  room.deck = Array.from({ length: 60 }).map((_, i) => ({
    id: `deck-${i}`, type: 'shape', shape: SHAPES[i % SHAPES.length], number: (i % 13) + 1,
  }));
  room.hands = new Map();
  return room;
}

describe('§1.1 applyGlobalBluffReshuffle (engine)', () => {
  it('re-deals every alive player an equal-sized fresh shape hand, retaining power cards', () => {
    const room = onlineRoom(['p0', 'p1', 'p2']);
    room.hands.set('p0', [
      { id: 'old-0a', type: 'shape', shape: 'circle', number: 1 },
      { id: 'old-0b', type: 'shape', shape: 'circle', number: 2 },
      { id: 'pow-0', type: 'power', power: 'shield' },
    ]);
    room.hands.set('p1', [{ id: 'old-1a', type: 'shape', shape: 'square', number: 3 }]);
    room.hands.set('p2', [
      { id: 'old-2a', type: 'shape', shape: 'triangle', number: 4 },
      { id: 'old-2b', type: 'shape', shape: 'triangle', number: 5 },
      { id: 'old-2c', type: 'shape', shape: 'triangle', number: 6 },
    ]);

    const res = applyGlobalBluffReshuffle(room);
    expect(res.reshuffled).toBe(true);
    expect([...res.playerIds].sort()).toEqual(['p0', 'p1', 'p2']);

    // p0: power card retained; both old shape cards gone; count preserved (2).
    const p0 = room.hands.get('p0');
    expect(p0.filter(c => c.type === 'power').map(c => c.id)).toEqual(['pow-0']);
    const p0Shapes = p0.filter(c => c.type !== 'power');
    expect(p0Shapes).toHaveLength(2);
    expect(p0Shapes.some(c => c.id === 'old-0a' || c.id === 'old-0b')).toBe(false);

    // p1 + p2: counts preserved, old ids gone.
    expect(room.hands.get('p1').filter(c => c.type !== 'power')).toHaveLength(1);
    expect(room.hands.get('p1').some(c => c.id === 'old-1a')).toBe(false);
    expect(room.hands.get('p2').filter(c => c.type !== 'power')).toHaveLength(3);
    expect(room.hands.get('p2').some(c => ['old-2a', 'old-2b', 'old-2c'].includes(c.id))).toBe(false);

    // Required target card cycled to a valid shape.
    expect(SHAPES).toContain(res.cardType);
    expect(room.currentCardType).toBe(res.cardType);
  });

  it('skips eliminated players (their hands are left untouched)', () => {
    const room = onlineRoom(['p0', 'p1']);
    room.players[1].status = 'eliminated';
    room.hands.set('p0', [{ id: 'a', type: 'shape', shape: 'circle', number: 1 }]);
    room.hands.set('p1', [{ id: 'keep', type: 'shape', shape: 'circle', number: 2 }]);

    const res = applyGlobalBluffReshuffle(room);
    expect(res.playerIds).toEqual(['p0']);
    expect(room.hands.get('p1').map(c => c.id)).toEqual(['keep']);
  });

  it('is a safe no-op for non-online rooms', () => {
    const room = createRoom('host', MODES.PHYSICAL);
    const res = applyGlobalBluffReshuffle(room);
    expect(res.reshuffled).toBe(false);
    expect(res.playerIds).toEqual([]);
  });

  // Regression: a correct bluff that eliminates the previous player used to deal
  // the on-turn accuser an EXTRA card before the reshuffle, leaving them at
  // count+1 ("global re-deal adds cards"). The reshuffle re-deals to the CURRENT
  // size only, so once the redundant draw is gone the accuser stays at 4.
  it('does NOT inflate the on-turn player after an elimination (4 stays 4)', () => {
    const room = onlineRoom(['prev', 'accuser', 'bystander']);
    room.currentTurnIndex = 1; // accuser on turn
    room.hands.set('prev', [{ id: 'pv', type: 'shape', shape: 'circle', number: 1 }]);
    room.hands.set('accuser', [
      { id: 'a1', type: 'shape', shape: 'circle', number: 1 },
      { id: 'a2', type: 'shape', shape: 'square', number: 2 },
      { id: 'a3', type: 'shape', shape: 'triangle', number: 3 },
      { id: 'a4', type: 'shape', shape: 'star', number: 4 },
    ]);
    room.hands.set('bystander', [
      { id: 'b1', type: 'shape', shape: 'circle', number: 5 },
      { id: 'b2', type: 'shape', shape: 'square', number: 6 },
      { id: 'b3', type: 'shape', shape: 'triangle', number: 7 },
    ]);

    // The corrected resolution sequence: eliminate the previous player, then the
    // single hand-refresh (no extra per-player draw beforehand).
    eliminateFromTurnOrder(room, 'prev');
    applyGlobalBluffReshuffle(room);

    expect(room.hands.get('accuser').filter(c => c.type !== 'power')).toHaveLength(4);
    expect(room.hands.get('bystander').filter(c => c.type !== 'power')).toHaveLength(3);
  });
});

describe('§1.1 reshuffle fires on a resolved bluff (orchestration)', () => {
  it('BLUFF_BLOCKED re-deals all alive hands + cycles the target', () => {
    const room = onlineRoom(['p0', 'p1']);
    room.hands.set('p0', [{ id: 'o0', type: 'shape', shape: 'circle', number: 1 }]);
    room.hands.set('p1', [{ id: 'o1', type: 'shape', shape: 'square', number: 2 }]);

    applyBluffOutcome(room, {
      type: GAME_EVENT_TYPES.BLUFF_BLOCKED,
      shieldHolderId: 'p0',
      accuserId: 'p1',
      accusedId: 'p0',
    });

    expect(room.lastAction.type).toBe('bluff_blocked');
    expect(room.lastAction.globalReshuffle).toBe(true);
    expect(SHAPES).toContain(room.lastAction.newCardType);
    expect(room.hands.get('p0').some(c => c.id === 'o0')).toBe(false);
    expect(room.hands.get('p1').some(c => c.id === 'o1')).toBe(false);
  });
});
