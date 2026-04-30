// ============================================================
// GAME ENGINE — Pure in-memory game logic, no I/O side effects
// ============================================================

const CARD_TYPES = ['square', 'circle', 'triangle', 'cross', 'star'];
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const MAX_PLAYERS = 15;
const MAX_RISK = 6;

const MODES = {
  PHYSICAL: 'physical',
  ONLINE: 'online',
};

// ─── Deck helpers ─────────────────────────────────────────────

/**
 * Generate a single Whot-style deck (73 cards: 5 shapes × 14 numbers + 1 Whot/20)
 * Numbers 1–14 per shape, plus one Whot card (shape: 'whot', number: 20)
 */
function generateDeck() {
  const cards = [];
  let idCounter = 0;
  for (const shape of SHAPES) {
    for (let num = 1; num <= 14; num++) {
      cards.push({ id: `${shape}-${num}-${idCounter++}`, shape, number: num });
    }
  }
  // Whot card
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

/**
 * Build a shuffled deck — 1 deck for ≤10 players, 2 decks for 11–15
 */
function buildDeck(playerCount) {
  const base = generateDeck();
  const full = playerCount > 10 ? [...base, ...generateDeck()] : base;
  return shuffleDeck(full);
}

/**
 * Deal cards from deck to playerCount players, cardsPerPlayer each
 * Returns { hands: Map<playerId, card[]>, remainingDeck }
 * Caller passes orderedPlayerIds to know which slot belongs to whom
 */
function dealCards(deck, orderedPlayerIds, cardsPerPlayer = 6) {
  const hands = new Map();
  let remaining = [...deck];

  for (const pid of orderedPlayerIds) {
    hands.set(pid, remaining.splice(0, cardsPerPlayer));
  }

  return { hands, remainingDeck: remaining };
}

// ─── Room / Player creation ────────────────────────────────────

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
    // Online-only fields (null in physical mode)
    deck: null,
    playedPile: null,
    hands: null,        // Map<playerId, card[]> — not serialized directly
    currentCard: null,  // top card that sets the required shape
    lastPlayedCard: null,
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
    status: 'alive',
    riskLevel: 1,
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

/**
 * Assign a new required card type (called after an elimination)
 * Online mode picks from SHAPES; physical mode picks from CARD_TYPES
 */
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
  // Do NOT clear lastPlayedCard here — it must persist so the next player can
  // call bluff on the previous player's card (including Whot cards).
  // lastPlayedCard is naturally overwritten when the next player plays their card.
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

    // Pick a non-Whot starting card from the top of the remaining deck
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

/**
 * Play any card from a player's hand face-down.
 * No shape validation — this is a bluffing game. Any card can be played.
 * The card is recorded as lastPlayedCard so bluff resolution can check it.
 * currentCardType does NOT change when a card is played — only on elimination.
 * Returns { ok: boolean, error?: string, card?: object }
 */
function validateAndPlayCard(room, playerId, cardId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Not in online mode' };

  const hand = room.hands.get(playerId);
  if (!hand) return { ok: false, error: 'Player has no hand' };

  const cardIdx = hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Card not in hand' };

  const card = hand[cardIdx];

  // Remove from hand and add to played pile
  hand.splice(cardIdx, 1);
  room.playedPile.push(card);
  room.lastPlayedCard = card;
  room.cardPlayedThisTurn = true;

  return { ok: true, card };
}

/**
 * Ensure the draw pile has cards; reshuffle played pile if needed
 */
function ensureDrawPile(room) {
  if (room.deck.length >= 5) return;
  if (room.playedPile.length === 0) return;

  // Keep the top card of played pile as the current card
  const topCard = room.playedPile.pop();
  room.deck = shuffleDeck(room.playedPile);
  room.playedPile = [topCard];
}

/**
 * Draw a card for a player from the deck
 */
function drawCardForPlayer(room, playerId) {
  ensureDrawPile(room);
  if (room.deck.length === 0) return null;

  const card = room.deck.shift();
  const hand = room.hands.get(playerId);
  if (hand) hand.push(card);
  return card;
}

// ─── Bluff resolution ──────────────────────────────────────────

/**
 * Online mode: server auto-resolves bluff by checking if lastPlayedCard actually
 * matched the required shape. The bluff call is CORRECT if the previous player lied.
 * Returns { bluffIsCorrect, spinTarget, revealedCard, accuser, accused }
 */
function resolveBluffOnline(room) {
  // Current player in the turn order is the one CALLING the bluff (accuser)
  const accuserId = room.turnOrder[room.currentTurnIndex];
  const accuser = room.players.find(p => p.id === accuserId);

  // Previous player is the one whose card is being challenged (accused)
  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const accusedId = room.turnOrder[prevIdx];
  const accused = room.players.find(p => p.id === accusedId);

  const revealedCard = room.lastPlayedCard;

  let bluffIsCorrect;
  if (!revealedCard) {
    // No card played at all — accused definitely lied
    bluffIsCorrect = true;
  } else {
    // Whot card is always valid (always matches). Any other card must match currentCardType.
    const isWhot = revealedCard.shape === 'whot';
    const matchesRequired = revealedCard.shape === room.currentCardType;
    bluffIsCorrect = !isWhot && !matchesRequired;
  }

  // Correct bluff → accused (the liar) spins; wrong bluff → accuser spins
  const spinTarget = bluffIsCorrect ? accused : accuser;

  return { bluffIsCorrect, spinTarget, revealedCard, accuser, accused };
}

/**
 * Physical mode: host declares bluff result
 * Online mode: use resolveBluffOnline instead
 */
function resolveBluff(room, bluffIsCorrect) {
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const prevPlayerId = room.turnOrder[prevIdx];
  const prevPlayer = room.players.find(p => p.id === prevPlayerId);

  const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;
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

// ─── Online round reset ────────────────────────────────────────

/**
 * Reset for a new round in online mode: rebuild deck, redeal to alive players, new starting card
 */
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
  // roundNumber was already incremented by declareRoundWinner — do NOT increment again
  // isFirstTurn must be reset so players cannot call bluff before anyone has played a card
  room.isFirstTurn = true;

  return room;
}

// ─── Gun spin ──────────────────────────────────────────────────

function spinGun(player) {
  const r1 = Math.floor(Math.random() * 6) + 1;
  // At risk ≥ 2 roll a second die and take the lower value — biases the outcome
  // toward elimination without dramatically changing the feel of risk level 1.
  const roll = player.riskLevel >= 2
    ? Math.min(r1, Math.floor(Math.random() * 6) + 1)
    : r1;

  const eliminated = roll <= player.riskLevel;

  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  } else {
    player.riskLevel = Math.min(player.riskLevel + 1, MAX_RISK);
  }

  return { eliminated, roll, riskLevel: player.riskLevel };
}

function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;

  room.turnOrder.splice(idx, 1);

  if (idx <= room.currentTurnIndex && room.currentTurnIndex > 0) {
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

/**
 * Serialize room state for a specific client.
 * requestingPlayerId: if provided, includes that player's hand in myHand.
 */
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
    // Online-only
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
  MAX_RISK,
  generateRoomCode,
  randomCardType,
  randomShape,
  generateDeck,
  shuffleDeck,
  buildDeck,
  dealCards,
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
