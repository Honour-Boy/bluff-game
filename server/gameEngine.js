// ============================================================
// GAME ENGINE — Pure in-memory game logic, no I/O side effects
// ============================================================

const CARD_TYPES = ['square', 'circle', 'triangle', 'cross', 'star'];
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const MAX_PLAYERS = 15;
const CHAMBER_SIZE = 6;

const MODES = {
  PHYSICAL: 'physical',
  ONLINE: 'online',
};

// ─── Deck helpers ─────────────────────────────────────────────

function generateDeck() {
  const cards = [];
  let idCounter = 0;
  for (const shape of SHAPES) {
    for (let num = 1; num <= 14; num++) {
      cards.push({ id: `${shape}-${num}-${idCounter++}`, shape, number: num });
    }
  }
  cards.push({ id: `whot-20-${idCounter++}`, shape: 'whot', number: 20 });
  return cards;
}

function shuffleDeck(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(playerCount) {
  const base = generateDeck();
  const full = playerCount > 10 ? [...base, ...generateDeck()] : base;
  return shuffleDeck(full);
}

function dealCards(deck, orderedPlayerIds, cardsPerPlayer = 6) {
  const hands = new Map();
  let remaining = [...deck];
  for (const pid of orderedPlayerIds) {
    hands.set(pid, remaining.splice(0, cardsPerPlayer));
  }
  return { hands, remainingDeck: remaining };
}

// ─── Chamber system ────────────────────────────────────────────
// Each player has a 6-slot chamber array: null | 'bullet'
// Bullets are placed by the backend only — the frontend renders
// exactly what the backend returns, ensuring perfect sync.

/**
 * Create a fresh chamber with exactly 1 bullet at a random position
 */
function initChamber() {
  const chamber = new Array(CHAMBER_SIZE).fill(null);
  chamber[Math.floor(Math.random() * CHAMBER_SIZE)] = 'bullet';
  return chamber;
}

/**
 * Add one more bullet at a random empty slot.
 * Called after a player survives a spin.
 * If all slots are full (shouldn't happen in normal play), returns unchanged.
 */
function addBulletToChamber(chamber) {
  const empty = chamber.reduce((acc, s, i) => (s === null ? [...acc, i] : acc), []);
  if (empty.length === 0) return chamber;
  const next = [...chamber];
  next[empty[Math.floor(Math.random() * empty.length)]] = 'bullet';
  return next;
}

/**
 * Pull the trigger.
 * Backend picks a random slot index, checks for bullet.
 * On survival → add another bullet for next time.
 * Returns { spinIndex, eliminated, chamber, bulletCount }
 */
function pullTrigger(chamber) {
  const spinIndex = Math.floor(Math.random() * CHAMBER_SIZE);
  const eliminated = chamber[spinIndex] === 'bullet';
  const updatedChamber = eliminated ? chamber : addBulletToChamber(chamber);
  const bulletCount = updatedChamber.filter(s => s === 'bullet').length;
  return { spinIndex, eliminated, chamber: updatedChamber, bulletCount };
}

// ─── Room / Player creation ────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostSocketId, mode = MODES.PHYSICAL) {
  return {
    code: generateRoomCode(),
    hostSocketId,
    mode,
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    currentCardType: null,
    phase: 'lobby',
    roundNumber: 1,
    lastAction: null,
    bluffUsedThisTurn: false,
    cardPlayedThisTurn: false,
    spinTargetId: null,
    createdAt: Date.now(),
    deck: null,
    playedPile: null,
    hands: null,
    currentCard: null,
    lastPlayedCard: null,
  };
}

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
    chamber: initChamber(),      // 6-slot array, 1 bullet
    riskLevel: 1,                // = bullet count; kept for RiskMeter display
    isSpectator: false,
    connectedAt: Date.now(),
  };
}

// ─── Card type helpers ─────────────────────────────────────────

function randomCardType() {
  return CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
}

