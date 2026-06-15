// ============================================================
// Tests — single-device session registry (lib/sessions.js)
//
// Pure logic, no socket transport: a fake `io` exposes
// `sockets.sockets` (a Map of live socketId → socket) and a fake
// `rooms` Map carries seated players. Covers the resolveLogin verdict
// matrix, the seated checks, and the socketId-matched clearSession.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidDeviceId,
  deviceIdFor,
  getSession,
  isSeated,
  seatedElsewhere,
  resolveLogin,
  registerSession,
  clearSession,
  _reset,
} from '../lib/sessions.js';

const DEV_A = '11111111-1111-4111-8111-111111111111';
const DEV_B = '22222222-2222-4222-8222-222222222222';

// Fake io: only `sockets.sockets.get(id)` is exercised.
function makeIo(liveSocketIds = []) {
  const map = new Map(liveSocketIds.map((id) => [id, { id, emit() {}, disconnect() {} }]));
  return { sockets: { sockets: map } };
}

function roomsSeating(userId, socketId, code = 'ROOM01') {
  return new Map([[code, { players: [{ id: userId, socketId }] }]]);
}

beforeEach(() => _reset());

describe('deviceId helpers', () => {
  it('validates UUID-shaped device ids only', () => {
    expect(isValidDeviceId(DEV_A)).toBe(true);
    expect(isValidDeviceId('not-a-uuid')).toBe(false);
    expect(isValidDeviceId('')).toBe(false);
    expect(isValidDeviceId(undefined)).toBe(false);
  });

  it('falls back to a unique per-connection id when deviceId is missing/invalid', () => {
    expect(deviceIdFor(DEV_A, 'sock1')).toBe(DEV_A);
    expect(deviceIdFor(undefined, 'sock1')).toBe('conn:sock1');
    expect(deviceIdFor('garbage', 'sock2')).toBe('conn:sock2');
  });
});

describe('resolveLogin — verdict matrix', () => {
  it('no prior session → clean proceed', () => {
    const io = makeIo(['new']);
    const v = resolveLogin(io, new Map(), { userId: 'u1', deviceId: DEV_A, socketId: 'new' });
    expect(v).toEqual({ ok: true, evicted: null });
  });

  it('idle on a different device → last-login-wins (evict old)', () => {
    registerSession('u1', { socketId: 'old', deviceId: DEV_A, username: 'U' });
    const io = makeIo(['old', 'new']); // both live, u1 not seated anywhere
    const v = resolveLogin(io, new Map(), { userId: 'u1', deviceId: DEV_B, socketId: 'new' });
    expect(v).toEqual({ ok: true, evicted: 'old' });
  });

  it('seated on a different LIVE device → refused', () => {
    registerSession('u1', { socketId: 'old', deviceId: DEV_A, username: 'U' });
    const io = makeIo(['old', 'new']);
    const rooms = roomsSeating('u1', 'old');
    const v = resolveLogin(io, rooms, { userId: 'u1', deviceId: DEV_B, socketId: 'new' });
    expect(v).toEqual({ ok: false, reason: 'account_in_room' });
  });

  it('seated but SAME device → allowed (replace, evict old)', () => {
    registerSession('u1', { socketId: 'old', deviceId: DEV_A, username: 'U' });
    const io = makeIo(['old', 'new']);
    const rooms = roomsSeating('u1', 'old');
    const v = resolveLogin(io, rooms, { userId: 'u1', deviceId: DEV_A, socketId: 'new' });
    expect(v).toEqual({ ok: true, evicted: 'old' });
  });

  it('old socket already dead → allowed and the stale entry is cleaned', () => {
    registerSession('u1', { socketId: 'old', deviceId: DEV_A, username: 'U' });
    const io = makeIo(['new']); // 'old' is gone
    const rooms = roomsSeating('u1', 'old'); // even if "seated", the corpse doesn't lock
    const v = resolveLogin(io, rooms, { userId: 'u1', deviceId: DEV_B, socketId: 'new' });
    expect(v).toEqual({ ok: true, evicted: null });
    expect(getSession('u1')).toBeNull();
  });
});

describe('clearSession — socketId-matched (eviction-safe)', () => {
  it('clears when the socket matches', () => {
    registerSession('u1', { socketId: 'sock', deviceId: DEV_A, username: 'U' });
    clearSession('u1', 'sock');
    expect(getSession('u1')).toBeNull();
  });

  it('a late disconnect from an evicted socket does NOT wipe the new session', () => {
    // New device took over; registry points at 'new'.
    registerSession('u1', { socketId: 'new', deviceId: DEV_B, username: 'U' });
    // The evicted 'old' socket's disconnect fires afterwards.
    clearSession('u1', 'old');
    expect(getSession('u1')).toEqual(expect.objectContaining({ socketId: 'new' }));
  });

  it('no-op for unauthenticated / guest sockets (never registered)', () => {
    expect(() => clearSession(undefined, 'sock')).not.toThrow();
    expect(() => clearSession('guest:abc', 'sock')).not.toThrow();
  });
});

describe('isSeated / seatedElsewhere', () => {
  it('isSeated finds a player in any room, ignores others', () => {
    const rooms = roomsSeating('u1', 'sock');
    expect(isSeated(rooms, 'u1')).toBe(true);
    expect(isSeated(rooms, 'u2')).toBe(false);
  });

  it('seatedElsewhere: true only for a DIFFERENT live socket', () => {
    const rooms = roomsSeating('u1', 'liveOld', 'OTHER1');
    const io = makeIo(['liveOld', 'me']);
    expect(seatedElsewhere(io, rooms, 'u1', 'me')).toBe(true);
    // Same socket = a rejoin, not a second seat.
    expect(seatedElsewhere(io, rooms, 'u1', 'liveOld')).toBe(false);
  });

  it('seatedElsewhere: dead old socket does not count', () => {
    const rooms = roomsSeating('u1', 'deadOld', 'OTHER1');
    const io = makeIo(['me']); // 'deadOld' not live
    expect(seatedElsewhere(io, rooms, 'u1', 'me')).toBe(false);
  });

  it('seatedElsewhere: exceptCode skips the room being rejoined', () => {
    const rooms = roomsSeating('u1', 'liveOld', 'ROOMX');
    const io = makeIo(['liveOld', 'me']);
    // Rejoining ROOMX: their own live-but-stale seat there must not block them.
    expect(seatedElsewhere(io, rooms, 'u1', 'me', 'ROOMX')).toBe(false);
    // But a seat in some other room still does.
    expect(seatedElsewhere(io, rooms, 'u1', 'me', 'ROOMY')).toBe(true);
  });
});
