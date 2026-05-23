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
    // v2 #120 — Medic revives are capped per game (MEDIC_MAX_SAVES).
    // Track a running count instead of a one-shot boolean.
    medicSavesUsed: 0,
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

  _resetStaleArmedPowerCard(room);
  return room;
}

// #163 — reset a stale armed power card at the START of the holder's turn.
// A holder can only be bluffed by the player immediately after them
// (`call_bluff` always targets the previous player), so an armed Shield /
// Mirror / Assassin that survived unconsumed all the way back to the holder's
// next turn can no longer fire for the play it was armed for. Clearing the
// armed flag here means a stale card never fires on an unintended later play,
// and the holder must explicitly re-confirm (re-arm) for their new turn. The
// card itself stays in the slot, ready to re-arm.
//
// Excluded:
//   • Freeze — consumed at end_turn via consumeFreezeOnTurnEnd, never survives.
//   • Swap   — armed early but only becomes activatable after a full turn
//              cycle (swapPendingPlayerIds), so it MUST persist across turns.
function _resetStaleArmedPowerCard(room) {
  const playerId = room.turnOrder[room.currentTurnIndex] || null;
  if (!playerId) return;
  const player = room.players.find(p => p.id === playerId);
  const armed = player?.armedPowerCard;
  if (!armed || armed.power === 'freeze' || armed.power === 'swap') return;

  const slot = room.powerCardSlot?.[playerId];
  if (Array.isArray(slot)) {
    const card = slot.find(c => c?.id === armed.cardId);
    if (card) card.armed = false;
  }
  player.armedPowerCard = null;
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

// Eliminate a player by id (set status, drop them into spectator, and pull
// them out of the turn order). Shared by the disconnect timeout and the
// group-removal eviction (#156) so both paths behave identically.
function eliminatePlayer(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.status === 'eliminated') return null;
  player.status = 'eliminated';
  player.isSpectator = true;
  eliminateFromTurnOrder(room, player.id);
  return player;
}

function handleDisconnect(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player) return null;
  return eliminatePlayer(room, player.id);
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
  eliminatePlayer,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
};
