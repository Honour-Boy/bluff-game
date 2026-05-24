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

// v2 Phase G — pre-game selection (#116). One handle per room covers
// the role-reveal delay then the 15s selection auto-resolve (only one
// is ever pending at a time). Cleared early when all players confirm.
const pregameTimers = new Map();    // roomCode → setTimeout handle

// §1.1 — bluff interception window. One 8s handle per room while an accused
// decides whether to arm a defensive card in response to a bluff; on expiry
// the bluff resolves with no interception. Cleared early on arm/pass/leave.
const bluffInterceptTimers = new Map();  // roomCode → setTimeout handle

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
function _clearPreGameTimer(code) {
  const t = pregameTimers.get(code);
  if (t) { clearTimeout(t); pregameTimers.delete(code); }
}
function _clearBluffInterceptTimer(code) {
  const t = bluffInterceptTimers.get(code);
  if (t) { clearTimeout(t); bluffInterceptTimers.delete(code); }
}

// §2.1 — verbose, single-line structured logging for every room teardown so
// "Room not found" reports can be traced to an explicit cause (cleanup sweep,
// host-grace expiry, last participant out, idle dismiss). `reason` is a stable
// code; `detail` carries context (phase, player counts, idle ms).
function logRoomDeletion(code, reason, detail = {}) {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[room-gc] DELETE ${code} reason=${reason}${parts ? ' ' + parts : ''}`);
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
  pregameTimers,
  bluffInterceptTimers,
  hostDisconnectTimers,
  playerDisconnectTimers,
  dcKey,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
  _clearBluffInterceptTimer,
  logRoomDeletion,
  getRoom,
  saveRoom,
};
