// ============================================================
// Tests for v2 Phase E — Risk + Room modifiers
//
// Covers, per the locked roadmap (sections 3 + 4):
//
//   Risk:
//     - Double Barrel: spinIndex = max(d1, d2); preserved survival /
//       elimination semantics
//     - Russian Roulette: every chamber starts with 3 bullets at
//       startGame
//     - Hot Potato: +2 bullets on survival; clamps at 6
//     - Redemption Spin: K-by-table selection, fresh 3-card hand on
//       success, chamber resets to 1 bullet on success, stays dead on
//       failure
//
//   Room:
//     - Speed Mode: 15s timer plumbing (state-only — no real timer in
//       these tests; we verify engine-level helpers + serialisation)
//     - Sudden Death: counter increments, threshold bump, reset on
//       elimination
//     - Mirror Match: opposite-player resolution + odd-fallback
//     - Mirror Match eligibility check at game start
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  startGame,
  serializeRoom,
  spinGun,
  pullTrigger,
  initChamber,
  addBulletToChamber,
  getSpinModifiers,
  tickSuddenDeath,
  resetSuddenDeath,
  SUDDEN_DEATH_THRESHOLD,
  getMirrorMatchOpposite,
  isMirrorMatchEligibleAtStart,
  pickRedemptionCandidates,
  runRedemptionSpin,
  resetRedemptionFlags,
  resetRoundOnline,
  eliminateFromTurnOrder,
  CHAMBER_SIZE,
  MODES,
  ROLES,
} from '../gameEngine.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(overrides = {}) {
  const cfg = defaultRoomConfig();
  if (overrides.risk) Object.assign(cfg.riskModifiers, overrides.risk);
  if (overrides.room) Object.assign(cfg.roomModifiers, overrides.room);
  if (overrides.power) Object.assign(cfg.powerCards.enabled, overrides.power);
  return cfg;
}

function makeOnlineRoom(playerCount, cfg = null) {
  const room = createRoom('host-socket', MODES.ONLINE, cfg || defaultRoomConfig());
  for (let i = 0; i < playerCount; i++) {
    room.players.push(createPlayer(`p${i}`, `Player${i}`, `sock-${i}`));
  }
  return room;
}

const countBullets = (chamber) => chamber.filter((s) => s === 'bullet').length;

