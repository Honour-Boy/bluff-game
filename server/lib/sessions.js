// ============================================================
// SOCKET LIB — Single-device session registry (one account, one device)
// ============================================================
// Enforces the owner's "one account, one live device" policy. Supabase
// happily issues sessions to many devices and revoking a refresh token
// doesn't kill a live socket, so the Socket.IO server is the real-time
// authority — this registry IS that authority.
//
// Policy (see docs/single-device-session.md §1):
//   • Old device idle (not seated in any room)  → last-login-wins: evict it.
//   • Old device seated in a room (any phase)    → REFUSE the new login.
//   • Same physical device (refresh/tab/reconnect, matched by deviceId)
//                                                → always replace silently.
//   • Old socket already gone                    → proceed, clean the entry.
//
// Guests are EXEMPT: their identity lives in one browser's storage, there
// is no account to contest, and the auth handler's guest branch returns
// before this gate is ever reached. resolveLogin is only ever called with
// real Supabase user ids.

// userId → { socketId, deviceId, username, authedAt }. One entry per
// account — that single-entry invariant IS the policy.
const sessions = new Map();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A persistent per-device id from the client. Anything not a UUID (an old
// client, or a tampered value) is rejected so it can't be used to forge a
// "same device" match and bypass the in-room refusal.
function isValidDeviceId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// Normalise the client-supplied deviceId. A missing/invalid id degrades to
// a unique-per-connection synthetic (the socket id) — such a login can still
// be evicted by last-login-wins, but can never impersonate another device's
// id to dodge the seated-elsewhere refusal.
function deviceIdFor(rawDeviceId, socketId) {
  return isValidDeviceId(rawDeviceId) ? rawDeviceId : `conn:${socketId}`;
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

// Is this account currently occupying a seat in ANY room? A player present
// in room.players counts (any phase, lobby included — the owner said
// "game/room"). There is no reconnection grace (PR #234) so a seat present
// here implies a currently-connected socket.
function isSeated(rooms, userId) {
  if (!rooms || typeof rooms.values !== 'function') return false;
  for (const room of rooms.values()) {
    if (room?.players?.some((p) => p.id === userId)) return true;
  }
  return false;
}

// Defense-in-depth (§3.6): is this account seated somewhere via a DIFFERENT,
// still-live socket than the one acting now? Used at seat-creation
// (create/join) so the same account can never hold two seats — even if the
// authenticate gate were ever bypassed. A same-socket rejoin (e.g. the
// player's own stale entry in the very room they're joining) and dead
// sockets both return false, so normal reconnect flows are untouched.
// `exceptCode` skips one room — pass the room being (re)joined so a player's
// own stale-but-live seat in that very room (e.g. the ~250ms before an evicted
// socket finishes disconnecting on a same-device refresh) never blocks their
// legitimate rejoin. They can still be refused for a seat in any OTHER room.
function seatedElsewhere(io, rooms, userId, socketId, exceptCode = null) {
  if (!rooms || typeof rooms.entries !== 'function') return false;
  for (const [code, room] of rooms.entries()) {
    if (exceptCode && code === exceptCode) continue;
    for (const p of room?.players || []) {
      if (p.id !== userId) continue;
      if (!p.socketId || p.socketId === socketId) continue;
      if (io?.sockets?.sockets?.get?.(p.socketId)) return true;
    }
  }
  return false;
}

// Decide the fate of a fresh authenticated login. Returns one of:
//   { ok: true,  evicted: null }        — no contest, or stale entry cleaned.
//   { ok: true,  evicted: oldSocketId } — caller force-logs-out the old socket.
//   { ok: false, reason: 'account_in_room' } — old device seated → refuse.
//
// `io` is used only to verify whether the previously-registered socket is
// still alive (a TCP corpse that hasn't been reaped shouldn't lock the user
// out forever).
function resolveLogin(io, rooms, { userId, deviceId, socketId }) {
  const existing = sessions.get(userId);

  // No prior session → clean proceed.
  if (!existing) return { ok: true, evicted: null };

  // Same device (or the user is just replacing their own session) → always
  // allowed; evict whatever socket the entry points at (covers two tabs:
  // newest wins, older tab gets the force_logout).
  if (existing.deviceId === deviceId) {
    return { ok: true, evicted: existing.socketId };
  }

  // Different device. Is the old socket even still alive?
  const oldLive = !!io?.sockets?.sockets?.get?.(existing.socketId);
  if (!oldLive) {
    // Corpse — drop it and let the new device in.
    sessions.delete(userId);
    return { ok: true, evicted: null };
  }

  // Old device is live AND seated in a room → the new login can't disturb it.
  if (isSeated(rooms, userId)) {
    return { ok: false, reason: 'account_in_room' };
  }

  // Old device live but idle → last-login-wins.
  return { ok: true, evicted: existing.socketId };
}

function registerSession(userId, { socketId, deviceId, username }) {
  sessions.set(userId, { socketId, deviceId, username, authedAt: Date.now() });
}

// Clear ONLY if the entry still points at this socket. A late `disconnect`
// from a socket we already evicted must not wipe the new session that
// replaced it.
function clearSession(userId, socketId) {
  if (!userId) return;
  const existing = sessions.get(userId);
  if (existing && existing.socketId === socketId) sessions.delete(userId);
}

// Test-only: wipe the registry between cases.
function _reset() {
  sessions.clear();
}

module.exports = {
  sessions,
  isValidDeviceId,
  deviceIdFor,
  getSession,
  isSeated,
  seatedElsewhere,
  resolveLogin,
  registerSession,
  clearSession,
  _reset,
};
