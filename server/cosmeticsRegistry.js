// ============================================================
// COSMETICS — Static catalog (one source of truth for server + client)
// ============================================================
// Each entry has a stable `id`, a display `label`, and an `xpRequired`
// unlock threshold. The free defaults (xpRequired: 0) are always
// available. New tiers align with XP_TIERS in engine/xp.js.

const COSMETICS = {
  gunSkins: [
    { id: 'gun_default',  label: 'Iron Classic',  xpRequired: 0    },
    { id: 'gun_gold',     label: 'Gold Rush',     xpRequired: 100  },
    { id: 'gun_obsidian', label: 'Obsidian',      xpRequired: 300  },
    { id: 'gun_chrome',   label: 'Chrome Outlaw', xpRequired: 750  },
    { id: 'gun_crimson',  label: 'Crimson Ace',   xpRequired: 1500 },
  ],
  cardBacks: [
    { id: 'card_default', label: 'Parchment',     xpRequired: 0    },
    { id: 'card_noir',    label: 'Noir',          xpRequired: 100  },
    { id: 'card_gilded',  label: 'Gilded',        xpRequired: 750  },
    { id: 'card_blood',   label: 'Blood Red',     xpRequired: 1500 },
  ],
  tableFelts: [
    { id: 'felt_default',  label: 'Smoke Green',   xpRequired: 0    },
    { id: 'felt_emerald',  label: 'Emerald',       xpRequired: 300  },
    { id: 'felt_midnight', label: 'Midnight Blue', xpRequired: 750  },
  ],
};

// ─── Derived helpers ─────────────────────────────────────────

// Per-slot Sets for fast id validation.
const SLOT_IDS = {
  gunSkin:   new Set(COSMETICS.gunSkins.map(c => c.id)),
  cardBack:  new Set(COSMETICS.cardBacks.map(c => c.id)),
  tableFelt: new Set(COSMETICS.tableFelts.map(c => c.id)),
};

const DEFAULT_SELECTIONS = {
  gunSkin:   'gun_default',
  cardBack:  'card_default',
  tableFelt: 'felt_default',
};

// Flat array of all items for lookup by id.
const ALL_ITEMS = [
  ...COSMETICS.gunSkins,
  ...COSMETICS.cardBacks,
  ...COSMETICS.tableFelts,
];

/**
 * Cosmetic IDs whose xpRequired ≤ totalXp.
 */
function getUnlocked(totalXp) {
  return ALL_ITEMS
    .filter(c => (totalXp || 0) >= c.xpRequired)
    .map(c => c.id);
}

/**
 * Returns { ok: true } if the selection is valid and unlocked.
 * Returns { ok: false, error: string } otherwise.
 */
function validateSelection(slot, id, totalXp) {
  if (!SLOT_IDS[slot]) return { ok: false, error: 'Unknown cosmetic slot' };
  if (!SLOT_IDS[slot].has(id)) return { ok: false, error: 'Unknown cosmetic for this slot' };
  const item = ALL_ITEMS.find(c => c.id === id);
  if (!item) return { ok: false, error: 'Cosmetic not found' };
  if ((totalXp || 0) < item.xpRequired) {
    return { ok: false, error: `Requires ${item.xpRequired} XP (you have ${totalXp || 0})` };
  }
  return { ok: true };
}

module.exports = { COSMETICS, SLOT_IDS, DEFAULT_SELECTIONS, ALL_ITEMS, getUnlocked, validateSelection };