function randomShape() {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

function newCardType(room) {
  room.currentCardType = room.mode === MODES.ONLINE ? randomShape() : randomCardType();
  return room;
}

// ─── Player helpers ────────────────────────────────────────────

function getCurrentPlayer(room) {
  if (!room.turnOrder.length) return null;
  const playerId = room.turnOrder[room.currentTurnIndex % room.turnOrder.length];
  return room.players.find(p => p.id === playerId) || null;
}

// ─── Turn management ───────────────────────────────────────────

function advanceTurn(room) {
  if (!room.turnOrder.length) return room;
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.lastAction = null;
  room.phase = 'playing';
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = false;
  return room;
}

// ─── Game start ────────────────────────────────────────────────

function startGame(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  if (alivePlayers.length < 2) throw new Error('Need at least 2 players');

  const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
  room.turnOrder = shuffled.map(p => p.id);
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.roundNumber = 1;
  room.lastAction = null;
  room.isFirstTurn = true;
  room.lastPlayedCard = null;

  if (room.mode === MODES.ONLINE) {
    const deck = buildDeck(alivePlayers.length);
    const { hands, remainingDeck } = dealCards(deck, room.turnOrder, 6);
    room.hands = hands;
    room.deck = remainingDeck;
    room.playedPile = [];

    let startIdx = room.deck.findIndex(c => c.shape !== 'whot');
    if (startIdx === -1) startIdx = 0;
    const [startCard] = room.deck.splice(startIdx, 1);
    room.currentCard = startCard;
    room.currentCardType = startCard.shape;
  } else {
    room.currentCardType = randomCardType();
    room.deck = null;
    room.playedPile = null;
    room.hands = null;
    room.currentCard = null;
  }

  return room;
}

// ─── Online-mode card play ─────────────────────────────────────

function validateAndPlayCard(room, playerId, cardId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Not in online mode' };

  const hand = room.hands.get(playerId);
  if (!hand) return { ok: false, error: 'Player has no hand' };

  const cardIdx = hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Card not in hand' };

  const card = hand[cardIdx];
  hand.splice(cardIdx, 1);
  room.playedPile.push(card);
  room.lastPlayedCard = card;
  room.cardPlayedThisTurn = true;

  return { ok: true, card };
}

function ensureDrawPile(room) {
  if (room.deck.length >= 5) return;
  if (room.playedPile.length === 0) return;
  const topCard = room.playedPile.pop();
  room.deck = shuffleDeck(room.playedPile);
  room.playedPile = [topCard];
}

function drawCardForPlayer(room, playerId) {
  ensureDrawPile(room);
  if (room.deck.length === 0) return null;
  const card = room.deck.shift();
  const hand = room.hands.get(playerId);
  if (hand) hand.push(card);
  return card;
}

// ─── Bluff resolution ──────────────────────────────────────────

function resolveBluffOnline(room) {
  const accuserId = room.turnOrder[room.currentTurnIndex];
  const accuser = room.players.find(p => p.id === accuserId);

  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const accusedId = room.turnOrder[prevIdx];
  const accused = room.players.find(p => p.id === accusedId);

  const revealedCard = room.lastPlayedCard;

  let bluffIsCorrect;
  if (!revealedCard) {
    bluffIsCorrect = true;
  } else {
    const isWhot = revealedCard.shape === 'whot';
    const matchesRequired = revealedCard.shape === room.currentCardType;
    bluffIsCorrect = !isWhot && !matchesRequired;
  }

  const spinTarget = bluffIsCorrect ? accused : accuser;
  return { bluffIsCorrect, spinTarget, revealedCard, accuser, accused };
}

function resolveBluff(room, bluffIsCorrect) {
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const prevPlayer = room.players.find(p => p.id === room.turnOrder[prevIdx]);

  const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;
  const spinResult = spinGun(spinTarget);

  if (spinResult.eliminated) eliminateFromTurnOrder(room, spinTarget.id);

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

// ─── Online round reset ────────────────────────────────────────
// NOTE: chamber state is intentionally preserved across rounds.
// Bullets accumulated in earlier rounds carry into the next so that
// tension escalates the longer the game runs — surviving 5 spins is
// supposed to feel earned. To reset chambers between rounds, clear
// player.chamber + riskLevel before the resumed turn.

function resetRoundOnline(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  const deck = buildDeck(alivePlayers.length);
  const aliveIds = alivePlayers.map(p => p.id);

  const { hands, remainingDeck } = dealCards(deck, aliveIds, 6);
  room.hands = hands;
  room.deck = remainingDeck;
  room.playedPile = [];

  let startIdx = room.deck.findIndex(c => c.shape !== 'whot');
  if (startIdx === -1) startIdx = 0;
  const [startCard] = room.deck.splice(startIdx, 1);
  room.currentCard = startCard;
  room.currentCardType = startCard.shape;

  room.phase = 'playing';
  room.lastAction = null;
  room.lastPlayedCard = null;
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = true;

  return room;
}

// ─── Gun spin ──────────────────────────────────────────────────
// Now fully deterministic — backend picks spinIndex from chamber array.
// Frontend receives { spinIndex, chamber } and animates to that exact slot.

function spinGun(player) {
  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber);
  player.chamber = chamber;
  player.riskLevel = bulletCount;   // bullet count is the new "risk level"
  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  }
  return { eliminated, spinIndex, chamber, riskLevel: bulletCount };
}

