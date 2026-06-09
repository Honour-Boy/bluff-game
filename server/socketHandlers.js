// ============================================================
// SOCKET HANDLERS — Orchestrator + test-surface shim (#105 PR B)
// ============================================================
// All socket-event logic now lives under server/handlers/*.js. The
// helpers and orchestration moved to server/lib/*.js. This module
// keeps its historical name and exports so every consumer (index.js
// + 19 test files) keeps working with zero import changes.
//
// `registerSocketHandlers(io, socket, deps)` is the one entry point —
// it wires up each topical handler module against the live `io` /
// `socket` pair, plus an optional `deps` override for tests.

const {
  defaultGroupsRepo,
  defaultGroupSettingsRepo,
  defaultLeaderboardRepo,
  defaultXpRepo,
  defaultCosmeticsRepo,
} = require('./lib/supabaseClient');
const {
  rooms,
} = require('./lib/state');
const {
  sanitizeGuestUsername,
  isValidGuestId,
  applyUsernameToRooms,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
} = require('./lib/guestAuth');
const {
  startInactivitySweep,
  stopInactivitySweep,
  startHostIdleSweep,
  stopHostIdleSweep,
  classifyLobbyIdle,
  bumpLobbyHostActivity,
  HOST_IDLE_WARNING_MS,
  HOST_IDLE_ACTION_MS,
  INACTIVITY_THRESHOLD_MS,
} = require('./lib/idleSweep');

const authHandlers = require('./handlers/auth');
const groupsHandlers = require('./handlers/groups');
const roomHandlers = require('./handlers/room');
const gameHandlers = require('./handlers/game');
const bluffHandlers = require('./handlers/bluff');
const roleHandlers = require('./handlers/roles');
const systemsHandlers = require('./handlers/systems');
const chatHandlers = require('./handlers/chat');
const voiceHandlers = require('./handlers/voice');
const disconnectHandlers = require('./handlers/disconnect');
const cosmeticsHandlers = require('./handlers/cosmetics');

function registerSocketHandlers(io, socket, deps = {}) {
  const ctx = {
    groupsRepo: deps.groupsRepo || defaultGroupsRepo,
    groupSettingsRepo: deps.groupSettingsRepo || defaultGroupSettingsRepo,
    leaderboardRepo: deps.leaderboardRepo || defaultLeaderboardRepo,
    xpRepo: deps.xpRepo || defaultXpRepo,
    cosmeticsRepo: deps.cosmeticsRepo || defaultCosmeticsRepo,
  };

  // Idempotent: runs once on first connection, no-ops thereafter.
  startInactivitySweep(io);
  startHostIdleSweep(io);

  // Issue #50: any application-level packet from a host who's in lobby
  // counts as activity. Bumps the per-room timestamp + cancels a
  // pending warning. Heartbeats live below socket.use, so they don't
  // false-positive here. Guarded for the mock sockets unit tests use.
  if (typeof socket.use === 'function') {
    socket.use((packet, next) => {
      bumpLobbyHostActivity(io, socket);
      next();
    });
  }

  authHandlers.register(io, socket, ctx);
  groupsHandlers.register(io, socket, ctx);
  roomHandlers.register(io, socket, ctx);
  gameHandlers.register(io, socket, ctx);
  bluffHandlers.register(io, socket, ctx);
  roleHandlers.register(io, socket, ctx);
  systemsHandlers.register(io, socket, ctx);
  chatHandlers.register(io, socket, ctx);
  voiceHandlers.register(io, socket, ctx);
  disconnectHandlers.register(io, socket, ctx);
  cosmeticsHandlers.register(io, socket, ctx);
}

module.exports = {
  registerSocketHandlers,
  rooms,
  // Exposed for unit tests + clarity. Treat as internal.
  sanitizeGuestUsername,
  isValidGuestId,
  applyUsernameToRooms,
  startInactivitySweep,
  stopInactivitySweep,
  startHostIdleSweep,
  stopHostIdleSweep,
  classifyLobbyIdle,
  HOST_IDLE_WARNING_MS,
  HOST_IDLE_ACTION_MS,
  INACTIVITY_THRESHOLD_MS,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
};
