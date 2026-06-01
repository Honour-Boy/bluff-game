// ============================================================
// #241 — Mirror Match: the spin animation must play for BOTH the player the
// bluff landed on AND the mirrored opposite player, on every client.
//
// The two spins are sequential: the primary spin's overlay resolves, the spin
// target acknowledges, and ONLY THEN does the mirror spin run. The client's
// "dismiss this overlay" flag (spinDismissed) is shared across spins and driven
// purely by socket-event ORDER:
//   • a `room_state` carrying a spin_result   → spinDismissed = false (show it)
//   • a `spin_acknowledged`                    → spinDismissed = true  (tear down)
// So the mirror spin_result MUST be the LAST event the server emits, otherwise a
// trailing `spin_acknowledged` tears the fresh mirror overlay down the instant
// its cylinder stops — the spin then appears to play for only the first player.
//
// This test drives the real `spin_acknowledged` handler and asserts the emit
// order: spin_acknowledged is sent BEFORE the mirror spin_result room_state.
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
const gameHandler = require('../handlers/game.js');
const { rooms, saveRoom } = require('../lib/state.js');

const leaderboardRepo = {
  recordWinner: vi.fn().mockResolvedValue({ wins: 1 }),
  recordGameStart: vi.fn(),
  getLeaderboard: vi.fn(),
};

// An ordered log of every emit, whether via io.to(...).emit or per-socket s.emit.
function makeOrderedIo(playerCount) {
  const log = [];
  const sockets = Array.from({ length: playerCount }).map((_, i) => ({
    id: `sock-${i}`,
    data: {},
    emit: (event, payload) => log.push({ src: `sock-${i}`, event, payload }),
  }));
  const io = {
    to: () => ({ emit: (event, payload) => log.push({ src: 'io', event, payload }) }),
    in: () => ({ fetchSockets: async () => sockets }),
  };
  return { io, log, sockets };
}

function makeMirrorRoom() {
  const cfg = defaultRoomConfig();
  cfg.roomModifiers.mirrorMatch = true;
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  room.code = 'MIR01';
  for (let i = 0; i < 4; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.mirrorMatchActive = true;
  // Primary spin already happened; the opposite player (p2) is queued to spin.
  room.pendingMirrorMatchSpin = { targetId: 'p2', triggeredBy: 'p0' };
  // p2 survives deterministically (empty chamber) so the flow runs cleanly.
  room.players[2].chamber = Array(CHAMBER_SIZE).fill(null);
  room.hands = new Map(room.players.map((p) => [p.id, [{ id: `h-${p.id}`, type: 'shape', shape: 'circle', number: 4 }]]));
  room.powerCardSlot = {};
  room.deck = Array.from({ length: 20 }).map((_, i) => ({ id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1 }));
  room.discardPile = [];
  room.playedPile = [];
  room.currentCardType = 'circle';
  return room;
}

// Register the game handlers against a fake socket and return the captured map.
function captureHandlers(io) {
  const handlers = {};
  const socket = { id: 'sock-0', data: {}, on: (evt, cb) => { handlers[evt] = cb; } };
  gameHandler.register(io, socket, { leaderboardRepo });
  return handlers;
}

beforeEach(() => {
  rooms.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('#241 — Mirror Match spin overlay ordering', () => {
  it('emits spin_acknowledged BEFORE the mirror spin_result so the second overlay survives', async () => {
    const { io, log } = makeOrderedIo(4);
    const room = makeMirrorRoom();
    await saveRoom(room);

    const handlers = captureHandlers(io);
    await handlers['spin_acknowledged']({ roomCode: 'MIR01' });

    const ackIdx = log.findIndex((e) => e.event === 'spin_acknowledged');
    const mirrorStateIdx = log.findIndex(
      (e) => e.event === 'room_state' && e.payload?.lastAction?.mirrorMatch === true,
    );

    expect(ackIdx).toBeGreaterThanOrEqual(0);      // the primary overlay IS dismissed
    expect(mirrorStateIdx).toBeGreaterThanOrEqual(0); // the mirror spin IS broadcast
    // The dismiss must come first so the mirror room_state (spinDismissed=false)
    // is the last word — otherwise the fresh mirror overlay is torn down at once.
    expect(ackIdx).toBeLessThan(mirrorStateIdx);
  });

  it('the mirror spin_result targets the opposite player and runs after the queue clears', async () => {
    const { io, log } = makeOrderedIo(4);
    const room = makeMirrorRoom();
    await saveRoom(room);

    const handlers = captureHandlers(io);
    await handlers['spin_acknowledged']({ roomCode: 'MIR01' });

    const mirrorState = log.find(
      (e) => e.event === 'room_state' && e.payload?.lastAction?.mirrorMatch === true,
    );
    expect(mirrorState.payload.lastAction.spinTargetId).toBe('p2');
    expect(mirrorState.payload.lastAction.mirrorMatchTriggeredBy).toBe('p0');
    // The queue is consumed so a later primary spin can re-queue a fresh mirror.
    expect(room.pendingMirrorMatchSpin).toBeUndefined();
  });
});
