// ============================================================
// Regression tests for the spin state-machine SAFETY TIMEOUTS.
//
// Two server-side anti-hang guards, added after a play-test report of
// the game freezing with the server healthy and BOTH sockets alive:
//
//   Issue 1 - spin_pending had no timeout. If the spin target never
//             emitted player_spin (spin UI failed to mount, or a
//             transient network blip swallowed the emit), the room sat
//             in spin_pending forever. The server now auto-resolves the
//             spin itself after SPIN_PENDING_TIMEOUT_MS - engine.spinGun
//             is server-authoritative, so the result is identical to a
//             manual spin.
//
//   Issue 2 - a game-ending spin parks in room.pendingGameOver awaiting
//             the client's spin_acknowledged (to sync the game-over
//             reveal with the spin overlay's dismissal). If that ack
//             never arrived the match stayed in 'playing' forever. The
//             server now finalises game_over itself after
//             PENDING_GAME_OVER_TIMEOUT_MS.
//
// Both timers are cancelled the instant the real client event arrives.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

// These three modules hold shared MUTABLE singletons (the rooms Map and the
// timer registries) that the production code reaches via CommonJS `require`.
// Pulling them in the same way - instead of an ESM `import`, which vitest can
// resolve to a *separate* module instance across the ESM/CJS boundary -
// guarantees the test observes the very maps the handlers/orchestration mutate.
const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  MODES,
  CHAMBER_SIZE,
  SPIN_PENDING_TIMEOUT_MS,
  PENDING_GAME_OVER_TIMEOUT_MS,
} = require('../gameEngine.js');
const {
  _scheduleSpinPendingTimeout,
  _stampPendingGameOver,
  resolvePendingGameOver,
} = require('../lib/orchestration.js');
const {
  rooms,
  saveRoom,
  spinPendingTimers,
  gameOverTimers,
  _clearSpinPendingTimer,
} = require('../lib/state.js');

// ─── Harness ─────────────────────────────────────────────────

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

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
};

// Deterministic chambers - no client RNG, no engine RNG ambiguity.
const safeChamber = () => Array(CHAMBER_SIZE).fill(null);        // never fires → survive
const loadedChamber = () => Array(CHAMBER_SIZE).fill('bullet');  // always fires → eliminated

// A 2-player online room parked in spin_pending, target = p<targetIndex>.
function makeSpinRoom({ players = 2, targetIndex = 1, targetChamber = safeChamber() } = {}) {
  const room = createRoom('host-socket', MODES.ONLINE, defaultRoomConfig());
  room.code = 'SPIN01';
  for (let i = 0; i < players; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  room.currentTurnIndex = 0;
  room.phase = 'spin_pending';
  room.spinTargetId = `p${targetIndex}`;
  room.players[targetIndex].chamber = targetChamber;
  room.hands = new Map(room.players.map((p) => [p.id, []]));
  room.deck = [];
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  return room;
}

beforeEach(() => {
  rooms.clear();
  spinPendingTimers.clear();
  gameOverTimers.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ─── Issue 1 - spin_pending auto-resolve ─────────────────────

describe('Issue 1 - spin_pending auto-resolves when the target never spins', () => {
  it('auto-spins server-side after the timeout (survival) and leaves spin_pending', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom({ targetChamber: safeChamber() });
    await saveRoom(room);

    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
    expect(spinPendingTimers.has(room.code)).toBe(true);

    // Nothing happens before the window elapses.
    await vi.advanceTimersByTimeAsync(SPIN_PENDING_TIMEOUT_MS - 1000);
    expect(room.phase).toBe('spin_pending');

    await vi.advanceTimersByTimeAsync(1000);

    expect(room.phase).toBe('playing');
    expect(room.spinTargetId).toBeNull();
    expect(room.lastAction.type).toBe('spin_result');
    expect(room.lastAction.eliminated).toBe(false);
    expect(spinPendingTimers.has(room.code)).toBe(false);
  });

  it('chains into game_over when the auto-spin eliminates the last opponent', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom({ players: 2, targetIndex: 1, targetChamber: loadedChamber() });
    await saveRoom(room);

    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
    await vi.advanceTimersByTimeAsync(SPIN_PENDING_TIMEOUT_MS);

    // The auto-spin eliminated p1 → only p0 left → pendingGameOver stamped and
    // its OWN safety timer armed (Issue 1 feeds Issue 2).
    expect(room.players[1].status).toBe('eliminated');
    expect(room.pendingGameOver).toMatchObject({ id: 'p0' });
    expect(gameOverTimers.has(room.code)).toBe(true);

    // The deferred game-over then finalises on its own grace.
    await vi.advanceTimersByTimeAsync(PENDING_GAME_OVER_TIMEOUT_MS);
    expect(room.phase).toBe('game_over');
    expect(room.lastAction.type).toBe('game_over');
    expect(room.pendingGameOver).toBeUndefined();
  });

  it('the armed timer is a no-op if the room already left spin_pending', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    room.lastAction = { type: 'sentinel' };
    await saveRoom(room);

    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
    // The spin resolves through some other path and the phase moves on.
    room.phase = 'playing';
    room.spinTargetId = null;
    await saveRoom(room);

    await vi.advanceTimersByTimeAsync(SPIN_PENDING_TIMEOUT_MS);
    // The guard inside the timer prevented a phantom auto-spin.
    expect(room.lastAction).toEqual({ type: 'sentinel' });
  });

  it('player_spin cancels the timer so it cannot fire', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    await saveRoom(room);

    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
    expect(spinPendingTimers.has(room.code)).toBe(true);

    // What player_spin does on a real spin.
    _clearSpinPendingTimer(room.code);
    expect(spinPendingTimers.has(room.code)).toBe(false);

    await vi.advanceTimersByTimeAsync(SPIN_PENDING_TIMEOUT_MS);
    expect(room.phase).toBe('spin_pending'); // untouched - nothing fired
  });

  it('does not auto-spin a target who is no longer alive', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    room.lastAction = { type: 'sentinel' };
    room.players[1].status = 'eliminated'; // the target left / was eliminated
    await saveRoom(room);

    _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
    await vi.advanceTimersByTimeAsync(SPIN_PENDING_TIMEOUT_MS);

    expect(room.lastAction).toEqual({ type: 'sentinel' });
  });
});

