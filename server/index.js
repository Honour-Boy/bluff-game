// ============================================================
// SERVER ENTRY — Express + Socket.IO
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { registerSocketHandlers, rooms } = require('./socketHandlers');

const PORT = process.env.PORT || 3001;

// ─── CORS origin resolution ──────────────────────────────────
// Hard-fail at boot if running in production without an explicit
// CLIENT_URL. Falling back to '*' on a deployed server is a real
// footgun — every origin gets to talk to the game and Socket.IO.
//
// Dev convenience: defaults to '*' only when NODE_ENV !== 'production'.
const isProd = process.env.NODE_ENV === 'production';
let corsOrigin = process.env.CLIENT_URL;
if (!corsOrigin) {
  if (isProd) {
    console.error('[FATAL] CLIENT_URL is required in production. Set it to the deployed client URL (e.g. https://bluff.example.com).');
    process.exit(1);
  }
  corsOrigin = '*';
  console.warn('[cors] CLIENT_URL not set — falling back to "*" (development only).');
}
// Allow comma-separated list, e.g. "https://app.com,https://staging.app.com"
const allowedOrigins = corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ─── Health check / room info endpoints ─────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size }));

app.get('/room/:code', (req, res) => {
  const room = rooms.get(req.params.code?.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ code: room.code, phase: room.phase, playerCount: room.players.length });
});

// ─── HTTP + Socket.IO server ─────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

server.listen(PORT, () => {
  console.log(`🎮 Bluff Game Server running on port ${PORT} (cors origin: ${corsOrigin})`);
});
