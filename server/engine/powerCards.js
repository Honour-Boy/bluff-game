// ============================================================
// ENGINE — Power-card lifecycle (hand mgmt + activation + freeze)
// ============================================================
// Phase B (plumbing), Phase C (effects). Card *building* lives in
// engine/deck.js; this module handles cards once they're in hands
// and the activate/consume lifecycle.

const { MODES, ROLES, INTERCEPTABLE_POWERS } = require('./constants');
const {
  _findPowerCardInHand,
  _countPowerCardsInHand,
  _hasPowerCardInHand,
  _powerCardCapForPlayer,
} = require('./handHelpers');
const { drawCardForPlayer } = require('./cards');

// ─── Power-card hand bookkeeping ──────────────────────────────

/**
 * After an initial deal, walk every player's hand and move any
 * extras over the per-player cap into room.discardPile, replacing
 * them with shape cards taken from the top of room.deck.
 */
function _normalisePowerCardHandCap(room) {
  if (!room.discardPile) room.discardPile = [];

  for (const [pid, hand] of room.hands.entries()) {
    if (!hand) continue;
    const player = room.players.find(p => p.id === pid);
    const cap = _powerCardCapForPlayer(player); // Collector → 3, default → 1
    let powerCount = _countPowerCardsInHand(hand);
    while (powerCount > cap) {
      const extraIdx = hand.findIndex(c => c?.type === 'power');
      const tailIdx = (() => {
        for (let i = hand.length - 1; i >= 0; i--) if (hand[i]?.type === 'power') return i;
        return extraIdx;
      })();
      let removeIdx = -1;
      let seen = 0;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i]?.type === 'power') {
          seen++;
          if (seen > cap) { removeIdx = i; break; }
        }
      }
      if (removeIdx === -1) removeIdx = tailIdx;

      const [extra] = hand.splice(removeIdx, 1);
      room.discardPile.push(extra);

      const shapeIdx = room.deck.findIndex(c => c?.type === 'shape');
      if (shapeIdx === -1) {
        console.warn('[engine] _normalisePowerCardHandCap: no shape card available for replacement');
        break;
      }
      const [shape] = room.deck.splice(shapeIdx, 1);
      hand.push(shape);
      powerCount = _countPowerCardsInHand(hand);
    }
  }
}

/**
 * Per #77 — guarantee that every player ends the initial deal with at
 * least one power card. Runs AFTER `_normalisePowerCardHandCap` so the
 * cap is already enforced; any player still holding zero power cards
 * gets one swapped in from the deck (or the discard pile, if the
 * cap-normalisation step parked some there).
 */
function _guaranteeMinPowerCardPerPlayer(room) {
  if (!room.hands || !Array.isArray(room.deck)) return;
  const enabled = room.config?.powerCards?.enabled;
  if (!enabled) return;
  if (!Object.values(enabled).some(Boolean)) return;
  if (!Array.isArray(room.discardPile)) room.discardPile = [];

  for (const [pid, hand] of room.hands.entries()) {
    if (!hand) continue;
    if (_hasPowerCardInHand(hand)) continue;

    let source = room.deck;
    let powerIdx = source.findIndex(c => c?.type === 'power');
    if (powerIdx === -1) {
      source = room.discardPile;
      powerIdx = source.findIndex(c => c?.type === 'power');
    }
    if (powerIdx === -1) {
      console.warn('[engine] _guaranteeMinPowerCardPerPlayer: no power card available for', pid);
      break;
    }

    const handShapeIdx = hand.findIndex(c => c?.type === 'shape');
    if (handShapeIdx === -1) continue;

    const [power] = source.splice(powerIdx, 1);
    const [shape] = hand.splice(handShapeIdx, 1);
    hand.push(power);
    room.deck.push(shape);
  }
}

/**
 * For every alive player, look at the Swap cards in their hand and
 * stamp the "alive playerIds who must take a turn before this Swap
 * is activatable" snapshot. Idempotent — won't overwrite an existing
 * snapshot.
 */
