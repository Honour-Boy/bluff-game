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
// The locker is gun_steel (the original look, Lv1 default) + the five
// owner-art identities — nothing else.
//
// Art skins: `art` is the owner's actual chamber artwork (traced vectors
// rasterized by scripts/build-chamber-skins.mjs onto CylinderSVG's exact
// disc geometry). It paints body, decorated rims, hole interiors and hub;
// CylinderSVG draws only the live game state (bullets) ON TOP. `holes` are
// the SIX measured centres of THIS artwork's painted holes (the art's holes
// deviate slightly from a perfect ring — cosmetic-previews/table-previews/
// measure3.mjs computes them) and `holeR` their radius, so the state
// circles sit exactly in the paint. `bullet` themes the round itself
// ({ fill: casing disc, core: centre, landingCore: centre when the spin
// lands on it }) — only the default steel keeps the original red. The flat
// fields stay as the decode-time fallback.
export const GUN_SKINS = {
  gun_steel: {
    body: '#111118', bodyStroke: '#2a2a35',
    chamber: '#0d0d18', chamberStroke: '#333',
    hub: '#222230', hubStroke: '#444',
  },
  gun_noir: {
    art: '/cosmetics/chamber_noir.png', holeR: 18,
    holes: [[100, 42.9], [150.6, 73], [150.6, 127.2], [99.9, 156.5], [50.1, 127.8], [49.9, 73]],
    bullet: { fill: '#1a1408', core: '#c8a35a', landingCore: '#f2d88a' },
    body: '#0d0c11', bodyStroke: '#c8a35a',
    chamber: '#070609', chamberStroke: '#9a7438',
    hub: '#1d1a24', hubStroke: '#ecd28c',
  },
  gun_crimson: {
    art: '/cosmetics/chamber_crimson.png', holeR: 17.5,
    holes: [[100.6, 41.8], [145.3, 65.9], [145.2, 132], [100, 157.1], [55.5, 133.1], [55.1, 65.4]],
    bullet: { fill: '#241008', core: '#c4a060', landingCore: '#f0d080' },
    body: '#4c1320', bodyStroke: '#c4a060',
    chamber: '#1a060c', chamberStroke: '#9c7a40',
    hub: '#6b1e2c', hubStroke: '#e6cd8e',
  },
  gun_neon: {
    art: '/cosmetics/chamber_neon.png', holeR: 16.5,
    holes: [[100.4, 43.4], [147.6, 72.4], [147.1, 129.4], [100.2, 157], [53.2, 129.1], [53.1, 71.9]],
    bullet: { fill: '#14062a', core: '#e84dd0', landingCore: '#ff8ae8' },
    body: '#141436', bodyStroke: '#45e6e6',
    chamber: '#0c0c26', chamberStroke: '#6a8af0',
    hub: '#1b1b42', hubStroke: '#e84dd0',
  },
  gun_kente: {
    art: '/cosmetics/chamber_kente.png', holeR: 16.5,
    holes: [[101.4, 37.5], [154, 69.8], [153, 125.5], [100.5, 158], [48, 125.3], [47.8, 67.5]],
    bullet: { fill: '#1c150d', core: '#e2a92e', landingCore: '#ffd34d' },
    body: '#8d4220', bodyStroke: '#e2a92e',
    chamber: '#1c150d', chamberStroke: '#e2a92e',
    hub: '#2f6b3a', hubStroke: '#e2a92e',
  },
  gun_cosmos: {
    art: '/cosmetics/chamber_cosmos.png', holeR: 21,
    holes: [[100.3, 50.9], [143.8, 78], [144.5, 128.1], [99.7, 150.1], [56, 126.3], [57.5, 78.5]],
    bullet: { fill: '#0d081e', core: '#9a6ae8', landingCore: '#e88ad8' },
    body: '#0a0a14', bodyStroke: '#9a6ae8',
    chamber: '#06060c', chamberStroke: '#4a8ae0',
    hub: '#10101e', hubStroke: '#e88ad8',
  },
};

