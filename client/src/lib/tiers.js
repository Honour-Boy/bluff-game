// ─── Client tier helpers (Phase 5) ────────────────────────────────────────────
// Mirror of the server's tier model (`server/engine/progression.js`):
// levels 1–20 group into four tiers, each gating which room mechanics a host
// may enable. Tier is purely derived from level, so the client never needs a
// dedicated wire field — `roomState.tier` (in-room) and `levelForXp` (lobby)
// are enough. Keep the boundaries in lockstep with the server's `tierForLevel`.

export const TIER_ORDER = ['streets', 'backroads', 'syndicate', 'covenant'];

// Display + style metadata. Colours reuse existing globals.css custom
// properties (no new tokens): Streets dim, Backroads aged-brass, Syndicate
// verdigris, Covenant gold-with-glow.
export const TIER_META = {
  streets: {
    label: 'Streets',
    name: 'The Streets',
    minLevel: 1,
    color: 'var(--text-dim)',
    fill: '#b89150', // warm amber bar fill
    glow: null,
  },
  backroads: {
    label: 'Backroads',
    name: 'The Backroads',
    minLevel: 3,
    color: 'var(--accent-dim)',
    fill: 'var(--accent-dim)', // aged brass
    glow: null,
  },
  syndicate: {
    label: 'Syndicate',
    name: 'The Syndicate',
    minLevel: 9,
    color: 'var(--accent3)',
    fill: 'var(--accent3)', // ember / verdigris accent
    glow: null,
  },
  covenant: {
    label: 'Covenant',
    name: 'The Covenant',
    minLevel: 14,
    color: 'var(--accent)',
    fill: 'var(--accent)', // gold
    glow: 'var(--glow-gold)',
  },
};

// Level → tier name. Never throws (guests / undefined → 'streets').
export function tierForLevel(level) {
  const l = Math.max(1, Math.min(20, Math.floor(Number(level)) || 1));
  if (l <= 2) return 'streets';
  if (l <= 8) return 'backroads';
  if (l <= 13) return 'syndicate';
  return 'covenant';
}

export function tierMeta(tier) {
  return TIER_META[tier] || TIER_META.streets;
}

// The tier immediately above `tier`, or null at the top (Covenant).
export function nextTier(tier) {
  const i = TIER_ORDER.indexOf(tier);
  if (i < 0 || i >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[i + 1];
}
