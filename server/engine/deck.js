// ============================================================
// ENGINE — Deck construction (shape + power cards)
// ============================================================
// Pure builders for the online-mode draw deck. Card *play*
// helpers (validateAndPlayCard, drawCardForPlayer, etc.) live in
// engine/cards.js.

const { SHAPES, POWER_TYPES } = require('./constants');

function generateDeck() {
  const cards = [];
  let idCounter = 0;
  for (const shape of SHAPES) {
    for (let num = 1; num <= 14; num++) {
      cards.push({ id: `${shape}-${num}-${idCounter++}`, type: 'shape', shape, number: num });
    }
  }
  cards.push({ id: `whot-20-${idCounter++}`, type: 'shape', shape: 'whot', number: 20 });
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

// ─── Power card construction ──────────────────────────────────
// Spec note (locked): copiesPerDeck SCALES with double deck. If
// copiesPerDeck=1 and the table is double-deck (>10 players), each
// enabled power type gets 2 copies, not 1.
let _powerIdCounter = 0;
function _nextPowerId(power) {
  return `power-${power}-${Date.now().toString(36)}-${(_powerIdCounter++).toString(36)}`;
}

function buildPowerCards(config, playerCount) {
  if (!config || !config.powerCards || !config.powerCards.enabled) return [];
  const enabled = config.powerCards.enabled;
  const baseCopies = Number.isFinite(config.powerCards.copiesPerDeck)
    ? Math.max(1, Math.min(2, Math.floor(config.powerCards.copiesPerDeck)))
    : 1;
  const deckMultiplier = playerCount > 10 ? 2 : 1;
  const totalCopies = baseCopies * deckMultiplier;

  const cards = [];
  for (const power of POWER_TYPES) {
    if (!enabled[power]) continue;
    for (let i = 0; i < totalCopies; i++) {
      cards.push({
        id: _nextPowerId(power),
        type: 'power',
        power,
      });
    }
  }
  return cards;
}

function buildDeck(playerCount, config = null) {
  const base = generateDeck();
  const full = playerCount > 10 ? [...base, ...generateDeck()] : base;
  const powers = buildPowerCards(config, playerCount);
  return shuffleDeck([...full, ...powers]);
}

// ─── Bonus-card mechanism (#116 pre-game selection) ───────────
// Append per-player extra cards onto an existing hands Map. Shared
// so both the deal and the pre-game finaliser route bonus cards
// through one code path. `extraCards` may be a Map or a plain object
// keyed by playerId → Card[]. Players absent from the map are left
// untouched. Returns the same `hands` Map for chaining.
function _appendExtraCards(hands, extraCards) {
  if (!hands || !extraCards) return hands;
  const lookup = extraCards instanceof Map
    ? (pid) => extraCards.get(pid)
    : (pid) => extraCards[pid];
  for (const pid of hands.keys()) {
    const extra = lookup(pid);
    if (Array.isArray(extra) && extra.length) {
      hands.get(pid).push(...extra);
    }
  }
  return hands;
}

function dealCards(deck, orderedPlayerIds, cardsPerPlayer = 6, extraCards = null) {
  const hands = new Map();
  let remaining = [...deck];
  for (const pid of orderedPlayerIds) {
    hands.set(pid, remaining.splice(0, cardsPerPlayer));
  }
  _appendExtraCards(hands, extraCards);
  return { hands, remainingDeck: remaining };
}

module.exports = {
  generateDeck,
  shuffleDeck,
  buildPowerCards,
  buildDeck,
  dealCards,
  _appendExtraCards,
};
