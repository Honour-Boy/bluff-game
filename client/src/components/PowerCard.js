"use client";

// ─── PowerCard ────────────────────────────────────────────────
// Visual identity for v2 power cards. Pure presentational — no
// state, no triggers, no game wiring. The Phase B agent will plumb
// activation logic on top of this.
//
// Props
//   type   : 'shield' | 'mirror' | 'swap' | 'peek' | 'freeze' | 'assassin'
//   size   : 'sm' (chip / list)  |  'md' (in-hand)  |  'lg' (full reveal)
//   style  : extra inline styles for the outer card
//
// All visual values come from CSS custom properties in globals.css
// or the per-type colour table below. The card is dark, near-black,
// with a unique coloured glowing border per power type.
// ──────────────────────────────────────────────────────────────

// Per-type colour + flavour metadata (verbatim from spec, Section 1).
export const POWER_META = {
  shield: {
    label: "Shield",
    color: "#cfd2d6", // silver chrome
    flavor: "Block all bluff calls for one complete activation cycle.",
  },
  mirror: {
    label: "Mirror",
    color: "#7a3cff", // deep purple
    flavor: "Redirect any bluff consequence back to its source.",
  },
  swap: {
    label: "Swap",
    color: "#d96b1f", // burnt orange
    flavor: "Exchange your played card with one from this round's played cards.",
  },
  peek: {
    label: "Peek",
    color: "#4affdb", // teal cyan — matches --accent3
    flavor: "See the last card played before making your decision.",
  },
  freeze: {
    label: "Freeze",
    color: "#7cd5ff", // ice blue
    flavor: "Skip the next player's turn entirely.",
  },
  assassin: {
    label: "Assassin",
    color: "#b8143a", // deep crimson
    flavor: "If they dare call your bluff, they pay with their life.",
  },
};

export const POWER_TYPES = Object.keys(POWER_META);

// ─── Inline SVG icons (one per type) ──────────────────────────
// Drawn in a 100×100 viewBox to match ShapeIcon's pattern.
// All icons are simple, glyph-like, and use stroke-based geometry
// so a single colour renders cleanly at any size.
const ICONS = {
  // Crested shield silhouette
  shield: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M50 8 L86 22 L86 52 C86 72 70 86 50 92 C30 86 14 72 14 52 L14 22 Z" fill={`${c}22`} />
      <path d="M50 28 L50 70 M32 44 L68 44" />
    </g>
  ),

  // Hand mirror — circle on a stem with reflective highlight
  mirror: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="50" cy="38" r="26" fill={`${c}22`} />
      <path d="M50 64 L50 92" />
      <path d="M40 28 Q44 22 54 24" stroke={`${c}aa`} strokeWidth="4" fill="none" />
    </g>
  ),

  // Two arrows looping past each other (swap)
  swap: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M18 36 H72 L62 26 M18 36 L28 46" />
      <path d="M82 64 H28 L38 74 M82 64 L72 54" />
    </g>
  ),

  // Eye with pupil (peek)
  peek: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M10 50 Q50 18 90 50 Q50 82 10 50 Z" fill={`${c}11`} />
      <circle cx="50" cy="50" r="12" fill={c} stroke="none" />
      <circle cx="54" cy="46" r="3" fill="#0a0a0b" stroke="none" />
    </g>
  ),

  // Snowflake (freeze)
  freeze: (c) => (
    <g fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M50 8 L50 92" />
      <path d="M14 30 L86 70" />
      <path d="M14 70 L86 30" />
      <path d="M50 22 L42 30 M50 22 L58 30" />
      <path d="M50 78 L42 70 M50 78 L58 70" />
      <path d="M22 38 L26 28 M22 38 L12 38" />
      <path d="M78 62 L74 72 M78 62 L88 62" />
      <path d="M22 62 L12 62 M22 62 L26 72" />
      <path d="M78 38 L88 38 M78 38 L74 28" />
    </g>
  ),

  // Crossed daggers (assassin)
  assassin: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M22 22 L60 60 L66 78 L48 72 L10 34 Z" fill={`${c}22`} />
      <path d="M78 22 L40 60 L34 78 L52 72 L90 34 Z" fill={`${c}22`} />
      <circle cx="50" cy="50" r="3" fill={c} stroke="none" />
    </g>
  ),
};

