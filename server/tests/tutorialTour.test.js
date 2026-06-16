// ============================================================
// Spotlight tour — socket handler flow (start / finish / spin-ack).
//
// Drives the real game handlers against an in-memory room:
//   • tutorial_start_tour deals (if needed), flips the lesson to 'tour', and
//     stages step 0; rejects non-tutorial / unauth / not-in-room.
//   • tutorial_finish_tour resets to a freshly-dealt Basics game.
//   • spin_acknowledged stamps tourSpinAcked during the call_bluff_chain step.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const engine = require('../gameEngine.js');
const gameHandler = require('../handlers/game.js');
const { stageTourStep, BOT_ID } = require('../engine/tourScenarios.js');
const {
  rooms,
  botTimers,
  tutorialTimers,
  idleTurnTimers,
  spinPendingTimers,
  _clearBotTimer,
  _clearTutorialTimer,
  _clearIdleTurnTimer,
  _clearSpinPendingTimer,
} = require('../lib/state.js');

function makeIo() {
  const log = [];
  return {
    log,
    to: () => ({ emit: (event, payload) => log.push({ event, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

const deps = {
  groupSettingsRepo: {},
  leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
};

function captureHandlers(io, { userId = 'human' } = {}) {
  const handlers = {};
  const socket = {
    id: 'host-sock', userId, username: 'You', data: {},
    on: (evt, cb) => { handlers[evt] = cb; },
    join: () => {}, leave: () => {},
  };
  gameHandler.register(io, socket, deps);
  return handlers;
}

function lobbyTourRoom(code = 'TOURH1') {
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, null);
  room.code = code;
  room.isTutorial = true;
  room.hostUserId = BOT_ID;
  room.hostSocketId = null;
  const human = engine.createPlayer('human', 'You', 'host-sock');
  const bot = engine.createPlayer(BOT_ID, 'Dealer Bot', null);
  bot.isBot = true;
  room.players.push(human, bot);
  room.phase = 'lobby';
  rooms.set(code, room);
  return room;
}

beforeEach(() => rooms.clear());
afterEach(() => {
  for (const c of [...botTimers.keys()]) _clearBotTimer(c);
  for (const c of [...tutorialTimers.keys()]) _clearTutorialTimer(c);
  for (const c of [...idleTurnTimers.keys()]) _clearIdleTurnTimer(c);
  for (const c of [...spinPendingTimers.keys()]) _clearSpinPendingTimer(c);
  rooms.clear();
  vi.clearAllMocks();
});

describe('tutorial_start_tour', () => {
  it('deals from the lobby, flips the lesson to tour, and stages step 0', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const room = lobbyTourRoom();
    const cb = vi.fn();

    await handlers['tutorial_start_tour']({ roomCode: room.code }, cb);

    expect(cb).toHaveBeenCalledWith({ success: true });
    expect(room.tutorialLesson).toBe('tour');
    expect(room.phase).toBe('playing');
    expect(room.tutorialScenario).toMatchObject({ tour: true, step: 'play_card', stepIndex: 0 });
    // Powers enabled so the activate_power instance's Peek works.
    expect(room.config.powerCards.enabled.peek).toBe(true);
    // Human is on turn with a legal hand.
    expect(room.turnOrder[room.currentTurnIndex]).toBe('human');
  });

  it('rejects a non-tutorial room', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const room = lobbyTourRoom();
    room.isTutorial = false;
    const cb = vi.fn();
    await handlers['tutorial_start_tour']({ roomCode: room.code }, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not a tutorial room' });
  });

  it('rejects an unauthenticated socket', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io, { userId: null });
    lobbyTourRoom();
    const cb = vi.fn();
    await handlers['tutorial_start_tour']({ roomCode: 'TOURH1' }, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
  });

  it('rejects a human who is not seated in the room', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io, { userId: 'stranger' });
    const room = lobbyTourRoom();
    const cb = vi.fn();
    await handlers['tutorial_start_tour']({ roomCode: room.code }, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not in this room' });
  });
});

describe('tutorial_finish_tour', () => {
  it('resets a tour room to a freshly-dealt Basics game', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const room = lobbyTourRoom();
    // Put it mid-tour first.
    engine.startGame(room);
    room.tutorialLesson = 'tour';
    stageTourStep(room, 1);
    const cb = vi.fn();

    await handlers['tutorial_finish_tour']({ roomCode: room.code }, cb);

    expect(cb).toHaveBeenCalledWith({ success: true });
    expect(room.tutorialLesson).toBe('basics');
    expect(room.tutorialScenario).toBeNull();
    expect(room.tourComplete).toBe(false);
    expect(room.phase).toBe('playing'); // dealt a fresh Basics game
  });
});

describe('spin_acknowledged — tour hook', () => {
  it('stamps tourSpinAcked during the call_bluff_chain step', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const room = lobbyTourRoom();
    engine.startGame(room);
    room.tutorialLesson = 'tour';
    stageTourStep(room, 1);          // call_bluff_chain
    expect(room.tourSpinAcked).toBe(false);

    await handlers['spin_acknowledged']({ roomCode: room.code });

    expect(room.tourSpinAcked).toBe(true);
    // It also broadcast the dismiss signal.
    expect(io.log.some((e) => e.event === 'spin_acknowledged')).toBe(true);
  });

  it('does NOT stamp outside a tour scenario', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const room = lobbyTourRoom();
    engine.startGame(room);
    room.tutorialLesson = 'basics'; // not the tour
    const cb = vi.fn();
    await handlers['spin_acknowledged']({ roomCode: room.code }, cb);
    expect(room.tourSpinAcked).toBeFalsy();
  });
});
