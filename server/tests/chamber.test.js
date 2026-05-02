// ============================================================
// Tests for the chamber / spin-trigger system.
//
// Backend-authoritative randomness — these lock the contract that
// pullTrigger always returns a coherent spinIndex/eliminated/chamber
// triple, and that the bullet count grows by 1 on every survival.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initChamber,
  addBulletToChamber,
  pullTrigger,
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

describe('pullTrigger', () => {
  beforeEach(() => {
    // Pin Math.random to a sequence: first call picks the spin index,
    // second call (only on survival) picks the new bullet slot.
    let seq = [0, 0]; // default: index 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = seq.shift();
      return v == null ? 0 : v;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('eliminated=true when the chosen slot has a bullet, chamber unchanged', () => {
    const chamber = ['bullet', null, null, null, null, null];
    const r = pullTrigger(chamber);
    expect(r.spinIndex).toBe(0);
    expect(r.eliminated).toBe(true);
    expect(r.chamber).toEqual(chamber); // no new bullet on death
    expect(r.bulletCount).toBe(1);
  });

  it('eliminated=false when the chosen slot is empty, and a new bullet is added', () => {
    const chamber = [null, null, null, null, null, 'bullet']; // bullet at slot 5
    // index 0 is empty → survive → add a bullet
    const r = pullTrigger(chamber);
    expect(r.spinIndex).toBe(0);
    expect(r.eliminated).toBe(false);
    expect(countBullets(r.chamber)).toBe(2);
    expect(r.bulletCount).toBe(2);
  });
});

describe('spinGun', () => {
  it('flips player to eliminated + spectator on a bullet hit', () => {
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: ['bullet', null, null, null, null, null],
      riskLevel: 1,
    };
    vi.spyOn(Math, 'random').mockReturnValue(0); // pick slot 0
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
      chamber: [null, null, null, null, null, 'bullet'],
      riskLevel: 1,
    };
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (calls++ === 0 ? 0 : 0));
    const r = spinGun(player);
    expect(r.eliminated).toBe(false);
    expect(player.status).toBe('alive');
    expect(player.riskLevel).toBe(2); // 1 original + 1 added
    vi.restoreAllMocks();
  });
});
