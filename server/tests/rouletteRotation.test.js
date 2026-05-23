// ============================================================
// Roulette Rotation — spontaneous turn order (online room modifier).
//
// Rules under test:
//   • Each cycle is a random permutation of the alive players — everyone
//     takes exactly one turn before anyone repeats.
//   • No player plays twice back-to-back (the only place this can happen
//     is across a cycle boundary).
//   • With exactly 2 alive players it degrades to strict alternation.
//   • Eliminations: finish the current cycle, then reshuffle from the
//     remaining alive players (the eliminated player never reappears).
//   • The bluff still accuses the true previous turn-taker after a
//     reshuffle (getPreviousTurnPlayerId), not naive index arithmetic.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  advanceTurn,
  getPreviousTurnPlayerId,
  eliminateFromTurnOrder,
  resolveBluff as resolveBluffPhysical,
  MODES,
} from '../gameEngine.js';

function makeRouletteRoom(ids) {
  const room = createRoom('host-socket', MODES.ONLINE, {
    roomModifiers: { rouletteRotation: true },
  });
  ids.forEach((id, i) => room.players.push(createPlayer(id, id.toUpperCase(), `sock-${i}`)));
  room.turnOrder = [...ids];
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  return room;
}

// Record the player whose turn it is, then advance — so the returned array is
// the chronological order of turns actually taken.
function takeTurns(room, n) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    seq.push(room.turnOrder[room.currentTurnIndex]);
    advanceTurn(room);
  }
  return seq;
}

function aliveIds(room) {
  return room.players.filter(p => p.status === 'alive').map(p => p.id);
}

describe('Roulette Rotation — cycle structure', () => {
  it('every cycle is a full permutation of the alive players (one turn each)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const room = makeRouletteRoom(ids);
    const seq = takeTurns(room, ids.length * 40); // 40 cycles

    for (let start = 0; start < seq.length; start += ids.length) {
      const cycle = seq.slice(start, start + ids.length);
      expect([...cycle].sort()).toEqual([...ids].sort()); // permutation: all present, no repeats
    }
  });

  it('never lets a player take two turns back-to-back (incl. across cycle boundaries)', () => {
    const room = makeRouletteRoom(['a', 'b', 'c', 'd', 'e']);
    const seq = takeTurns(room, 500);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it('re-rolls the order each cycle (not a fixed repeating sequence)', () => {
    // Across many 4-player cycles at least two distinct orderings must appear,
    // otherwise it would just be the fixed rotation in disguise.
    const ids = ['a', 'b', 'c', 'd'];
    const room = makeRouletteRoom(ids);
    const seq = takeTurns(room, ids.length * 40);
    const seen = new Set();
    for (let start = 0; start < seq.length; start += ids.length) {
      seen.add(seq.slice(start, start + ids.length).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('degrades to strict alternation with exactly 2 alive players', () => {
    const room = makeRouletteRoom(['a', 'b']);
    const seq = takeTurns(room, 20);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).not.toBe(seq[i - 1]);
    }
    expect(new Set(seq)).toEqual(new Set(['a', 'b']));
  });
});

describe('Roulette Rotation — eliminations', () => {
  it('finishes the current cycle, then reshuffles only the remaining alive players', () => {
    const room = makeRouletteRoom(['a', 'b', 'c', 'd']);
    // a takes a turn, advance to whoever is next, then eliminate c mid-cycle.
    advanceTurn(room);
    const cPlayer = room.players.find(p => p.id === 'c');
    cPlayer.status = 'eliminated';
    eliminateFromTurnOrder(room, 'c');

    const seq = takeTurns(room, 200);
    expect(seq).not.toContain('c'); // eliminated player never takes another turn

    // Every freshly-generated cycle is a permutation of the survivors.
    const survivors = aliveIds(room); // a, b, d
    // Skip the partial first cycle remnant; check whole cycles of size 3.
    const tail = seq.slice(seq.length % survivors.length);
    for (let start = 0; start < tail.length; start += survivors.length) {
      const cycle = tail.slice(start, start + survivors.length);
      if (cycle.length === survivors.length) {
        expect([...cycle].sort()).toEqual([...survivors].sort());
      }
    }
  });
});

describe('Roulette Rotation — bluff target after a reshuffle', () => {
  it('the bluff accuses the previous turn-taker across a cycle boundary, not turnOrder[index-1]', () => {
    const room = makeRouletteRoom(['a', 'b', 'c', 'd']);

    // Walk until advancing lands us on the first turn of a brand-new cycle.
    let finisher = null;
    for (let i = 0; i < 200; i++) {
      finisher = room.turnOrder[room.currentTurnIndex];
      advanceTurn(room);
      if (room.currentTurnIndex === 0) break; // crossed into a new (reshuffled) cycle
    }

    // The true previous player is the one who just finished the old cycle.
    expect(getPreviousTurnPlayerId(room)).toBe(finisher);

    // And it is NOT necessarily the last slot of the new cycle (the naive
    // arithmetic) — prove the helper diverges from index math at the boundary.
    const len = room.turnOrder.length;
    const naivePrev = room.turnOrder[(room.currentTurnIndex - 1 + len) % len];
    // finisher can't be first of the new cycle (no back-to-back), so if it also
    // isn't the last slot, the two differ — which is the whole point.
    if (naivePrev !== finisher) {
      expect(getPreviousTurnPlayerId(room)).not.toBe(naivePrev);
    }
  });

  it('resolveBluff (engine, physical-style) spins the correct previous player after reshuffle', () => {
    const room = makeRouletteRoom(['a', 'b', 'c', 'd']);
    let finisher = null;
    for (let i = 0; i < 200; i++) {
      finisher = room.turnOrder[room.currentTurnIndex];
      advanceTurn(room);
      if (room.currentTurnIndex === 0) break;
    }
    // A correct bluff spins the accused = the previous turn-taker.
    const { spinTarget } = resolveBluffPhysical(room, true);
    expect(spinTarget.id).toBe(finisher);
  });
});
