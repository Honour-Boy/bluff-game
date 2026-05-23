// ============================================================
// Tests for §2.2 — in-room host migration helper.
//
// pickReplacementHost is the pure engine half of the leave_room
// host-migration flow: when the acting host leaves a live game it
// hands the seat to a random remaining ALIVE player. In a 2-player
// game that lone survivor is also the game-over winner. The socket
// wiring (emit host_migrated, group reclaim on rejoin) lives in
// handlers/room.js and is covered by CI + browser play-test.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  pickReplacementHost,
  MODES,
} from '../gameEngine.js';

function roomWith(statuses) {
  // statuses: array of 'alive' | 'eliminated', one per player p0..pN.
  const room = createRoom('host-socket', MODES.ONLINE);
  statuses.forEach((status, i) => {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    p.status = status;
    room.players.push(p);
  });
  room.hostUserId = 'p0';
  return room;
}

describe('pickReplacementHost (§2.2)', () => {
  it('returns a remaining alive player when the host leaves a >2 game', () => {
    const room = roomWith(['alive', 'alive', 'alive']);
    const next = pickReplacementHost(room, 'p0');
    expect(next).not.toBeNull();
    expect(next.id).not.toBe('p0');
    expect(['p1', 'p2']).toContain(next.id);
    expect(next.status).toBe('alive');
  });

  it('returns the lone survivor in a 2-player game (also the winner + new host)', () => {
    const room = roomWith(['alive', 'alive']);
    const next = pickReplacementHost(room, 'p0');
    expect(next.id).toBe('p1');
  });

  it('never picks an eliminated player', () => {
    const room = roomWith(['alive', 'eliminated', 'alive']);
    for (let i = 0; i < 25; i++) {
      const next = pickReplacementHost(room, 'p0');
      expect(next.id).not.toBe('p1');
      expect(next.status).toBe('alive');
    }
  });

  it('returns null when nobody is left to take over (room teardown case)', () => {
    const room = roomWith(['alive', 'eliminated', 'eliminated']);
    // The host (p0) is the only alive player and they are the one leaving.
    expect(pickReplacementHost(room, 'p0')).toBeNull();
  });

  it('excludes the leaving player even if marked alive', () => {
    const room = roomWith(['alive']);
    expect(pickReplacementHost(room, 'p0')).toBeNull();
  });
});
