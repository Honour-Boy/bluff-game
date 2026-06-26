// ============================================================
// Phase 3 (#294–300) - The Pact (Covenant) engine + server flow.
//
//   • Pure engine: role assignment, response, bluff block, volunteer eligibility,
//     partner death (bullet dock), dual win, dual-win game-over sentinel.
//   • Flow: call_bluff is refused between pact partners WITHOUT consuming the
//     caller's bluff; a spin on one partner pauses for a volunteer prompt and
//     resumes against the volunteer.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const engine = require('../gameEngine.js');
const {
  createRoom,
  createPlayer,
  applyTierFlags,
  assignPactRoles,
  applyPactResponse,
  isPactBluffBlocked,
  checkPactVolunteerEligible,
  applyPactPartnerDeath,
  checkDualWin,
  checkGameOver,
  buildGameOverLastAction,
  markDualWinners,
  defaultRoomConfig,
  MODES,
  CHAMBER_SIZE,
} = require('../gameEngine.js');
const { applySpinAndBroadcast } = require('../lib/orchestration.js');
const bluffHandler = require('../handlers/bluff.js');
const gameHandler = require('../handlers/game.js');
const {
  rooms, saveRoom, pactVolunteerTimers, _clearPactVolunteerTimer, _clearSpinPendingTimer,
} = require('../lib/state.js');

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
  addXp: vi.fn().mockResolvedValue({ xp: 100 }),
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

function makeRoom({ tier = 'covenant', code = 'PACT01', count = 3 } = {}) {
  const room = createRoom('host-socket', MODES.ONLINE, defaultRoomConfig());
  room.code = code;
  for (let i = 0; i < count; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  applyTierFlags(room, tier);
  room.phase = 'playing';
  room.hands = new Map(room.players.map((p) => [p.id, [{ id: `h-${p.id}`, type: 'shape', shape: 'circle', number: 4 }]]));
  room.powerCardSlot = {};
  room.deck = Array.from({ length: 20 }).map((_, i) => ({ id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1 }));
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  return room;
}

beforeEach(() => { rooms.clear(); });
afterEach(() => { _clearPactVolunteerTimer('PACT01'); _clearSpinPendingTimer('PACT01'); vi.clearAllMocks(); });

// ─── Pure engine ─────────────────────────────────────────────
describe('pact engine - pure helpers', () => {
  it('assignPactRoles designates a selector + a distinct default target', () => {
    const room = makeRoom();
    const res = assignPactRoles(room);
    expect(res.ok).toBe(true);
    expect(room.pactSelectorId).toBeTruthy();
    expect(room.pactTargetId).toBeTruthy();
    expect(room.pactSelectorId).not.toBe(room.pactTargetId);
  });

  it('applyPactResponse(accept) activates the bond; deny clears it + strips reserved card', () => {
    const accept = makeRoom();
    accept.pactSelectorId = 'p0';
    accept.pactTargetId = 'p1';
    accept.pactOfferPending = true;
    const r1 = applyPactResponse(accept, true);
    expect(r1.action).toBe('confirmed');
    expect(accept.pact).toEqual({ a: 'p0', b: 'p1', active: true });
    expect(accept.pactOfferPending).toBe(false);

    const deny = makeRoom();
    deny.pactSelectorId = 'p0';
    deny.pactTargetId = 'p1';
    deny.powerCardSlot = { p0: [{ id: 'x', power: 'shield' }] };
    const r2 = applyPactResponse(deny, false);
    expect(r2.action).toBe('denied');
    expect(deny.pact).toBeNull();
    expect(deny.powerCardSlot.p0).toEqual([]);
  });

  it('isPactBluffBlocked is symmetric for partners, false for others', () => {
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    expect(isPactBluffBlocked(room, 'p0', 'p1')).toBe(true);
    expect(isPactBluffBlocked(room, 'p1', 'p0')).toBe(true);
    expect(isPactBluffBlocked(room, 'p0', 'p2')).toBe(false);
    expect(isPactBluffBlocked(room, 'p2', 'p1')).toBe(false);
    room.pact.active = false;
    expect(isPactBluffBlocked(room, 'p0', 'p1')).toBe(false);
  });

  it('checkPactVolunteerEligible returns the other partner only when both alive', () => {
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    expect(checkPactVolunteerEligible(room, 'p0')).toBe('p1');
    expect(checkPactVolunteerEligible(room, 'p1')).toBe('p0');
    expect(checkPactVolunteerEligible(room, 'p2')).toBeNull();
    room.players.find(p => p.id === 'p1').status = 'eliminated';
    expect(checkPactVolunteerEligible(room, 'p0')).toBeNull();
  });

  it('applyPactPartnerDeath breaks the bond + docks one bullet from the survivor', () => {
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    const survivor = room.players.find(p => p.id === 'p1');
    survivor.chamber = ['bullet', 'bullet', null, null, null, null];
    survivor.riskLevel = 2;
    const res = applyPactPartnerDeath(room, 'p0');
    expect(res).toEqual({ ok: true, survivorId: 'p1' });
    expect(room.pact.active).toBe(false);
    expect(survivor.chamber.filter(s => s === 'bullet').length).toBe(1);
    expect(survivor.riskLevel).toBe(1);
  });

  it('checkDualWin fires only when the two alive players are the partners', () => {
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    room.players.find(p => p.id === 'p2').status = 'eliminated';
    const dual = checkDualWin(room);
    expect(dual.map(p => p.id).sort()).toEqual(['p0', 'p1']);

    // A non-partner among the final two → no dual win.
    const room2 = makeRoom();
    room2.pact = { a: 'p0', b: 'p1', active: true };
    room2.players.find(p => p.id === 'p1').status = 'eliminated';
    expect(checkDualWin(room2)).toBeNull();
  });

  it('checkGameOver returns a dual-win sentinel; helpers expand it', () => {
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    room.players.find(p => p.id === 'p2').status = 'eliminated';
    const winner = checkGameOver(room);
    expect(winner.dualWin).toBe(true);
    expect(winner.dualWinners.map(p => p.id).sort()).toEqual(['p0', 'p1']);

    const la = buildGameOverLastAction(winner);
    expect(la.dualWin).toBe(true);
    expect(la.winnerIds.sort()).toEqual(['p0', 'p1']);
    markDualWinners(room, winner);
    expect(room.dualWinnerIds.sort()).toEqual(['p0', 'p1']);
  });
});

// ─── call_bluff: pact partners can't bluff each other ────────
describe('pact bluff block (call_bluff)', () => {
  function captureBluff(io) {
    const handlers = {};
    const socket = { id: 'sock-1', userId: 'p1', data: {}, on: (evt, cb) => { handlers[evt] = cb; } };
    bluffHandler.register(io, socket, { leaderboardRepo });
    return handlers;
  }

  it('refuses a bluff between partners WITHOUT consuming the caller bluff', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    room.currentTurnIndex = 1;            // p1 on turn
    room.prevTurnPlayerId = 'p0';         // p0 is the accused (partner)
    room.isFirstTurn = false;
    await saveRoom(room);

    const handlers = captureBluff(io);
    const res = await new Promise((resolve) => handlers.call_bluff({ roomCode: 'PACT01', playerId: 'p1' }, resolve));
    expect(res.success).toBe(false);
    expect(res.error).toBe('pact_bluff_blocked');
    expect(room.bluffUsedThisTurn).toBe(false);
    expect(log.some(l => l.event === 'pact_bluff_blocked')).toBe(true);
  });
});

