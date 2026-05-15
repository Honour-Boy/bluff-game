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

function makeOnlineLobbyRoom({
  code = 'ROOM76',
  hostSocketId = 'host-socket',
  hostUserId = '11111111-1111-1111-1111-111111111111',
} = {}) {
  const room = createRoom(hostSocketId, MODES.ONLINE, { version: 1 });
  room.code = code;
  room.hostUserId = hostUserId;
  room.players.push(createPlayer(hostUserId, 'HostUser', hostSocketId));
  room.players.push(createPlayer('22222222-2222-2222-2222-222222222222', 'GuestTwo', 'sock-2'));
  return room;
}

beforeEach(() => {
  rooms.clear();
});

describe('group leaderboard integration', () => {
  it('records participants on start and winner on game over in a group room', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = makeOnlineLobbyRoom();
    room.groupId = 'group-76';
    rooms.set(room.code, room);

    const leaderboardRepo = {
      recordGameStart: vi.fn().mockResolvedValue({ participantCount: 2 }),
      recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
      getLeaderboard: vi.fn(),
    };
    const groupSettingsRepo = {
      DEFAULT_SETTINGS: { version: 1 },
      getGroupSettings: vi.fn(),
      upsertGroupSettings: vi.fn().mockResolvedValue({ updatedAt: '2026-05-15T22:00:00.000Z' }),
    };

    registerSocketHandlers(io, socket, { leaderboardRepo, groupSettingsRepo });
    const startGame = socket.handlers.get('start_game');
    const endTurn = socket.handlers.get('end_turn');

    await startGame({ roomCode: room.code }, vi.fn());

    expect(leaderboardRepo.recordGameStart).toHaveBeenCalledWith(
      'group-76',
      expect.arrayContaining(room.turnOrder),
      expect.any(String),
    );

    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    room.hands.set(currentPlayerId, []);
    room.cardPlayedThisTurn = true;

    const endTurnCb = vi.fn();
    await endTurn({ roomCode: room.code, playerId: currentPlayerId }, endTurnCb);

    expect(endTurnCb).toHaveBeenCalledWith({ success: true, gameOver: true });
    expect(leaderboardRepo.recordWinner).toHaveBeenCalledWith(
      'group-76',
      currentPlayerId,
      expect.any(String),
    );
    expect(io.emitters.get('group:group-76')).toHaveBeenCalledWith('group_leaderboard_updated', {
      groupId: 'group-76',
      winnerUserId: currentPlayerId,
      newWins: 1,
    });
  });

  it('skips leaderboard writes for ad-hoc rooms', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const room = makeOnlineLobbyRoom({ code: 'ADHOC7' });
    rooms.set(room.code, room);

    const leaderboardRepo = {
      recordGameStart: vi.fn(),
      recordWinner: vi.fn(),
      getLeaderboard: vi.fn(),
    };
    const groupSettingsRepo = {
      DEFAULT_SETTINGS: { version: 1 },
      getGroupSettings: vi.fn(),
      upsertGroupSettings: vi.fn(),
    };

    registerSocketHandlers(io, socket, { leaderboardRepo, groupSettingsRepo });
    const startGame = socket.handlers.get('start_game');

    await startGame({ roomCode: room.code }, vi.fn());

    expect(leaderboardRepo.recordGameStart).not.toHaveBeenCalled();
    expect(leaderboardRepo.recordWinner).not.toHaveBeenCalled();
  });

  it('returns a leaderboard to members and blocks non-members', async () => {
    const io = makeFakeIo();
    const socket = makeFakeSocket();
    const leaderboardRepo = {
      recordGameStart: vi.fn(),
      recordWinner: vi.fn(),
      getLeaderboard: vi.fn().mockResolvedValue([
        {
          userId: '11111111-1111-1111-1111-111111111111',
          username: 'HostUser',
          wins: 3,
          gamesPlayed: 5,
          lastWinAt: '2026-05-15T22:00:00.000Z',
          lastPlayedAt: '2026-05-15T22:00:00.000Z',
        },
      ]),
    };
    const groupsRepo = {
      getActiveGroupById: vi.fn().mockResolvedValue({ id: 'group-76' }),
      isGroupMember: vi.fn().mockResolvedValue(true),
    };

    registerSocketHandlers(io, socket, { leaderboardRepo, groupsRepo });
    const getGroupLeaderboard = socket.handlers.get('get_group_leaderboard');
    const cb = vi.fn();

    await getGroupLeaderboard({ groupId: 'group-76' }, cb);

    expect(cb).toHaveBeenCalledWith({
      success: true,
      leaderboard: [
        {
          userId: '11111111-1111-1111-1111-111111111111',
          username: 'HostUser',
          wins: 3,
          gamesPlayed: 5,
          lastWinAt: '2026-05-15T22:00:00.000Z',
          lastPlayedAt: '2026-05-15T22:00:00.000Z',
        },
      ],
    });

    groupsRepo.isGroupMember.mockResolvedValue(false);
    const deniedCb = vi.fn();
    await getGroupLeaderboard({ groupId: 'group-76' }, deniedCb);
    expect(deniedCb).toHaveBeenCalledWith({
      success: false,
      error: 'not_a_group_member',
    });
  });
});