// ─── Deck skins (card backs + the player's own hand's card faces) ──
// `back_leather` is the original CSS-only leather look. The others carry a
// `frame`: a self-contained colored SVG (built from the owner-supplied frame
// art by client/scripts/build-cosmetic-decks.mjs, in public/cosmetics) that
// paints BOTH the face-down backs and, with the shape + number overlaid in
// its empty centre, this player's own hand cards. `accent` colours the
// filigree/glow accents wherever the skin shows. `ink` (optional) overrides
// the number/label text colour on the FACE — set it dark for skins with a
// BRIGHT field (kente) where the default light text would wash out.
// Perf: `frame` points at PNG rasters (scripts/build-deck-rasters.mjs), not
// the source SVGs — painting the vector art on every card re-rasterized it
// per element size and made the table lag (worst on the heavy kente trace).
export const CARD_BACKS = {
  back_leather: { a: '#1e1410', b: '#120d09', c: '#1a1108', accent: 'var(--accent)' },
  back_noir: { frame: '/cosmetics/deck_noir.png', field: '#0c0b0f', accent: '#c8a35a' },
  back_crimson: { frame: '/cosmetics/deck_crimson.png', field: '#691d2b', accent: '#c4a060' },
  back_neon: { frame: '/cosmetics/deck_neon.png', field: '#141436', accent: '#45e6e6' },
  back_kente: { frame: '/cosmetics/deck_kente.png', field: '#aa5229', accent: '#e2a92e', ink: '#190f06' },
  back_cosmos: { frame: '/cosmetics/deck_cosmos.png', field: '#060609', accent: '#9a6ae8' },
};

// ─── Table felts (the oval's cloth) ───────────────────────────
// `felt_emerald` is the original green felt. The art felts carry a `frame`:
// a self-contained SVG underlay (procedural rim ornament + base cloth,
// generated by client/scripts/build-cosmetic-decks.mjs into public/cosmetics)
// painted through `--felt-bg` ABOVE the colour gradient — the hi…edge tones
// match the SVG's base so the gradient is a faithful fallback while the
// image decodes (and feeds any colour-only consumers like swatches).
export const TABLE_FELTS = {
  felt_emerald: { hi: '#2f5e3f', mid1: '#245132', mid2: '#18391f', low: '#0e2415', edge: '#0a1a10' },
  felt_noir: { frame: '/cosmetics/felt_noir.svg', hi: '#211d29', mid1: '#14121a', mid2: '#0e0d13', low: '#0b0a0f', edge: '#07060a' },
  felt_crimson: { frame: '/cosmetics/felt_crimson.svg', hi: '#8a2a3c', mid1: '#6b1e2c', mid2: '#581826', low: '#4c1320', edge: '#3a0d18' },
  felt_neon: { frame: '/cosmetics/felt_neon.svg', hi: '#20204c', mid1: '#17173c', mid2: '#131336', low: '#101030', edge: '#0c0c26' },
  felt_kente: { frame: '/cosmetics/felt_kente.svg', hi: '#c06636', mid1: '#a85128', mid2: '#9a4924', low: '#8d4220', edge: '#7a3719' },
  felt_cosmos: { frame: '/cosmetics/felt_cosmos.svg', hi: '#10101e', mid1: '#0a0a14', mid2: '#080810', low: '#06060c', edge: '#06060c' },
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
  // Art felt: the SVG underlay paints over the colour gradient (which stays
  // as the decode-time fallback). `.poker-table-felt` defaults the layer to
  // `none`, so colour-only felts are untouched.
  if (felt.frame) {
    vars['--felt-bg'] = `url("${felt.frame}")`;
  }
  if (back.frame) {
    vars['--cardback-bg'] = `url("${back.frame}")`;
    vars['--cardface-bg'] = `url("${back.frame}")`;
    vars['--cardback-filigree-opacity'] = '0';
    // Bright-field skins (kente) carry a dark ink so face text stays legible;
    // dark skins leave it unset and the per-surface light fallbacks apply.
    if (back.ink) vars['--cardface-ink'] = back.ink;
  } else {
    vars['--cardback-a'] = back.a;
    vars['--cardback-b'] = back.b;
    vars['--cardback-c'] = back.c;
  }
  return vars;
}
