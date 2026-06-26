// ============================================================
// SERVER ENTRY - Express + Socket.IO
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { registerSocketHandlers, rooms } = require('./socketHandlers');
const { makeOriginAllow } = require('./lib/corsOrigins');

const PORT = process.env.PORT || 3001;

// ─── CORS origin resolution ──────────────────────────────────
// Hard-fail at boot if running in production without an explicit
// CLIENT_URL. Falling back to '*' on a deployed server is a real
// footgun - every origin gets to talk to the game and Socket.IO.
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
  console.warn('[cors] CLIENT_URL not set - falling back to "*" (development only).');
}
// CLIENT_URL is a comma-separated EXACT allow-list, e.g.
//   "https://app.com,https://staging.app.com".
// PREVIEW_ORIGIN_REGEX (optional) additionally allows any origin matching a
// pattern - used on the staging box (Railway) so dynamic Vercel preview URLs
// (https://bluff-game-<hash>-<scope>.vercel.app) pass without a redeploy. Anchor
// it to your project+scope, e.g.
//   ^https://bluff-game-[a-z0-9-]+-honour-boys-projects\.vercel\.app$
const previewOriginRegex = process.env.PREVIEW_ORIGIN_REGEX || null;
const originAllowed = makeOriginAllow({ clientUrl: corsOrigin, previewRegex: previewOriginRegex });
// Express/Socket.IO origin callback form: (origin, cb) => cb(err, allow).
const corsOriginFn = (origin, cb) => cb(null, originAllowed(origin));

const app = express();
app.use(cors({ origin: corsOriginFn }));
app.use(express.json());

// ─── Health check / room info endpoints ─────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size }));

// §2.1 - lightweight keepalive endpoint for an EXTERNAL uptime pinger (e.g. a
// cron-job.org / UptimeRobot hit every few minutes). Cheap and side-effect free;
// complements the in-process WebSocket heartbeat below.
app.get('/keepalive', (_, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'awake',
    uptimeSec: Math.round(process.uptime()),
    rooms: rooms.size,
    sockets: io?.engine?.clientsCount ?? 0,
    rssMb: Math.round(mem.rss / 1048576),
  });
});

app.get('/room/:code',
  rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }),
  (req, res) => {
    const room = rooms.get(req.params.code?.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ code: room.code, phase: room.phase, playerCount: room.players.length });
  }
);

// ─── HTTP + Socket.IO server ─────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOriginFn, methods: ['GET', 'POST'] },
  // §2.1 - aggressive heartbeat. A shorter ping interval keeps a steady stream
  // of WebSocket ping/pong frames flowing so idle-detection on free-tier hosts
  // (Render et al.) is far less likely to flag the container as inactive and
  // spin it down mid-session. pingTimeout stays comfortably above the interval
  // so a single slow round-trip doesn't drop a live player.
  pingInterval: 15000,
  pingTimeout: 20000,
});

// ─── Per-IP connection rate limiting ────────────────────────
// Tracks new connections per IP over a 60-second rolling window.
// IPs that exceed 10 new connections are refused immediately and
// the socket is disconnected with an error event - the socket
// object already exists at this point so we use socket.disconnect
// rather than preventing the TCP handshake.
const ipConnectTimestamps = new Map();

function isConnectionAllowed(ip) {
  const now = Date.now();
  const times = (ipConnectTimestamps.get(ip) || []).filter(t => now - t < 60_000);
  if (times.length >= 10) return false;
  times.push(now);
  ipConnectTimestamps.set(ip, times);
  return true;
}

// Purge stale IP entries every 5 minutes to prevent unbounded growth.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, times] of ipConnectTimestamps) {
    if (times.every(t => t < cutoff)) ipConnectTimestamps.delete(ip);
  }
}, 5 * 60_000);