// ─── Size table ───────────────────────────────────────────────
const SIZES = {
  sm: { w: 64, h: 96, icon: 32, name: 11, flavor: 0, pad: 6, radius: 4 },
  md: { w: 116, h: 168, icon: 56, name: 16, flavor: 9, pad: 10, radius: 6 },
  lg: { w: 220, h: 320, icon: 112, name: 30, flavor: 12, pad: 18, radius: 8 },
};

// ─── Component ────────────────────────────────────────────────
export function PowerCard({ type, size = "md", style }) {
  const meta = POWER_META[type] || POWER_META.shield;
  const s = SIZES[size] || SIZES.md;
  const draw = ICONS[type] || ICONS.shield;

  // Glow intensity scales subtly with size for visual weight
  const glowOuter = size === "lg" ? 28 : size === "md" ? 16 : 8;
  const glowInner = size === "lg" ? 4 : size === "md" ? 2 : 1;
  const showName = size !== "sm" || s.name > 0;
  const showFlavor = size === "lg";

  return (
    <div
      style={{
        width: s.w,
        height: s.h,
        position: "relative",
        background:
          "linear-gradient(160deg, #0d0d10 0%, #08080a 55%, #050507 100%)",
        border: `2px solid ${meta.color}`,
        borderRadius: s.radius,
        padding: s.pad,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: showFlavor ? "space-between" : "center",
        gap: size === "lg" ? 14 : 6,
        boxShadow: `
          0 0 ${glowOuter}px ${meta.color}55,
          0 0 ${glowOuter * 2}px ${meta.color}22,
          inset 0 0 ${glowInner * 8}px ${meta.color}18,
          inset 0 1px 0 rgba(255,255,255,0.04)
        `,
        userSelect: "none",
        overflow: "hidden",
        ...style,
      }}
      data-power-type={type}
      data-size={size}
    >
      {/* Inner faint frame for depth */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 4,
          border: `1px solid ${meta.color}33`,
          borderRadius: Math.max(2, s.radius - 2),
          pointerEvents: "none",
        }}
      />

      {/* Top label rail (only md / lg) */}
      {size !== "sm" && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "'Space Mono', monospace",
            fontSize: size === "lg" ? 9 : 8,
            letterSpacing: "0.22em",
            color: `${meta.color}cc`,
            textTransform: "uppercase",
            textAlign: "center",
            width: "100%",
            paddingTop: 2,
          }}
        >
          Power · {type}
        </div>
      )}

      {/* Icon */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: s.icon,
          height: s.icon,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: `drop-shadow(0 0 ${size === "lg" ? 12 : 6}px ${meta.color}aa)`,
        }}
      >
        <svg viewBox="0 0 100 100" width={s.icon} height={s.icon} aria-label={meta.label}>
          {draw(meta.color)}
        </svg>
      </div>

      {/* Name */}
      {showName && size !== "sm" && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: s.name,
            letterSpacing: "0.14em",
            color: meta.color,
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1,
            textShadow: `0 0 8px ${meta.color}aa`,
          }}
        >
          {meta.label}
        </div>
      )}

      {/* Tiny name for sm chips */}
      {size === "sm" && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: meta.color,
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1,
            marginTop: 2,
          }}
        >
          {meta.label}
        </div>
      )}

      {/* Flavor (lg only) */}
      {showFlavor && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "'Space Mono', monospace",
            fontSize: s.flavor,
            color: "var(--text-dim)",
            textAlign: "center",
            lineHeight: 1.4,
            letterSpacing: "0.04em",
            paddingBottom: 2,
            borderTop: `1px solid ${meta.color}22`,
            paddingTop: 10,
            width: "100%",
          }}
        >
          {meta.flavor}
        </div>
      )}
    </div>
  );
}
