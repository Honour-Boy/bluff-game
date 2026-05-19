// ============================================================
// HANDLERS — authenticate + update_username
// ============================================================

const crypto = require('node:crypto');
const { supabase } = require('../lib/supabaseClient');
const { rooms, saveRoom } = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const {
  sanitizeGuestUsername,
  isValidGuestId,
  applyUsernameToRooms,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
} = require('../lib/guestAuth');

function register(io, socket) {
  // ─── AUTHENTICATE socket with Supabase JWT or guest ──────
  // Must be called once after connecting, before any game events.
  socket.on('authenticate', async ({ token, guest } = {}, callback) => {
    // Guest path — typed username, no Supabase verification.
    if (!token && guest && typeof guest === 'object') {
      const cleanUsername = sanitizeGuestUsername(guest.username);
      if (!cleanUsername) {
        return callback?.({
          success: false,
          error: `Display name must be ${GUEST_USERNAME_MIN}-${GUEST_USERNAME_MAX} characters`,
        });
      }

      const guestId = isValidGuestId(guest.guestId)
        ? guest.guestId
        : crypto.randomUUID();

      socket.userId   = `${GUEST_USER_PREFIX}${guestId}`;
      socket.username = cleanUsername;
      socket.isGuest  = true;

      return callback?.({
        success: true,
        guest: true,
        guestId,
        username: cleanUsername,
      });
    }

    if (!token) return callback?.({ success: false, error: 'No token provided' });

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return callback?.({ success: false, error: 'Invalid or expired token' });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();

      socket.userId   = data.user.id;
      socket.isGuest  = false;
      socket.username = profile?.username
        || data.user.user_metadata?.username
        || data.user.user_metadata?.full_name
        || data.user.email?.split('@')[0]
        || 'Player';

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: 'Authentication failed' });
    }
  });

  // ─── Sync display username after a profile rename ────────
  socket.on('update_username', async (_payload, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      if (socket.isGuest) return callback?.({ success: false, error: 'Guests cannot rename mid-session' });

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', socket.userId)
        .single();

      if (profileError) return callback?.({ success: false, error: 'Profile lookup failed' });
      const next = profile?.username;
      if (!next) return callback?.({ success: false, error: 'Profile lookup failed' });

      const previous = socket.username;
      socket.username = next;

      const affectedCodes = applyUsernameToRooms(rooms, socket.userId, next);
      for (const code of affectedCodes) {
        const room = rooms.get(code);
        if (!room) continue;
        await saveRoom(room);
        await broadcastRoomState(io, code);
      }

      callback?.({ success: true, username: next, previous });
    } catch (err) {
      console.error('[update_username]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
