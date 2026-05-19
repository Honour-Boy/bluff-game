// ============================================================
// SOCKET LIB — Shared in-memory state singletons
// ============================================================
// `rooms` is the single source of truth; every other lib/handler
// module gets the same Map instance by `require('./state').rooms`.
// Timer registries live here too so cleanup paths (disconnect,
// inactivity sweep, idle dismiss) can clear them from anywhere.

const rooms = new Map();

// v2 Phase F — system timer registries.
// 10s betting + 15s ghost-vote windows are server-side.
const bettingTimers = new Map();    // roomCode → setTimeout handle
const ghostVoteTimers = new Map();  // roomCode → setTimeout handle

// Host / player disconnect grace timers.
const hostDisconnectTimers = new Map();
// Player disconnect timers must be visible across socket connections —
// reconnect arrives on a NEW socket and needs to cancel the OLD socket's
// elimination timer. Key: `${roomCode}:${playerId}`.
const playerDisconnectTimers = new Map();
const dcKey = (code, playerId) => `${code}:${playerId}`;

function _clearBettingTimer(code) {
  const t = bettingTimers.get(code);
  if (t) { clearTimeout(t); bettingTimers.delete(code); }
}
function _clearGhostVoteTimer(code) {
  const t = ghostVoteTimers.get(code);
  if (t) { clearTimeout(t); ghostVoteTimers.delete(code); }
}

async function getRoom(code) {
  return rooms.get(code) || null;
}

async function saveRoom(room) {
  // Stamp every accepted mutation so the inactivity sweep can tell
  // a live room from a zombie.
  room.lastActivityAt = Date.now();
  rooms.set(room.code, room);
}

module.exports = {
  rooms,
  bettingTimers,
  ghostVoteTimers,
  hostDisconnectTimers,
  playerDisconnectTimers,
  dcKey,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  getRoom,
  saveRoom,
};
