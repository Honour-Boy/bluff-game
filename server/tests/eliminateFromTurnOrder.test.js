// ============================================================
// Regression tests for eliminateFromTurnOrder.
//
// Off-by-one bug in this function (PR #16) silently skipped a
// player's turn whenever the active player was eliminated. These
// tests pin the corrected behaviour so v2 features can't reintroduce
// the bug while adding more elimination paths (Mirror, Sniper, etc).
// ============================================================

import { describe, it, expect } from 'vitest';
import { eliminateFromTurnOrder } from '../gameEngine.js';

const room = (turnOrder, currentTurnIndex) => ({ turnOrder: [...turnOrder], currentTurnIndex });

describe('eliminateFromTurnOrder', () => {
  it('removes a player who is BEFORE the current turn — currentTurnIndex shifts down by 1', () => {
    const r = room(['a', 'b', 'c', 'd', 'e'], 3); // 'd' is current
    eliminateFromTurnOrder(r, 'a');
    expect(r.turnOrder).toEqual(['b', 'c', 'd', 'e']);
    expect(r.currentTurnIndex).toBe(2); // 'd' is still at index 2
  });

  it('removes the current player — index stays so the next player slides in', () => {
    const r = room(['a', 'b', 'c', 'd', 'e'], 2); // 'c' is current
    eliminateFromTurnOrder(r, 'c');
    // Splice removes 'c'; 'd' is now at index 2. Without the fix this
    // decremented to 1 and 'b' acted again — a skipped turn.
    expect(r.turnOrder).toEqual(['a', 'b', 'd', 'e']);
    expect(r.currentTurnIndex).toBe(2);
  });

  it('removes a player AFTER the current turn — index unchanged', () => {
    const r = room(['a', 'b', 'c', 'd', 'e'], 1); // 'b' is current
    eliminateFromTurnOrder(r, 'd');
    expect(r.turnOrder).toEqual(['a', 'b', 'c', 'e']);
    expect(r.currentTurnIndex).toBe(1);
  });

  it('removes the last player when current is the last — wraps to 0', () => {
    const r = room(['a', 'b', 'c'], 2); // 'c' is current
    eliminateFromTurnOrder(r, 'c');
    expect(r.turnOrder).toEqual(['a', 'b']);
    // Modulo 2 wraps 2 → 0
    expect(r.currentTurnIndex).toBe(0);
  });

  it('is a no-op when the player is not in turnOrder', () => {
    const r = room(['a', 'b', 'c'], 1);
    eliminateFromTurnOrder(r, 'zzz');
    expect(r.turnOrder).toEqual(['a', 'b', 'c']);
    expect(r.currentTurnIndex).toBe(1);
  });

  it('handles eliminating index 0 when currentTurnIndex is 0', () => {
    const r = room(['a', 'b', 'c'], 0); // 'a' is current and being eliminated
    eliminateFromTurnOrder(r, 'a');
    expect(r.turnOrder).toEqual(['b', 'c']);
    expect(r.currentTurnIndex).toBe(0); // 'b' takes over at 0
  });
});
