// ============================================================
// SOCKET LIB — Room broadcasting + power-card event fanout
// ============================================================

const engine = require('../gameEngine');
const { getRoom } = require('./state');

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

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

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
  broadcastRoomState,
};