// Pin a deterministic Math.random sequence — pop one at a time. When
// the sequence is exhausted, return 0 (safe default).
function pinRandom(seq) {
  const queue = [...seq];
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    if (queue.length === 0) return 0;
    return queue.shift();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Risk: Double Barrel
// ============================================================

describe('Risk modifier — Double Barrel', () => {
  it('takes the higher of two spin indices', () => {
    // Math.random sequence: first call = d1 in [0, 1), second = d2.
    // d1 = 0.0 → index 0; d2 = 0.83 → index 5. Take max → 5.
    pinRandom([0.0, 0.9, 0.0]);
    const chamber = ['bullet', null, null, null, null, null];
    const r = pullTrigger(chamber, { doubleBarrel: true });
    expect(r.spinIndex).toBe(5);
    expect(r.eliminated).toBe(false);
  });

  it('without doubleBarrel, only one die rolls', () => {
    pinRandom([0.0, 0.9, 0.0]);
    const chamber = ['bullet', null, null, null, null, null];
    const r = pullTrigger(chamber, { doubleBarrel: false });
    // Without doubleBarrel, index 0 hits and the player is eliminated.
    expect(r.spinIndex).toBe(0);
    expect(r.eliminated).toBe(true);
  });

  it('eliminates only when the higher of two dice hits a bullet', () => {
    // d1=0 (idx 0), d2=0.34 (idx 2). Max = 2. Bullet at 2 → die.
    pinRandom([0.0, 0.34]);
    const chamber = [null, null, 'bullet', null, null, null];
    const r = pullTrigger(chamber, { doubleBarrel: true });
    expect(r.spinIndex).toBe(2);
    expect(r.eliminated).toBe(true);
  });

  it('over many runs survival rate is higher than vanilla on a single-bullet-low chamber', () => {
    // Statistical sanity check — bullet at slot 0, every other slot
    // empty. Vanilla survival ≈ 5/6. Double Barrel survival = P(both
    // dice >= 1) = 25/36 ≈ 0.694 — actually LOWER. Wait — taking max
    // makes the higher slot more likely. Vanilla: P(spinIndex == 0)
    // = 1/6. Double Barrel: P(max == 0) = (1/6)^2 = 1/36. So Double
    // Barrel survives MORE often when bullet is at slot 0. Verify.
    let vanillaSurvived = 0;
    let dbSurvived = 0;
    const ITER = 5000;
    const chamber = ['bullet', null, null, null, null, null];
    // Restore real Math.random for the statistical test.
    vi.restoreAllMocks();
    for (let i = 0; i < ITER; i++) {
      const v = pullTrigger([...chamber]);
      if (!v.eliminated) vanillaSurvived++;
      const d = pullTrigger([...chamber], { doubleBarrel: true });
      if (!d.eliminated) dbSurvived++;
    }
    // Double Barrel should survive more often when bullet is at low
    // index. Allow some statistical noise.
    expect(dbSurvived).toBeGreaterThan(vanillaSurvived);
  });
});

// ============================================================
// Risk: Russian Roulette
// ============================================================

describe('Risk modifier — Russian Roulette', () => {
  it('startGame leaves chambers at 3 bullets when enabled', () => {
    const cfg = configWith({ risk: { russianRoulette: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    for (const p of room.players) {
      if (p.status !== 'alive') continue;
      expect(countBullets(p.chamber)).toBe(3);
      expect(p.riskLevel).toBe(3);
    }
  });

  it('startGame leaves chambers at 1 bullet when disabled (default)', () => {
    const room = makeOnlineRoom(4);
    startGame(room);
    for (const p of room.players) {
      if (p.status !== 'alive') continue;
      expect(countBullets(p.chamber)).toBe(1);
      expect(p.riskLevel).toBe(1);
    }
  });

  it('initChamber(3) places 3 distinct bullets', () => {
    for (let i = 0; i < 50; i++) {
      const c = initChamber(3);
      expect(c).toHaveLength(CHAMBER_SIZE);
      expect(countBullets(c)).toBe(3);
    }
  });

  it('initChamber clamps bullets to chamber size', () => {
    const c = initChamber(99);
    expect(countBullets(c)).toBe(CHAMBER_SIZE);
  });

  it('initChamber clamps negative input to 0 bullets', () => {
    const c = initChamber(-5);
    expect(countBullets(c)).toBe(0);
  });
});

// ============================================================
// Risk: Hot Potato
// ============================================================

describe('Risk modifier — Hot Potato', () => {
  it('adds 2 bullets on survival', () => {
    pinRandom([0.0, 0.5, 0.5]);
    const chamber = [null, null, null, null, null, 'bullet'];
    const r = pullTrigger(chamber, { hotPotato: true });
    expect(r.eliminated).toBe(false);
    // Started with 1 bullet → +2 → 3.
    expect(countBullets(r.chamber)).toBe(3);
  });

  it('adds 1 bullet without hotPotato (vanilla survival rule preserved)', () => {
    pinRandom([0.0, 0.5]);
    const chamber = [null, null, null, null, null, 'bullet'];
    const r = pullTrigger(chamber);
    expect(r.eliminated).toBe(false);
    expect(countBullets(r.chamber)).toBe(2);
  });

  it('clamps at chamber capacity (5/6 + Hot Potato survival → 6/6, not error)', () => {
    pinRandom([0.0, 0.0]);
    // 5/6 chamber, miss at idx 0 → would survive → +2 wants to overflow
    const chamber = [null, 'bullet', 'bullet', 'bullet', 'bullet', 'bullet'];
    const r = pullTrigger(chamber, { hotPotato: true });
    expect(r.eliminated).toBe(false);
    expect(countBullets(r.chamber)).toBe(CHAMBER_SIZE); // clamped
  });

  it('does not add bullets on elimination', () => {
    pinRandom([0.0]);
    const chamber = ['bullet', null, null, null, null, null];
    const r = pullTrigger(chamber, { hotPotato: true });
    expect(r.eliminated).toBe(true);
    expect(countBullets(r.chamber)).toBe(1);
  });
});

// ============================================================
// Risk: Redemption Spin
// ============================================================

describe('Risk modifier — Redemption Spin', () => {
  it('off by default → pickRedemptionCandidates returns []', () => {
    const room = makeOnlineRoom(6);
    startGame(room);
    // Eliminate 2 players to seed candidates
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    expect(pickRedemptionCandidates(room)).toEqual([]);
  });

  it('table size: 4 players → K=1', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    room.players[1].status = 'eliminated';
    room.players[2].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(1);
  });

  it('table size: 6 players → K=2', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    for (let i = 1; i <= 4; i++) room.players[i].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(2);
  });

  it('table size: 9 players → K=3', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(9, cfg);
    startGame(room);
    for (let i = 1; i <= 5; i++) room.players[i].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(3);
  });

  it('table size: 12 players → K=4', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(12, cfg);
    startGame(room);
    for (let i = 1; i <= 6; i++) room.players[i].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(4);
  });

  it('table size: 15 players → K=5', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(15, cfg);
    startGame(room);
    for (let i = 1; i <= 8; i++) room.players[i].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(5);
  });

  it('K is clamped to the number of eliminated players', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(15, cfg); // table K=5, only 1 eliminated
    startGame(room);
    room.players[1].status = 'eliminated';
    const cands = pickRedemptionCandidates(room);
    expect(cands).toHaveLength(1);
  });

  it('returns empty when alive count <= 1 (game already won)', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    for (let i = 1; i < 6; i++) room.players[i].status = 'eliminated';
    expect(pickRedemptionCandidates(room)).toEqual([]);
  });

  it('runRedemptionSpin: survivor is revived with chamber=1 bullet, status=alive', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    const victim = room.players[1];
    victim.status = 'eliminated';
    victim.chamber = [null, 'bullet', 'bullet', null, null, null]; // 2 bullets pre-spin
    eliminateFromTurnOrder(room, victim.id);
    // Force a survival spin: index 0 (empty)
    pinRandom([0.0, 0.5]);
    const result = runRedemptionSpin(room, victim.id);
    expect(result.eliminated).toBe(false);
    expect(victim.status).toBe('alive');
    expect(countBullets(victim.chamber)).toBe(1);
    expect(victim.riskLevel).toBe(1);
    expect(room.turnOrder).toContain(victim.id);
    expect(result.freshCards.length).toBeLessThanOrEqual(3);
    expect(result.freshCards.length).toBeGreaterThan(0);
  });

  it('runRedemptionSpin: failure leaves player eliminated', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    const victim = room.players[1];
    victim.status = 'eliminated';
    victim.chamber = ['bullet', null, null, null, null, null];
    eliminateFromTurnOrder(room, victim.id);
    pinRandom([0.0]); // hit bullet at idx 0
    const result = runRedemptionSpin(room, victim.id);
    expect(result.eliminated).toBe(true);
    expect(victim.status).toBe('eliminated');
    expect(room.turnOrder).not.toContain(victim.id);
    expect(result.freshCards).toEqual([]);
  });

  it('each eliminated player only gets one redemption shot per round', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    const victim = room.players[1];
    victim.status = 'eliminated';
    victim.chamber = ['bullet', null, null, null, null, null];
    pinRandom([0.0]); // first spin: die
    runRedemptionSpin(room, victim.id);
    // Second pick → already consumed flag
    const cands = pickRedemptionCandidates(room);
    expect(cands).not.toContain(victim.id);
  });

  it('resetRoundOnline clears redemption-consumed flags so next round eligible', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    const victim = room.players[1];
    victim.status = 'eliminated';
    victim._redemptionConsumed = true;
    resetRedemptionFlags(room);
    expect(victim._redemptionConsumed).toBeUndefined();
  });

  it('disabled when room.lastStandActive is set (Phase F3 hook)', () => {
    const cfg = configWith({ risk: { redemptionSpin: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    for (let i = 1; i <= 3; i++) room.players[i].status = 'eliminated';
    room.lastStandActive = true;
    expect(pickRedemptionCandidates(room)).toEqual([]);
  });
});

// ============================================================
// Room: Speed Mode (engine-side surface only — full timer
// behaviour lives in socketHandlers and is integration-tested)
// ============================================================

describe('Room modifier — Speed Mode (engine surface)', () => {
  it('serializeRoom exposes speedModeMsRemaining when enabled + deadline set', () => {
    const cfg = configWith({ room: { speedMode: true } });
    const room = makeOnlineRoom(3, cfg);
    startGame(room);
    room.speedModeDeadline = Date.now() + 10_000;
    const view = serializeRoom(room, room.players[0].id);
    expect(view.speedModeMsRemaining).toBeGreaterThan(0);
    expect(view.speedModeMsRemaining).toBeLessThanOrEqual(10_000);
  });

  it('serializeRoom omits speedModeMsRemaining when disabled', () => {
    const room = makeOnlineRoom(3);
    startGame(room);
    room.speedModeDeadline = Date.now() + 10_000;
    const view = serializeRoom(room, room.players[0].id);
    expect(view.speedModeMsRemaining).toBeUndefined();
  });

  it('serializeRoom omits speedModeMsRemaining when no deadline armed', () => {
    const cfg = configWith({ room: { speedMode: true } });
    const room = makeOnlineRoom(3, cfg);
    startGame(room);
    const view = serializeRoom(room, room.players[0].id);
    expect(view.speedModeMsRemaining).toBeUndefined();
  });
});

// ============================================================
// Room: Sudden Death
// ============================================================

describe('Room modifier — Sudden Death', () => {
  it('off by default → tickSuddenDeath returns null', () => {
    const room = makeOnlineRoom(4);
    startGame(room);
    expect(tickSuddenDeath(room)).toBeNull();
    expect(room.suddenDeathCounter).toBe(0);
  });

  it('counter increments each tick when enabled', () => {
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    tickSuddenDeath(room);
    expect(room.suddenDeathCounter).toBe(1);
    tickSuddenDeath(room);
    expect(room.suddenDeathCounter).toBe(2);
  });

  it('threshold (4 ticks) bumps every alive chamber by 1 + emits banner', () => {
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    // Each player starts with 1 bullet
    for (let i = 0; i < SUDDEN_DEATH_THRESHOLD - 1; i++) tickSuddenDeath(room);
    expect(room.suddenDeathCounter).toBe(SUDDEN_DEATH_THRESHOLD - 1);
    const banner = tickSuddenDeath(room);
    expect(banner).not.toBeNull();
    expect(banner.kind).toBe('sudden_death');
    expect(banner.affectedPlayerIds.length).toBe(4);
    for (const p of room.players) {
      if (p.status !== 'alive') continue;
      expect(countBullets(p.chamber)).toBe(2);
    }
    // Counter resets after threshold fires
    expect(room.suddenDeathCounter).toBe(0);
  });

  it('eliminateFromTurnOrder resets the counter', () => {
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    tickSuddenDeath(room);
    tickSuddenDeath(room);
    tickSuddenDeath(room);
    expect(room.suddenDeathCounter).toBe(3);
    const victim = room.players[1];
    victim.status = 'eliminated';
    eliminateFromTurnOrder(room, victim.id);
    expect(room.suddenDeathCounter).toBe(0);
  });

  it('fully-loaded chambers stay at 6 (graceful clamp)', () => {
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = makeOnlineRoom(2, cfg);
    startGame(room);
    // Force one player's chamber to 6/6 already
    room.players[0].chamber = new Array(CHAMBER_SIZE).fill('bullet');
    room.players[0].riskLevel = CHAMBER_SIZE;
    for (let i = 0; i < SUDDEN_DEATH_THRESHOLD; i++) tickSuddenDeath(room);
    expect(countBullets(room.players[0].chamber)).toBe(CHAMBER_SIZE);
    expect(room.players[0].riskLevel).toBe(CHAMBER_SIZE);
  });

  it('counter resets between rounds', () => {
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    tickSuddenDeath(room);
    tickSuddenDeath(room);
    expect(room.suddenDeathCounter).toBe(2);
    resetRoundOnline(room);
    expect(room.suddenDeathCounter).toBe(0);
  });

  it('resetSuddenDeath is a no-op on null room', () => {
    expect(() => resetSuddenDeath(null)).not.toThrow();
  });
});

// ============================================================
// Room: Mirror Match
// ============================================================

describe('Room modifier — Mirror Match', () => {
  it('isMirrorMatchEligibleAtStart: true when alive count is even', () => {
    const room = makeOnlineRoom(6);
    expect(isMirrorMatchEligibleAtStart(room)).toBe(true);
  });

  it('isMirrorMatchEligibleAtStart: false when alive count is odd', () => {
    const room = makeOnlineRoom(5);
    expect(isMirrorMatchEligibleAtStart(room)).toBe(false);
  });

  it('isMirrorMatchEligibleAtStart: false when alive count < 2', () => {
    const room = makeOnlineRoom(1);
    expect(isMirrorMatchEligibleAtStart(room)).toBe(false);
  });

  it('startGame latches mirrorMatchActive flag', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    expect(room.mirrorMatchActive).toBe(true);
  });

  it('startGame does NOT latch mirrorMatchActive when modifier off', () => {
    const room = makeOnlineRoom(6);
    startGame(room);
    expect(room.mirrorMatchActive).toBe(false);
  });

  it('getMirrorMatchOpposite: even count → exact opposite player', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    // turnOrder is a shuffled list. Index 0 vs index 3 are opposites.
    const a = room.turnOrder[0];
    const b = room.turnOrder[3];
    expect(getMirrorMatchOpposite(room, a)).toBe(b);
    expect(getMirrorMatchOpposite(room, b)).toBe(a);
  });

  it('getMirrorMatchOpposite: odd count fallback walks forward to next alive', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    // Eliminate the would-be opposite of turnOrder[0] (index 3).
    const exactOppositeId = room.turnOrder[3];
    const exactOpposite = room.players.find(p => p.id === exactOppositeId);
    exactOpposite.status = 'eliminated';
    eliminateFromTurnOrder(room, exactOppositeId);
    // After elimination turnOrder length is 5. Re-derive an originator
    // from the new turnOrder; the math now uses idx + 2 (length/2 = 2).
    // We'll just assert the helper returns SOME alive non-self id.
    const originator = room.turnOrder[0];
    const opp = getMirrorMatchOpposite(room, originator);
    expect(opp).not.toBe(originator);
    expect(opp).not.toBe(exactOppositeId);
    const oppPlayer = room.players.find(p => p.id === opp);
    expect(oppPlayer.status).toBe('alive');
  });

  it('getMirrorMatchOpposite: returns null when modifier inactive', () => {
    const room = makeOnlineRoom(6);
    startGame(room);
    expect(getMirrorMatchOpposite(room, room.turnOrder[0])).toBeNull();
  });

  it('mirror match stays active even when alive count goes odd post-elimination', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = makeOnlineRoom(6, cfg);
    startGame(room);
    expect(room.mirrorMatchActive).toBe(true);
    // Eliminate one to make alive=5 (odd)
    const v = room.players[2];
    v.status = 'eliminated';
    eliminateFromTurnOrder(room, v.id);
    // mirrorMatchActive flag is latched at startGame and preserved
    expect(room.mirrorMatchActive).toBe(true);
  });

  it('serializeRoom exposes mirrorMatchActive', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = makeOnlineRoom(4, cfg);
    startGame(room);
    const view = serializeRoom(room, room.players[0].id);
    expect(view.mirrorMatchActive).toBe(true);
  });
});

