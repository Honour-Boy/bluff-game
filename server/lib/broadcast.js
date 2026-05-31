// ============================================================
// SOCKET LIB — Room broadcasting + power-card event fanout
// ============================================================

const engine = require('../gameEngine');
const { getRoom } = require('./state');
const { armSpeedModeTimer } = require('./speedMode');

/**
 * Fan out the bluff-pipeline's announce events to every socket in
 * the room as `power_card_triggered`. The client listens for this
 * and renders a full-screen <AnnouncementBanner /> per event.
 */
function emitPowerCardEvents(io, roomCode, events) {
  if (!events || events.length === 0) return;
  for (const evt of events) {
    io.to(roomCode).emit('power_card_triggered', evt);
  }
}

/**
 * Tell every player in the room that the acting host changed — a group
 * stand-in was appointed (`reason: 'standin'`) or host was reclaimed /
 * handed back to the owner (`reason: 'reclaimed'`). Host *controls* still
 * follow room_state's `amHost`; this event only drives the toast (#183).
 */
function emitHostChanged(io, roomCode, { hostId, hostName, reason } = {}) {
  if (!roomCode || !hostId || !hostName) return;
  io.to(roomCode).emit('host_changed', { hostId, hostName, reason });
}

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  // Speed Mode (online) — arm / re-arm the per-turn countdown BEFORE serializing
  // so a turn change's freshly-stamped `room.speedModeDeadline` ships in THIS
  // push (serialize.js exposes `speedModeMsRemaining`). Torn down when the
  // modifier isn't in force or the room leaves the playing phase. On expiry the
  // timer auto-ends the active player's turn (no auto-spin — #79).
  armSpeedModeTimer(io, room);

  // §3.3 — push live pre-room occupancy to anyone watching this group's
  // directory (members are subscribed to `group:<id>` via list_my_groups /
  // get_group). Compact payload — no hands, just who's gathered and the phase.
  if (room.groupId) {
    const players = Array.isArray(room.players) ? room.players : [];
    io.to(`group:${room.groupId}`).emit('group_room_status', {
      groupId: room.groupId,
      code: room.code,
      playerCount: players.length,
      phase: room.phase,
      inLobby: room.phase === 'lobby',
      players: players.map(p => ({ id: p.id, username: p.username, status: p.status })),
    });
  }

  if (room.mode === engine.MODES.ONLINE) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const player = room.players.find(p => p.socketId === s.id);
      const playerId = player ? player.id : null;
      // Issue #81 — pass the per-socket spectator target so the
      // engine can attach `spectatedHand` + `currentPromptTarget`
      // gated to spectator callers only.
      const spectatingTargetId = s.data?.spectatingTargetId || null;
      s.emit('room_state', engine.serializeRoom(room, playerId, { spectatingTargetId }));
    }
  } else {
    io.to(roomCode).emit('room_state', engine.serializeRoom(room));
  }
}

module.exports = {
  emitPowerCardEvents,
  emitHostChanged,
  broadcastRoomState,
};