io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
    || socket.handshake.address;
  if (!isConnectionAllowed(ip)) {
    socket.emit('error', { message: 'Too many connections from your address. Try again shortly.' });
    socket.disconnect(true);
    return;
  }
  console.log(`[Socket] Connected: ${socket.id}`);

  // §2.1 - per-socket error boundary. A throw inside one socket's handler
  // registration (or a later listener) must never take the whole process down
  // and strand every other room. Log it verbosely with context and move on.
  socket.on('error', (err) => {
    console.error(`[Socket ${socket.id}] socket error:`, err?.message || err);
  });

  // §2.1 - application-level keepalive ack. The client echoes our heartbeat,
  // producing a steady trickle of INBOUND traffic on top of the engine-level
  // pong - extra insurance that the host sees the container as active.
  socket.on('client_keepalive', () => {
    socket.emit('server_keepalive_ack', { t: Date.now() });
  });

  try {
    registerSocketHandlers(io, socket);
  } catch (err) {
    console.error(`[Socket ${socket.id}] handler registration failed:`, err);
    socket.emit('error', { message: 'Server error initialising your session.' });
  }
});

// §2.1 - in-process WebSocket keepalive. Emits a tiny heartbeat to every
// connected client on a short interval. Combined with the shortened
// pingInterval above, this keeps both directions of the socket busy so the
// platform's idle watchdog doesn't spin the instance down during a live game.
const KEEPALIVE_INTERVAL_MS = 20_000;
const keepaliveHandle = setInterval(() => {
  const clients = io?.engine?.clientsCount ?? 0;
  if (clients > 0) io.emit('server_keepalive', { t: Date.now() });
}, KEEPALIVE_INTERVAL_MS);
if (typeof keepaliveHandle.unref === 'function') keepaliveHandle.unref();

// §2.1 - verbose runtime diagnostics. Periodically snapshot memory + room/socket
// counts so a stall has a breadcrumb trail right up to the moment it happens,
// and shout loudly on a sudden RSS spike (a common precursor to an OOM stall).
const DIAGNOSTICS_INTERVAL_MS = 30_000;
const RSS_SPIKE_RATIO = 1.4;
let lastRssMb = 0;
const diagnosticsHandle = setInterval(() => {
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1048576);
  const heapMb = Math.round(mem.heapUsed / 1048576);
  const clients = io?.engine?.clientsCount ?? 0;
  console.log(`[diag] rss=${rssMb}MB heap=${heapMb}MB rooms=${rooms.size} sockets=${clients} uptime=${Math.round(process.uptime())}s`);
  if (lastRssMb > 0 && rssMb > lastRssMb * RSS_SPIKE_RATIO) {
    console.error(`[diag] ⚠️ MEMORY SPIKE: rss ${lastRssMb}MB → ${rssMb}MB (rooms=${rooms.size}, sockets=${clients}). Possible leak / stall precursor.`);
  }
  lastRssMb = rssMb;
}, DIAGNOSTICS_INTERVAL_MS);
if (typeof diagnosticsHandle.unref === 'function') diagnosticsHandle.unref();

// §2.1 - process-level error boundaries. We log with full context (and memory)
// rather than exiting: the goal is to capture exactly what the runtime looked
// like just before a stall, and to keep serving the other live rooms. An
// unhandled rejection or stray throw in one async path should not silently kill
// the server with no trace.
process.on('unhandledRejection', (reason, promise) => {
  const mem = process.memoryUsage();
  console.error('[unhandledRejection]', reason);
  console.error(`[unhandledRejection] context: rooms=${rooms.size} sockets=${io?.engine?.clientsCount ?? 0} rss=${Math.round(mem.rss / 1048576)}MB`, promise);
});
process.on('uncaughtException', (err) => {
  const mem = process.memoryUsage();
  console.error('[uncaughtException]', err);
  console.error(`[uncaughtException] context: rooms=${rooms.size} sockets=${io?.engine?.clientsCount ?? 0} rss=${Math.round(mem.rss / 1048576)}MB`);
});

server.listen(PORT, () => {
  console.log(`🎮 Bluff Game Server running on port ${PORT} (cors origin: ${corsOrigin}${previewOriginRegex ? ` | preview regex: ${previewOriginRegex}` : ''})`);
  console.log(`[diag] keepalive every ${KEEPALIVE_INTERVAL_MS / 1000}s, diagnostics every ${DIAGNOSTICS_INTERVAL_MS / 1000}s, socket ping every 15s`);
});
