// ============================================================
// Tests for host identity in serializeRoom.
//
// isHost is re-derived on the CLIENT from every room_state push so a
// live host change (stand-in reclaim / hand-back / migration) flips the
// affected player's UI. That derivation needs serializeRoom to carry
// the host identity: hostUserId (room-level) + amHost (per-recipient,
// only when a requestingPlayerId was supplied).
// ============================================================

import { describe, it, expect } from 'vitest';
import { createRoom, createPlayer, serializeRoom, MODES } from '../gameEngine.js';

function makeGroupRoom() {
  const room = createRoom('host-socket', MODES.ONLINE);
  room.players.push(createPlayer('host-id', 'Hostie', 'sock-h'));
  room.players.push(createPlayer('guest-id', 'Guestie', 'sock-g'));
  room.hostUserId = 'host-id';
  return room;
}

describe('serializeRoom host identity', () => {
  it('exposes hostUserId to every recipient', () => {
    const room = makeGroupRoom();
    expect(serializeRoom(room, 'host-id').hostUserId).toBe('host-id');
    expect(serializeRoom(room, 'guest-id').hostUserId).toBe('host-id');
    expect(serializeRoom(room, null).hostUserId).toBe('host-id');
  });

  it('sets amHost true only for the host recipient', () => {
    const room = makeGroupRoom();
    expect(serializeRoom(room, 'host-id').amHost).toBe(true);
    expect(serializeRoom(room, 'guest-id').amHost).toBe(false);
  });

  it('leaves amHost undefined when no requestingPlayerId is supplied (physical broadcast)', () => {
    const room = makeGroupRoom();
    expect(serializeRoom(room, null).amHost).toBeUndefined();
  });

  it('reflects a reclaim: amHost flips to the new host on the next serialize', () => {
    const room = makeGroupRoom();
    // Stand-in held host…
    room.hostUserId = 'guest-id';
    expect(serializeRoom(room, 'guest-id').amHost).toBe(true);
    expect(serializeRoom(room, 'host-id').amHost).toBe(false);
    // …owner reclaims.
    room.hostUserId = 'host-id';
    expect(serializeRoom(room, 'host-id').amHost).toBe(true);
    expect(serializeRoom(room, 'guest-id').amHost).toBe(false);
  });
});
