// ============================================================
// SERVER ENTRY — Express + Socket.IO
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { registerSocketHandlers, rooms } = require('./socketHandlers');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: '*' }));
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
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

server.listen(PORT, () => {
  console.log(`🎮 Bluff Game Server running on port ${PORT}`);
});
