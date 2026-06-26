// ============================================================
// TierSigil - escalating rank emblems (Streets → Covenant)
// ============================================================
// One construction language across all four tiers: a revolver-cylinder
// medallion (6 chambers around a hub) - the game's core motif. Rank escalates
// by FORM, not colour alone, so it reads even at 14px:
//   • Streets   - bare ring, 1 loaded chamber (pewter)
//   • Backroads - + laurel wreath flanks, 2 loaded (aged brass)
//   • Syndicate - + a crown of points, 3 loaded (verdigris)
//   • Covenant  - double seal ring + radiant ticks + apex star, all 6 loaded,
//                 gold with a glow (gold)
// Pure inline SVG, no deps. Sizes cleanly from a 14px chip badge to a 44px crest.

const PALETTE = {
  streets: { base: '#9a8f7a', lite: '#cabfa6', glow: null },
  backroads: { base: '#b8862f', lite: '#e6bd6a', glow: null },
  syndicate: { base: '#3f8f7a', lite: '#74c8b0', glow: null },
  covenant: { base: '#f0b54a', lite: '#ffe9b0', glow: 'rgba(240,181,74,0.55)' },
};

const LOADED = { streets: 1, backroads: 2, syndicate: 3, covenant: 6 };

let _seq = 0;

// Six cylinder chambers around the hub (top, then clockwise).
function chambers(grad, base, loadedCount) {
  const angles = [-90, -30, 30, 90, 150, 210];
  // Load from the top, clockwise - gives each rank a recognisable filled pattern.
  const loadOrder = [0, 3, 1, 4, 2, 5].slice(0, loadedCount);
  const loadedSet = new Set(loadOrder);
  return angles.map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const cx = 22 + Math.cos(a) * 9.5;
    const cy = 22 + Math.sin(a) * 9.5;
    const on = loadedSet.has(i);
    return (
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r="2.5"
        fill={on ? `url(#${grad})` : 'rgba(0,0,0,0.35)'}
        stroke={base}
        strokeWidth="1"
        opacity={on ? 1 : 0.7}
      />
    );
  });
}

// A 5-point crown band sitting on the top arc (Syndicate+).
function crown(base, grad) {
  return (
    <path
      d="M9 13 L13 7 L17 12 L22 5 L27 12 L31 7 L35 13 Z"
      fill={`url(#${grad})`}
      stroke={base}
      strokeWidth="0.8"
      strokeLinejoin="round"
    />
  );
}

// Two laurel arcs flanking the medallion (Backroads).
function laurels(base) {
  const leaf = (x, y, rot) => (
    <ellipse cx={x} cy={y} rx="2.6" ry="1.3" fill={base} opacity="0.9" transform={`rotate(${rot} ${x} ${y})`} />
  );
  return (
    <g opacity="0.95">
      <path d="M7 30 Q3 22 8 13" fill="none" stroke={base} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M37 30 Q41 22 36 13" fill="none" stroke={base} strokeWidth="1.4" strokeLinecap="round" />
      {leaf(5.5, 26, 35)}{leaf(5, 21, 15)}{leaf(6.5, 16, -10)}
      {leaf(38.5, 26, -35)}{leaf(39, 21, -15)}{leaf(37.5, 16, 10)}
    </g>
  );
}

// Radiating seal ticks between the double rings (Covenant).
function sealTicks(grad) {
  return Array.from({ length: 24 }).map((_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 20.5;
    const r2 = i % 2 === 0 ? 18.4 : 19.2;
    return (
      <line
        key={i}
        x1={22 + Math.cos(a) * r1}
        y1={22 + Math.sin(a) * r1}
        x2={22 + Math.cos(a) * r2}
        y2={22 + Math.sin(a) * r2}
        stroke={`url(#${grad})`}
        strokeWidth={i % 2 === 0 ? 1.2 : 0.7}
        strokeLinecap="round"
        opacity="0.85"
      />
    );
  });
}

export function TierSigil({ tier = 'streets', size = 40, glow }) {
  const pal = PALETTE[tier] || PALETTE.streets;
  const showGlow = glow ?? !!pal.glow;
  const gid = `tierGrad-${(_seq += 1)}`;
  const loaded = LOADED[tier] ?? 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      role="img"
      aria-label={`${tier} rank emblem`}
      style={{ display: 'block', filter: showGlow && pal.glow ? `drop-shadow(0 0 5px ${pal.glow})` : 'none', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.lite} />
          <stop offset="55%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.base} stopOpacity="0.78" />
        </linearGradient>
      </defs>

      {/* Tier ornaments (drawn behind the medallion ring). */}
      {tier === 'backroads' && laurels(pal.base)}
      {(tier === 'syndicate' || tier === 'covenant') && crown(pal.base, gid)}

      {/* Medallion ring(s). */}
      {tier === 'covenant' ? (
        <>
          {sealTicks(gid)}
          <circle cx="22" cy="22" r="17.5" stroke={`url(#${gid})`} strokeWidth="1" opacity="0.6" />
          <circle cx="22" cy="22" r="14.5" stroke={`url(#${gid})`} strokeWidth="1.8" />
        </>
      ) : (
        <circle cx="22" cy="22" r={tier === 'streets' ? 15.5 : 15} stroke={`url(#${gid})`} strokeWidth={tier === 'streets' ? 1.5 : 1.8} />
      )}

      {/* The shared revolver cylinder. */}
      {chambers(gid, pal.base, loaded)}
      <circle cx="22" cy="22" r="2.4" fill={`url(#${gid})`} />

      {/* Covenant apex star - the sealed crown jewel. */}
      {tier === 'covenant' && (
        <path d="M22 1.5 L23.4 5 L27 5.2 L24.2 7.6 L25.2 11 L22 9 L18.8 11 L19.8 7.6 L17 5.2 L20.6 5 Z" fill={`url(#${gid})`} stroke={pal.base} strokeWidth="0.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}
