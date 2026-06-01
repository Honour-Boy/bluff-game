import { describe, it, expect } from 'vitest';
import { gameMusicStage } from '../useAtmosphere';

const players = (alive, dead = 0) => [
  ...Array.from({ length: alive }, (_, i) => ({ id: `a${i}`, status: 'alive' })),
  ...Array.from({ length: dead }, (_, i) => ({ id: `d${i}`, status: 'eliminated' })),
];

describe('gameMusicStage — progressive intensity (PR5)', () => {
  it('returns 0 with no room / no players', () => {
    expect(gameMusicStage(null)).toBe(0);
    expect(gameMusicStage({})).toBe(0);
    expect(gameMusicStage({ phase: 'playing' })).toBe(0);
  });

  it('returns 0 in lobby / pre_game regardless of players', () => {
    expect(gameMusicStage({ phase: 'lobby', players: players(6) })).toBe(0);
    expect(gameMusicStage({ phase: 'pre_game', players: players(6) })).toBe(0);
  });

  it('returns 0 early in the game (full field)', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(6) })).toBe(0);
    // 6 total, 5 alive → 5 > ceil(6*0.6)=4 → still calm
    expect(gameMusicStage({ phase: 'playing', players: players(5, 1) })).toBe(0);
  });

  it('returns 1 as the field thins (≤ ~60% alive)', () => {
    // 6 total, 4 alive → 4 <= ceil(3.6)=4 → building
    expect(gameMusicStage({ phase: 'playing', players: players(4, 2) })).toBe(1);
    // 6 total, 3 alive → build
    expect(gameMusicStage({ phase: 'playing', players: players(3, 3) })).toBe(1);
  });

  it('returns 2 for the final two (peak stakes)', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(2, 6) })).toBe(2);
    expect(gameMusicStage({ phase: 'spin_pending', players: players(2, 4) })).toBe(2);
  });
});
