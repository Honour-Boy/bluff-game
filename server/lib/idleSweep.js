// ============================================================
// SOCKET LIB — Inactivity sweep + lobby host-idle sweep
// ============================================================

const engine = require('../gameEngine');
const {
  rooms,
  hostDisconnectTimers,
  playerDisconnectTimers,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
  _clearSpinPendingTimer,
  _clearGameOverTimer,
  _clearSpeedModeTimer,
  logRoomDeletion,
  saveRoom,
} = require('./state');
const { broadcastRoomState } = require('./broadcast');

// ─── 45-minute generic inactivity sweep ──────────────────────
// Garbage-collect rooms nobody has touched in a while. A "touch" is
// any accepted mutation (saveRoom bumps `room.lastActivityAt`).
const INACTIVITY_THRESHOLD_MS = 45 * 60 * 1000;
const INACTIVITY_SWEEP_INTERVAL_MS = 60 * 1000;

let inactivitySweepHandle = null;

function startInactivitySweep(io) {
  if (inactivitySweepHandle) return;
  inactivitySweepHandle = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const last = room.lastActivityAt ?? room.createdAt ?? now;
      const idleMs = now - last;
      if (idleMs <= INACTIVITY_THRESHOLD_MS) continue;

      // §2.1 Retention Override — a persistent group room is protected from the
      // generic sweep while a session is still live: anyone seated, or a game
      // in progress, keeps it alive no matter how quiet the socket traffic has
      // been (a long Sniper/Medic deliberation can look "idle"). Only a fully
      // empty group room is collected; even then the next join rebuilds it from
      // the DB-backed group, so no settings/leaderboard are lost. Ad-hoc rooms
      // keep the original behaviour.
      if (room.groupId) {
        const hasParticipants = Array.isArray(room.players) && room.players.length > 0;
        const sessionLive = !['lobby', 'game_over'].includes(room.phase);
        if (hasParticipants || sessionLive) {
          continue;
        }
      }

      logRoomDeletion(code, 'inactivity_sweep', {
        idleMs,
        phase: room.phase,
        groupId: room.groupId || undefined,
        players: Array.isArray(room.players) ? room.players.length : 0,
      });
      io.to(code).emit('game_ended', {
        reason: 'Room closed after long inactivity.',
      });
      _clearBettingTimer(code);
      _clearGhostVoteTimer(code);
      _clearPreGameTimer(code);
      _clearSpinPendingTimer(code);
      _clearGameOverTimer(code);
      _clearSpeedModeTimer(code);
      const hostTimer = hostDisconnectTimers.get(code);
      if (hostTimer) {
        clearTimeout(hostTimer);
        hostDisconnectTimers.delete(code);
      }
      for (const [key, timer] of playerDisconnectTimers.entries()) {
        if (key.startsWith(`${code}:`)) {
          clearTimeout(timer);
          playerDisconnectTimers.delete(key);
        }
      }
      discardLobbyIdleState(code);
      rooms.delete(code);
    }
  }, INACTIVITY_SWEEP_INTERVAL_MS);
  if (typeof inactivitySweepHandle.unref === 'function') {
    inactivitySweepHandle.unref();
  }
}

function stopInactivitySweep() {
  if (inactivitySweepHandle) {
    clearInterval(inactivitySweepHandle);
    inactivitySweepHandle = null;
  }
}

// ─── Lobby host idle timeout (issue #50) ─────────────────────
const HOST_IDLE_WARNING_MS = 4 * 60 * 1000;
const HOST_IDLE_ACTION_MS  = 5 * 60 * 1000;
const HOST_IDLE_SWEEP_INTERVAL_MS = 30 * 1000;

const lobbyHostActivity = new Map();
const lobbyHostWarnedAt = new Map();

/**
 * Pure decision function — classifies what (if anything) should happen
 * for one lobby on this tick. Exported for testing without timer mocks.
 */
function classifyLobbyIdle(now, lastActivityMs, warnedAt, alivePlayerCount, {
  warningMs = HOST_IDLE_WARNING_MS,
  actionMs  = HOST_IDLE_ACTION_MS,
} = {}) {
  const idle = now - lastActivityMs;
  if (idle >= actionMs) {
    return alivePlayerCount >= 2 ? 'auto_start' : 'dismiss';
  }
  if (idle >= warningMs && warnedAt == null) return 'warn';
  return 'idle';
}

function discardLobbyIdleState(code) {
  lobbyHostActivity.delete(code);
  lobbyHostWarnedAt.delete(code);
}

/**
 * Bump the host-activity timestamp for every lobby this socket hosts,
 * and cancel any pending warning. Called from socket.use middleware.
 */
