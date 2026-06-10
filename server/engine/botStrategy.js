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

const { SHAPES, INTERCEPTABLE_POWERS } = require('./constants');
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

// Free-play (sandbox) bluff-calling. The bot must feel SPONTANEOUS and never
// like it can see your card — so each game gets its own randomized base call
// rate (rolled once at game start, stored on `room.botCallRate`), and every
// eligible turn is an INDEPENDENT gamble at that rate (no fixed count, no
// minimum, no card knowledge). When the bot is genuinely STUCK (it holds no card
// that matches the required shape), it leans toward calling: a resolved bluff
// triggers a global re-deal that refreshes every hand — a legitimate way to dig
// out of a dead hand, decided WITHOUT looking at the opponent's card.
const BOT_CALL_RATE_MIN = 0.12;
const BOT_CALL_RATE_MAX = 0.40;
const BOT_STUCK_CALL_RATE = 0.7;

// Roll a fresh per-game base call rate. Injectable rng for deterministic tests.
function rollBotCallRate(rng = Math.random) {
  return BOT_CALL_RATE_MIN + rng() * (BOT_CALL_RATE_MAX - BOT_CALL_RATE_MIN);
}

// Does the bot lack any legal HONEST play for the required shape? (Whot is a
// universal honest play, so holding one means it isn't stuck.) Reads only the
// bot's OWN hand — never the opponent's card.
function _botHasNoHonestPlay(room, botId) {
  const hand = room.hands?.get?.(botId) || [];
  const required = room.currentCardType;
  return !hand.some(
    (c) => c?.type === 'shape' && (c.shape === required || c.shape === 'whot'),
  );
}

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

  // Free play: if the bot PEEKED the challengeable card this turn (offensive
  // Peek activation), it knows the truth — challenge a lie, never a truth. The
  // driver stamps `_botPeekedChallengeable` after a Peek; the id-match guard
  // keeps a stale peek from leaking onto a later card.
  if (
    room._botPeekedChallengeable
    && room.challengeableCard
    && room._botPeekedChallengeable.id === room.challengeableCard.id
  ) {
    return room.challengeableCard.shape !== room.challengeableCardType;
  }

  // Sandbox / free play: a spontaneous, card-agnostic gamble at this game's
  // randomized rate. NOT the coached Basics guarantee below (that one leans hard
  // to teach the learner about being challenged, which felt like cheating in a
  // free game). Stuck → lean toward a redeal-triggering call.
  if (room.sandbox) {
    let rate = typeof room.botCallRate === 'number' ? room.botCallRate : BOT_BLUFF_CALL_RATE;
    if (_botHasNoHonestPlay(room, botId)) rate = Math.max(rate, BOT_STUCK_CALL_RATE);
    return rng() < rate;
  }

  // Coached Basics ONLY (not sandbox): lean on the challenge until the learner
  // has seen ≥2 calls — a deliberate teaching guarantee, not card knowledge.
  if (room.isTutorial && !room.sandbox && (room.botBluffCallsThisGame || 0) < BOT_BLUFF_MIN_CALLS) {
    const oppHand = _humanOpponentHandSize(room, botId);
    // Round winding down + minimum not met → take the eligible call for certain.
    if (oppHand != null && oppHand <= BOT_BLUFF_FORCE_HAND_SIZE) return true;
    return rng() < BOT_BLUFF_CALL_RATE_BELOW_MIN;
  }

  return rng() < BOT_BLUFF_CALL_RATE;
}

// ─── Free-play power-card strategy (sandbox, powers ON) ───────────────────────
// Outside the scripted Power Clinic the bot must HOLD, ACTIVATE and DEFEND with
// power cards on its own, or a powers-on practice game is one-sided (and can
// stall on a power-only bot). These pure helpers answer "would a simple opponent
// use this power?"; the driver (lib/bots.js) owns the engine mutation + timing.
// All are gated by the driver to free play (no `room.tutorialScenario`), so the
// clinic + Basics paths are untouched.

// How often the bot arms a held Freeze when it's ahead (denying the human their
// next turn), and how often it arms a held Assassin (high-risk: it must then play
// honestly and bank on a human challenge). Both deliberately low so powers feel
// like an occasional threat, not a barrage.
const BOT_FREEZE_RATE = 0.4;
const BOT_ASSASSIN_RATE = 0.2;

function _slot(room, botId) {
  return (room.powerCardSlot && room.powerCardSlot[botId]) || [];
}

// Pure mirror of lib/bots `_botCanForceBluff`: is there a real, live previous
// play this bot could challenge right now?
function _botCanChallenge(room, botId) {
  if (room.isFirstTurn || room.bluffUsedThisTurn || room.bluffBlockedThisTurn) return false;
  if (!room.challengeableCard) return false;
  const accusedId = getPreviousTurnPlayerId(room);
  if (!accusedId || accusedId === botId) return false;
  const accused = (room.players || []).find((p) => p.id === accusedId);
  return !!accused && accused.status === 'alive';
}

// Bot's own shape-hand size (the playable hand; powers live in the slot).
function _botHandSize(room, botId) {
  const hand = room.hands?.get?.(botId);
  return Array.isArray(hand) ? hand.length : null;
}

