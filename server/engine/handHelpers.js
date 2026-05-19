// ============================================================
// ENGINE — Tiny hand-inspector + cap helpers (shared)
// ============================================================
// Pulled out so both engine/cards.js (drawCardForPlayer) and
// engine/powerCards.js (cap normalisation, etc.) can require them
// without forming a cycle. Pure functions only.

const { ROLES, COLLECTOR_POWER_CARD_CAP } = require('./constants');

function _findPowerCardInHand(hand) {
  if (!hand) return null;
  for (const card of hand) {
    if (card?.type === 'power') return card;
  }
  return null;
}

function _countPowerCardsInHand(hand) {
  if (!hand) return 0;
  let n = 0;
  for (const c of hand) if (c?.type === 'power') n++;
  return n;
}

function _hasPowerCardInHand(hand) {
  return _countPowerCardsInHand(hand) > 0;
}

// Per-player power-card hand cap — Collector lifts to 3, everyone
// else is gated at 1. Used by deal normalisation + drawCardForPlayer.
function _powerCardCapForPlayer(player) {
  if (!player) return 1;
  return player.role === ROLES.COLLECTOR ? COLLECTOR_POWER_CARD_CAP : 1;
}

module.exports = {
  _findPowerCardInHand,
  _countPowerCardsInHand,
  _hasPowerCardInHand,
  _powerCardCapForPlayer,
};
