"use client";

// ─── PowerCardBack ────────────────────────────────────────────
// The face-down side of a power card. Visually distinct from the
// shape-card back so opponents know "something special is in play"
// without learning which power. Uses a metallic frame + a stylised
// "?" glyph in lime over a tessellated chevron field.
//
// Props
//   size  : 'sm' | 'md' | 'lg'  — same dimensions as PowerCard
//   style : extra inline styles
// ──────────────────────────────────────────────────────────────

const SIZES = {
  sm: { w: 64, h: 96, mark: 32, radius: 4, frame: 2 },
  md: { w: 116, h: 168, mark: 64, radius: 6, frame: 3 },
  lg: { w: 220, h: 320, mark: 128, radius: 8, frame: 4 },
};

export function PowerCardBack({ size = "md", style }) {
  const s = SIZES[size] || SIZES.md;

  return (
    <div
      style={{
        width: s.w,
        height: s.h,
        position: "relative",
        background:
          "linear-gradient(155deg, #0e0e12 0%, #08080b 55%, #050506 100%)",
        border: "2px solid var(--border)",
        borderRadius: s.radius,
        overflow: "hidden",
        boxShadow:
          "0 0 16px rgba(232,255,74,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
        userSelect: "none",
        ...style,
      }}
      data-power-back
      data-size={size}
    >
      {/* Chevron pattern field */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(
            45deg,
            rgba(232,255,74,0.05) 0,
            rgba(232,255,74,0.05) 1px,
            transparent 1px,
            transparent 9px
          ), repeating-linear-gradient(
            -45deg,
            rgba(74,255,219,0.04) 0,
            rgba(74,255,219,0.04) 1px,
            transparent 1px,
            transparent 9px
          )`,
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />

      {/* Inner metallic frame (double rule) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: s.frame * 2,
          border: "1px solid rgba(207,210,214,0.35)",
          borderRadius: Math.max(2, s.radius - 2),
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: s.frame * 2 + 3,
          border: "1px solid rgba(232,255,74,0.18)",
          borderRadius: Math.max(2, s.radius - 3),
          pointerEvents: "none",
        }}
      />

      {/* Center mark — stylised "?" inside a metallic ring */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width={s.mark}
          height={s.mark}
          aria-label="power card back"
          style={{
            filter:
              "drop-shadow(0 0 10px rgba(232,255,74,0.45)) drop-shadow(0 0 24px rgba(207,210,214,0.18))",
          }}
        >
          {/* Outer metallic ring */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#cfd2d6"
            strokeWidth="2.5"
            opacity="0.7"
          />
          {/* Inner accent ring */}
          <circle
            cx="50"
            cy="50"
            r="32"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            opacity="0.85"
          />
          {/* Question glyph — drawn in Bebas-style stroke, not text */}
          <path
            d="M38 36 Q38 26 50 26 Q62 26 62 36 Q62 44 54 48 Q50 50 50 56 L50 60"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="72" r="4.5" fill="var(--accent)" />
        </svg>
      </div>

      {/* Tiny corner ticks for cardstock feel */}
      {[
        { top: 6, left: 6 },
        { top: 6, right: 6 },
        { bottom: 6, left: 6 },
        { bottom: 6, right: 6 },
      ].map((pos, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: "absolute",
            width: 6,
            height: 6,
            borderTop:
              pos.top !== undefined ? "1px solid rgba(207,210,214,0.5)" : "none",
            borderBottom:
              pos.bottom !== undefined
                ? "1px solid rgba(207,210,214,0.5)"
                : "none",
            borderLeft:
              pos.left !== undefined ? "1px solid rgba(207,210,214,0.5)" : "none",
            borderRight:
              pos.right !== undefined
                ? "1px solid rgba(207,210,214,0.5)"
                : "none",
            ...pos,
          }}
        />
      ))}
    </div>
  );
}
