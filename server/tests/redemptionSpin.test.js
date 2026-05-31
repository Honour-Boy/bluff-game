import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engine = require('../gameEngine');
const {
  rooms,
  saveRoom,
  redemptionTimers,
  _clearRedemptionTimer,
} = require('../lib/state');
const {
  _redemptionEligible,
  beginRedemption,
  resolveRedemption,
} = require('../lib/orchestration');

const EMPTY_CHAMBER = [null, null, null, null, null, null];
const LOADED_CHAMBER = ['bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet'];

function makeIo() {
  const emits = [];
  return {
    emits,
    to: () => ({ emit: (ev, payload) => emits.push({ ev, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

// Build a live online room where p2 has just been eliminated by a spin, with
// the modifier on — i.e. exactly the post-elimination state where a redemption
// offer should be queued.
function makeRoomWithEliminated({ redemptionSpin = true } = {}) {
  const cfg = engine.defaultRoomConfig();
  cfg.riskModifiers.redemptionSpin = redemptionSpin;
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, cfg);
  for (let i = 0; i < 3; i++) {
    room.players.push(engine.createPlayer(`p${i}`, `P${i}`, `s${i}`));
  }
  engine.startGame(room);
  room.phase = 'playing';

  const p2 = room.players.find((p) => p.id === 'p2');
  p2.status = 'eliminated';
  p2.isSpectator = true;
  engine.eliminateFromTurnOrder(room, 'p2');
  return room;
}

describe('Redemption Spin (Phase E1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const code of [...redemptionTimers.keys()]) _clearRedemptionTimer(code);
    rooms.clear();
    vi.useRealTimers();
  });

  describe('_redemptionEligible', () => {
    it('is true for a just-eliminated player when the modifier is on and 2+ remain alive', () => {
      const room = makeRoomWithEliminated();
      expect(_redemptionEligible(room, 'p2')).toBe(true);
    });

    it('is false when the modifier is off', () => {
      const room = makeRoomWithEliminated({ redemptionSpin: false });
      expect(_redemptionEligible(room, 'p2')).toBe(false);
    });

    it('is false once the player has already consumed their one-shot', () => {
      const room = makeRoomWithEliminated();
      room.players.find((p) => p.id === 'p2')._redemptionConsumed = true;
      expect(_redemptionEligible(room, 'p2')).toBe(false);
    });

    it('is false for an alive player', () => {
      const room = makeRoomWithEliminated();
      expect(_redemptionEligible(room, 'p0')).toBe(false);
    });

    it('is false when the elimination ended the match (only one left alive)', () => {
      const room = makeRoomWithEliminated();
      // Knock p1 out too — only p0 remains alive.
      const p1 = room.players.find((p) => p.id === 'p1');
      p1.status = 'eliminated';
      engine.eliminateFromTurnOrder(room, 'p1');
      expect(_redemptionEligible(room, 'p2')).toBe(false);
    });

    it('is false during Last Stand', () => {
      const room = makeRoomWithEliminated();
      room.lastStandActive = true;
      expect(_redemptionEligible(room, 'p2')).toBe(false);
    });
  });

  describe('beginRedemption', () => {
    it('opens redemption_pending for the queued candidate and arms the safety timer', async () => {
      const room = makeRoomWithEliminated();
      room.pendingRedemption = { playerId: 'p2', playerName: 'P2' };
      await saveRoom(room);

      await beginRedemption(makeIo(), room, {});

      expect(room.phase).toBe('redemption_pending');
      expect(room.redemption.playerId).toBe('p2');
      expect(room.pendingRedemption).toBeUndefined();
      expect(redemptionTimers.has(room.code)).toBe(true);

      const view = engine.serializeRoom(room, 'p0');
      expect(view.redemption.playerId).toBe('p2');
      expect(view.redemption.msRemaining).toBeGreaterThan(0);
    });

    it('falls back to playing if the queued candidate is no longer eligible', async () => {
      const room = makeRoomWithEliminated();
      room.pendingRedemption = { playerId: 'p2', playerName: 'P2' };
      room.players.find((p) => p.id === 'p2')._redemptionConsumed = true; // not eligible
      await saveRoom(room);

      await beginRedemption(makeIo(), room, {});

      expect(room.phase).toBe('playing');
      expect(room.redemption ?? null).toBeNull();
      expect(redemptionTimers.has(room.code)).toBe(false);
    });
  });

  describe('resolveRedemption', () => {
    async function open(room) {
      room.pendingRedemption = { playerId: 'p2', playerName: 'P2' };
      await saveRoom(room);
      await beginRedemption(makeIo(), room, {});
    }

    it('SURVIVE: rejoins the player with a fresh chamber + 3 cards, back in turn order', async () => {
      const room = makeRoomWithEliminated();
      await open(room);
      const p2 = room.players.find((p) => p.id === 'p2');
      p2.chamber = [...EMPTY_CHAMBER]; // no bullet → guaranteed survival

      await resolveRedemption(makeIo(), room.code, room, {});

      expect(p2.status).toBe('alive');
      expect(p2.isSpectator).toBe(false);
      expect(room.turnOrder).toContain('p2');
      expect(room.hands.get('p2')).toHaveLength(3);
      expect(room.phase).toBe('playing');
      expect(room.redemption ?? null).toBeNull();
      expect(redemptionTimers.has(room.code)).toBe(false);
      expect(p2._redemptionConsumed).toBe(true);

      expect(room.lastAction.type).toBe('spin_result');
      expect(room.lastAction.redemption).toBe(true);
      expect(room.lastAction.eliminated).toBe(false);
    });

    it('BULLET: keeps the player out', async () => {
      const room = makeRoomWithEliminated();
      await open(room);
      const p2 = room.players.find((p) => p.id === 'p2');
      p2.chamber = [...LOADED_CHAMBER]; // all bullets → guaranteed elimination

      await resolveRedemption(makeIo(), room.code, room, {});

      expect(p2.status).toBe('eliminated');
      expect(room.turnOrder).not.toContain('p2');
      expect(room.phase).toBe('playing');
      expect(p2._redemptionConsumed).toBe(true);
      expect(room.lastAction.type).toBe('spin_result');
      expect(room.lastAction.redemption).toBe(true);
      expect(room.lastAction.eliminated).toBe(true);
    });

    it('is one-shot — the player is no longer eligible after resolving', async () => {
      const room = makeRoomWithEliminated();
      await open(room);
      room.players.find((p) => p.id === 'p2').chamber = [...LOADED_CHAMBER];
      await resolveRedemption(makeIo(), room.code, room, {});
      expect(_redemptionEligible(room, 'p2')).toBe(false);
    });
  });

  describe('safety timeout', () => {
    it('auto-runs the redemption spin server-side if the player never takes it', async () => {
      const room = makeRoomWithEliminated();
      room.pendingRedemption = { playerId: 'p2', playerName: 'P2' };
      await saveRoom(room);
      await beginRedemption(makeIo(), room, {});
      // Force a deterministic outcome for the auto-spin.
      room.players.find((p) => p.id === 'p2').chamber = [...EMPTY_CHAMBER];

      expect(room.phase).toBe('redemption_pending');
      await vi.advanceTimersByTimeAsync(engine.REDEMPTION_PENDING_TIMEOUT_MS);

      expect(room.phase).toBe('playing');
      expect(room.redemption ?? null).toBeNull();
      expect(room.lastAction.type).toBe('spin_result');
      expect(room.lastAction.redemption).toBe(true);
    });
  });
});
