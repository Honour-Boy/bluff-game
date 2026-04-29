// ============================================================
// GAME ENGINE — Pure in-memory game logic, no I/O side effects
// ============================================================

const CARD_TYPES = ['square', 'circle', 'triangle', 'cross', 'star'];
const MAX_PLAYERS = 15;
const MAX_RISK = 6;

/**
 * Generate a random room code (6 uppercase alphanumeric chars)
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Create a new room with a host
 */
function createRoom(hostSocketId) {
  return {
    code: generateRoomCode(),
    hostSocketId,
    players: [],          // Array of player objects
    turnOrder: [],        // Array of player IDs (alive only, maintained deterministically)
    currentTurnIndex: 0,  // Index into turnOrder
    currentCardType: null,// Required card type announced this turn
    phase: 'lobby',       // lobby | playing | bluff_resolution | spin_pending | round_end | game_over
    roundNumber: 1,
    lastAction: null,
    bluffUsedThisTurn: false,
    cardPlayedThisTurn: false,
    spinTargetId: null,
    createdAt: Date.now(),
  };
}

/**
 * Create a new player object
 */
function createPlayer(id, username, socketId) {
  return {
    id,
    username,
    socketId,
    status: 'alive',     // alive | eliminated
    riskLevel: 1,        // 1–6; increases on survive-spin
    isSpectator: false,
    connectedAt: Date.now(),
  };
}

/**
 * Pick a random card type for a turn
 */
function randomCardType() {
  return CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
}

/**
 * Get the current active player (whose turn it is)
 */
function getCurrentPlayer(room) {
  if (!room.turnOrder.length) return null;
  const playerId = room.turnOrder[room.currentTurnIndex % room.turnOrder.length];
  return room.players.find(p => p.id === playerId) || null;
}

/**
 * Advance to the next living player's turn
 * @returns updated room (mutates in place)
 */
function advanceTurn(room) {
  if (!room.turnOrder.length) return room;
  // Move to next index, wrap around
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.currentCardType = randomCardType();
  room.lastAction = null;
  room.phase = 'playing';
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  return room;
}

/**
 * Start the game: shuffle players, pick random starting player
 */
function startGame(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  if (alivePlayers.length < 2) throw new Error('Need at least 2 players');

  // Shuffle for turn order
  const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
  room.turnOrder = shuffled.map(p => p.id);
  room.currentTurnIndex = 0;
  room.currentCardType = randomCardType();
  room.phase = 'playing';
  room.roundNumber = 1;
  room.lastAction = null;
  return room;
}

/**
 * Perform a gun spin for a player.
 * Returns { eliminated: boolean, roll: number, riskLevel: number }
 */
function spinGun(player) {
  const roll = Math.floor(Math.random() * 6) + 1; // 1–6
  const eliminated = roll <= player.riskLevel;

  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  } else {
    // Survive: increase risk, cap at MAX_RISK
    player.riskLevel = Math.min(player.riskLevel + 1, MAX_RISK);
  }

  return { eliminated, roll, riskLevel: player.riskLevel };
}

/**
 * Eliminate a player from the turn order
 * Adjusts currentTurnIndex so the next call to getCurrentPlayer is correct
 */
function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;

  room.turnOrder.splice(idx, 1);

  // If the removed player was before or at current index, step back
  // so currentTurnIndex still points to the same "next" player
  if (idx <= room.currentTurnIndex && room.currentTurnIndex > 0) {
    room.currentTurnIndex--;
  }
  // Wrap if needed
  if (room.turnOrder.length > 0) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
  }
}

/**
 * Resolve a bluff call:
 * correct bluff → previous player spins
 * incorrect bluff → accuser (current player) spins
 *
 * Returns { spinTarget: player, spinResult, nextPhase }
 */
function resolveBluff(room, bluffIsCorrect) {
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  // Previous player = the one before current in turn order
  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const prevPlayerId = room.turnOrder[prevIdx];
  const prevPlayer = room.players.find(p => p.id === prevPlayerId);

  let spinTarget;
  if (bluffIsCorrect) {
    // Bluff call was correct → previous player (the bluffer) spins
    spinTarget = prevPlayer;
  } else {
    // Bluff call was wrong → accuser (current player) spins
    spinTarget = currentPlayer;
  }

  const spinResult = spinGun(spinTarget);

  if (spinResult.eliminated) {
    eliminateFromTurnOrder(room, spinTarget.id);
  }

  room.phase = 'playing';
  room.lastAction = {
    type: 'bluff_resolved',
    bluffCorrect: bluffIsCorrect,
    spinTargetId: spinTarget.id,
    spinTargetName: spinTarget.username,
    ...spinResult,
  };

  return { spinTarget, spinResult };
}

/**
 * Handle player disconnect: mark eliminated, remove from turn order
 */
function handleDisconnect(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player || player.status === 'eliminated') return null;

  player.status = 'eliminated';
  player.isSpectator = true;
  eliminateFromTurnOrder(room, player.id);
  return player;
}

/**
 * Check if only one player remains alive → game over
 */
function checkGameOver(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  return alive.length <= 1 ? alive[0] || null : false;
}

/**
 * Declare a round winner (player finished their 5 cards)
 */
function declareRoundWinner(room, playerId) {
  const winner = room.players.find(p => p.id === playerId);
  if (!winner) return null;
  room.phase = 'round_end';
  room.roundNumber++;
  room.lastAction = { type: 'round_win', winnerId: playerId, winnerName: winner.username };
  return winner;
}

/**
 * Reconnect a player: update their socketId
 */
function reconnectPlayer(room, playerId, newSocketId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  player.socketId = newSocketId;
  return player;
}

/**
 * Serialize room state to send to clients (sanitized)
 */
function serializeRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      status: p.status,
      riskLevel: p.riskLevel,
      isSpectator: p.isSpectator,
    })),
    turnOrder: room.turnOrder,
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    currentCardType: room.currentCardType,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastAction: room.lastAction,
    bluffUsedThisTurn: room.bluffUsedThisTurn || false,
    cardPlayedThisTurn: room.cardPlayedThisTurn || false,
    spinTargetId: room.spinTargetId || null,
  };
}

module.exports = {
  createRoom,
  createPlayer,
  startGame,
  advanceTurn,
  spinGun,
  resolveBluff,
  eliminateFromTurnOrder,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
  serializeRoom,
  generateRoomCode,
  randomCardType,
  CARD_TYPES,
  MAX_PLAYERS,
};