// ─── volunteer pull: spin on a partner pauses for the other ──
describe('pact volunteer pull (spin)', () => {
  it('pauses the spin + prompts the partner; resumes against the volunteer', async () => {
    const { io, log } = makeIo(3);
    const room = makeRoom();
    room.pact = { a: 'p0', b: 'p1', active: true };
    room.phase = 'spin_pending';
    room.spinTargetId = 'p0';
    room.lastAction = { type: 'spin_pending', spinTargetId: 'p0', bluffCorrect: true, accuserId: 'p2' };
    await saveRoom(room);

    const player = room.players.find(p => p.id === 'p0');
    const paused = await applySpinAndBroadcast(io, 'PACT01', room, player, leaderboardRepo);
    expect(paused).toBeNull();                       // spin held
    expect(room.pendingPactVolunteer?.partnerId).toBe('p1');
    expect(pactVolunteerTimers.has('PACT01')).toBe(true);
    expect(log.some(l => l.event === 'pact_volunteer_prompt')).toBe(true);

    // The partner volunteers - resolves against p1 (deterministic empty chamber).
    const volunteer = room.players.find(p => p.id === 'p1');
    volunteer.chamber = Array(CHAMBER_SIZE).fill(null);
    const handlers = {};
    const socket = { id: 'sock-1', userId: 'p1', data: {}, on: (evt, cb) => { handlers[evt] = cb; } };
    gameHandler.register(io, socket, { leaderboardRepo });
    const res = await new Promise((resolve) => handlers.pact_volunteer({ roomCode: 'PACT01' }, resolve));
    expect(res.success).toBe(true);
    expect(room.pendingPactVolunteer).toBeNull();
    const spin = log.filter(l => l.event === 'room_state').pop();
    // p1 took the spin (survived) - last spin_result targeted p1.
    expect(room.lastAction.spinTargetId).toBe('p1');
    expect(room.lastAction.spinReason).toBe('pact_volunteer');
  });
});
