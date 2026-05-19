// ============================================================
// HANDLERS — Chat (send_chat_message)
// ============================================================
// Rate-limited to 5 messages / 3s per socket. Stored in
// room.chatLog (capped at 50, broadcast in room_state for
// reconnect history) and emitted live via 'chat_message'.

const engine = require('../gameEngine');
const { getRoom, saveRoom } = require('../lib/state');

function register(io, socket) {
  socket.on('send_chat_message', async ({ roomCode, text } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const isMember = room.players.some(p => p.id === socket.userId) || room.hostUserId === socket.userId;
      if (!isMember) return callback?.({ success: false, error: 'Not a member of this room' });

      // Rate limit: rolling 3-second window, max 5 messages
      const now = Date.now();
      socket.chatTimestamps = (socket.chatTimestamps || []).filter(t => now - t < 3000);
      if (socket.chatTimestamps.length >= 5) {
        return callback?.({ success: false, error: 'Sending too fast — slow down' });
      }
      socket.chatTimestamps.push(now);

      const msg = engine.appendChatMessage(room, {
        userId: socket.userId,
        username: socket.username || 'Player',
        text,
      });
      if (!msg) return callback?.({ success: false, error: 'Empty message' });

      await saveRoom(room);
      io.to(code).emit('chat_message', msg);
      callback?.({ success: true, message: msg });
    } catch (err) {
      console.error('[send_chat_message]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
