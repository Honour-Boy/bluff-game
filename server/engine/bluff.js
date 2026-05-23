// ============================================================
// ENGINE — Bluff resolution + online round reset
// ============================================================
// Physical mode is the host's verdict (`resolveBluff` with a manual
// flag); online mode is server-authoritative (`resolveBluffOnline`
// checks the actual played card). Round reset rebuilds the deck +
// hands for the next round, preserving cross-round chamber state.

const { MODES, GAME_EVENT_TYPES } = require('./constants');
const { buildDeck, dealCards } = require('./deck');
const { spinGun } = require('./spin');
const { eliminateFromTurnOrder, getPreviousTurnPlayerId } = require('./players');
const {
  _normalisePowerCardHandCap,
  _guaranteeMinPowerCardPerPlayer,
  _snapshotSwapHolders,
} = require('./powerCards');

// ─── Bluff correctness — the single source of truth ──────────
//
// A bluff call is "correct" when the previously played card did NOT
// satisfy the required shape: a Whot (wild) never counts as truthful,
// and a missing card means the previous player can't have told the
// truth. `bluffPipeline.js`'s Tier-3 (#119) consumes this so the
// correctness rule lives in exactly one place.
//
// The card under accusation is `room.challengeableCard` — the previous
// player's play, snapshotted at the turn boundary (`advanceTurn`) and
// validated against `room.challengeableCardType` (the required shape in
// effect when they played). We deliberately do NOT read the live
// `lastPlayedCard`/`currentCardType`: turn actions are order-free, so the
// accuser may have already played their own card this turn, which would
// otherwise make the bluff judge their card instead of the accused's.
function isBluffCorrect(room) {
  const revealed = room.challengeableCard;
  if (!revealed) return true;
  if (revealed.shape === 'whot') return false;
  return revealed.shape !== room.challengeableCardType;
}

// Tier-3 (Bluff Validation) of the ResolutionQueue. Returns the
// computed correctness, the revealed card, and the typed base
// `GameEvent` (#119) — a `SPIN_CONSEQUENCE` that targets the accused
// on a correct call or the accuser on a wrong one. It is `redirectable`
// so Tier-4 Mirror/Sniper may retarget it; power-card branches in the
// pipeline re-type it into a non-redirectable event when needed.
function buildBluffValidationEvent(room, accuser, accused) {
  const bluffIsCorrect = isBluffCorrect(room);
  const revealedCard = room.challengeableCard || null;
  const target = bluffIsCorrect ? (accused?.id || null) : (accuser?.id || null);
  return {
    bluffIsCorrect,
    revealedCard,
    event: {
      type: GAME_EVENT_TYPES.SPIN_CONSEQUENCE,
      redirectable: true,
      preventable: false,
      source: accuser?.id || null,
      target,
      payload: { bluffIsCorrect },
    },
  };
}

function resolveBluffOnline(room) {
  const accuserId = room.turnOrder[room.currentTurnIndex];
  const accuser = room.players.find(p => p.id === accuserId);

  const accusedId = getPreviousTurnPlayerId(room);
  const accused = room.players.find(p => p.id === accusedId);

  const { bluffIsCorrect, revealedCard } = buildBluffValidationEvent(room, accuser, accused);
  const spinTarget = bluffIsCorrect ? accused : accuser;
  return { bluffIsCorrect, spinTarget, revealedCard, accuser, accused };
}

function resolveBluff(room, bluffIsCorrect) {
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  const prevPlayer = room.players.find(p => p.id === getPreviousTurnPlayerId(room));

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
  room.challengeableCard = null;
  room.challengeableCardType = null;
  room.prevTurnPlayerId = null;
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
  isBluffCorrect,
  buildBluffValidationEvent,
};
