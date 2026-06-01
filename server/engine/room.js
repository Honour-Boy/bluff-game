// ============================================================
// ENGINE — Room creation, lobby → game lifecycle, chat, replay reset
// ============================================================
// Deals with the room object as a whole: factory, chat log, startGame
// (initial deal + role assignment), and the replay reset that the host
// uses after a finished game.

const {
  MODES,
  ROLES,
  CHAT_LOG_MAX,
  CHAT_TEXT_MAX,
  normalizeRoomConfig,
} = require('./constants');
const { initChamber } = require('./chamber');
const { buildDeck, dealCards } = require('./deck');
const { randomCardType } = require('./cards');
const { createPlayer } = require('./players');
const { assignRoles } = require('./roles');
const {
  _normalisePowerCardHandCap,
  _guaranteeMinPowerCardPerPlayer,
  _snapshotSwapHolders,
  _extractPowerCardsToSlot,
  _topUpShapeHandsTo,
} = require('./powerCards');

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostSocketId, mode = MODES.PHYSICAL, config = null) {
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
    powerActivatedThisTurn: false,
    spinTargetId: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    deck: null,
    playedPile: null,
    hands: null,
    powerCardSlot: null,
    currentCard: null,
    lastPlayedCard: null,
    // Snapshot of the previous player's play (taken at each turn boundary in
    // advanceTurn) — the card a bluff / Peek resolves against. See engine/bluff.js.
    challengeableCard: null,
    challengeableCardType: null,
    // Id of the player who took the immediately-previous turn (the bluff target).
    // Stamped by advanceTurn so Roulette Rotation's reshuffled cycles resolve
    // the accused correctly. See engine/players.js getPreviousTurnPlayerId.
    prevTurnPlayerId: null,
    chatLog: [],
    config: normalizeRoomConfig(config),
    discardPile: [],
    // Phase C — Freeze. One-shot skip queue.
    skipNextPlayer: false,
    bluffBlockedThisTurn: false,
  };
}

function appendChatMessage(room, { userId, username, text }) {
  if (!room.chatLog) room.chatLog = [];
  const trimmed = String(text || '').slice(0, CHAT_TEXT_MAX).trim();
  if (!trimmed) return null;
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    username,
    text: trimmed,
    ts: Date.now(),
  };
  room.chatLog.push(msg);
  if (room.chatLog.length > CHAT_LOG_MAX) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_MAX);
  }
  return msg;
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
  room.challengeableCard = null;
  room.challengeableCardType = null;
  room.prevTurnPlayerId = null;
  room.discardPile = room.discardPile || [];

  // v2 Phase E1 — Double Barrel: load 2 bullets into every chamber at start
  // (≈24% first-spin death on the issue #67 curve). Russian Roulette is a
  // separate modifier (failed bluff = immediate spin) and does NOT touch the
  // chamber load — see shouldImmediateSpin / the bluff handlers.
  if (room.config?.riskModifiers?.doubleBarrel) {
    for (const p of alivePlayers) {
      p.chamber = initChamber(2);
      p.riskLevel = 2;
    }
  }
  room.suddenDeathCounter = 0;
  room.mirrorMatchActive = !!room.config?.roomModifiers?.mirrorMatch;
  // #6 — highlight callouts: one "First Blood" per game; per-player survival
  // streaks reset at the start of a fresh game.
  room.firstBloodAwarded = false;
  for (const p of alivePlayers) p.survivalStreak = 0;

  // v2 Phase D — assign roles BEFORE the deal so the per-player
  // power-card hand cap is honoured by `_normalisePowerCardHandCap`.
  assignRoles(room);

  if (room.mode === MODES.ONLINE) {
    const deck = buildDeck(alivePlayers.length, room.config);
    const { hands, remainingDeck } = dealCards(deck, room.turnOrder, 6);
    room.hands = hands;
    room.deck = remainingDeck;
    room.playedPile = [];
    room.powerCardSlot = {};

    _normalisePowerCardHandCap(room);
    _guaranteeMinPowerCardPerPlayer(room);
    _snapshotSwapHolders(room);
    _extractPowerCardsToSlot(room);
    // #139 — the power card lives in its own slot and must NOT eat into the
    // playable hand. Refill each hand to a full 6 shape cards after the
    // power card has been pulled out.
    _topUpShapeHandsTo(room, 6);

    let startIdx = room.deck.findIndex(c => c.type === 'shape' && c.shape !== 'whot');
    if (startIdx === -1) startIdx = room.deck.findIndex(c => c.type === 'shape');
    if (startIdx === -1) startIdx = 0;
    const [startCard] = room.deck.splice(startIdx, 1);
    room.currentCard = startCard;
    room.currentCardType = startCard?.shape || null;
  } else {
    room.currentCardType = randomCardType();
    room.deck = null;
    room.playedPile = null;
    room.hands = null;
    room.currentCard = null;
  }

  return room;
}

/**
 * Reset a finished room back to lobby state so the same group can play
 * another game without re-joining (issue #54). Mutates `room` in place
 * so callers holding the reference see the reset.
 *
 * Implementation strategy: rebuild from `createRoom` + `createPlayer`
 * rather than enumerating fields to clear. Only `code`, `hostUserId`,
 * `createdAt`, and `chatLog` are explicitly preserved across the reset.
 */
function resetRoomForReplay(room) {
  if (!room) return room;

  const code         = room.code;
  const hostSocketId = room.hostSocketId;
  const hostUserId   = room.hostUserId;
  const mode         = room.mode;
  const config       = room.config;
  const groupId      = room.groupId;
  const groupSettingsMeta = room.groupSettingsMeta || null;
  const createdAt    = room.createdAt;
  const chatLog      = room.chatLog || [];

  const playerIdentities = room.players.map(p => ({
    id: p.id,
    username: p.username,
    socketId: p.socketId,
  }));

  for (const key of Object.keys(room)) delete room[key];

  Object.assign(room, createRoom(hostSocketId, mode, config));

  room.code           = code;
  room.hostUserId     = hostUserId;
  room.groupId        = groupId;
  room.groupSettingsMeta = groupSettingsMeta;
  room.createdAt      = createdAt;
  room.lastActivityAt = Date.now();
  room.chatLog        = chatLog;

  for (const ident of playerIdentities) {
    room.players.push(createPlayer(ident.id, ident.username, ident.socketId));
  }

  return room;
}

module.exports = {
  generateRoomCode,
  createRoom,
  appendChatMessage,
  startGame,
  resetRoomForReplay,
};
