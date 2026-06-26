// ============================================================
// #237 - Russian Roulette: auto-pull the trigger AND auto-end the turn.
//
// Russian Roulette fires an IMMEDIATE spin on a failed bluff (no manual "Pull
// the Trigger"), so the on-turn player's turn must ALSO end on its own once the
// spin resolves - otherwise play hangs waiting for an End Turn the modifier
// removed. applySpinAndBroadcast owns the auto-advance; these tests drive it
// directly (same harness the spin-timeout tests use) and assert the turn moves
// on for every outcome, without skipping when the spinner is the one eliminated.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  MODES,
  CHAMBER_SIZE,
} = require('../gameEngine.js');
const { applySpinAndBroadcast } = require('../lib/orchestration.js');
const { rooms, saveRoom } = require('../lib/state.js');

function makeFakeIo() {
  const emitters = new Map();
  return {
    to: (channel) => {
      if (!emitters.has(channel)) emitters.set(channel, vi.fn());
      return { emit: emitters.get(channel) };
    },
    in: () => ({ fetchSockets: async () => [] }),
  };
}

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
};

const safeChamber = () => Array(CHAMBER_SIZE).fill(null);       // never fires → survive
const loadedChamber = () => Array(CHAMBER_SIZE).fill('bullet'); // always fires → eliminated

// A Russian-Roulette online room in mid-play, `currentTurnIndex` on-turn.
function makeRRRoom({ players = 3, currentTurnIndex = 0, russianRoulette = true } = {}) {
  const cfg = defaultRoomConfig();
  cfg.riskModifiers.russianRoulette = russianRoulette;
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  room.code = 'RRTEST';
  for (let i = 0; i < players; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  room.currentTurnIndex = currentTurnIndex;
  room.phase = 'playing';
  room.hands = new Map(room.players.map((p) => [p.id, [{ id: `h-${p.id}`, type: 'shape', shape: 'circle', number: 3 }]]));
  room.deck = Array.from({ length: 20 }).map((_, i) => ({ id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1 }));
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  // §1.1 - a spin only happens as the tail of a bluff the on-turn player called.
  room.cardPlayedThisTurn = true;
  return room;
}

const currentTurnId = (room) => room.turnOrder[room.currentTurnIndex] ?? null;

beforeEach(() => {
  rooms.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('#237 - Russian Roulette auto-ends the turn after the immediate spin', () => {
  it('survival: the on-turn spinner survives → turn advances to the next player', async () => {
    const io = makeFakeIo();
    const room = makeRRRoom({ currentTurnIndex: 0 });
    room.players[0].chamber = safeChamber();
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, room.players[0], leaderboardRepo);

    expect(room.players[0].status).toBe('alive');
    expect(room.phase).toBe('playing');
    expect(currentTurnId(room)).toBe('p1');         // advanced off p0
    expect(room.lastAction.type).toBe('spin_result'); // still animates the cylinder
  });

  it('correct bluff: the PREVIOUS player spins+survives → the on-turn accuser still advances', async () => {
    const io = makeFakeIo();
    // p1 is on-turn (accuser); p0 (previous player / accused) is the spin target.
    const room = makeRRRoom({ currentTurnIndex: 1 });
    room.players[0].chamber = safeChamber();
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, room.players[0], leaderboardRepo);

    expect(room.players[0].status).toBe('alive');
    expect(currentTurnId(room)).toBe('p2');         // advanced off the accuser p1
  });

  it('spinner eliminated: pointer already moved - does NOT skip the next player', async () => {
    const io = makeFakeIo();
    // p0 on-turn (accuser on a wrong bluff) spins and dies.
    const room = makeRRRoom({ currentTurnIndex: 0 });
    room.players[0].chamber = loadedChamber();
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, room.players[0], leaderboardRepo);

    expect(room.players[0].status).toBe('eliminated');
    expect(room.turnOrder).toEqual(['p1', 'p2']);
    // eliminateFromTurnOrder already put the turn on p1; we must NOT advance to p2.
    expect(currentTurnId(room)).toBe('p1');
  });

  it('resets the turn-action ledger so the next player can act', async () => {
    const io = makeFakeIo();
    const room = makeRRRoom({ currentTurnIndex: 0 });
    room.players[0].chamber = safeChamber();
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, room.players[0], leaderboardRepo);

    expect(room.cardPlayedThisTurn).toBe(false);
    expect(room.bluffUsedThisTurn).toBe(false);
  });

  it('control: with Russian Roulette OFF the turn does NOT auto-advance', async () => {
    const io = makeFakeIo();
    const room = makeRRRoom({ currentTurnIndex: 0, russianRoulette: false });
    room.players[0].chamber = safeChamber();
    await saveRoom(room);

    await applySpinAndBroadcast(io, room.code, room, room.players[0], leaderboardRepo);

    // Vanilla flow: the spin resolves but the player still owns the turn until
    // they manually End Turn.
    expect(currentTurnId(room)).toBe('p0');
    expect(room.lastAction.type).toBe('spin_result');
  });
});
