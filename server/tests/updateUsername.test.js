// ============================================================
// Tests for the update_username socket handler.
//
// The handler does three things: (1) auth/guest gate, (2) refresh
// socket.username from a Supabase profile lookup, (3) push the
// new name into every room.players entry that matches the user
// and re-broadcast.
//
// Step (2) depends on Supabase, which we don't try to mock for
// CJS-required modules — vitest 4 hoisting interacts badly with
// the live createClient call in socketHandlers.js. Instead the
// room-mutation logic is extracted into the pure helper
// `applyUsernameToRooms`, which IS testable in isolation here.
// The auth gates of the handler (no socket.userId / isGuest)
// short-circuit before the Supabase call so we exercise those
// directly via the same fake-socket harness used elsewhere.
// ============================================================

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'fake-jwt'; } },
}));

import {
  registerSocketHandlers,
  applyUsernameToRooms,
} from '../socketHandlers.js';
import { createRoom, createPlayer, MODES } from '../gameEngine.js';

// ─── applyUsernameToRooms — pure helper ──────────────────────

describe('applyUsernameToRooms', () => {
  it('returns empty when the user is in no rooms', () => {
    const rooms = new Map();
    rooms.set('AAA111', createRoom('host', MODES.PHYSICAL));

    expect(applyUsernameToRooms(rooms, 'user-1', 'NewName')).toEqual([]);
  });

  it('updates a single room and reports its code', () => {
    const rooms = new Map();
    const room = createRoom('host', MODES.PHYSICAL);
    room.players.push(createPlayer('user-1', 'OldName', 'sock'));
    rooms.set(room.code, room);

    const affected = applyUsernameToRooms(rooms, 'user-1', 'NewName');

    expect(affected).toEqual([room.code]);
    expect(room.players[0].username).toBe('NewName');
  });

  it('updates the user across multiple rooms in one pass', () => {
    const rooms = new Map();
    const a = createRoom('hostA', MODES.PHYSICAL);
    a.players.push(createPlayer('user-1', 'OldName', 'sockA'));
    rooms.set(a.code, a);

    const b = createRoom('hostB', MODES.ONLINE);
    b.players.push(createPlayer('user-1', 'OldName', 'sockB'));
    b.players.push(createPlayer('user-2', 'Bystander', 'sockOther'));
    rooms.set(b.code, b);

    const affected = applyUsernameToRooms(rooms, 'user-1', 'NewName');

    expect(new Set(affected)).toEqual(new Set([a.code, b.code]));
    expect(a.players[0].username).toBe('NewName');
    expect(b.players[0].username).toBe('NewName');
    // Other players are untouched.
    expect(b.players[1].username).toBe('Bystander');
  });

  it('skips rooms where the player already matches the new name', () => {
    const rooms = new Map();
    const a = createRoom('hostA', MODES.PHYSICAL);
    a.players.push(createPlayer('user-1', 'SameName', 'sockA'));
    rooms.set(a.code, a);

    const b = createRoom('hostB', MODES.PHYSICAL);
    b.players.push(createPlayer('user-1', 'OldName', 'sockB'));
    rooms.set(b.code, b);

    const affected = applyUsernameToRooms(rooms, 'user-1', 'SameName');

    // Only the room with the stale name reports as changed.
    expect(affected).toEqual([b.code]);
    expect(a.players[0].username).toBe('SameName');
    expect(b.players[0].username).toBe('SameName');
  });

  it('does not modify rooms the user is not a member of', () => {
    const rooms = new Map();
    const a = createRoom('hostA', MODES.PHYSICAL);
    a.players.push(createPlayer('user-2', 'Stranger', 'sockA'));
    rooms.set(a.code, a);

    const affected = applyUsernameToRooms(rooms, 'user-1', 'NewName');

    expect(affected).toEqual([]);
    expect(a.players[0].username).toBe('Stranger');
  });
});

// ─── update_username handler — auth gates only ───────────────

function setup({ userId, username = 'OldName', isGuest = false } = {}) {
  const handlers = new Map();
  const socket = {
    id: 'sock-test',
    userId,
    username,
    isGuest,
    on: (event, fn) => handlers.set(event, fn),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };
  const io = {
    to: () => ({ emit: vi.fn() }),
    in: () => ({ fetchSockets: async () => [] }),
  };
  registerSocketHandlers(io, socket);
  return { socket, updateUsername: handlers.get('update_username') };
}

describe('update_username handler — auth gates', () => {
  it('rejects when socket.userId is unset', async () => {
    const { updateUsername } = setup({ userId: undefined });
    const cb = vi.fn();
    await updateUsername({}, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
  });

  it('rejects guest users (must rename via fresh signInAsGuest)', async () => {
    const { updateUsername } = setup({ userId: 'guest:abc', isGuest: true });
    const cb = vi.fn();
    await updateUsername({}, cb);
    expect(cb).toHaveBeenCalledWith({
      success: false,
      error: 'Guests cannot rename mid-session',
    });
  });
});
