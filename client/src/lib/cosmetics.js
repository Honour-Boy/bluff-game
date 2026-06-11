// ============================================================
// COSMETICS — client render definitions for the #205 unlock catalog
// ============================================================
// The server owns WHAT exists / what's unlocked / what's equipped
// (engine/progression.js); this module owns only how each id LOOKS.
// Ids must match the server catalog exactly. Everything is plain CSS
// values (gradients + hexes) — no image assets — applied through CSS
// custom properties so the existing table styles pick them up with
// their current look as the fallback.

// ─── Gun / cylinder skins (SpinOverlay) ───────────────────────
// Keys mirror the hard-coded colors CylinderSVG used before #205;
// `gun_steel` IS that original palette.
export const GUN_SKINS = {
  gun_steel: {
    body: '#111118', bodyStroke: '#2a2a35',
    chamber: '#0d0d18', chamberStroke: '#333',
    hub: '#222230', hubStroke: '#444',
  },
  gun_brass: {
    body: '#1d1607', bodyStroke: '#8a6a24',
    chamber: '#171003', chamberStroke: '#9a7a2e',
    hub: '#3a2c10', hubStroke: '#c89a3e',
  },
  gun_obsidian: {
    body: '#0a0812', bodyStroke: '#4d3568',
    chamber: '#0c0716', chamberStroke: '#5b3f86',
    hub: '#1d1430', hubStroke: '#8a64c8',
  },
  gun_gilded: {
    body: '#241a05', bodyStroke: '#c8922e',
    chamber: '#1a1204', chamberStroke: '#e0b04f',
    hub: '#4a3408', hubStroke: '#f0c860',
  },
};

// ─── Card backs (deck / played pile / reveal back / lobby deal) ──
// `back_leather` is the original leather-look gradient.
export const CARD_BACKS = {
  back_leather: { a: '#1e1410', b: '#120d09', c: '#1a1108', accent: 'var(--accent)' },
  back_crimson: { a: '#2c0e12', b: '#170708', c: '#240b0e', accent: '#d8606a' },
  back_midnight: { a: '#0e1626', b: '#070b14', c: '#0c1220', accent: '#6f8fd8' },
  back_royal: { a: '#1c1030', b: '#0e0818', c: '#170d28', accent: '#b08fe8' },
};

// ─── Table felts (the oval's cloth) ───────────────────────────
// `felt_emerald` is the original green felt.
export const TABLE_FELTS = {
  felt_emerald: { hi: '#2f5e3f', mid1: '#245132', mid2: '#18391f', low: '#0e2415', edge: '#0a1a10' },
  felt_wine: { hi: '#5e2f3a', mid1: '#51242f', mid2: '#391820', low: '#240e13', edge: '#1a0a0d' },
  felt_midnight: { hi: '#2f3f5e', mid1: '#243251', mid2: '#182339', low: '#0e1524', edge: '#0a0f1a' },
  felt_ocean: { hi: '#2f5e58', mid1: '#245149', mid2: '#183934', low: '#0e2420', edge: '#0a1a17' },
};

export const DEFAULT_EQUIPPED = {
  gunSkin: 'gun_steel',
  cardBack: 'back_leather',
  tableFelt: 'felt_emerald',
};

export function gunSkinFor(id) {
  return GUN_SKINS[id] || GUN_SKINS[DEFAULT_EQUIPPED.gunSkin];
}

export function cardBackFor(id) {
  return CARD_BACKS[id] || CARD_BACKS[DEFAULT_EQUIPPED.cardBack];
}

export function tableFeltFor(id) {
  return TABLE_FELTS[id] || TABLE_FELTS[DEFAULT_EQUIPPED.tableFelt];
}

// The CSS custom properties the table styles consume (helpers.js +
// CenterTablePanel). Spread onto the OnlinePlayerUI root so the viewer's
// OWN felt + card back theme everything below; defaults in the CSS keep
// the original look when no cosmetics are equipped.
export function cosmeticStyleVars(equipped) {
  const felt = tableFeltFor(equipped?.tableFelt);
  const back = cardBackFor(equipped?.cardBack);
  return {
    '--felt-hi': felt.hi,
    '--felt-mid1': felt.mid1,
    '--felt-mid2': felt.mid2,
    '--felt-low': felt.low,
    '--felt-edge': felt.edge,
    '--cardback-a': back.a,
    '--cardback-b': back.b,
    '--cardback-c': back.c,
    '--cardback-accent': back.accent,
  };
}
