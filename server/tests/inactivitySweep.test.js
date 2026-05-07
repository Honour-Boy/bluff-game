// ============================================================
// Tests for the inactivity sweep that GCs abandoned rooms.
//
// We don't drive the real interval (45-minute threshold + 60s
// poll). Instead we exercise the predicate directly: stamp
// `room.lastActivityAt` to a value comfortably past the
// threshold, run the sweep manually via the same loop body, and
// assert that the room is removed from `rooms` and `game_ended`
// is emitted.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'fake-jwt'; } },
}));

import {
  rooms,
  startInactivitySweep,
  stopInactivitySweep,
  INACTIVITY_THRESHOLD_MS,
} from '../socketHandlers.js';
import { createRoom, MODES } from '../gameEngine.js';

function makeFakeIo() {
  // emit-spy per room code so we can assert the right room got the
  // game_ended fan-out.
  const emitsByCode = new Map();
  return {
    emitsByCode,
    to: (code) => ({
      emit: (...args) => {
        if (!emitsByCode.has(code)) emitsByCode.set(code, []);
        emitsByCode.get(code).push(args);
      },
    }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

beforeEach(() => {
  rooms.clear();
  stopInactivitySweep();
});

describe('inactivity sweep', () => {
  it('evicts a room whose lastActivityAt is past the threshold', async () => {
    vi.useFakeTimers();

    const io = makeFakeIo();
    const room = createRoom('host-sock', MODES.PHYSICAL);
    // Stamp an activity time well past the threshold so the very
    // first sweep tick catches it.
    room.lastActivityAt = Date.now() - INACTIVITY_THRESHOLD_MS - 1000;
    rooms.set(room.code, room);

    startInactivitySweep(io);
    // First tick fires after 60s — advance to it.
    await vi.advanceTimersByTimeAsync(60_000 + 100);

    expect(rooms.has(room.code)).toBe(false);
    const emits = io.emitsByCode.get(room.code) || [];
    const ended = emits.find(([event]) => event === 'game_ended');
    expect(ended).toBeDefined();
    expect(ended[1].reason).toMatch(/inactivity/i);

    vi.useRealTimers();
  });

  it('leaves a fresh room alone', async () => {
    vi.useFakeTimers();

    const io = makeFakeIo();
    const room = createRoom('host-sock', MODES.PHYSICAL);
    // lastActivityAt is freshly stamped at createRoom-time.
    rooms.set(room.code, room);

    startInactivitySweep(io);
    await vi.advanceTimersByTimeAsync(60_000 + 100);

    expect(rooms.has(room.code)).toBe(true);
    expect(io.emitsByCode.get(room.code)).toBeUndefined();

    vi.useRealTimers();
  });

  it('startInactivitySweep is idempotent', () => {
    // We can't directly assert "only one interval scheduled" without
    // peeking at the module — but we CAN assert subsequent calls
    // don't throw and the predicate still passes the smoke test
    // above. The internal short-circuit (`if (handle) return`) is
    // exercised here.
    const io = makeFakeIo();
    expect(() => {
      startInactivitySweep(io);
      startInactivitySweep(io);
      startInactivitySweep(io);
    }).not.toThrow();
  });
});
