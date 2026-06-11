// ============================================================
// #205 — Game-over XP award funnel + progression socket handlers
// ============================================================
// maybeAwardGameXp rides maybeRecordGroupWinner (every game_over path), so a
// finished online game persists XP per human and emits a private `xp_awarded`
// to each. Tutorial / physical / solo rooms and repos without the progression
// methods must all stay inert. The handlers validate cosmetics server-side.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  startGame,
  eliminateFromTurnOrder,
  XP_RULES,
  DEFAULT_COSMETICS,
  MODES,
  defaultRoomConfig,
} = require('../gameEngine.js');
const { maybeAwardGameXp, maybeRecordGroupWinner } = require('../lib/roomBuilders.js');
const progressionHandler = require('../handlers/progression.js');
const { rooms, saveRoom } = require('../lib/state.js');

// UUID-shaped ids so isPersistentUserId treats them as signed-in players.
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const GUEST = 'guest:abc';

function makeIo() {
  const log = [];
  return {
    log,
    to: (id) => ({ emit: (event, payload) => log.push({ to: id, event, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

function makeRepo(overrides = {}) {
  return {
    recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
    recordGameStart: vi.fn(),
    getProgression: vi.fn().mockResolvedValue({ xp: 0, gamesPlayed: 0, equipped: {} }),
    addXp: vi.fn().mockImplementation(async (userId, amount) => ({
      userId, xp: amount, gamesPlayed: 1, equipped: {},
    })),
    setEquippedCosmetics: vi.fn().mockImplementation(async (userId, equipped) => ({
      userId, xp: 0, gamesPlayed: 0, equipped,
    })),
    ...overrides,
  };
}

// A finished 2-player online game: U1 won, U2 (or a guest) died first.
function finishedRoom({ loserId = U2 } = {}) {
  const room = createRoom('sock-1', MODES.ONLINE, defaultRoomConfig());
  room.code = 'XP0001';
  room.players.push(createPlayer(U1, 'Winner', 'sock-1'));
  room.players.push(createPlayer(loserId, 'Loser', 'sock-2'));
  startGame(room);
  for (const p of room.players) p.gameStats.cardsPlayed = 1;
  const loser = room.players.find((p) => p.id === loserId);
  loser.status = 'eliminated';
  eliminateFromTurnOrder(room, loserId);
  room.phase = 'game_over';
  room.lastAction = { type: 'game_over', winnerId: U1, winnerName: 'Winner' };
  return room;
}

beforeEach(() => { rooms.clear(); });
afterEach(() => { vi.clearAllMocks(); });

describe('#205 — maybeAwardGameXp', () => {
  it('persists XP per signed-in human and emits a private xp_awarded to each', async () => {
    const io = makeIo();
    const repo = makeRepo();
    const room = finishedRoom();

    const awards = await maybeAwardGameXp(io, room, repo);

    expect(repo.addXp).toHaveBeenCalledTimes(2);
    const winnerAward = awards.find((a) => a.playerId === U1);
    const loserAward = awards.find((a) => a.playerId === U2);
    expect(winnerAward.breakdown.win).toBe(XP_RULES.win);
    expect(winnerAward.placement).toBe(1);
    expect(loserAward.breakdown.win).toBe(0);
    expect(loserAward.placement).toBe(2);

    const emitted = io.log.filter((e) => e.event === 'xp_awarded');
    expect(emitted.map((e) => e.to).sort()).toEqual(['sock-1', 'sock-2']);
    expect(emitted.every((e) => typeof e.payload.gained === 'number')).toBe(true);
    expect(room.xpAwarded).toBe(true);
  });

  it('awards only once per game (re-entry guarded)', async () => {
    const io = makeIo();
    const repo = makeRepo();
    const room = finishedRoom();
    await maybeAwardGameXp(io, room, repo);
    const second = await maybeAwardGameXp(io, room, repo);
    expect(second).toBeNull();
    expect(repo.addXp).toHaveBeenCalledTimes(2); // unchanged
  });

  it('rides maybeRecordGroupWinner so every game-over site awards XP', async () => {
    const io = makeIo();
    const repo = makeRepo();
    const room = finishedRoom(); // ad-hoc (no groupId) — winner recording no-ops
    await maybeRecordGroupWinner(io, room, repo);
    expect(repo.addXp).toHaveBeenCalledTimes(2);
    expect(repo.recordWinner).not.toHaveBeenCalled();
  });

  it('emits a non-persisted summary for guests (sign-in nudge)', async () => {
    const io = makeIo();
    const repo = makeRepo();
    const room = finishedRoom({ loserId: GUEST });

    await maybeAwardGameXp(io, room, repo);

    expect(repo.addXp).toHaveBeenCalledTimes(1); // only the signed-in winner
    const guestEvt = io.log.find((e) => e.event === 'xp_awarded' && e.to === 'sock-2');
    expect(guestEvt.payload.guest).toBe(true);
    expect(guestEvt.payload.totalXp).toBeNull();
  });

  it('flags newly-crossed unlock tiers on a level-up', async () => {
    const io = makeIo();
    // 90 existing XP: any gain ≥10 crosses into level 2 (felt_wine unlocks).
    const repo = makeRepo({
      addXp: vi.fn().mockImplementation(async (userId, amount) => ({
        userId, xp: 90 + amount, gamesPlayed: 2, equipped: {},
      })),
    });
    const room = finishedRoom();

    await maybeAwardGameXp(io, room, repo);

    const winnerEvt = io.log.find((e) => e.event === 'xp_awarded' && e.to === 'sock-1');
    expect(winnerEvt.payload.leveledUp).toBe(true);
    expect(winnerEvt.payload.unlocked.map((u) => u.id)).toContain('felt_wine');
  });

  it('stays inert for tutorial rooms, physical mode, solo tables, and legacy repos', async () => {
    const io = makeIo();
    const repo = makeRepo();

    const tutorial = finishedRoom();
    tutorial.isTutorial = true;
    expect(await maybeAwardGameXp(io, tutorial, repo)).toBeNull();

    const physical = finishedRoom();
    physical.mode = MODES.PHYSICAL;
    expect(await maybeAwardGameXp(io, physical, repo)).toBeNull();

    const solo = finishedRoom();
    solo.players = [solo.players[0]];
    expect(await maybeAwardGameXp(io, solo, repo)).toBeNull();

    const legacyRepo = { recordWinner: vi.fn(), recordGameStart: vi.fn() };
    expect(await maybeAwardGameXp(io, finishedRoom(), legacyRepo)).toBeNull();

    expect(repo.addXp).not.toHaveBeenCalled();
    expect(io.log.filter((e) => e.event === 'xp_awarded')).toHaveLength(0);
  });
});

describe('#205 — progression handlers', () => {
  function captureHandlers(io, socket, repo) {
    const handlers = {};
    socket.on = (evt, cb) => { handlers[evt] = cb; };
    progressionHandler.register(io, socket, { leaderboardRepo: repo });
    return handlers;
  }

  it('get_progression returns xp/level/catalog with validated equipped set', async () => {
    const repo = makeRepo({
      getProgression: vi.fn().mockResolvedValue({
        xp: 150, gamesPlayed: 3,
        equipped: { tableFelt: 'felt_wine', cardBack: 'back_kente' }, // kente needs L9
      }),
    });
    const handlers = captureHandlers(makeIo(), { id: 'sock-1', userId: U1, isGuest: false }, repo);

    const cb = vi.fn();
    await handlers['get_progression']({}, cb);

    const res = cb.mock.calls[0][0];
    expect(res.success).toBe(true);
    expect(res.progression.level).toBe(2);
    expect(res.progression.equipped.tableFelt).toBe('felt_wine');
    expect(res.progression.equipped.cardBack).toBe(DEFAULT_COSMETICS.cardBack); // locked → default
    expect(Array.isArray(res.progression.catalog)).toBe(true);
  });

  it('get_progression serves level-1 defaults to guests without touching the repo', async () => {
    const repo = makeRepo();
    const handlers = captureHandlers(makeIo(), { id: 'sock-g', userId: GUEST, isGuest: true }, repo);

    const cb = vi.fn();
    await handlers['get_progression']({}, cb);

    const res = cb.mock.calls[0][0];
    expect(res.success).toBe(true);
    expect(res.guest).toBe(true);
    expect(res.progression.equipped).toEqual(DEFAULT_COSMETICS);
    expect(repo.getProgression).not.toHaveBeenCalled();
  });

  it('set_cosmetics persists only owned items and live-updates the seated player', async () => {
    const io = makeIo();
    const repo = makeRepo({
      getProgression: vi.fn().mockResolvedValue({ xp: 100, gamesPlayed: 1, equipped: {} }), // level 2
    });
    // Seat the player at a live table so the equip propagates.
    const room = createRoom('sock-1', MODES.ONLINE, defaultRoomConfig());
    room.code = 'COSM01';
    room.players.push(createPlayer(U1, 'Winner', 'sock-1'));
    await saveRoom(room);

    const handlers = captureHandlers(io, { id: 'sock-1', userId: U1, isGuest: false }, repo);
    const cb = vi.fn();
    await handlers['set_cosmetics']({
      equipped: { tableFelt: 'felt_wine', gunSkin: 'gun_cosmos' }, // cosmos needs L10
    }, cb);

    const res = cb.mock.calls[0][0];
    expect(res.success).toBe(true);
    expect(res.equipped.tableFelt).toBe('felt_wine');
    expect(res.equipped.gunSkin).toBe(DEFAULT_COSMETICS.gunSkin); // locked → default
    expect(repo.setEquippedCosmetics).toHaveBeenCalledWith(U1, res.equipped);
    expect(room.players[0].cosmetics).toEqual(res.equipped);
  });

  it('set_cosmetics refuses guests', async () => {
    const repo = makeRepo();
    const handlers = captureHandlers(makeIo(), { id: 'sock-g', userId: GUEST, isGuest: true }, repo);
    const cb = vi.fn();
    await handlers['set_cosmetics']({ equipped: { tableFelt: 'felt_wine' } }, cb);
    expect(cb.mock.calls[0][0].success).toBe(false);
    expect(repo.setEquippedCosmetics).not.toHaveBeenCalled();
  });
});
