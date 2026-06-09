// ============================================================
// CLIENT — Cosmetics catalog (mirrors server/cosmeticsRegistry.js)
// ============================================================
// Keep in sync with the server registry.  The server is authoritative
// for unlock validation; this file is used for rendering and the picker UI.

export const COSMETICS = {
  gunSkins: [
    { id: 'gun_default',  label: 'Iron Classic',  xpRequired: 0,    description: 'The classic tavern iron.' },
    { id: 'gun_gold',     label: 'Gold Rush',     xpRequired: 100,  description: 'Gilded in gambler\'s gold.' },
    { id: 'gun_obsidian', label: 'Obsidian',      xpRequired: 300,  description: 'Forged from volcanic glass.' },
    { id: 'gun_chrome',   label: 'Chrome Outlaw', xpRequired: 750,  description: 'Mirror-polished and merciless.' },
    { id: 'gun_crimson',  label: 'Crimson Ace',   xpRequired: 1500, description: 'Only legends carry this one.' },
  ],
  cardBacks: [
    { id: 'card_default', label: 'Parchment',     xpRequired: 0,    description: 'Aged parchment, worn with use.' },
    { id: 'card_noir',    label: 'Noir',          xpRequired: 100,  description: 'Deep black with silver trim.' },
    { id: 'card_gilded',  label: 'Gilded',        xpRequired: 750,  description: 'Embossed in gold leaf.' },
    { id: 'card_blood',   label: 'Blood Red',     xpRequired: 1500, description: 'For those who\'ve survived it all.' },
  ],
  tableFelts: [
    { id: 'felt_default',  label: 'Smoke Green',   xpRequired: 0,    description: 'The smoky saloon standard.' },
    { id: 'felt_emerald',  label: 'Emerald',       xpRequired: 300,  description: 'Rich emerald velvet.' },
    { id: 'felt_midnight', label: 'Midnight Blue', xpRequired: 750,  description: 'Deep as a desert night.' },
  ],
};

export const XP_TIERS = [
  { tier: 0, minXp: 0,    label: 'Greenhorn'  },
  { tier: 1, minXp: 100,  label: 'Gunslinger' },
  { tier: 2, minXp: 300,  label: 'Outlaw'     },
  { tier: 3, minXp: 750,  label: 'Desperado'  },
  { tier: 4, minXp: 1500, label: 'Legend'     },
];

export const DEFAULT_SELECTIONS = {
  gunSkin:   'gun_default',
  cardBack:  'card_default',
  tableFelt: 'felt_default',
};

// ─── Derived helpers ─────────────────────────────────────────

export function getTierForXp(totalXp) {
  for (let i = XP_TIERS.length - 1; i >= 0; i--) {
    if ((totalXp || 0) >= XP_TIERS[i].minXp) return XP_TIERS[i];
  }
  return XP_TIERS[0];
}

export function getNextTier(totalXp) {
  for (const tier of XP_TIERS) {
    if ((totalXp || 0) < tier.minXp) return tier;
  }
  return null; // max tier
}

export function isUnlocked(itemId, totalXp) {
  const allItems = [
    ...COSMETICS.gunSkins,
    ...COSMETICS.cardBacks,
    ...COSMETICS.tableFelts,
  ];
  const item = allItems.find(c => c.id === itemId);
  if (!item) return false;
  return (totalXp || 0) >= item.xpRequired;
}

/** CSS color / gradient to use for a gun skin id. */
export function gunSkinStyle(skinId) {
  switch (skinId) {
    case 'gun_gold':     return { color: '#d4a832', filter: 'sepia(0.6) saturate(3) hue-rotate(5deg)' };
    case 'gun_obsidian': return { color: '#1a1a2e', filter: 'brightness(0.4) contrast(2) saturate(0)' };
    case 'gun_chrome':   return { color: '#c8d8e8', filter: 'brightness(1.4) saturate(0.2) contrast(1.3)' };
    case 'gun_crimson':  return { color: '#8b1a1a', filter: 'sepia(1) saturate(5) hue-rotate(320deg) brightness(0.7)' };
    default:             return {};
  }
}

/** CSS variables to apply to the table scene for a felt id.
 *  --felt-bg:   bright center of the radial gradient
 *  --felt-edge: mid-ring color (36% stop) */
export function feltVars(feltId) {
  switch (feltId) {
    case 'felt_emerald':  return { '--felt-bg': '#2f7a52', '--felt-edge': '#1f5c3a' };
    case 'felt_midnight': return { '--felt-bg': '#1a2f6b', '--felt-edge': '#0f1d4a' };
    default:              return { '--felt-bg': '#2f5e3f', '--felt-edge': '#245132' };
  }
}

/** Accent color for a card back id. */
export function cardBackAccent(backId) {
  switch (backId) {
    case 'card_noir':    return '#b0b8c8';
    case 'card_gilded':  return '#d4a832';
    case 'card_blood':   return '#8b1a1a';
    default:             return 'var(--accent)';
  }
}
