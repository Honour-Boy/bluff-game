import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'fake-jwt'; } },
}));

import { createPlayer, createRoom, MODES } from '../gameEngine.js';
import { registerSocketHandlers, rooms } from '../socketHandlers.js';

function makeFakeSocket({
  id = 'host-socket',
  userId = '11111111-1111-1111-1111-111111111111',
  username = 'HostUser',
} = {}) {
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
  const emitters = new Map();
  return {
    emitters,
    to: (channel) => {
      if (!emitters.has(channel)) emitters.set(channel, vi.fn());
      return { emit: emitters.get(channel) };
    },
    in: () => ({ fetchSockets: async () => [] }),
  };
}

function makeOnlineLobbyRoom({ code = 'ROOM75', hostSocketId = 'host-socket', hostUserId = '11111111-1111-1111-1111-111111111111' } = {}) {
  const room = createRoom(hostSocketId, MODES.ONLINE, {
    version: 1,
    systems: { betting: true },
  });
  room.code = code;
  room.hostUserId = hostUserId;
  room.players.push(createPlayer(hostUserId, 'HostUser', hostSocketId));
  room.players.push(createPlayer('22222222-2222-2222-2222-222222222222', 'GuestTwo', 'sock-2'));
  return room;
}

beforeEach(() => {
  rooms.clear();
});

describe('start_game group settings persistence', () => {
  it('persists group-room settings after a successful start and broadcasts the update', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = makeOnlineLobbyRoom();
    room.groupId = 'group-75';
    rooms.set(room.code, room);

    const groupSettingsRepo = {
      DEFAULT_SETTINGS: { version: 1 },
      getGroupSettings: vi.fn(),
      upsertGroupSettings: vi.fn().mockResolvedValue({
        updatedAt: '2026-05-15T20:30:00.000Z',
      }),
    };
    const leaderboardRepo = {
      recordGameStart: vi.fn().mockResolvedValue({ participantCount: 2 }),
      recordWinner: vi.fn(),
      getLeaderboard: vi.fn(),
    };

    registerSocketHandlers(io, socket, { groupSettingsRepo, leaderboardRepo });
    const startGame = socket.handlers.get('start_game');
    const cb = vi.fn();

    await startGame({ roomCode: room.code }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: true,
      mirrorMatchAutoDisabled: false,
      rouletteRotationAutoDisabled: false,
    });
    expect(groupSettingsRepo.upsertGroupSettings).toHaveBeenCalledWith(
      'group-75',
      expect.objectContaining({
        version: 1,
        systems: expect.objectContaining({ betting: true }),
      }),
      socket.userId,
    );
    expect(room.groupSettingsMeta).toEqual({
      updatedAt: '2026-05-15T20:30:00.000Z',
      updatedByUserId: socket.userId,
      updatedByUsername: socket.username,
    });
    expect(io.emitters.get('group:group-75')).toHaveBeenCalledWith('group_settings_updated', {
      groupId: 'group-75',
      updatedAt: '2026-05-15T20:30:00.000Z',
    });
  });

  it('does not persist anything for ad-hoc rooms', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = makeOnlineLobbyRoom({ code: 'ADHOC1' });
    rooms.set(room.code, room);

    const groupSettingsRepo = {
      DEFAULT_SETTINGS: { version: 1 },
      getGroupSettings: vi.fn(),
      upsertGroupSettings: vi.fn(),
    };
    const leaderboardRepo = {
      recordGameStart: vi.fn(),
      recordWinner: vi.fn(),
      getLeaderboard: vi.fn(),
    };

    registerSocketHandlers(io, socket, { groupSettingsRepo, leaderboardRepo });
    const startGame = socket.handlers.get('start_game');
    const cb = vi.fn();

    await startGame({ roomCode: room.code }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: true,
      mirrorMatchAutoDisabled: false,
      rouletteRotationAutoDisabled: false,
    });
    expect(groupSettingsRepo.upsertGroupSettings).not.toHaveBeenCalled();
  });

  it('still starts the game when the settings upsert fails', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = makeOnlineLobbyRoom({ code: 'ERR751' });
    room.groupId = 'group-err';
    rooms.set(room.code, room);

    const groupSettingsRepo = {
      DEFAULT_SETTINGS: { version: 1 },
      getGroupSettings: vi.fn(),
      upsertGroupSettings: vi.fn().mockRejectedValue(new Error('db down')),
    };
    const leaderboardRepo = {
      recordGameStart: vi.fn().mockResolvedValue({ participantCount: 2 }),
      recordWinner: vi.fn(),
      getLeaderboard: vi.fn(),
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerSocketHandlers(io, socket, { groupSettingsRepo, leaderboardRepo });
    const startGame = socket.handlers.get('start_game');
    const cb = vi.fn();

    await startGame({ roomCode: room.code }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: true,
      mirrorMatchAutoDisabled: false,
      rouletteRotationAutoDisabled: false,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