function _snapshotSwapHolders(room) {
  if (!room.hands) return;
  const aliveIds = room.players.filter(p => p.status === 'alive').map(p => p.id);
  for (const [pid, hand] of room.hands.entries()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && !card.swapPendingPlayerIds) {
        card.swapPendingPlayerIds = aliveIds.filter(id => id !== pid);
      }
    }
  }
}

/**
 * #139 — restore the playable hand to a full `size` shape cards.
 *
 * The initial deal sizes each hand at 6 cards INCLUDING any power card,
 * and `_guaranteeMinPowerCardPerPlayer` ensures everyone holds one. Once
 * `_extractPowerCardsToSlot` pulls that power card into its own slot the
 * playable hand is left one short (5 shape cards). The power/bonus slot is
 * a SEPARATE slot — it must never decrement the 6-card shape hand — so we
 * top each hand back up to `size` shape cards from the remaining deck.
 *
 * Run AFTER extraction. Pure draw from room.deck (no played-pile reshuffle
 * needed at deal time — a fresh deck always has ample shape cards: 71 per
 * single deck, doubled past 10 players).
 */
function _topUpShapeHandsTo(room, size) {
  if (!room.hands || !Array.isArray(room.deck)) return;
  for (const hand of room.hands.values()) {
    if (!Array.isArray(hand)) continue;
    let shapeCount = hand.reduce((n, c) => (c?.type === 'shape' ? n + 1 : n), 0);
    while (shapeCount < size) {
      const shapeIdx = room.deck.findIndex(c => c?.type === 'shape');
      if (shapeIdx === -1) {
        console.warn('[engine] _topUpShapeHandsTo: deck exhausted of shape cards');
        break;
      }
      const [shape] = room.deck.splice(shapeIdx, 1);
      hand.push(shape);
      shapeCount++;
    }
  }
}

/**
 * After the initial deal and cap normalisation, move every power card
 * out of room.hands into room.powerCardSlot[playerId] (an array).
 * From this point on, room.hands contains shape cards only.
 */
function _extractPowerCardsToSlot(room) {
  if (!room.hands) return;
  if (!room.powerCardSlot) room.powerCardSlot = {};
  for (const [pid, hand] of room.hands.entries()) {
    if (!Array.isArray(hand)) continue;
    const powers = [];
    const shapes = [];
    for (const card of hand) {
      if (card?.type === 'power') powers.push(card);
      else shapes.push(card);
    }
    hand.length = 0;
    hand.push(...shapes);
    room.powerCardSlot[pid] = powers;
  }
}

/**
 * Walk every Swap card in every hand and remove `playerId` from its
 * pending-set (the set of "alive players who must still take a turn
 * before this Swap is activatable"). Called when a player ends their
 * turn.
 */
function _creditSwapTurnFor(room, playerId) {
  if (!room.powerCardSlot) return;
  for (const slot of Object.values(room.powerCardSlot)) {
    if (!Array.isArray(slot)) continue;
    for (const card of slot) {
      if (card?.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
        card.swapPendingPlayerIds = card.swapPendingPlayerIds.filter(id => id !== playerId);
      }
    }
  }
}

/**
 * Eliminations remove a player from every Swap snapshot WITHOUT
 * crediting (locked decision — eliminating someone shouldn't unlock
 * a Swap mechanically).
 */
function _removePlayerFromSwapSnapshots(room, playerId) {
  if (!room.powerCardSlot) return;
  for (const slot of Object.values(room.powerCardSlot)) {
    if (!Array.isArray(slot)) continue;
    for (const card of slot) {
      if (card?.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
        card.swapPendingPlayerIds = card.swapPendingPlayerIds.filter(id => id !== playerId);
      }
    }
  }
}

/**
 * Assassin backfire penalty (#63): when a bluff is *correctly* called
 * on an Assassin holder, the holder takes the +3 shape-card penalty
 * instead of being spun.
 */
