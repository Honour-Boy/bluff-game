// ============================================================
// #239 - Idle-turn safety net.
//
// OUTSIDE Speed Mode, a current player who never acts must not stall the table.
// After IDLE_TURN_TIMEOUT_MS the server auto-resolves their turn (auto-plays a
// sensible legal card when safe, then ends the turn - no spin, #79) and play
// continues. Speed Mode's shorter advertised cap takes precedence, so the idle
// timer never arms while Speed Mode is on (the two can't double-fire).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engine = require('../gameEngine');
const {
  rooms,
  saveRoom,
  idleTurnTimers,
  speedModeTimers,
  _clearIdleTurnTimer,
} = require('../lib/state');
const { armIdleTurnTimer, _idleTurnActive } = require('../lib/idleTurn');

const IDLE_MS = engine.IDLE_TURN_TIMEOUT_MS;

function makeIo() {
  const emits = [];
  return {
    emits,
    to: () => ({ emit: (ev, payload) => emits.push({ ev, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

function makeRoom({ speedMode = false } = {}) {
  const cfg = engine.defaultRoomConfig();
  cfg.roomModifiers.speedMode = speedMode;
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, cfg);
  for (let i = 0; i < 3; i++) {
    room.players.push(engine.createPlayer(`p${i}`, `P${i}`, `s${i}`));
  }
  engine.startGame(room); // deals 6 shape cards each, leaves phase 'playing'
  room.turnOrder = ['p0', 'p1', 'p2'];
  room.currentTurnIndex = 0;
  room.skipNextPlayer = false;
  return room;
}

const handLen = (room, id) => (room.hands.get(id) || []).length;

describe('#239 - idle-turn safety net', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const code of [...idleTurnTimers.keys()]) _clearIdleTurnTimer(code);
    for (const code of [...speedModeTimers.keys()]) { clearTimeout(speedModeTimers.get(code)); speedModeTimers.delete(code); }
    rooms.clear();
    vi.useRealTimers();
  });

  it('arms a timer on a playing turn when Speed Mode is OFF', async () => {
    const room = makeRoom();
    await saveRoom(room);

    armIdleTurnTimer(makeIo(), room);

    expect(_idleTurnActive(room)).toBe(true);
    expect(idleTurnTimers.has(room.code)).toBe(true);
    // The idle net is silent - it must NOT surface a Speed Mode countdown.
    expect(engine.serializeRoom(room, 'p1').speedModeMsRemaining).toBeUndefined();
  });

  it('does NOT arm when Speed Mode is ON (Speed Mode owns the per-turn timeout)', async () => {
    const room = makeRoom({ speedMode: true });
    await saveRoom(room);

    armIdleTurnTimer(makeIo(), room);

    expect(_idleTurnActive(room)).toBe(false);
    expect(idleTurnTimers.has(room.code)).toBe(false);
  });

  it('auto-plays a card and advances the turn on expiry - no spin, nobody eliminated', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armIdleTurnTimer(io, room);
    const handBefore = handLen(room, 'p0');
    const pileBefore = room.playedPile.length;

    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(room.currentTurnIndex).toBe(1);          // advanced off the idle player
    expect(room.phase).toBe('playing');             // no spin
    expect(room.lastAction.type).toBe('idle_timeout');
    expect(room.lastAction.playerId).toBe('p0');
    expect(room.lastAction.autoPlayed).toBe(true);
    expect(handLen(room, 'p0')).toBe(handBefore - 1); // one card auto-played
    expect(room.playedPile.length).toBe(pileBefore + 1);
    expect(room.players.every((p) => p.status === 'alive')).toBe(true);
  });

  it('forfeits without auto-playing when it would empty the hand (no handing a win)', async () => {
    const room = makeRoom();
    // p0 down to a single card - auto-play would empty their hand and "win".
    room.hands.set('p0', [{ id: 'last', type: 'shape', shape: 'circle', number: 5 }]);
    await saveRoom(room);
    const io = makeIo();

    armIdleTurnTimer(io, room);
    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(room.currentTurnIndex).toBe(1);
    expect(room.lastAction.type).toBe('idle_timeout');
    expect(room.lastAction.autoPlayed).toBe(false);  // forfeited, did not play
    expect(handLen(room, 'p0')).toBe(1);             // their last card is kept
  });

  it('re-arms a fresh idle timer for the next player after a timeout', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armIdleTurnTimer(io, room);
    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(room.currentTurnIndex).toBe(1);
    expect(idleTurnTimers.has(room.code)).toBe(true);
  });

  it('tears the timer down when the room leaves the playing phase', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armIdleTurnTimer(io, room);
    expect(idleTurnTimers.has(room.code)).toBe(true);

    room.phase = 'spin_pending';
    armIdleTurnTimer(io, room);

    expect(idleTurnTimers.has(room.code)).toBe(false);
  });

  it('keeps a single countdown across a turn (no reset on each sub-action)', async () => {
    const room = makeRoom();
    await saveRoom(room);
    const io = makeIo();

    armIdleTurnTimer(io, room);
    const firstKey = room._idleTurnKey;

    armIdleTurnTimer(io, room); // same turn, another broadcast
    expect(room._idleTurnKey).toBe(firstKey);

    engine.advanceTurn(room);
    armIdleTurnTimer(io, room); // genuine turn change → new key
    expect(room._idleTurnKey).not.toBe(firstKey);
  });
});
