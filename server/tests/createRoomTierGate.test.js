// ============================================================
// Phase 2 (#292) - create_room gates the config on the host's tier.
//
// The host's level (from leaderboardRepo) maps to a tier; the requested
// config is run through applyTierCapsToConfig before the room is built, and
// room.tier is stamped. Guests are always Streets (no DB read). The ack
// carries { tier, capsApplied } so the client can show a notice.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const roomHandler = require('../handlers/room.js');
const { rooms, getRoom } = require('../lib/state.js');

function makeIo() {
  const log = [];
  return {
    log,
    to: (id) => ({ emit: (event, payload) => log.push({ to: id, event, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

function makeRepo(level) {
  return {
    recordWinner: vi.fn(),
    recordGameStart: vi.fn(),
    getLeaderboard: vi.fn(),
    getLevel: vi.fn().mockResolvedValue(level),
    getProgression: vi.fn().mockResolvedValue({ xp: 0, gamesPlayed: 0, equipped: {} }),
  };
}

// groupsRepo.getActiveGroupByCode is consulted by buildAdHocRoom for code
// collisions - always "no collision".
const groupsRepo = { getActiveGroupByCode: vi.fn().mockResolvedValue(null) };

function captureHandlers(io, { userId = 'host-uuid', username = 'Host', isGuest = false } = {}, repo) {
  const handlers = {};
  const socket = {
    id: 'sock-host', userId, username, isGuest, data: {},
    on: (evt, cb) => { handlers[evt] = cb; },
    join: () => {}, leave: () => {},
  };
  roomHandler.register(io, socket, { groupsRepo, groupSettingsRepo: {}, leaderboardRepo: repo });
  return handlers;
}

const POWERS_ON = {
  powerCards: { enabled: { shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true } },
  systems: { betting: true, lastStand: true },
  secretRoles: true,
};

beforeEach(() => { rooms.clear(); });
afterEach(() => { vi.clearAllMocks(); });

describe('create_room tier gate', () => {
  it('Streets host (level 1) has all powers + secret roles forced off', async () => {
    const io = makeIo();
    const repo = makeRepo(1);
    const handlers = captureHandlers(io, {}, repo);
    const cb = vi.fn();

    await handlers['create_room']({ mode: 'online', config: POWERS_ON }, cb);

    const ack = cb.mock.calls[0][0];
    expect(ack.success).toBe(true);
    expect(ack.tier).toBe('streets');
    expect(ack.capsApplied).toBe(true);

    const room = await getRoom(ack.roomCode);
    expect(room.tier).toBe('streets');
    expect(Object.values(room.config.powerCards.enabled).every(v => v === false)).toBe(true);
    expect(room.config.secretRoles).toBe(false);
    expect(room.config.systems.betting).toBe(false);
  });

  it('Syndicate host (level 9) keeps powers + betting and forces secretRoles on', async () => {
    const io = makeIo();
    const repo = makeRepo(9);
    const handlers = captureHandlers(io, {}, repo);
    const cb = vi.fn();

    await handlers['create_room']({ mode: 'online', config: POWERS_ON }, cb);

    const ack = cb.mock.calls[0][0];
    expect(ack.tier).toBe('syndicate');
    const room = await getRoom(ack.roomCode);
    expect(room.config.powerCards.enabled.shield).toBe(true);
    expect(room.config.systems.betting).toBe(true);
    expect(room.config.secretRoles).toBe(true);
  });

  it('Covenant host (level 14) arms the Blood Debt flag', async () => {
    const io = makeIo();
    const repo = makeRepo(14);
    const handlers = captureHandlers(io, {}, repo);
    const cb = vi.fn();

    await handlers['create_room']({ mode: 'online', config: POWERS_ON }, cb);

    const ack = cb.mock.calls[0][0];
    expect(ack.tier).toBe('covenant');
    const room = await getRoom(ack.roomCode);
    expect(room.bloodDebtActive).toBe(true);
    expect(room.pactActive).toBe(false);
  });

  it('guest host defaults to Streets without a DB read', async () => {
    const io = makeIo();
    const repo = makeRepo(20); // would be Covenant if consulted
    const handlers = captureHandlers(io, { userId: 'guest:abc', isGuest: true }, repo);
    const cb = vi.fn();

    await handlers['create_room']({ mode: 'online', config: POWERS_ON }, cb);

    const ack = cb.mock.calls[0][0];
    expect(ack.tier).toBe('streets');
    expect(repo.getLevel).not.toHaveBeenCalled();
  });
});
