// ============================================================
// SOCKET LIB — Idle-turn safety net (#239)
// ============================================================
// OUTSIDE Speed Mode an AFK current player would block the table forever. This
// mirrors the Speed Mode timer exactly (arm on a fresh turn, re-arm on turn
// change, pause off the `playing` phase, clear on teardown) but at a longer
// IDLE_TURN_TIMEOUT_MS and ONLY when Speed Mode is OFF — Speed Mode's shorter,
// advertised cap takes precedence, so the two never both fire on one turn.
//
// On expiry the server AUTO-RESOLVES the turn: it auto-plays a sensible legal
// card on the absent player's behalf (unless that would empty their hand and
// hand them the win), then ends the turn via the same advanceTurn + freeze +
// sudden-death path a real `end_turn` runs. No spin is forced (#79).

const engine = require('../gameEngine');
const { getRoom, saveRoom, idleTurnTimers, _clearIdleTurnTimer } = require('./state');

const { IDLE_TURN_TIMEOUT_MS } = engine;

// Active only in an online room mid-`playing` with a live turn order AND Speed
// Mode OFF — when Speed Mode is on, armSpeedModeTimer owns the per-turn timeout.
// Tutorial / Practice rooms opt OUT: a learner reading the on-screen guide must
// never be rushed off their turn, and the only other seat is a bot (which drives
// its OWN turns via lib/bots.js), so an idle human only ever blocks themselves —
// the inactivity sweep GCs an abandoned practice room anyway.
function _idleTurnActive(room) {
  return !!room
    && room.mode === engine.MODES.ONLINE
    && !room.isTutorial
    && !room.config?.roomModifiers?.speedMode
    && room.phase === 'playing'
    && Array.isArray(room.turnOrder)
    && room.turnOrder.length > 0;
}

// A stable key for the current player's turn, so the countdown isn't restarted
// on each broadcast during a single player's sub-actions.
function _turnKey(room) {
  return `${room.roundNumber || 0}:${room.currentTurnIndex}:${room.turnOrder[room.currentTurnIndex]}`;
}

/**
 * Idempotent. Called at the end of every broadcastRoomState (after the Speed
 * Mode timer). Arms (or re-arms on turn change) the idle countdown, or tears it
 * down when it's not in force (Speed Mode on, not playing, etc.).
 */
function armIdleTurnTimer(io, room) {
  if (!room || !room.code) return;
  const code = room.code;

  if (!_idleTurnActive(room)) {
    room._idleTurnKey = null;
    _clearIdleTurnTimer(code);
    return;
  }

  const key = _turnKey(room);
  if (room._idleTurnKey === key && idleTurnTimers.has(code)) return;

  _clearIdleTurnTimer(code);
  room._idleTurnKey = key;
  const handle = setTimeout(() => {
    _onIdleTurnExpire(io, code).catch((err) => {
      console.error('[idle-turn] expire handler failed', err);
    });
  }, IDLE_TURN_TIMEOUT_MS);
  idleTurnTimers.set(code, handle);
}

/**
 * Fired when the current player has been idle for IDLE_TURN_TIMEOUT_MS. Auto-
 * plays a sensible card on their behalf (when safe), then ends their turn exactly
 * as `end_turn` would, and re-broadcasts (which re-arms for the next player).
 */
async function _onIdleTurnExpire(io, code) {
  // Deferred require breaks the broadcast ↔ idleTurn module cycle.
  const { broadcastRoomState } = require('./broadcast');

  _clearIdleTurnTimer(code);
  const room = await getRoom(code);
  if (!_idleTurnActive(room)) return;
  // Guard against a stale timer firing after the turn already moved on.
  if (room._idleTurnKey && room._idleTurnKey !== _turnKey(room)) return;

  const endingPlayerId = room.turnOrder[room.currentTurnIndex];
  const endingPlayer = room.players.find(p => p.id === endingPlayerId);

  // Auto-play a sensible legal card if they never acted — but never play their
  // LAST card, which would hand an absent player the win; just forfeit then.
  let autoPlayed = false;
  if (!room.cardPlayedThisTurn) {
    const hand = room.hands?.get(endingPlayerId) || [];
    if (hand.length > 1) {
      const cardId = engine.pickAutoPlayCard(room, endingPlayerId);
      if (cardId) {
        const res = engine.validateAndPlayCard(room, endingPlayerId, cardId);
        if (res.ok) autoPlayed = true;
      }
    }
  }

  // End the turn (same path as end_turn / Speed Mode expiry). No spin (#79).
  const freezeTrigger = engine.consumeFreezeOnTurnEnd(room, endingPlayerId);
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  engine.advanceTurn(room);
  const suddenDeathBanner = engine.tickSuddenDeath(room);

  room.lastAction = {
    type: 'idle_timeout',
    playerId: endingPlayerId,
    playerName: endingPlayer?.username || null,
    autoPlayed,
  };
  room._idleTurnKey = null;

  await saveRoom(room);
  await broadcastRoomState(io, code);

  if (freezeTrigger) io.to(code).emit('power_card_triggered', freezeTrigger);
  if (suddenDeathBanner) io.to(code).emit('power_card_triggered', suddenDeathBanner);
}

module.exports = {
  armIdleTurnTimer,
  _onIdleTurnExpire,
  _idleTurnActive,
};
