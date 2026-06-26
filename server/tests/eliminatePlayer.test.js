// ============================================================
// Tests for eliminatePlayer (by-id elimination).
//
// Extracted from handleDisconnect (#156) so the disconnect timeout and
// the group-removal eviction share one elimination path. These pin the
// status/turn-order side effects so neither caller can drift.
// ============================================================

import { describe, it, expect } from 'vitest';
import { eliminatePlayer } from '../gameEngine.js';

function room(ids, currentTurnIndex = 0) {
  return {
    players: ids.map((id) => ({ id, username: id.toUpperCase(), status: 'alive', isSpectator: false })),
    turnOrder: [...ids],
    currentTurnIndex,
  };
}

describe('eliminatePlayer', () => {
  it('eliminates an alive player and drops them from the turn order', () => {
    const r = room(['a', 'b', 'c'], 0);
    const result = eliminatePlayer(r, 'b');

    expect(result.id).toBe('b');
    const b = r.players.find((p) => p.id === 'b');
    expect(b.status).toBe('eliminated');
    expect(b.isSpectator).toBe(true);
    expect(r.turnOrder).toEqual(['a', 'c']);
  });

  it('keeps currentTurnIndex on the next player when the current player is removed', () => {
    const r = room(['a', 'b', 'c', 'd'], 1); // 'b' is current
    eliminatePlayer(r, 'b');
    // 'c' slides into index 1 and acts next - no skipped turn.
    expect(r.turnOrder).toEqual(['a', 'c', 'd']);
    expect(r.currentTurnIndex).toBe(1);
  });

  it('returns null and is a no-op when the player is already eliminated', () => {
    const r = room(['a', 'b'], 0);
    r.players[1].status = 'eliminated';
    const before = [...r.turnOrder];

    expect(eliminatePlayer(r, 'b')).toBeNull();
    expect(r.turnOrder).toEqual(before);
  });

  it('returns null when the player id is not in the room', () => {
    const r = room(['a', 'b'], 0);
    expect(eliminatePlayer(r, 'zzz')).toBeNull();
    expect(r.turnOrder).toEqual(['a', 'b']);
  });
});
