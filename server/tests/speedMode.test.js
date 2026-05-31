import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engine = require('../gameEngine');
const {
  rooms,
  saveRoom,
  speedModeTimers,
  _clearSpeedModeTimer,
} = require('../lib/state');
const { armSpeedModeTimer, _speedModeActive } = require('../lib/speedMode');

const SPEED_MS = engine.SPEED_MODE_TURN_MS;

// A minimal io double: broadcastRoomState only needs `.in(code).fetchSockets()`
// (we return none, so no per-socket emit) and `.to(code).emit()` for banners.
function makeIo() {
  const emits = [];
  return {
    emits,
    to: () => ({ emit: (ev, payload) => emits.push({ ev, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

function makeRoom({ speedMode = true } = {}) {
  const cfg = engine.defaultRoomConfig();
  cfg.roomModifiers.speedMode = speedMode;
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, cfg);
  for (let i = 0; i < 3; i++) {
    room.players.push(engine.createPlayer(`p${i}`, `P${i}`, `s${i}`));
  }
  engine.startGame(room); // leaves phase 'playing'
  // Pin a deterministic turn order — startGame may shuffle the starting seat.
  room.turnOrder = ['p0', 'p1', 'p2'];
  room.currentTurnIndex = 0;
  room.skipNextPlayer = false;
  return room;
}

describe('Speed Mode turn timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const code of [...speedModeTimers.keys()]) _clearSpeedModeTimer(code);
    rooms.clear();
    vi.useRealTimers();
  });

  it('stamps a deadline and schedules a timer on a playing speed-mode turn', async () => {
    const room = makeRoom();
    await saveRoom(room);

    armSpeedModeTimer(makeIo(), room);

    expect(room.speedModeDeadline).toBeGreaterThan(Date.now());
    expect(room.speedModeDeadline - Date.now()).toBe(SPEED_MS);
    expect(speedModeTimers.has(room.code)).toBe(true);
    // serialize exposes the remaining time for the countdown UI.
    const view = engine.serializeRoom(room, 'p1');
    expect(view.speedModeMsRemaining).toBeGreaterThan(0);
    expect(view.currentPlayerId).toBe('p0');
  });

  it('auto-ENDS the current turn on expiry — advances the turn, no spin', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armSpeedModeTimer(io, room);
    expect(room.currentTurnIndex).toBe(0);

    await vi.advanceTimersByTimeAsync(SPEED_MS);

    // Turn advanced to the next player; the room is still in normal play.
    expect(room.currentTurnIndex).toBe(1);
    expect(room.phase).toBe('playing');
    expect(room.lastAction.type).toBe('speed_timeout');
    expect(room.lastAction.playerId).toBe('p0');
    // Critically: NO spin was triggered and nobody was eliminated (#79).
    expect(room.phase).not.toBe('spin_pending');
    expect(room.players.every((p) => p.status === 'alive')).toBe(true);
  });

  it('re-arms a fresh countdown for the next player after a timeout', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armSpeedModeTimer(io, room);
    await vi.advanceTimersByTimeAsync(SPEED_MS);

    // The new current player (p1) has their own running countdown.
    expect(room.currentTurnIndex).toBe(1);
    expect(speedModeTimers.has(room.code)).toBe(true);
    expect(room.speedModeDeadline - Date.now()).toBe(SPEED_MS);
  });

  it('does nothing when Speed Mode is off', async () => {
    const room = makeRoom({ speedMode: false });
    await saveRoom(room);

    armSpeedModeTimer(makeIo(), room);

    expect(_speedModeActive(room)).toBe(false);
    expect(room.speedModeDeadline ?? null).toBeNull();
    expect(speedModeTimers.has(room.code)).toBe(false);
    expect(engine.serializeRoom(room, 'p1').speedModeMsRemaining).toBeUndefined();
  });

  it('tears the countdown down when the room leaves the playing phase', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armSpeedModeTimer(io, room);
    expect(speedModeTimers.has(room.code)).toBe(true);

    // A bluff call moves the room into spin_pending — the countdown must pause.
    room.phase = 'spin_pending';
    armSpeedModeTimer(io, room);

    expect(speedModeTimers.has(room.code)).toBe(false);
    expect(room.speedModeDeadline ?? null).toBeNull();
  });

  it('keeps a single countdown across a turn (no reset on each sub-action)', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armSpeedModeTimer(io, room);
    const firstKey = room._speedModeTurnKey;
    const firstDeadline = room.speedModeDeadline;

    // Same player's turn, another broadcast (e.g. they played a card).
    armSpeedModeTimer(io, room);
    expect(room._speedModeTurnKey).toBe(firstKey);
    expect(room.speedModeDeadline).toBe(firstDeadline);

    // A genuine turn change re-arms with a new key + fresh deadline.
    engine.advanceTurn(room);
    armSpeedModeTimer(io, room);
    expect(room._speedModeTurnKey).not.toBe(firstKey);
  });
});
