// ============================================================
// #244 - Host "Kick Player" control.
//
// The host can remove a disruptive player mid-session. The kick is host-only,
// boots the target's socket back to landing with a `kicked` event, removes them
// from the room (lobby/game_over → spliced; mid-game → eliminated out of the
// turn order, mirroring a disconnect), and re-broadcasts the roster to everyone.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  MODES,
} = require('../gameEngine.js');
const roomHandler = require('../handlers/room.js');
const { rooms, saveRoom } = require('../lib/state.js');

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
};
const deps = { groupsRepo: {}, groupSettingsRepo: {}, leaderboardRepo };

// Ordered emit log across io.to(...).emit and per-socket s.emit.
function makeIo(socketIds = []) {
  const log = [];
  const sockets = socketIds.map((id) => ({ id, data: {}, emit: (event, payload) => log.push({ to: id, event, payload }) }));
  return {
    log,
    socketsLeftFrom: [],
    to: (id) => ({ emit: (event, payload) => log.push({ to: id, event, payload }) }),
    in(id) {
      const io = this;
      return {
        fetchSockets: async () => sockets,
        socketsLeave: (code) => io.socketsLeftFrom.push({ id, code }),
      };
    },
  };
}

// Register the room handlers against a fake host socket; return the captured map.
function captureHandlers(io, { userId = 'host', username = 'Host' } = {}) {
  const handlers = {};
  const socket = { id: 'sock-host', userId, username, data: {}, on: (evt, cb) => { handlers[evt] = cb; }, leave: () => {} };
  roomHandler.register(io, socket, deps);
  return handlers;
}

function makeRoom({ phase = 'lobby' } = {}) {
  const room = createRoom('sock-host', MODES.ONLINE, defaultRoomConfig());
  room.code = 'KICK01';
  room.hostUserId = 'host';
  room.hostSocketId = 'sock-host';
  const host = createPlayer('host', 'Host', 'sock-host');
  const a = createPlayer('pa', 'Alice', 'sock-a');
  const b = createPlayer('pb', 'Bob', 'sock-b');
  room.players.push(host, a, b);
  room.turnOrder = ['host', 'pa', 'pb'];
  room.currentTurnIndex = 0;
  room.phase = phase;
  room.hands = new Map(room.players.map((p) => [p.id, []]));
  room.deck = [];
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  return room;
}

beforeEach(() => { rooms.clear(); });
afterEach(() => { vi.clearAllMocks(); });

describe('#244 - kick_player', () => {
  it('host removes a lobby player and boots their socket to landing', async () => {
    const io = makeIo(['sock-host', 'sock-a', 'sock-b']);
    const room = makeRoom({ phase: 'lobby' });
    await saveRoom(room);

    const handlers = captureHandlers(io);
    const cb = vi.fn();
    await handlers['kick_player']({ roomCode: 'KICK01', playerId: 'pa' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: true });
    // Removed from the roster entirely (lobby splice).
    expect(room.players.some((p) => p.id === 'pa')).toBe(false);
    expect(room.turnOrder).not.toContain('pa');
    // The kicked socket got a boot event...
    const kicked = io.log.find((e) => e.event === 'kicked');
    expect(kicked).toBeTruthy();
    expect(kicked.to).toBe('sock-a');
    // ...and was detached from the room.
    expect(io.socketsLeftFrom).toContainEqual({ id: 'sock-a', code: 'KICK01' });
  });

  it('mid-game kick eliminates the target out of the turn order (disconnect-style)', async () => {
    const io = makeIo(['sock-host', 'sock-a', 'sock-b']);
    const room = makeRoom({ phase: 'playing' });
    await saveRoom(room);

    const handlers = captureHandlers(io);
    await handlers['kick_player']({ roomCode: 'KICK01', playerId: 'pb' }, vi.fn());

    const bob = room.players.find((p) => p.id === 'pb');
    expect(bob.status).toBe('eliminated');
    expect(bob.isSpectator).toBe(true);
    expect(room.turnOrder).not.toContain('pb');
    expect(room.lastAction).toMatchObject({ type: 'kicked', playerId: 'pb' });
  });

  it('rejects a non-host caller', async () => {
    const io = makeIo(['sock-host', 'sock-a', 'sock-b']);
    const room = makeRoom({ phase: 'lobby' });
    await saveRoom(room);

    // Register with a NON-host identity.
    const handlers = captureHandlers(io, { userId: 'pa', username: 'Alice' });
    const cb = vi.fn();
    await handlers['kick_player']({ roomCode: 'KICK01', playerId: 'pb' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Only the host can kick players' });
    expect(room.players.some((p) => p.id === 'pb')).toBe(true); // untouched
    expect(io.log.some((e) => e.event === 'kicked')).toBe(false);
  });

  it('refuses to kick the host themselves', async () => {
    const io = makeIo(['sock-host', 'sock-a', 'sock-b']);
    const room = makeRoom({ phase: 'lobby' });
    await saveRoom(room);

    const handlers = captureHandlers(io);
    const cb = vi.fn();
    await handlers['kick_player']({ roomCode: 'KICK01', playerId: 'host' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'The host cannot kick themselves' });
    expect(room.players.some((p) => p.id === 'host')).toBe(true);
  });

  it('rejects an unknown player id', async () => {
    const io = makeIo(['sock-host', 'sock-a', 'sock-b']);
    const room = makeRoom({ phase: 'lobby' });
    await saveRoom(room);

    const handlers = captureHandlers(io);
    const cb = vi.fn();
    await handlers['kick_player']({ roomCode: 'KICK01', playerId: 'ghost' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Player not in room' });
  });
});
