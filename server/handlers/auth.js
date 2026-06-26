// ============================================================
// HANDLERS — authenticate + update_username
// ============================================================

const crypto = require('node:crypto');
const { supabase } = require('../lib/supabaseClient');
const { rooms, saveRoom } = require('../lib/state');
const { socketRateLimit } = require('../lib/rateLimiter');
const { broadcastRoomState } = require('../lib/broadcast');
const {
  sanitizeGuestUsername,
  isValidGuestId,
  applyUsernameToRooms,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
} = require('../lib/guestAuth');
const {
  deviceIdFor,
  sanitizeDeviceName,
  resolveLogin,
  registerSession,
  clearSession,
} = require('../lib/sessions');

function register(io, socket) {
  // ─── AUTHENTICATE socket with Supabase JWT or guest ──────
  // Must be called once after connecting, before any game events.
  socket.on('authenticate', async ({ token, guest, deviceId, deviceName, takeover } = {}, callback) => {
    if (!socketRateLimit(socket, 'authenticate', 5, 10_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
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

      const userId = data.user.id;
      const username = profile?.username
        || data.user.user_metadata?.username
        || data.user.user_metadata?.full_name
        || data.user.email?.split('@')[0]
        || 'Player';

      // ── Single-active-session gate (one device at a time) ──────────
      // A different live device doesn't silently win OR silently lose: the new
      // device is told which device is active (`session_active_elsewhere`) so
      // it can show a takeover screen, and only takes over when the user
      // confirms (`takeover: true`). Same device → silent replace. Decide
      // BEFORE stamping socket.userId. See lib/sessions.js.
      const device = deviceIdFor(deviceId, socket.id);
      const cleanDeviceName = sanitizeDeviceName(deviceName);
      const verdict = resolveLogin(io, rooms, {
        userId, deviceId: device, socketId: socket.id, takeover: takeover === true,
      });
      if (!verdict.ok) {
        return callback?.({
          success: false,
          code: verdict.reason,            // 'session_active_elsewhere'
          activeDevice: verdict.activeDevice, // { name, since } for the screen
        });
      }
      if (verdict.evicted) {
        const old = io.sockets?.sockets?.get?.(verdict.evicted);
        if (old) {
          old.emit('force_logout', { reason: 'signed_in_elsewhere' });
          old.userId = null; // immediately dead to game events
          setTimeout(() => old.disconnect(true), 250); // let the event flush
        }
      }
      registerSession(userId, { socketId: socket.id, deviceId: device, deviceName: cleanDeviceName, username });

      socket.userId   = userId;
      socket.deviceId = device;
      socket.isGuest  = false;
      socket.username = username;

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: 'Authentication failed' });
    }
  });

  // ─── Sign out — release the single-active-session entry ──────────
  // A sign-out doesn't drop the socket (it stays connected on the landing /
  // auth screen), so without this the registry would keep showing the account
  // as signed-in on this device — making the NEXT login (even on the same or a
  // fresh device) see a phantom active session. clearSession is socketId-
  // matched, so it only releases THIS device's own entry.
  socket.on('sign_out', (_payload, callback) => {
    clearSession(socket.userId, socket.id);
    socket.userId = null;
    socket.deviceId = null;
    socket.isGuest = false;
    socket.username = null;
    callback?.({ success: true });
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
