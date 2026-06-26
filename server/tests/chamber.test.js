// ============================================================
// Tests for the chamber / spin-trigger system.
//
// Backend-authoritative randomness — these lock the contract that
// pullTrigger always returns a coherent spinIndex/eliminated/chamber
// triple. Issue #67 changed the model from raw `bullets/6` to a
// non-linear DEATH_CURVE, with the chamber slot SELECTED to agree
// with the drawn outcome (visuals never contradict the result).
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initChamber,
  addBulletToChamber,
  pullTrigger,
  deathProbability,
  DEATH_CURVE,
  spinGun,
  CHAMBER_SIZE,
} from '../gameEngine.js';

const countBullets = (chamber) => chamber.filter((s) => s === 'bullet').length;

describe('initChamber', () => {
  it('returns a 6-slot array with exactly 1 bullet', () => {
    const c = initChamber();
    expect(c).toHaveLength(CHAMBER_SIZE);
    expect(countBullets(c)).toBe(1);
  });

  it('places the bullet at a random index over many runs', () => {
    const placements = new Set();
    for (let i = 0; i < 200; i++) {
      placements.add(initChamber().indexOf('bullet'));
    }
    // Probabilistically every slot should have been picked at least once
    expect(placements.size).toBe(CHAMBER_SIZE);
  });
});

describe('addBulletToChamber', () => {
  it('adds exactly one bullet to an empty slot', () => {
    const before = [null, null, 'bullet', null, null, null];
    const after = addBulletToChamber(before);
    expect(countBullets(after)).toBe(2);
    // Original slot still has its bullet
    expect(after[2]).toBe('bullet');
  });

  it('returns unchanged when chamber is fully loaded', () => {
    const full = ['bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet'];
    const out = addBulletToChamber(full);
    expect(out).toEqual(full);
    expect(countBullets(out)).toBe(6);
  });
});

describe('deathProbability — issue #67 curve table', () => {
  it('matches the issue #67 table exactly', () => {
    expect(deathProbability(0)).toBe(0);
    expect(deathProbability(1)).toBeCloseTo(0.15);
    expect(deathProbability(2)).toBeCloseTo(0.24);
    expect(deathProbability(3)).toBeCloseTo(0.33);
    expect(deathProbability(4)).toBeCloseTo(0.50);
    expect(deathProbability(5)).toBeCloseTo(0.75);
    expect(deathProbability(6)).toBeCloseTo(1.00);
    expect(DEATH_CURVE[4]).toBe(0.5);
  });

  it('clamps out-of-range / fractional counts', () => {
    expect(deathProbability(-3)).toBe(0);
    expect(deathProbability(99)).toBe(1);
    expect(deathProbability(2.9)).toBeCloseTo(0.24); // floored to 2
  });
});

describe('pullTrigger — issue #67 curve, chamber-consistent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('eliminates when the outcome roll lands under the curve; spinIndex points to a bullet slot; chamber unchanged on death', () => {
    const chamber = ['bullet', null, null, null, null, null]; // 1 bullet → p=0.15
    // [0] outcome roll 0.10 < 0.15 → die; [1+] slot pick within bulletSlots=[0]
    vi.spyOn(Math, 'random').mockImplementationOnce(() => 0.10).mockImplementation(() => 0);
    const r = pullTrigger(chamber);
    expect(r.eliminated).toBe(true);
    expect(chamber[r.spinIndex]).toBe('bullet');
    expect(r.spinIndex).toBe(0);
    expect(r.chamber).toEqual(chamber); // no new bullet on death
    expect(r.bulletCount).toBe(1);
  });

  it('survives when the outcome roll is above the curve; spinIndex points to an empty slot; a bullet is added', () => {
    const chamber = ['bullet', null, null, null, null, null]; // 1 bullet → p=0.15
    // [0] outcome 0.90 ≥ 0.15 → survive; [1] slot pick in emptySlots; [2] addBullet pick
    vi.spyOn(Math, 'random').mockImplementationOnce(() => 0.90).mockImplementation(() => 0);
    const r = pullTrigger(chamber);
    expect(r.eliminated).toBe(false);
    expect(chamber[r.spinIndex]).toBeNull();
    expect(countBullets(r.chamber)).toBe(2); // survival adds one
    expect(r.bulletCount).toBe(2);
  });

  it('keeps spinIndex consistent with the verdict on every spin (randomised invariant)', () => {
    for (let i = 0; i < 500; i++) {
      const bullets = 1 + Math.floor(Math.random() * 5); // 1..5
      const chamber = initChamber(bullets);
      const r = pullTrigger([...chamber]);
      // The slot the spin lands on must agree with the verdict, always.
      expect(chamber[r.spinIndex] === 'bullet').toBe(r.eliminated);
    }
  });

  it('chamber realism: 0 bullets can never kill, a full chamber can never spare', () => {
    const empty = [null, null, null, null, null, null];
    for (let i = 0; i < 100; i++) expect(pullTrigger([...empty]).eliminated).toBe(false);
    const full = ['bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet'];
    for (let i = 0; i < 100; i++) expect(pullTrigger([...full]).eliminated).toBe(true);
  });
});

describe('pullTrigger — death distribution approximates the curve (issue #67)', () => {
  it('observed death rate ≈ curve for 1..5 bullets over many trials', () => {
    const TRIALS = 20000;
    for (let bullets = 1; bullets <= 5; bullets++) {
      let deaths = 0;
      for (let i = 0; i < TRIALS; i++) {
        if (pullTrigger(initChamber(bullets)).eliminated) deaths++;
      }
      // ±0.05 tolerance (toBeCloseTo precision 1); stderr at 20k trials
      // is well under 0.004, so this is a comfortable margin.
      expect(deaths / TRIALS).toBeCloseTo(DEATH_CURVE[bullets], 1);
    }
  });
});

describe('spinGun', () => {
  it('flips player to eliminated + spectator on a bullet hit', () => {
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: ['bullet', null, null, null, null, null], // 1 bullet → p=0.15
      riskLevel: 1,
    };
    // outcome roll 0 < 0.15 → die; slot pick falls on the only bullet (idx 0)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = spinGun(player);
    expect(r.eliminated).toBe(true);
    expect(player.status).toBe('eliminated');
    expect(player.isSpectator).toBe(true);
    vi.restoreAllMocks();
  });

  it('keeps player alive on miss and bumps riskLevel = bulletCount', () => {
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: [null, null, null, null, null, 'bullet'], // 1 bullet → p=0.15
      riskLevel: 1,
    };
    // [0] outcome 0.90 ≥ 0.15 → survive; subsequent picks default to 0
    vi.spyOn(Math, 'random').mockImplementationOnce(() => 0.90).mockImplementation(() => 0);
    const r = spinGun(player);
    expect(r.eliminated).toBe(false);
    expect(player.status).toBe('alive');
    expect(player.riskLevel).toBe(2); // 1 original + 1 added on survival
    vi.restoreAllMocks();
  });
});
