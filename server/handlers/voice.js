// ============================================================
// HANDLERS - Voice (LiveKit token minting)
// ============================================================
// Returns a JWT scoped to the LiveKit room `bluff:<roomCode>`. The
// caller must already be authenticated AND a member of the game room.

const { AccessToken } = require('livekit-server-sdk');
const { getRoom } = require('../lib/state');

function register(io, socket) {
  socket.on('request_voice_token', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        return callback?.({ success: false, error: 'Voice not configured on server' });
      }

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const isPlayer = room.players.some(p => p.id === socket.userId);
      const isHost = room.hostUserId === socket.userId;
      if (!isPlayer && !isHost) {
        return callback?.({ success: false, error: 'Not a member of this room' });
      }

      const livekitRoom = `bluff:${code}`;
      const at = new AccessToken(apiKey, apiSecret, {
        identity: socket.userId,
        name: socket.username || 'Player',
        ttl: 60 * 60,
      });
      at.addGrant({
        room: livekitRoom,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });

      const token = await at.toJwt();
      callback?.({ success: true, token, livekitRoom });
    } catch (err) {
      console.error('[request_voice_token]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
