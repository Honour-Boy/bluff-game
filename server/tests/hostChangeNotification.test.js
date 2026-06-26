// ============================================================
// #183 — host changes are announced to the whole room
//
// When a group stand-in is appointed or the owner reclaims / is
// handed host back, syncLiveRoomHosts already moves the host controls
// via room_state. The fix adds a dedicated `host_changed` event so
// every client can toast who now holds them. This locks the wire
// contract that event carries (the socket wiring in handlers/groups.js
// is covered by CI + browser play-test, per the repo convention).
// ============================================================

import { describe, it, expect } from 'vitest';
import { emitHostChanged } from '../lib/broadcast.js';

// Minimal io double that records every emit with its target so we can
// assert the room it went to and the payload it carried.
function makeIo() {
  const sent = [];
  return {
    to: (target) => ({
      emit: (event, payload) => { sent.push({ target, event, payload }); },
    }),
    sent,
  };
}

describe('#183 — host_changed notification', () => {
  it('emits host_changed to the room with id, name and the standin reason', () => {
    const io = makeIo();

    emitHostChanged(io, 'ABC234', { hostId: 'p1', hostName: 'Alice', reason: 'standin' });

    expect(io.sent).toHaveLength(1);
    const [msg] = io.sent;
    expect(msg.event).toBe('host_changed');
    expect(msg.target).toBe('ABC234');
    expect(msg.payload).toEqual({ hostId: 'p1', hostName: 'Alice', reason: 'standin' });
  });

  it('carries the reclaimed reason when host reverts to the owner', () => {
    const io = makeIo();

    emitHostChanged(io, 'ABC234', { hostId: 'owner', hostName: 'Bob', reason: 'reclaimed' });

    expect(io.sent).toHaveLength(1);
    expect(io.sent[0].payload.reason).toBe('reclaimed');
    expect(io.sent[0].payload.hostName).toBe('Bob');
  });

  it('is a no-op when the host id or name is missing (never emits an empty toast)', () => {
    const io = makeIo();

    emitHostChanged(io, 'ABC234', { hostId: 'p1' });            // no name
    emitHostChanged(io, 'ABC234', { hostName: 'Alice' });       // no id
    emitHostChanged(io, null, { hostId: 'p1', hostName: 'Alice' }); // no room

    expect(io.sent).toHaveLength(0);
  });
});
