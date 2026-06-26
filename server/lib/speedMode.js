// ============================================================
// SOCKET LIB - Speed Mode turn timer (roomModifiers.speedMode)
// ============================================================
// When Speed Mode is on, every player's turn is capped at
// SPEED_MODE_TURN_MS. The server stamps `room.speedModeDeadline` when a new
// turn opens (serialize.js exposes `speedModeMsRemaining` to drive the
// client-side countdown for ALL players) and, on expiry, auto-ENDS the turn -
// the same advanceTurn + freeze-consume path a normal `end_turn` runs. There is
// NO auto-spin: #79 bans auto-spin in every mode; running out of time simply
// forfeits the rest of your turn.

const engine = require('../gameEngine');
const { getRoom, saveRoom, speedModeTimers, _clearSpeedModeTimer } = require('./state');

const { SPEED_MODE_TURN_MS } = engine;

// Speed Mode is only in force for an online room running its `playing` phase
// with a live turn order. During spins / resolution (phase ≠ 'playing') the
// countdown pauses and re-arms when play resumes.
function _speedModeActive(room) {
  return !!room
    && room.mode === engine.MODES.ONLINE
    && !!room.config?.roomModifiers?.speedMode
    && room.phase === 'playing'
    && Array.isArray(room.turnOrder)
    && room.turnOrder.length > 0;
}

// A stable key for the current player's turn. Re-arming only when this changes
// keeps a single countdown running across a player's multiple sub-actions
// (play / call bluff / activate power) instead of restarting it each broadcast.
function _turnKey(room) {
  return `${room.roundNumber || 0}:${room.currentTurnIndex}:${room.turnOrder[room.currentTurnIndex]}`;
}

/**
 * Idempotent. Called at the end of every broadcastRoomState. Arms (or re-arms
 * on turn change) the per-turn countdown, or tears it down when Speed Mode is
 * not in force. Mutates `room.speedModeDeadline` so the next serialize carries
 * the countdown.
 */
function armSpeedModeTimer(io, room) {
  if (!room || !room.code) return;
  const code = room.code;

  if (!_speedModeActive(room)) {
    if (room.speedModeDeadline) room.speedModeDeadline = null;
    room._speedModeTurnKey = null;
    _clearSpeedModeTimer(code);
    return;
  }

  const key = _turnKey(room);
  // Already counting down for this exact turn - let it keep running.
  if (room._speedModeTurnKey === key && speedModeTimers.has(code)) return;

  _clearSpeedModeTimer(code);
  room._speedModeTurnKey = key;
  room.speedModeDeadline = Date.now() + SPEED_MODE_TURN_MS;
  const handle = setTimeout(() => {
    _onSpeedModeExpire(io, code).catch((err) => {
      console.error('[speed-mode] expire handler failed', err);
    });
  }, SPEED_MODE_TURN_MS);
  speedModeTimers.set(code, handle);
}

/**
 * Fired when the active player's turn runs out of time. Ends their turn exactly
 * as `end_turn` would (consume freeze → clear the per-turn ledger → advanceTurn
 * → tick Sudden Death), then re-broadcasts (which re-arms for the next player).
 * No spin is performed.
 */
async function _onSpeedModeExpire(io, code) {
  // Deferred require breaks the broadcast ↔ speedMode module cycle.
  const { broadcastRoomState } = require('./broadcast');

  _clearSpeedModeTimer(code);
  const room = await getRoom(code);
  if (!_speedModeActive(room)) return;
  // Guard against a stale timer firing after the turn already moved on.
  if (room._speedModeTurnKey && room._speedModeTurnKey !== _turnKey(room)) return;

  const endingPlayerId = room.turnOrder[room.currentTurnIndex];
  const endingPlayer = room.players.find(p => p.id === endingPlayerId);

  const freezeTrigger = engine.consumeFreezeOnTurnEnd(room, endingPlayerId);
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  engine.advanceTurn(room);
  const suddenDeathBanner = engine.tickSuddenDeath(room);

  room.lastAction = {
    type: 'speed_timeout',
    playerId: endingPlayerId,
    playerName: endingPlayer?.username || null,
  };

  // The broadcast below re-arms the countdown for the new current player.
  room.speedModeDeadline = null;
  room._speedModeTurnKey = null;

  await saveRoom(room);
  await broadcastRoomState(io, code);

  if (freezeTrigger) io.to(code).emit('power_card_triggered', freezeTrigger);
  if (suddenDeathBanner) io.to(code).emit('power_card_triggered', suddenDeathBanner);
}

module.exports = {
  armSpeedModeTimer,
  _onSpeedModeExpire,
  _speedModeActive,
};