function applyAssassinBackfirePenalty(room, playerId, count = 3) {
  if (room.mode !== MODES.ONLINE) return [];
  const player = room.players.find(p => p.id === playerId);
  if (!player) return [];

  const dealt = [];
  for (let i = 0; i < count; i++) {
    const card = drawCardForPlayer(room, playerId);
    if (card) dealt.push(card);
    else break;
  }
  return dealt;
}

/**
 * Is the given Swap card eligible to be activated right now?
 * Swap requires that every alive player at the time the card landed
 * has since taken at least one turn.
 */
function isSwapActivatable(card) {
  if (!card || card.power !== 'swap') return false;
  if (!Array.isArray(card.swapPendingPlayerIds)) return true; // no snapshot = no gate
  return card.swapPendingPlayerIds.length === 0;
}

function activatePowerCard(room, playerId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  if (room.phase !== 'playing') return { ok: false, error: 'Wrong phase' };

  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  if (currentPlayerId !== playerId) return { ok: false, error: 'Not your turn' };

  // Turn-flow flexibility. The three turn actions — play a card, call a bluff,
  // activate a power card — are fully order-independent and each allowed once
  // per turn. A power card may be armed at ANY point during the holder's own
  // active turn window: before or after a normal card is played, AND before or
  // after a bluff is called. (Mid-resolution is already excluded by the
  // `phase === 'playing'` check above — bluff resolution / spins move the room
  // out of `playing` until they settle back on the same turn.) The only block
  // is being already armed: one activation per turn.
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };
  if (player.status !== 'alive') return { ok: false, error: 'Player not alive' };
  if (player.armedPowerCard)    return { ok: false, error: 'Already armed' };

  const slot = room.powerCardSlot?.[playerId] || [];
  const powerCard = slot[0] ?? null;
  if (!powerCard) return { ok: false, error: 'No power card in hand' };

  if (powerCard.power === 'swap' && !isSwapActivatable(powerCard)) {
    return { ok: false, error: 'Swap not yet activatable — every alive player must take a turn first' };
  }

  if (!room.discardPile) room.discardPile = [];

  // Peek: consumed-on-use — remove from slot immediately.
  if (powerCard.power === 'peek') {
    room.powerCardSlot[playerId] = slot.filter(c => c.id !== powerCard.id);
    room.discardPile.push(powerCard);
    // Peek reveals the previous player's play — the same snapshotted card a
    // bluff targets — NOT the live lastPlayedCard, which would be this player's
    // own card if they already played this turn (order-free actions).
    const peekedCard = room.challengeableCard || null;
    return {
      ok: true,
      power: 'peek',
      consumed: true,
      peekedCard,
      cardId: powerCard.id,
    };
  }

  // All other powers: arm the player and mark the card armed.
  powerCard.armed = true;
  player.armedPowerCard = {
    power: powerCard.power,
    cardId: powerCard.id,
    activatedAtTurn: room.currentTurnIndex,
    activatedAtRound: room.roundNumber,
  };

  return {
    ok: true,
    power: powerCard.power,
    consumed: false,
    cardId: powerCard.id,
  };
}

// ─── Bluff interception (§1.1) ─────────────────────────────────
// When a bluff is called, the accused (the previous player — NOT on turn)
// gets a window to arm a DEFENSIVE power card in response, before the bluff
// resolves. The resolution pipeline already reads `accused.armedPowerCard` at
// every tier (Shield→Tier1, Swap→Tier2, Mirror→Tier4), so arming here is all
// that's needed — the existing queue does the rest.

/**
 * The defensive power cards `playerId` could arm right now in response to a
 * bluff: interceptable powers they hold, with Swap's "everyone took a turn"
 * gate honoured. Returns the matching slot cards (possibly empty).
 */
function listInterceptCards(room, playerId) {
  const slot = room.powerCardSlot?.[playerId] || [];
  return slot.filter(
    c => c
      && INTERCEPTABLE_POWERS.includes(c.power)
      && (c.power !== 'swap' || isSwapActivatable(c)),
  );
}

