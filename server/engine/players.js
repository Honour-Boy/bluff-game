// ============================================================
// ENGINE — Player lifecycle + turn rotation
// ============================================================
// createPlayer, turn-order helpers, elimination + reconnect bookkeeping.

const { ROLES } = require('./constants');
const { initChamber } = require('./chamber');
const { _creditSwapTurnFor, _removePlayerFromSwapSnapshots } = require('./powerCards');

/**
 * Create a new player.
 * chamber is always initialised here (backend only — never on client).
 */
function createPlayer(id, username, socketId) {
  return {
    id,
    username,
    socketId,
    status: 'alive',
    chamber: initChamber(),
    riskLevel: 1,
    isSpectator: false,
    connectedAt: Date.now(),
    armedPowerCard: null,
    // v2 Phase D — Secret roles.
    role: ROLES.BAREHAND,
    medicAbilityAvailable: true,
    saboteurAbilityAvailable: true,
    sniperAbilityAvailable: true,
    // v2 Phase F — Bounty system.
    consecutiveSurvivedSpins: 0,
    hasBounty: false,
    // v2 Phase F — Betting system.
    consecutiveCorrectBets: 0,
  };
}

function getCurrentPlayer(room) {
  if (!room.turnOrder.length) return null;
  const playerId = room.turnOrder[room.currentTurnIndex % room.turnOrder.length];
  return room.players.find(p => p.id === playerId) || null;
}

// ─── Turn management ───────────────────────────────────────────
//
// v2 Phase C — Freeze. When the freeze holder ends their turn we
// stamp room.skipNextPlayer = true (and queue the bluff-block). On
// the very next advanceTurn, we advance an EXTRA step so the next
// player in turn order is fully skipped. The player AFTER the
// skipped one inherits room.bluffBlockedThisTurn = true.

function advanceTurn(room) {
  if (!room.turnOrder.length) return room;

  const finishingPlayerId = room.turnOrder[room.currentTurnIndex] || null;
  if (finishingPlayerId) _creditSwapTurnFor(room, finishingPlayerId);

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.lastAction = null;
  room.phase = 'playing';
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = false;
  room.bluffBlockedThisTurn = false;

  if (room.skipNextPlayer) {
    const skippedPlayerId = room.turnOrder[room.currentTurnIndex] || null;
    if (skippedPlayerId) _creditSwapTurnFor(room, skippedPlayerId);
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    room.skipNextPlayer = false;
    room.bluffBlockedThisTurn = true;
  }

  return room;
}

function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;
  room.turnOrder.splice(idx, 1);
  if (idx < room.currentTurnIndex) {
    room.currentTurnIndex--;
  }
  if (room.turnOrder.length > 0) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
  }
  // Eliminations remove from Swap pending sets WITHOUT crediting.
  _removePlayerFromSwapSnapshots(room, playerId);
  // v2 Phase E2 — Sudden Death: any elimination resets the streak
  // counter to 0. Done inline here to avoid pulling in modifiers.js
  // just for one field reset.
  if (room) room.suddenDeathCounter = 0;
}

function handleDisconnect(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player || player.status === 'eliminated') return null;
  player.status = 'eliminated';
  player.isSpectator = true;
  eliminateFromTurnOrder(room, player.id);
  return player;
}

function checkGameOver(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  return alive.length <= 1 ? alive[0] || null : false;
}

function declareRoundWinner(room, playerId) {
  const winner = room.players.find(p => p.id === playerId);
  if (!winner) return null;
  room.phase = 'round_end';
  room.roundNumber++;
  room.lastAction = { type: 'round_win', winnerId: playerId, winnerName: winner.username };
  return winner;
}

function reconnectPlayer(room, playerId, newSocketId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  player.socketId = newSocketId;
  return player;
}

module.exports = {
  createPlayer,
  getCurrentPlayer,
  advanceTurn,
  eliminateFromTurnOrder,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
};
