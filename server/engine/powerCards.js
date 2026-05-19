// ============================================================
// ENGINE — Power-card lifecycle (hand mgmt + activation + freeze)
// ============================================================
// Phase B (plumbing), Phase C (effects). Card *building* lives in
// engine/deck.js; this module handles cards once they're in hands
// and the activate/consume lifecycle.

const { MODES, ROLES } = require('./constants');
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
 * Walk every Swap card in every hand and remove `playerId` from its
 * pending-set (the set of "alive players who must still take a turn
 * before this Swap is activatable"). Called when a player ends their
 * turn.
 */
function _creditSwapTurnFor(room, playerId) {
  if (!room.hands) return;
  for (const hand of room.hands.values()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
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
  if (!room.hands) return;
  for (const hand of room.hands.values()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
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

  if (room.cardPlayedThisTurn) return { ok: false, error: 'Card already played this turn' };
  if (room.bluffUsedThisTurn)  return { ok: false, error: 'Bluff already called this turn' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };
  if (player.status !== 'alive') return { ok: false, error: 'Player not alive' };
  if (player.armedPowerCard)    return { ok: false, error: 'Already armed' };

  const hand = room.hands?.get(playerId);
  const powerCard = _findPowerCardInHand(hand);
  if (!powerCard) return { ok: false, error: 'No power card in hand' };

  if (powerCard.power === 'swap' && !isSwapActivatable(powerCard)) {
    return { ok: false, error: 'Swap not yet activatable — every alive player must take a turn first' };
  }

  if (!room.discardPile) room.discardPile = [];

  // Peek: consumed-on-use.
  if (powerCard.power === 'peek') {
    const idx = hand.indexOf(powerCard);
    if (idx !== -1) hand.splice(idx, 1);
    room.discardPile.push(powerCard);
    const peekedCard = room.lastPlayedCard || null;
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
  const hand = room.hands?.get(holderId);
  if (hand) {
    let idx = armed.cardId
      ? hand.findIndex(c => c?.id === armed.cardId)
      : -1;
    if (idx === -1) idx = hand.findIndex(c => c?.type === 'power' && c.power === 'freeze');
    if (idx !== -1) {
      const [card] = hand.splice(idx, 1);
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
  _creditSwapTurnFor,
  _removePlayerFromSwapSnapshots,
  applyAssassinBackfirePenalty,
  isSwapActivatable,
  activatePowerCard,
  consumeFreezeOnTurnEnd,
};
