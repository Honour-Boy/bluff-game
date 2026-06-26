// ============================================================
// ENGINE — Card-type helpers + online-mode card play
// ============================================================
// validateAndPlayCard, ensureDrawPile, drawCardForPlayer are the
// engine-side mutators behind the play_card_online / draw paths.

const { CARD_TYPES, SHAPES, MODES } = require('./constants');
const { shuffleDeck } = require('./deck');
const { _powerCardCapForPlayer } = require('./handHelpers');

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

// ─── Online-mode card play ─────────────────────────────────────

function validateAndPlayCard(room, playerId, cardId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Not in online mode' };

  // One shape card per turn. The turn-action UI lets a player play / call
  // bluff / activate a power card in any order, so the only authoritative
  // guard against a double-play lives here, not in the (now order-free) UI.
  if (room.cardPlayedThisTurn) return { ok: false, error: 'You already played a card this turn' };

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

/**
 * Draw a card for a player, honouring the v2 power-card hand cap.
 *
 * Rule (Phase B, locked): a player may hold at most ONE power card
 * (Collector role lifts to 3). If the next card off the deck is a
 * power card and the player is already at cap, the would-be-drawn
 * card is moved to room.discardPile and we try again. Loops until
 * either a shape card lands in the hand or the deck is exhausted.
 *
 * Returns the card actually placed in the player's hand, or null.
 */
function drawCardForPlayer(room, playerId) {
  if (!room.discardPile) room.discardPile = [];
  const hand = room.hands?.get(playerId);
  if (!hand) return null;
  const player = room.players.find(p => p.id === playerId);
  const cap = _powerCardCapForPlayer(player); // Collector → 3, default → 1

  if (!room.powerCardSlot) room.powerCardSlot = {};
  const slot = room.powerCardSlot[playerId] || (room.powerCardSlot[playerId] = []);

  let safety = (room.deck?.length || 0) + (room.playedPile?.length || 0) + 4;
  while (safety-- > 0) {
    ensureDrawPile(room);
    if (!room.deck || room.deck.length === 0) {
      console.warn('[engine] drawCardForPlayer: deck exhausted with no eligible card');
      return null;
    }
    const card = room.deck.shift();

    if (card?.type === 'power') {
      if (slot.length >= cap) {
        // Slot full — discard silently; caller may emit power_card_discarded.
        room.discardPile.push(card);
        continue;
      }
      // Stamp swap snapshot before routing to slot.
      if (card.power === 'swap' && !card.swapPendingPlayerIds) {
        const aliveIds = room.players.filter(p => p.status === 'alive').map(p => p.id);
        card.swapPendingPlayerIds = aliveIds.filter(id => id !== playerId);
      }
      slot.push(card);
      return card;
    }

    hand.push(card);
    return card;
  }
  console.warn('[engine] drawCardForPlayer: safety bound exceeded');
  return null;
}

// #239 — pick a sensible card for the idle-turn auto-resolver to play on an AFK
// player's behalf. Prefers an HONEST play (shape matches the required
// `currentCardType`) so the auto-played card can't be successfully bluff-called
// and spin the absent player; otherwise falls back to any plain shape card. Whot
// (needs a nominated shape) and power cards are skipped to keep the auto-play
// trivial and side-effect-free. Returns a cardId, or null if nothing suitable.
function pickAutoPlayCard(room, playerId) {
  const hand = room.hands?.get(playerId) || [];
  const plain = hand.filter(c => c?.type === 'shape' && c.shape !== 'whot');
  if (plain.length === 0) return null;
  const honest = plain.find(c => c.shape === room.currentCardType);
  return (honest || plain[0]).id;
}

module.exports = {
  randomCardType,
  randomShape,
  newCardType,
  validateAndPlayCard,
  pickAutoPlayCard,
  ensureDrawPile,
  drawCardForPlayer,
};
