import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'fake-jwt'; } },
}));

import { registerSocketHandlers, rooms } from '../socketHandlers.js';
import { createRoom, MODES } from '../gameEngine.js';

function makeFakeSocket({ id = 'sock-1', userId = '11111111-1111-1111-1111-111111111111', username = 'Alice' } = {}) {
  const handlers = new Map();
  return {
    id,
    userId,
    username,
    isGuest: false,
    data: {},
    handlers,
    on: (event, fn) => handlers.set(event, fn),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };
}

function makeFakeIo() {
  return {
    to: () => ({ emit: vi.fn() }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

beforeEach(() => {
  rooms.clear();
});

describe('join_room group gating', () => {
  it('keeps non-group room joins unchanged', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = createRoom('host-socket', MODES.ONLINE);
    room.code = 'ABC234';
    room.hostUserId = 'host-user';
    rooms.set(room.code, room);

    const groupsRepo = {
      getActiveGroupByCode: vi.fn().mockResolvedValue(null),
    };

    registerSocketHandlers(io, socket, { groupsRepo });
    const joinRoom = socket.handlers.get('join_room');
    const cb = vi.fn();

    await joinRoom({ roomCode: 'ABC234' }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: true,
      playerId: socket.userId,
      roomCode: 'ABC234',
      mode: 'online',
      isHost: false,
    });
  });

  it('auto-creates a persistent group room and allows members in', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket({
      userId: '22222222-2222-2222-2222-222222222222',
      username: 'Bob',
    });
    const groupsRepo = {
      getActiveGroupByCode: vi.fn().mockResolvedValue({
        id: 'group-1',
        code: 'GRP234',
        host_user_id: '33333333-3333-3333-3333-333333333333',
      }),
      isGroupMember: vi.fn().mockResolvedValue(true),
    };

    registerSocketHandlers(io, socket, { groupsRepo });
    const joinRoom = socket.handlers.get('join_room');
    const cb = vi.fn();

    await joinRoom({ roomCode: 'GRP234' }, cb);

    const room = rooms.get('GRP234');
    expect(room).toBeTruthy();
    expect(room.groupId).toBe('group-1');
    expect(room.hostUserId).toBe('33333333-3333-3333-3333-333333333333');
    expect(cb).toHaveBeenCalledWith({
      success: true,
      playerId: socket.userId,
      roomCode: 'GRP234',
      mode: 'online',
      isHost: false,
    });
  });

  it('returns host privileges when the group host joins through join_room', async () => {
    const io = makeFakeIo();
    const hostId = '44444444-4444-4444-4444-444444444444';
    const socket = makeFakeSocket({
      userId: hostId,
      username: 'Hosty',
    });
    const groupsRepo = {
      getActiveGroupByCode: vi.fn().mockResolvedValue({
        id: 'group-2',
        code: 'HOST22',
        host_user_id: hostId,
      }),
      isGroupMember: vi.fn().mockResolvedValue(true),
    };

    registerSocketHandlers(io, socket, { groupsRepo });
    const joinRoom = socket.handlers.get('join_room');
    const cb = vi.fn();

    await joinRoom({ roomCode: 'HOST22' }, cb);

    const room = rooms.get('HOST22');
    expect(room.hostSocketId).toBe(socket.id);
    expect(cb).toHaveBeenCalledWith({
      success: true,
      playerId: hostId,
      roomCode: 'HOST22',
      mode: 'online',
      isHost: true,
    });
  });

  it('rejects non-members from group codes with the documented error', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const groupsRepo = {
      getActiveGroupByCode: vi.fn().mockResolvedValue({
        id: 'group-3',
        code: 'LOCK33',
        host_user_id: '55555555-5555-5555-5555-555555555555',
      }),
      isGroupMember: vi.fn().mockResolvedValue(false),
    };

    registerSocketHandlers(io, socket, { groupsRepo });
    const joinRoom = socket.handlers.get('join_room');
    const cb = vi.fn();

    await joinRoom({ roomCode: 'LOCK33' }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: false,
      error: 'not_a_group_member',
    });
  });
});