function bumpLobbyHostActivity(io, socket) {
  if (!socket.userId) return;
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.hostUserId !== socket.userId) continue;
    if (room.phase !== 'lobby') continue;
    lobbyHostActivity.set(code, now);
    if (lobbyHostWarnedAt.has(code)) {
      io.to(code).emit('lobby_idle_warning_cancelled');
      lobbyHostWarnedAt.delete(code);
    }
  }
}

let hostIdleSweepHandle = null;

function startHostIdleSweep(io) {
  if (hostIdleSweepHandle) return;
  hostIdleSweepHandle = setInterval(async () => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (room.phase !== 'lobby') {
        discardLobbyIdleState(code);
        continue;
      }
      const lastActivity = lobbyHostActivity.get(code) ?? room.createdAt ?? now;
      const warnedAt     = lobbyHostWarnedAt.get(code) ?? null;
      const alive        = room.players.filter(p => p.status === 'alive').length;
      const verdict      = classifyLobbyIdle(now, lastActivity, warnedAt, alive);

      if (verdict === 'warn') {
        const secondsUntilAction = Math.max(
          0,
          Math.ceil((HOST_IDLE_ACTION_MS - (now - lastActivity)) / 1000),
        );
        io.to(code).emit('lobby_idle_warning', {
          secondsUntilAction,
          willAutoStart: alive >= 2,
        });
        lobbyHostWarnedAt.set(code, now);
        continue;
      }

      if (verdict === 'auto_start') {
        try {
          await autoStartIdleLobby(io, room);
        } catch (err) {
          console.error(`[host_idle] auto-start failed for ${code}:`, err.message);
          await dismissIdleLobby(io, code, 'Could not auto-start. Lobby closed.');
        }
        discardLobbyIdleState(code);
        continue;
      }

      if (verdict === 'dismiss') {
        await dismissIdleLobby(io, code, 'Host idle — lobby closed.');
        discardLobbyIdleState(code);
        continue;
      }
    }
  }, HOST_IDLE_SWEEP_INTERVAL_MS);
  if (typeof hostIdleSweepHandle.unref === 'function') {
    hostIdleSweepHandle.unref();
  }
}

function stopHostIdleSweep() {
  if (hostIdleSweepHandle) {
    clearInterval(hostIdleSweepHandle);
    hostIdleSweepHandle = null;
  }
}

/**
 * Auto-start path for an idle lobby. Mirrors the user-driven
 * `start_game` socket handler (Mirror Match auto-disable, engine
 * startGame, broadcast) without the host-socket-id check.
 */
async function autoStartIdleLobby(io, room) {
  let mirrorMatchAutoDisabled = false;
  if (
    room.mode === engine.MODES.ONLINE
    && room.config?.roomModifiers?.mirrorMatch
    && !engine.isMirrorMatchEligibleAtStart(room)
  ) {
    room.config.roomModifiers.mirrorMatch = false;
    mirrorMatchAutoDisabled = true;
  }

  engine.startGame(room);
  await saveRoom(room);
  io.to(room.code).emit('lobby_auto_started', {
    reason: 'Host idle — game auto-started.',
  });
  await broadcastRoomState(io, room.code);

  if (mirrorMatchAutoDisabled) {
    io.to(room.code).emit('power_card_triggered', {
      kind: 'system_notice',
      title: 'Mirror Match disabled',
      subtitle: 'requires an even player count',
    });
  }
  console.log(`[host_idle] Auto-started ${room.code} (${room.players.length} players)`);
}

async function dismissIdleLobby(io, code, reason) {
  io.to(code).emit('game_ended', { reason });
  _clearBettingTimer(code);
  _clearGhostVoteTimer(code);
  _clearPreGameTimer(code);
  _clearSpinPendingTimer(code);
  _clearGameOverTimer(code);
  _clearSpeedModeTimer(code);
  const hostTimer = hostDisconnectTimers.get(code);
  if (hostTimer) {
    clearTimeout(hostTimer);
    hostDisconnectTimers.delete(code);
  }
  for (const [key, timer] of playerDisconnectTimers.entries()) {
    if (key.startsWith(`${code}:`)) {
      clearTimeout(timer);
      playerDisconnectTimers.delete(key);
    }
  }
  logRoomDeletion(code, 'host_idle_dismiss', { reason });
  rooms.delete(code);
  console.log(`[host_idle] Dismissed ${code}: ${reason}`);
}

module.exports = {
  INACTIVITY_THRESHOLD_MS,
  HOST_IDLE_WARNING_MS,
  HOST_IDLE_ACTION_MS,
  startInactivitySweep,
  stopInactivitySweep,
  classifyLobbyIdle,
  discardLobbyIdleState,
  bumpLobbyHostActivity,
  startHostIdleSweep,
  stopHostIdleSweep,
  autoStartIdleLobby,
  dismissIdleLobby,
};
