// ============================================================
// ENGINE — Bot strategy (tutorial / practice opponent)
// ============================================================
// Pure decision helpers for a server-driven bot opponent. No I/O, no
// socket access — these only read the room + a botId and return a
// choice (a cardId + optional nominated shape). The bot turn DRIVER
// (lib/bots.js) owns the timing + engine mutation; this module owns the
// "what would a simple opponent do?" question.
//
// Deliberately dumb. The practice bot exists to teach the core loop
// (play → bluff → spin → win), so it plays mostly honestly with an
// occasional bluff, so a human's bluff call against it can land — and
// usually backfires, which teaches the risk of a reckless challenge. It
// never INITIATES a bluff call itself in v1 (the human is the challenger).

const { SHAPES } = require('./constants');
const { getPreviousTurnPlayerId } = require('./players');

// How often the bot deliberately plays a card that does NOT match the
// required shape (a "lie") when it also has a legal honest play. Tuned low
// so honest play dominates.
const BOT_BLUFF_RATE = 0.25;

// How often the bot CHALLENGES the previous player when it's eligible to (it
// can't see the card, so this is a pure gamble). ~1-in-3 eligible turns: frequent
// enough that a learner reliably SEES the bot call bluff during a short practice
// round, without spins dominating the game.
const BOT_BLUFF_CALL_RATE = 0.34;

// Tutorial guarantee — a practice game must SHOW the bot calling bluff at least
// twice so the learner experiences being challenged. Until that minimum is met in
// a tutorial game the bot challenges far more eagerly (BELOW_MIN rate), and HARD-
// forces a call once the round is winding down (the human is at/under
// FORCE_HAND_SIZE shape cards, so few eligible turns remain). Tracked on
// `room.botBluffCallsThisGame`, incremented by the bot driver when a call fires.
const BOT_BLUFF_MIN_CALLS = 2;
const BOT_BLUFF_CALL_RATE_BELOW_MIN = 0.85;
const BOT_BLUFF_FORCE_HAND_SIZE = 3;

// Shape-hand size of the bot's live human opponent (the only non-bot alive seat
// in a practice room). null when it can't be determined.
function _humanOpponentHandSize(room, botId) {
  const opp = (room.players || []).find(
    (p) => p && p.id !== botId && !p.isBot && p.status === 'alive',
  );
  if (!opp) return null;
  const hand = room.hands?.get?.(opp.id);
  return Array.isArray(hand) ? hand.length : null;
}

// Plain = a normal shape card (not a Whot wild). Whot can never be a "lie"
// (it matches anything) so it's handled separately and only as a fallback.
function _plainShapeCards(hand) {
  return (hand || []).filter((c) => c?.type === 'shape' && c.shape !== 'whot');
}

function _pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Choose a card for the bot to play this turn. Returns
 *   { cardId, nominatedShape }   (nominatedShape only set for a Whot card)
 * or null when the bot has nothing playable (caller then just ends the turn).
 *
 * Strategy:
 *   • Prefer a plain (non-Whot) shape card.
 *   • Usually play one that MATCHES room.currentCardType (honest).
 *   • With BOT_BLUFF_RATE, play a non-matching plain card (a bluff) when one
 *     is available, so a human bluff-call against the bot can be correct.
 *   • Fall back to a Whot card (nominating the required shape) only when no
 *     plain card exists.
 *
 * `rng` is injectable so tests can force honest vs. bluff play deterministically.
 */
function chooseCardPlay(room, botId, rng = Math.random) {
  const hand = room.hands?.get(botId) || [];
  const plain = _plainShapeCards(hand);
  const required = room.currentCardType;

  if (plain.length > 0) {
    const honest = plain.filter((c) => c.shape === required);
    const lies = plain.filter((c) => c.shape !== required);

    // Bluff: occasionally play a non-matching card even when an honest play
    // exists. Always bluff if honest play is impossible but a lie is available.
    if (lies.length > 0 && (honest.length === 0 || rng() < BOT_BLUFF_RATE)) {
      return { cardId: _pick(lies, rng).id, nominatedShape: null };
    }
    if (honest.length > 0) {
      return { cardId: _pick(honest, rng).id, nominatedShape: null };
    }
    return { cardId: lies[0].id, nominatedShape: null };
  }

  // No plain card left — play a Whot wild, nominating the required shape
  // (or a random one if the required type is somehow unset).
  const whot = (hand || []).find((c) => c?.type === 'shape' && c.shape === 'whot');
  if (whot) {
    const shape = SHAPES.includes(required) ? required : _pick(SHAPES, rng);
    return { cardId: whot.id, nominatedShape: shape };
  }

  // Only power cards / empty — nothing to play.
  return null;
}

/**
 * Should the bot CHALLENGE the previous player at the start of its turn?
 * Eligible only when a real, un-challenged previous play exists to call on:
 *   • not the round's first turn, no bluff already used this turn, not frozen,
 *   • there is a snapshotted challengeable card,
 *   • the accused (previous turn-taker) is a live OTHER player.
 * When eligible it's a flat probability gamble (the bot can't see the card).
 *
 * `rng` is injectable so tests can force or suppress the call deterministically.
 */
function shouldCallBluff(room, botId, rng = Math.random) {
  if (!room) return false;
  if (room.isFirstTurn || room.bluffUsedThisTurn || room.bluffBlockedThisTurn) return false;
  if (!room.challengeableCard) return false;
  const accusedId = getPreviousTurnPlayerId(room);
  if (!accusedId || accusedId === botId) return false;
  const accused = (room.players || []).find((p) => p.id === accusedId);
  if (!accused || accused.status !== 'alive') return false;

  // Tutorial: lean on the challenge until the learner has seen ≥2 calls.
  if (room.isTutorial && (room.botBluffCallsThisGame || 0) < BOT_BLUFF_MIN_CALLS) {
    const oppHand = _humanOpponentHandSize(room, botId);
    // Round winding down + minimum not met → take the eligible call for certain.
    if (oppHand != null && oppHand <= BOT_BLUFF_FORCE_HAND_SIZE) return true;
    return rng() < BOT_BLUFF_CALL_RATE_BELOW_MIN;
  }

  return rng() < BOT_BLUFF_CALL_RATE;
}

module.exports = {
  BOT_BLUFF_RATE,
  BOT_BLUFF_CALL_RATE,
  BOT_BLUFF_MIN_CALLS,
  BOT_BLUFF_CALL_RATE_BELOW_MIN,
  BOT_BLUFF_FORCE_HAND_SIZE,
  chooseCardPlay,
  shouldCallBluff,
};