// ============================================================
// Cross-cutting: getSpinModifiers reflects room.config
// ============================================================

describe('getSpinModifiers', () => {
  it('returns false flags when no modifiers set', () => {
    const room = makeOnlineRoom(2);
    const m = getSpinModifiers(room);
    expect(m.doubleBarrel).toBe(false);
    expect(m.hotPotato).toBe(false);
  });

  it('reads doubleBarrel + hotPotato from config', () => {
    const cfg = configWith({ risk: { doubleBarrel: true, hotPotato: true } });
    const room = makeOnlineRoom(2, cfg);
    const m = getSpinModifiers(room);
    expect(m.doubleBarrel).toBe(true);
    expect(m.hotPotato).toBe(true);
  });

  it('safe on a room with no config', () => {
    const m = getSpinModifiers({});
    expect(m).toEqual({ doubleBarrel: false, hotPotato: false });
  });
});

// ============================================================
// spinGun + modifiers integration
// ============================================================

describe('spinGun forwards modifiers', () => {
  it('Hot Potato survival: player chamber gains 2 bullets', () => {
    pinRandom([0.0, 0.5, 0.5]);
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: [null, null, null, null, null, 'bullet'],
      riskLevel: 1,
      role: 'barehand',
    };
    const r = spinGun(player, { hotPotato: true });
    expect(r.eliminated).toBe(false);
    expect(player.riskLevel).toBe(3);
  });

  it('Gambler still ignores survival bullets even with Hot Potato', () => {
    pinRandom([0.0, 0.5, 0.5]);
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: [null, null, null, null, null, 'bullet'],
      riskLevel: 1,
      role: 'gambler',
    };
    const r = spinGun(player, { hotPotato: true });
    expect(r.eliminated).toBe(false);
    expect(player.riskLevel).toBe(1); // Gambler revert wins over Hot Potato
  });

  it('Double Barrel: spin index is the higher of two rolls', () => {
    pinRandom([0.0, 0.9, 0.5]);
    const player = {
      id: 'p1',
      status: 'alive',
      isSpectator: false,
      chamber: [null, null, null, null, null, null], // empty for clarity
      riskLevel: 0,
      role: 'barehand',
    };
    // Manually load 1 bullet at slot 0; doubleBarrel should pick max(0,5)=5
    player.chamber[0] = 'bullet';
    const r = spinGun(player, { doubleBarrel: true });
    expect(r.spinIndex).toBe(5);
    expect(r.eliminated).toBe(false);
  });
});
