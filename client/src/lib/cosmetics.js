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

// ─── Deck skins (card backs + the player's own hand's card faces) ──
// `back_leather` is the original CSS-only leather look. The others carry a
// `frame`: a self-contained colored SVG (built from the owner-supplied frame
// art by client/scripts/build-cosmetic-decks.mjs, in public/cosmetics) that
// paints BOTH the face-down backs and, with the shape + number overlaid in
// its empty centre, this player's own hand cards. `accent` colours the
// filigree/glow accents wherever the skin shows.
export const CARD_BACKS = {
  back_leather: { a: '#1e1410', b: '#120d09', c: '#1a1108', accent: 'var(--accent)' },
  back_noir: { frame: '/cosmetics/deck_noir.svg', field: '#0c0b0f', accent: '#c8a35a' },
  back_crimson: { frame: '/cosmetics/deck_crimson.svg', field: '#691d2b', accent: '#c4a060' },
  back_neon: { frame: '/cosmetics/deck_neon.svg', field: '#141436', accent: '#45e6e6' },
  back_kente: { frame: '/cosmetics/deck_kente.svg', field: '#aa5229', accent: '#e2a92e' },
  back_cosmos: { frame: '/cosmetics/deck_cosmos.svg', field: '#060609', accent: '#9a6ae8' },
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
// CenterTablePanel + CardHand and friends). Spread onto the OnlinePlayerUI
// root so the viewer's OWN felt + deck skin theme everything below; defaults
// in the CSS keep the original look when no cosmetics are equipped.
//
// Two deck-skin flavours:
//  • CSS-only (leather): gradient stop vars + the gold mini-filigree overlay.
//  • Frame art: --cardback-bg / --cardface-bg point at the skin SVG (which is
//    self-contained — field + ornament), and the filigree overlay is hidden
//    (--cardback-filigree-opacity: 0) so it doesn't fight the artwork.
export function cosmeticStyleVars(equipped) {
  const felt = tableFeltFor(equipped?.tableFelt);
  const back = cardBackFor(equipped?.cardBack);
  const vars = {
    '--felt-hi': felt.hi,
    '--felt-mid1': felt.mid1,
    '--felt-mid2': felt.mid2,
    '--felt-low': felt.low,
    '--felt-edge': felt.edge,
    '--cardback-accent': back.accent,
  };
  if (back.frame) {
    vars['--cardback-bg'] = `url("${back.frame}")`;
    vars['--cardface-bg'] = `url("${back.frame}")`;
    vars['--cardback-filigree-opacity'] = '0';
  } else {
    vars['--cardback-a'] = back.a;
    vars['--cardback-b'] = back.b;
    vars['--cardback-c'] = back.c;
  }
  return vars;
}
