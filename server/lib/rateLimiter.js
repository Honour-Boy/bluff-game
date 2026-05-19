// ─── Per-socket rolling-window rate limiter ──────────────────
// Stores hit timestamps on `socket._rateLimits[key]` (plain array).
// No external state; cleaned up automatically when the socket
// disconnects because the socket object is GC'd with it.
//
// Usage:
//   const { allowed } = socketRateLimit(socket, 'join_room', 10, 60_000);
//   if (!allowed) return callback?.({ success: false, error: 'Rate limit exceeded' });

function socketRateLimit(socket, key, max, windowMs) {
  const now = Date.now();
  if (!socket._rateLimits) socket._rateLimits = {};
  socket._rateLimits[key] = (socket._rateLimits[key] || []).filter(t => now - t < windowMs);
  if (socket._rateLimits[key].length >= max) {
    return { allowed: false };
  }
  socket._rateLimits[key].push(now);
  return { allowed: true };
}

module.exports = { socketRateLimit };
