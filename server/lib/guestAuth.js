// ============================================================
// SOCKET LIB — Guest-auth helpers + username sync
// ============================================================
// Anonymous players join with a typed display name. Their
// `socket.userId` is `guest:<uuid>` so the prefix lets server logic
// cheaply distinguish guests from authenticated Supabase users.

const GUEST_USER_PREFIX = 'guest:';
const GUEST_USERNAME_MIN = 4;
const GUEST_USERNAME_MAX = 20;

/**
 * Sanitise a typed guest display name.
 *  - Strips control chars / HTML / zero-width / emojis (anything
 *    outside letters / numbers / space / `_` / `.` / `-`).
 *  - Trims and clamps to GUEST_USERNAME_MAX.
 *  - Returns null if the result is shorter than GUEST_USERNAME_MIN.
 */
function sanitizeGuestUsername(raw) {
  const cleaned = String(raw || '')
    .replace(/[^\p{L}\p{N}\s_.\-]/gu, '')
    .trim()
    .slice(0, GUEST_USERNAME_MAX);
  if (cleaned.length < GUEST_USERNAME_MIN) return null;
  return cleaned;
}

/**
 * Validate a client-supplied guestId. We don't trust raw input — a
 * malicious client could send a UUID that collides with a real
 * Supabase user id (or an existing guest's id). The check below
 * accepts only RFC-4122 hex UUIDs.
 */
function isValidGuestId(id) {
  return typeof id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Walk every room in the in-memory store and update the player
 * matching `userId` to the new username. Returns the room codes
 * that actually changed (so the caller can decide which rooms to
 * re-broadcast). Pure side-effect on the player rows; no I/O.
 */
function applyUsernameToRooms(rooms, userId, nextUsername) {
  const affected = [];
  for (const [code, room] of rooms.entries()) {
    const player = room.players.find(p => p.id === userId);
    if (!player) continue;
    if (player.username === nextUsername) continue;
    player.username = nextUsername;
    affected.push(code);
  }
  return affected;
}

module.exports = {
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
  sanitizeGuestUsername,
  isValidGuestId,
  applyUsernameToRooms,
};