// "Ahead" = the bot is at least level with its human opponent on shape cards
// (closer to, or tied for, emptying its hand and winning).
function _botIsAhead(room, botId) {
  const mine = _botHandSize(room, botId);
  const theirs = _humanOpponentHandSize(room, botId);
  if (mine == null || theirs == null) return false;
  return mine <= theirs;
}

// Did the bot's card under accusation actually mismatch the required shape (a
// genuine lie)? The accused only gains from defending when they DID lie — an
// honest accused lets the wrong call spin the accuser for free.
function botLiedOnChallengeable(room) {
  const c = room.challengeableCard;
  if (!c) return false;
  return c.shape !== room.challengeableCardType;
}

/**
 * Should the bot proactively ACTIVATE an offensive power at the start of its own
 * turn (before playing a card)? Returns `{ cardId, power } | null`.
 *
 *   • Peek    — when there's a previous play it could challenge, peek first to
 *               sharpen that decision (the driver stamps the revealed card so
 *               `shouldCallBluff` then challenges a known lie / spares a truth).
 *   • Freeze  — when ahead, arm to skip the human's next turn. Rate-limited.
 *   • Assassin— arm rarely; the bot then plays honestly and a correct human
 *               challenge is struck down. High-risk, so kept sparing.
 *
 * One activation per turn is enforced by the engine ledger
 * (`room.powerActivatedThisTurn`) + `player.armedPowerCard`; this helper also
 * short-circuits on them so it never fights the ledger.
 */
function chooseBotPowerActivation(room, botId, rng = Math.random) {
  if (!room || room.phase !== 'playing') return null;
  if (room.powerActivatedThisTurn) return null;
  if (room.turnOrder?.[room.currentTurnIndex] !== botId) return null;
  const bot = (room.players || []).find((p) => p.id === botId);
  if (!bot || bot.status !== 'alive' || bot.armedPowerCard) return null;

  const slot = _slot(room, botId);
  if (slot.length === 0) return null;
  const has = (power) => slot.find((c) => c?.power === power) || null;

  const peek = has('peek');
  if (peek && _botCanChallenge(room, botId)) {
    return { cardId: peek.id, power: 'peek' };
  }

  const freeze = has('freeze');
  if (freeze && _botIsAhead(room, botId) && rng() < BOT_FREEZE_RATE) {
    return { cardId: freeze.id, power: 'freeze' };
  }

  const assassin = has('assassin');
  if (assassin && rng() < BOT_ASSASSIN_RATE) {
    return { cardId: assassin.id, power: 'assassin' };
  }

  return null;
}

/**
 * When the bot is the ACCUSED in a bluff-intercept window, should it arm a
 * defensive power (Shield / Mirror / Swap)? Only worth it when the bot actually
 * lied — an honest accused burns the card for nothing (the wrong call already
 * spins the accuser). The driver checks it holds an interceptable card.
 */
function shouldBotInterceptBluff(room, botId) {
  if (!botLiedOnChallengeable(room)) return false;
  const slot = _slot(room, botId);
  return slot.some((c) => c && INTERCEPTABLE_POWERS.includes(c.power));
}

/**
 * Which held defensive card the bot arms when it does intercept. Priority:
 * Shield (clean block) → Mirror (reflect onto accuser) → Swap (trade to an
 * honest card). Caller still validates Swap's "everyone took a turn" gate via
 * the engine. Returns a cardId, or null.
 */
function chooseInterceptCard(room, botId) {
  const slot = _slot(room, botId);
  for (const power of ['shield', 'mirror', 'swap']) {
    const c = slot.find((card) => card?.power === power);
    if (c) return c.id;
  }
  return null;
}

/**
 * When the bot is the Swap holder resolving a swap_pending pause, which card
 * from the played pile to swap in. Prefer one that makes the accused card HONEST
 * (shape matches the required type → the bluff was wrong → the accuser spins);
 * otherwise any other pile card; otherwise a no-op (its own card). Returns a
 * cardId, or null when there's nothing to pick.
 */
function chooseSwapPick(room) {
  const pile = room.playedPile || [];
  const original = room.challengeableCard || pile[pile.length - 1] || null;
  const required = room.challengeableCardType;

  const honest = pile.find((c) => c && c.id !== original?.id && c.shape === required);
  if (honest) return honest.id;
  const other = pile.find((c) => c && c.id !== original?.id);
  if (other) return other.id;
  return original?.id || null;
}

module.exports = {
  BOT_BLUFF_RATE,
  BOT_BLUFF_CALL_RATE,
  BOT_BLUFF_MIN_CALLS,
  BOT_BLUFF_CALL_RATE_BELOW_MIN,
  BOT_BLUFF_FORCE_HAND_SIZE,
  BOT_FREEZE_RATE,
  BOT_ASSASSIN_RATE,
  BOT_CALL_RATE_MIN,
  BOT_CALL_RATE_MAX,
  BOT_STUCK_CALL_RATE,
  rollBotCallRate,
  chooseCardPlay,
  shouldCallBluff,
  chooseBotPowerActivation,
  shouldBotInterceptBluff,
  chooseInterceptCard,
  chooseSwapPick,
  botLiedOnChallengeable,
};
