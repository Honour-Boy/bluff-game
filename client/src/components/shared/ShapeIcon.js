"use client";

// ─── Colour palette (one accent per shape) ────────────────────
export const SHAPE_COLORS = {
  circle: "#4affdb",
  triangle: "#ff4a6e",
  cross: "#ffaa4a",
  square: "#e8ff4a",
  star: "#c44aff",
  whot: "#e8ff4a",
};

// ─── SVG paths — all in a 100×100 viewBox ────────────────────
// Every shape is drawn with comparable visual weight so they feel
// consistent when placed side-by-side at the same pixel size.
const PATHS = {
  // Filled circle (r = 38, centred)
  circle: (c) => <circle cx="50" cy="50" r="38" fill={c} />,

  // Rounded-corner square (76×76 box, r = 8)
  square: (c) => (
    <rect x="12" y="12" width="76" height="76" rx="8" ry="8" fill={c} />
  ),

  // Equilateral triangle (wide base, apex near top)
  triangle: (c) => <polygon points="50,8 93,88 7,88" fill={c} />,

  // Plus/cross (arm width ≈ 28, arm length ≈ 38 each side)
  cross: (c) => (
    <path d="M36,10 H64 V36 H90 V64 H64 V90 H36 V64 H10 V36 H36 Z" fill={c} />
  ),

  // 5-pointed star (outer r ≈ 46, inner r ≈ 19)
  star: (c) => (
    <polygon
      points="50,4 61,35 94,36 68,57 78,88 50,69 22,88 32,57 6,36 39,35"
      fill={c}
    />
  ),

  // Whot wild-card — "W" glyph in a circle
  whot: (c) => (
    <g>
      <circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="6" />
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontSize="52"
        fontWeight="900"
        fontFamily="'Bebas Neue', Impact, sans-serif"
        fill={c}
        letterSpacing="-2"
      >
        W
      </text>
    </g>
  ),
};

/**
 * ShapeIcon — renders a crisp SVG icon for a Whot shape.
 *
 * Props
 *   shape   : 'circle' | 'triangle' | 'cross' | 'square' | 'star' | 'whot'
 *   size    : pixel width/height (default 24)
 *   color   : override fill color (default = SHAPE_COLORS[shape])
 *   style   : extra inline styles for the <svg> element
 */
export function ShapeIcon({ shape, size = 24, color, style }) {
  const fill = color || SHAPE_COLORS[shape] || "#ffffff";
  const draw = PATHS[shape] || PATHS.square;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-label={shape}
    >
      {draw(fill)}
    </svg>
  );
}

/**
 * Convenience: mapping from shape key → { label, color }
 * Used by CardShape and other display components.
 */
export const SHAPE_META = {
  circle: { label: "Circle", color: SHAPE_COLORS.circle },
  triangle: { label: "Triangle", color: SHAPE_COLORS.triangle },
  cross: { label: "Cross", color: SHAPE_COLORS.cross },
  square: { label: "Square", color: SHAPE_COLORS.square },
  star: { label: "Star", color: SHAPE_COLORS.star },
  whot: { label: "Whot", color: SHAPE_COLORS.whot },
};
