// ============================================================
// SOCKET LIB — Single-active-session registry (one device at a time)
// ============================================================
// Enforces the owner's "one active session per account" policy. Supabase
// happily issues sessions to many devices and revoking a refresh token
// doesn't kill a live socket, so the Socket.IO server is the real-time
// authority — this registry IS that authority.
//
// Policy (owner decision 2026-06-15):
//   • Same physical device (refresh / tab, matched by deviceId) → replace
//     silently; the old socket gets force_logout.
//   • A DIFFERENT live device → the new login is NOT silently kicked through;
//     resolveLogin reports `session_active_elsewhere` with the active device's
//     name so the new device can show a takeover screen. The user confirms,
//     the new device re-attempts with `takeover: true`, and the old device is
//     force-logged-out. Only ONE device is ever active at a time.
//   • Old socket already gone (stale entry) → cleaned; the new login proceeds.
//   • Sign-out clears the entry (handlers/auth.js `sign_out`) so a logged-out
//     account is never seen as still signed in.
//
// Guests are EXEMPT: their identity lives in one browser's storage, there is
// no account to contest, and the auth handler's guest branch returns before
// this gate is reached. resolveLogin is only ever called with real user ids.

// userId → { socketId, deviceId, deviceName, username, authedAt }. One entry
// per account — that single-entry invariant IS the policy.
const sessions = new Map();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A persistent per-device id from the client. Anything not a UUID (an old
// client, or a tampered value) is rejected so it can't be used to forge a
// "same device" match and skip the takeover screen.
function isValidDeviceId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// Normalise the client-supplied deviceId. A missing/invalid id degrades to a
// unique-per-connection synthetic (the socket id) — such a login can still be
// taken over, but can never impersonate another device's id to bypass the
// takeover screen.
function deviceIdFor(rawDeviceId, socketId) {
  return isValidDeviceId(rawDeviceId) ? rawDeviceId : `conn:${socketId}`;
}

// A human-readable device label from the client (e.g. "Chrome on Windows").
// Untrusted input — strip angle brackets + control chars, collapse whitespace,
// clamp length. Returns null when nothing usable remains.
function sanitizeDeviceName(raw) {
  const cleaned = String(raw || '')
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || null;
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

// Is this account currently occupying a seat in ANY room? A player present in
// room.players counts (any phase, lobby included). There is no reconnection
// grace (PR #234) so a seat present here implies a connected socket.
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
// player's own stale entry in the very room they're joining) and dead sockets
// both return false, so normal reconnect flows are untouched. `exceptCode`
// skips one room — pass the room being (re)joined so a player's own stale-but-
// live seat in that very room (e.g. the ~250ms before an evicted socket
// finishes disconnecting) never blocks their legitimate rejoin.
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
//   { ok: false, reason: 'session_active_elsewhere', activeDevice } — a
//        DIFFERENT live device holds the account; the new device must show the
//        user a takeover screen (it names `activeDevice`) and re-attempt with
//        `takeover: true` to evict it.
//
// ONE active session at a time: rather than silently kicking the old device, a
// contested login is surfaced so the user can SEE the other device and choose
// to log it out. Same physical device (refresh / tab) replaces silently; a
// dead old socket is cleaned and the new login proceeds. `takeover` (set after
// the user confirms) evicts the old device unconditionally.
//
// `io` verifies whether the previously-registered socket is still alive (a TCP
// corpse that hasn't been reaped shouldn't block the user behind a takeover
// screen for a device that's already gone).
function resolveLogin(io, rooms, { userId, deviceId, socketId, takeover = false }) {
  const existing = sessions.get(userId);

  // No prior session → clean proceed.
  if (!existing) return { ok: true, evicted: null };

  // THE SAME socket re-authenticating (the client authenticates on `connect`
  // AND again when the auth identity settles, plus React strict-mode double
  // effects) — there is nothing to evict, and we must NEVER force_logout the
  // very socket asking. Without this guard a re-auth self-evicts and the user
  // is logged out for no reason. This is checked before the deviceId branch.
  if (existing.socketId === socketId) {
    return { ok: true, evicted: null };
  }

  // Same device, different socket (a new tab, or a reconnect that minted a new
  // socket id): replace silently, evicting the old socket (newest wins; a dead
  // old socket is a harmless no-op emit).
  if (existing.deviceId === deviceId) {
    return { ok: true, evicted: existing.socketId };
  }

  // Different device. If the old socket is already gone, just clean the entry.
  const oldLive = !!io?.sockets?.sockets?.get?.(existing.socketId);
  if (!oldLive) {
    sessions.delete(userId);
    return { ok: true, evicted: null };
  }

  // Different LIVE device. The user has explicitly chosen to take over → evict.
  if (takeover) return { ok: true, evicted: existing.socketId };

  // Otherwise surface the conflict so the new device can name the active one.
  return {
    ok: false,
    reason: 'session_active_elsewhere',
    activeDevice: { name: existing.deviceName || 'Another device', since: existing.authedAt },
  };
}

function registerSession(userId, { socketId, deviceId, deviceName, username }) {
  sessions.set(userId, {
    socketId,
    deviceId,
    deviceName: deviceName || null,
    username,
    authedAt: Date.now(),
  });
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
  sanitizeDeviceName,
  getSession,
  isSeated,
  seatedElsewhere,
  resolveLogin,
  registerSession,
  clearSession,
  _reset,
};
