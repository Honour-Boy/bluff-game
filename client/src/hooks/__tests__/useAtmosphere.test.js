import { describe, it, expect } from 'vitest';
import { gameMusicStage } from '../useAtmosphere';

const players = (alive, dead = 0) => [
  ...Array.from({ length: alive }, (_, i) => ({ id: `a${i}`, status: 'alive' })),
  ...Array.from({ length: dead }, (_, i) => ({ id: `d${i}`, status: 'eliminated' })),
];

describe('gameMusicStage - progressive intensity scaled to the playlist', () => {
  it('returns 0 with no room / no players', () => {
    expect(gameMusicStage(null)).toBe(0);
    expect(gameMusicStage({})).toBe(0);
    expect(gameMusicStage({ phase: 'playing' })).toBe(0);
  });

  it('returns 0 in lobby / pre_game regardless of players', () => {
    expect(gameMusicStage({ phase: 'lobby', players: players(6) }, 5)).toBe(0);
    expect(gameMusicStage({ phase: 'pre_game', players: players(6) }, 5)).toBe(0);
  });

  it('returns 0 at the opening (full field)', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(6) }, 5)).toBe(0);
  });

  it('steps up one stage per elimination across a 5-track playlist (6 players)', () => {
    const stageAt = (alive) =>
      gameMusicStage({ phase: 'playing', players: players(alive, 6 - alive) }, 5);
    expect(stageAt(6)).toBe(0); // full table
    expect(stageAt(5)).toBe(1);
    expect(stageAt(4)).toBe(2);
    expect(stageAt(3)).toBe(3);
    expect(stageAt(2)).toBe(4); // final two - peak track
  });

  it('the final two always hit the peak stage (= last track)', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(2, 6) }, 5)).toBe(4);
    expect(gameMusicStage({ phase: 'spin_pending', players: players(2, 4) }, 5)).toBe(4);
  });

  it('clamps to the provided stage count (3-stage playlist compresses 0..2)', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(6) }, 3)).toBe(0);
    expect(gameMusicStage({ phase: 'playing', players: players(2, 4) }, 3)).toBe(2);
  });

  it('a single-track playlist never escalates past 0', () => {
    expect(gameMusicStage({ phase: 'playing', players: players(2, 4) }, 1)).toBe(0);
  });

  it('defaults its ceiling to the live game playlist and stays in range', () => {
    const s = gameMusicStage({ phase: 'playing', players: players(4, 2) });
    expect(s).toBeGreaterThanOrEqual(0);
  });
});