/**
 * Can `playerId` open an interception window at all? True only if they hold an
 * interceptable card AND aren't already armed (an already-armed card is handled
 * by the pipeline directly — no window needed).
 */
function canInterceptBluff(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.status !== 'alive') return false;
  if (player.armedPowerCard) return false;
  return listInterceptCards(room, playerId).length > 0;
}

/**
 * Arm a defensive power card for the accused during an interception window.
 * Unlike `activatePowerCard` this does NOT require the holder to be the active
 * player (the accused is off-turn by definition). `cardId` selects which held
 * card to arm; omitted → the first eligible one.
 */
function armInterceptCard(room, playerId, cardId = null) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };
  if (player.status !== 'alive') return { ok: false, error: 'Player not alive' };
  if (player.armedPowerCard) return { ok: false, error: 'Already armed' };

  const slot = room.powerCardSlot?.[playerId] || [];
  const card = cardId ? slot.find(c => c?.id === cardId) : listInterceptCards(room, playerId)[0];
  if (!card) return { ok: false, error: 'No defensive card to arm' };
  if (!INTERCEPTABLE_POWERS.includes(card.power)) {
    return { ok: false, error: 'Not a defensive card' };
  }
  if (card.power === 'swap' && !isSwapActivatable(card)) {
    return { ok: false, error: 'Swap not yet activatable — every alive player must take a turn first' };
  }

  card.armed = true;
  player.armedPowerCard = {
    power: card.power,
    cardId: card.id,
    activatedAtTurn: room.currentTurnIndex,
    activatedAtRound: room.roundNumber,
    viaIntercept: true,
  };

  return { ok: true, power: card.power, cardId: card.id };
}

// ─── Freeze trigger (Phase C) ──────────────────────────────────
// "Activated at turn start" (Phase B arms it) and "consumed on turn
// end". When the holder calls end_turn, we look for an armed freeze
// on the player, pull the card from their hand into discard, clear
// the armed marker, and queue a one-shot skip on the room.

function consumeFreezeOnTurnEnd(room, holderId) {
  if (room.mode !== MODES.ONLINE) return null;
  if (!room.turnOrder?.length) return null;

  const holder = room.players.find(p => p.id === holderId);
  if (!holder) return null;
  const armed = holder.armedPowerCard;
  if (!armed || armed.power !== 'freeze') return null;

  const holderIdx = room.turnOrder.indexOf(holderId);
  if (holderIdx === -1) return null;
  const skippedIdx = (holderIdx + 1) % room.turnOrder.length;
  const skippedId = room.turnOrder[skippedIdx];
  if (!skippedId || skippedId === holderId) return null;
  const skipped = room.players.find(p => p.id === skippedId) || null;

  if (!room.discardPile) room.discardPile = [];
  const slot = room.powerCardSlot?.[holderId];
  if (Array.isArray(slot)) {
    let cardIdx = armed.cardId
      ? slot.findIndex(c => c?.id === armed.cardId)
      : -1;
    if (cardIdx === -1) cardIdx = slot.findIndex(c => c?.power === 'freeze');
    if (cardIdx !== -1) {
      const [card] = slot.splice(cardIdx, 1);
      room.discardPile.push(card);
    }
  }

  holder.armedPowerCard = null;
  room.skipNextPlayer = true;

  return {
    kind: 'freeze_skip',
    holderId,
    holderName: holder.username || null,
    skippedId,
    skippedName: skipped?.username || null,
  };
}

module.exports = {
  _normalisePowerCardHandCap,
  _guaranteeMinPowerCardPerPlayer,
  _snapshotSwapHolders,
  _extractPowerCardsToSlot,
  _topUpShapeHandsTo,
  _creditSwapTurnFor,
  _removePlayerFromSwapSnapshots,
  applyAssassinBackfirePenalty,
  isSwapActivatable,
  activatePowerCard,
  listInterceptCards,
  canInterceptBluff,
  armInterceptCard,
  consumeFreezeOnTurnEnd,
};