// ─── Utilities ─────────────────────────────────────────────────

function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;
  room.turnOrder.splice(idx, 1);
  // Splice already advanced the position for idx === currentTurnIndex
  // (the next player slid into the eliminated player's slot). Only
  // decrement when an earlier-positioned player was removed.
  if (idx < room.currentTurnIndex) {
    room.currentTurnIndex--;
  }
  if (room.turnOrder.length > 0) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
  }
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

// ─── Serialization ─────────────────────────────────────────────

function serializeRoom(room, requestingPlayerId = null) {
  const isOnline = room.mode === MODES.ONLINE;

  return {
    code: room.code,
    mode: room.mode,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      status: p.status,
      riskLevel: p.riskLevel,
      chamber: p.chamber,            // ← full chamber exposed to all clients
      isSpectator: p.isSpectator,
      handSize: isOnline && room.hands ? (room.hands.get(p.id) || []).length : undefined,
    })),
    turnOrder: room.turnOrder,
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    currentCardType: room.currentCardType,
    currentCard: room.currentCard || null,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastAction: room.lastAction,
    bluffUsedThisTurn: room.bluffUsedThisTurn || false,
    cardPlayedThisTurn: room.cardPlayedThisTurn || false,
    spinTargetId: room.spinTargetId || null,
    isFirstTurn: room.isFirstTurn || false,
    deckSize: isOnline && room.deck ? room.deck.length : undefined,
    playedPileSize: isOnline && room.playedPile ? room.playedPile.length : undefined,
    myHand: isOnline && requestingPlayerId && room.hands
      ? (room.hands.get(requestingPlayerId) || [])
      : undefined,
  };
}

module.exports = {
  MODES,
  CARD_TYPES,
  SHAPES,
  MAX_PLAYERS,
  CHAMBER_SIZE,
  generateRoomCode,
  randomCardType,
  randomShape,
  generateDeck,
  shuffleDeck,
  buildDeck,
  dealCards,
  initChamber,
  addBulletToChamber,
  pullTrigger,
  createRoom,
  createPlayer,
  startGame,
  advanceTurn,
  newCardType,
  spinGun,
  resolveBluff,
  resolveBluffOnline,
  eliminateFromTurnOrder,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
  validateAndPlayCard,
  ensureDrawPile,
  drawCardForPlayer,
  resetRoundOnline,
  serializeRoom,
  getCurrentPlayer,
};
