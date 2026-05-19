// ============================================================
// ENGINE — Bluff resolution + online round reset
// ============================================================
// Physical mode is the host's verdict (`resolveBluff` with a manual
// flag); online mode is server-authoritative (`resolveBluffOnline`
// checks the actual played card). Round reset rebuilds the deck +
// hands for the next round, preserving cross-round chamber state.

const { MODES } = require('./constants');
const { buildDeck, dealCards } = require('./deck');
const { spinGun } = require('./spin');
const { eliminateFromTurnOrder } = require('./players');
const {
  _normalisePowerCardHandCap,
  _guaranteeMinPowerCardPerPlayer,
  _snapshotSwapHolders,
} = require('./powerCards');

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
// tension escalates the longer the game runs. To reset chambers
// between rounds, clear player.chamber + riskLevel before the
// resumed turn.

function resetRoundOnline(room) {
  // Lazy-require the modifiers helper so we don't introduce a hard
  // cycle (modifiers.js requires nothing in this file, but resolution
  // order can matter in tests). The function is stable at call time.
  const { resetRedemptionFlags } = require('./modifiers');

  const alivePlayers = room.players.filter(p => p.status === 'alive');
  const deck = buildDeck(alivePlayers.length, room.config);
  const aliveIds = alivePlayers.map(p => p.id);

  const { hands, remainingDeck } = dealCards(deck, aliveIds, 6);
  room.hands = hands;
  room.deck = remainingDeck;
  room.playedPile = [];
  room.discardPile = room.discardPile || [];

  _normalisePowerCardHandCap(room);
  _guaranteeMinPowerCardPerPlayer(room);
  _snapshotSwapHolders(room);

  for (const p of alivePlayers) p.armedPowerCard = null;

  let startIdx = room.deck.findIndex(c => c.type === 'shape' && c.shape !== 'whot');
  if (startIdx === -1) startIdx = room.deck.findIndex(c => c.type === 'shape');
  if (startIdx === -1) startIdx = 0;
  const [startCard] = room.deck.splice(startIdx, 1);
  room.currentCard = startCard;
  room.currentCardType = startCard?.shape || null;

  room.phase = 'playing';
  room.lastAction = null;
  room.lastPlayedCard = null;
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = true;
  room.skipNextPlayer = false;
  room.bluffBlockedThisTurn = false;
  room.suddenDeathCounter = 0;
  resetRedemptionFlags(room);

  return room;
}

module.exports = {
  resolveBluffOnline,
  resolveBluff,
  resetRoundOnline,
};