// ─── Issue 2 - pendingGameOver auto-finalise ─────────────────

describe('Issue 2 - pendingGameOver auto-finalises when spin_acknowledged never arrives', () => {
  it('finalises game_over after the grace window', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    room.phase = 'playing';
    room.spinTargetId = null;
    await saveRoom(room);

    _stampPendingGameOver(io, room, { id: 'p0', username: 'Player0' }, leaderboardRepo);
    expect(room.pendingGameOver).toMatchObject({ id: 'p0' });
    expect(gameOverTimers.has(room.code)).toBe(true);

    await vi.advanceTimersByTimeAsync(PENDING_GAME_OVER_TIMEOUT_MS - 1);
    expect(room.phase).toBe('playing'); // not yet

    await vi.advanceTimersByTimeAsync(1);
    expect(room.phase).toBe('game_over');
    expect(room.lastAction).toMatchObject({ type: 'game_over', winnerId: 'p0' });
    expect(room.pendingGameOver).toBeUndefined();
    expect(gameOverTimers.has(room.code)).toBe(false);
  });

  it('spin_acknowledged (resolvePendingGameOver) cancels the timer and finalises immediately', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    room.phase = 'playing';
    await saveRoom(room);

    _stampPendingGameOver(io, room, { id: 'p0', username: 'Player0' }, leaderboardRepo);
    expect(gameOverTimers.has(room.code)).toBe(true);

    await resolvePendingGameOver(io, room, leaderboardRepo);
    expect(room.phase).toBe('game_over');
    expect(gameOverTimers.has(room.code)).toBe(false);

    // Advancing past the grace does nothing more (no double-resolve).
    const lastActionRef = room.lastAction;
    await vi.advanceTimersByTimeAsync(PENDING_GAME_OVER_TIMEOUT_MS);
    expect(room.lastAction).toBe(lastActionRef);
  });

  it('drops any queued Mirror Match spin when the game ends', async () => {
    const io = makeFakeIo();
    const room = makeSpinRoom();
    room.phase = 'playing';
    room.pendingMirrorMatchSpin = { targetId: 'p1', triggeredBy: 'p0' };
    await saveRoom(room);

    _stampPendingGameOver(io, room, { id: 'p0', username: 'Player0' }, leaderboardRepo);
    await vi.advanceTimersByTimeAsync(PENDING_GAME_OVER_TIMEOUT_MS);

    expect(room.phase).toBe('game_over');
    expect(room.pendingMirrorMatchSpin).toBeUndefined();
  });
});
