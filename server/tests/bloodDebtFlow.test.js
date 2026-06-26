// ============================================================
// Phase 4 (#302, #303) — Blood Debt end-to-end server flow.
//
//   • A correct-bluff spin death in a Covenant room emits `blood_debt_assign`
//     to the fallen player and arms the 10s window (assignment).
//   • The same death in a non-Covenant room does NOT.
//   • `blood_debt_target` records the picked debtor; expiry would default to
//     the caller.
//   • A debtor's queued debt spin fires from `spin_acknowledged` carrying
//     spinReason: 'blood_debt', consuming the flag exactly once.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  applyTierFlags,
  assignBloodDebt,
  defaultRoomConfig,
  MODES,
  CHAMBER_SIZE,
} = require('../gameEngine.js');
const { applySpinAndBroadcast } = require('../lib/orchestration.js');
const gameHandler = require('../handlers/game.js');
const { rooms, saveRoom, bloodDebtTimers, _clearBloodDebtTimer } = require('../lib/state.js');

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
};

function makeIo(playerCount) {
  const log = [];
  const sockets = Array.from({ length: playerCount }).map((_, i) => ({
    id: `sock-${i}`, data: {},
    emit: (event, payload) => log.push({ src: `sock-${i}`, event, payload }),
  }));
  const io = {
    to: (id) => ({ emit: (event, payload) => log.push({ src: id, event, payload }) }),
    in: () => ({ fetchSockets: async () => sockets }),
  };
  return { io, log };
}

// A Covenant room mid-bluff: the previous resolution stamped a correct-bluff
// spin_pending on `victim`, who is about to spin a fully-loaded chamber (dies).
function makeRoom({ tier = 'covenant', code = 'BD0001' } = {}) {
  const room = createRoom('host-socket', MODES.ONLINE, defaultRoomConfig());
  room.code = code;
  for (let i = 0; i < 3; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  applyTierFlags(room, tier);
  room.currentTurnIndex = 1; // accuser p1 is on turn
  room.phase = 'spin_pending';
  room.hands = new Map(room.players.map((p) => [p.id, [{ id: `h-${p.id}`, type: 'shape', shape: 'circle', number: 4 }]]));
  room.powerCardSlot = {};
  room.deck = Array.from({ length: 20 }).map((_, i) => ({ id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1 }));
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  // The correct-bluff verdict that produced this spin.
  room.lastAction = { type: 'spin_pending', spinTargetId: 'p0', bluffCorrect: true, accuserId: 'p1' };
  return room;
}

function captureHandlers(io) {
  const handlers = {};
  const socket = { id: 'sock-0', userId: 'p0', data: {}, on: (evt, cb) => { handlers[evt] = cb; } };
  gameHandler.register(io, socket, { leaderboardRepo });
  return handlers;
}

beforeEach(() => { rooms.clear(); });
afterEach(() => { _clearBloodDebtTimer('BD0001'); vi.clearAllMocks(); });

describe('Blood Debt assignment on correct-bluff elimination', () => {
  it('Covenant: emits blood_debt_assign to the fallen player + arms the window', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom({ tier: 'covenant' });
    const victim = room.players.find((p) => p.id === 'p0');
    victim.chamber = Array(CHAMBER_SIZE).fill('bullet'); // certain death
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, victim, leaderboardRepo);

    const assign = log.find((e) => e.event === 'blood_debt_assign');
    expect(assign).toBeTruthy();
    expect(assign.src).toBe('sock-0'); // private to the eliminated player
    expect(assign.payload.alivePlayerIds.sort()).toEqual(['p1', 'p2']);
    expect(room.pendingBloodDebt).toMatchObject({ eliminatedId: 'p0', callerId: 'p1' });
    expect(bloodDebtTimers.has('BD0001')).toBe(true);
  });

  it('non-Covenant: no blood_debt_assign, no pending state', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom({ tier: 'syndicate' });
    const victim = room.players.find((p) => p.id === 'p0');
    victim.chamber = Array(CHAMBER_SIZE).fill('bullet');
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, victim, leaderboardRepo);

    expect(log.find((e) => e.event === 'blood_debt_assign')).toBeUndefined();
    expect(room.pendingBloodDebt).toBeUndefined();
  });
});

describe('blood_debt_target handler', () => {
  it('records the picked debtor and clears the pending window', async () => {
    const { io } = makeIo(3);
    const room = makeRoom();
    room.players.find((p) => p.id === 'p0').status = 'eliminated';
    room.pendingBloodDebt = { eliminatedId: 'p0', callerId: 'p1', deadline: Date.now() + 10000 };
    bloodDebtTimers.set('BD0001', setTimeout(() => {}, 10000));
    await saveRoom(room);

    const handlers = captureHandlers(io);
    const cb = vi.fn();
    await handlers['blood_debt_target']({ roomCode: 'BD0001', targetUserId: 'p2' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: true });
    expect(room.players.find((p) => p.id === 'p2').hasBloodDebt).toBe(true);
    expect(room.pendingBloodDebt).toBeNull();
    expect(bloodDebtTimers.has('BD0001')).toBe(false);
  });

  it('rejects a pick from someone other than the eliminated player', async () => {
    const { io } = makeIo(3);
    const room = makeRoom();
    room.pendingBloodDebt = { eliminatedId: 'pX', callerId: 'p1', deadline: Date.now() + 10000 };
    await saveRoom(room);

    const handlers = captureHandlers(io); // socket.userId === 'p0'
    const cb = vi.fn();
    await handlers['blood_debt_target']({ roomCode: 'BD0001', targetUserId: 'p2' }, cb);

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'No blood debt to assign' });
  });
});

describe('debt spin fires from spin_acknowledged', () => {
  it('runs a blood_debt spin on the debtor and consumes the flag once', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom();
    room.phase = 'playing';
    room.lastAction = { type: 'spin_result' };
    // p0 carries a debt and is queued to spin; survives deterministically.
    assignBloodDebt(room, 'p0');
    room.pendingBloodDebtSpin = { debtorId: 'p0' };
    room.players.find((p) => p.id === 'p0').chamber = Array(CHAMBER_SIZE).fill(null);
    await saveRoom(room);

    const handlers = captureHandlers(io);
    await handlers['spin_acknowledged']({ roomCode: 'BD0001' });

    const debtSpin = log.find(
      (e) => e.event === 'room_state' && e.payload?.lastAction?.spinReason === 'blood_debt',
    );
    expect(debtSpin).toBeTruthy();
    expect(debtSpin.payload.lastAction.spinTargetId).toBe('p0');
    expect(room.players.find((p) => p.id === 'p0').hasBloodDebt).toBe(false);
    expect(room.pendingBloodDebtSpin).toBeUndefined();
  });

  it('cancels silently (consumes flag) if the debtor already died', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom();
    room.phase = 'playing';
    assignBloodDebt(room, 'p0');
    room.pendingBloodDebtSpin = { debtorId: 'p0' };
    room.players.find((p) => p.id === 'p0').status = 'eliminated';
    await saveRoom(room);

    const handlers = captureHandlers(io);
    await handlers['spin_acknowledged']({ roomCode: 'BD0001' });

    expect(log.find((e) => e.payload?.lastAction?.spinReason === 'blood_debt')).toBeUndefined();
    expect(room.players.find((p) => p.id === 'p0').hasBloodDebt).toBe(false);
    expect(room.pendingBloodDebtSpin).toBeUndefined();
  });
});
