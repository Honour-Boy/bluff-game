"use client";

import { useEffect, useState } from "react";

// ─── AnnouncementBanner ───────────────────────────────────────
// A full-width dramatic sweep used by power-card triggers, bounty
// placements, sudden death, last stand entry, etc. Pure presentation
// — Phase B will plumb the trigger events.
//
// Lifecycle: mount → sweep in (350ms) → linger 3.5s → sweep out
// (300ms) → call onComplete (if provided). Nothing else: the parent
// owns when to mount and when to unmount via key changes.
//
// Props
//   kind         : preset key driving default colors / title
//                  ('bluff_blocked' | 'bluff_reflected' | 'assassin'
//                   | 'elimination' | 'bounty' | 'sudden_death'
//                   | 'last_stand')
//   title        : main headline (overrides preset title)
//   subtitle     : smaller text below title
//   accentColor  : override the preset accent
//   playerName   : optional — appended after the kind glyph
//   onComplete   : called once the sweep-out finishes
//   durationMs   : linger duration (default 3500)
// ──────────────────────────────────────────────────────────────

const PRESETS = {
  bluff_blocked: {
    title: "BLUFF BLOCKED",
    accent: "var(--accent)", // lime
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(20,28,8,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "shield",
  },
  bluff_reflected: {
    title: "BLUFF REFLECTED",
    accent: "var(--accent)", // lime
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(22,12,32,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "mirror",
  },
  assassin: {
    title: "ASSASSIN STRIKE",
    accent: "#b8143a", // deep crimson
    bg: "linear-gradient(90deg, rgba(10,4,6,0.97) 0%, rgba(40,4,12,0.96) 50%, rgba(10,4,6,0.97) 100%)",
    glyph: "skull",
  },
  elimination: {
    title: "ELIMINATED",
    accent: "var(--eliminated)", // pink-red
    bg: "linear-gradient(90deg, rgba(8,4,6,0.97) 0%, rgba(40,8,16,0.96) 50%, rgba(8,4,6,0.97) 100%)",
    glyph: "skull",
  },
  bounty: {
    title: "BOUNTY PLACED",
    accent: "var(--accent2)", // pink
    bg: "linear-gradient(90deg, rgba(10,4,6,0.96) 0%, rgba(34,6,14,0.95) 50%, rgba(10,4,6,0.96) 100%)",
    glyph: "coin",
  },
  sudden_death: {
    title: "SUDDEN DEATH",
    accent: "#7cd5ff", // ice blue
    bg: "linear-gradient(90deg, rgba(4,6,12,0.96) 0%, rgba(6,18,32,0.96) 50%, rgba(4,6,12,0.96) 100%)",
    glyph: "snow",
  },
  last_stand: {
    title: "LAST STAND",
    accent: "#b8143a", // deep crimson
    bg: "linear-gradient(90deg, #050506 0%, #0a0204 50%, #050506 100%)",
    glyph: "duel",
  },
};

// Inline glyph SVGs — same approach as ShapeIcon / PowerCard
const GLYPHS = {
  shield: (c) => (
    <path
      d="M50 8 L86 22 L86 52 C86 72 70 86 50 92 C30 86 14 72 14 52 L14 22 Z M50 28 L50 70 M32 44 L68 44"
      fill="none"
      stroke={c}
      strokeWidth="6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),
  mirror: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="38" r="26" />
      <path d="M50 64 L50 92" />
    </g>
  ),
  skull: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 44 Q22 14 50 14 Q78 14 78 44 L78 60 L66 60 L66 76 L34 76 L34 60 L22 60 Z" />
      <circle cx="38" cy="44" r="5" fill={c} />
      <circle cx="62" cy="44" r="5" fill={c} />
      <path d="M44 60 L44 70 M50 60 L50 70 M56 60 L56 70" />
    </g>
  ),
  coin: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="50" r="36" />
      <path d="M50 28 L50 72 M40 36 L60 36 M40 64 L60 64 M40 50 L60 50" />
    </g>
  ),
  snow: (c) => (
    <g fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 8 L50 92 M14 30 L86 70 M14 70 L86 30" />
    </g>
  ),
  duel: (c) => (
    <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 84 L60 40" />
      <path d="M84 84 L40 40" />
      <path d="M50 14 L50 30" />
    </g>
  ),
};

export function AnnouncementBanner({
  kind = "bluff_blocked",
  title,
  subtitle,
  accentColor,
  playerName,
  onComplete,
  durationMs = 3500,
}) {
  const preset = PRESETS[kind] || PRESETS.bluff_blocked;
  const accent = accentColor || preset.accent;
  const headline = title || preset.title;
  const draw = GLYPHS[preset.glyph] || GLYPHS.shield;

  const [phase, setPhase] = useState("enter"); // 'enter' | 'hold' | 'exit'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 350);
    const t2 = setTimeout(() => setPhase("exit"), 350 + durationMs);
    const t3 = setTimeout(() => onComplete && onComplete(), 350 + durationMs + 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [durationMs, onComplete]);

  // Translate based on phase
  const translate =
    phase === "enter" ? "translateX(-100%)" :
    phase === "exit"  ? "translateX(100%)"  :
                        "translateX(0)";
  const opacity = phase === "enter" ? 0 : 1;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "38vh",
        zIndex: 9500,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: 96,
          background: preset.bg,
          borderTop: `1px solid ${accent}`,
          borderBottom: `1px solid ${accent}`,
          boxShadow: `0 0 48px ${accent}55, inset 0 0 64px ${accent}22`,
          transform: translate,
          opacity,
          transition:
            "transform 350ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 200ms linear",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "18px 24px",
          overflow: "hidden",
        }}
      >
        {/* Diagonal sheen */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              115deg,
              transparent 0,
              transparent 20px,
              ${accent}08 20px,
              ${accent}08 22px
            )`,
            pointerEvents: "none",
          }}
        />

        {/* Glyph */}
        <div
          style={{
            position: "relative",
            width: 64,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            filter: `drop-shadow(0 0 12px ${accent}cc)`,
          }}
        >
          <svg viewBox="0 0 100 100" width={64} height={64} aria-hidden>
            {draw(accent)}
          </svg>
        </div>

        {/* Text block */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 44,
              letterSpacing: "0.16em",
              color: accent,
              textTransform: "uppercase",
              lineHeight: 1,
              textShadow: `0 0 16px ${accent}aa, 0 2px 0 rgba(0,0,0,0.6)`,
            }}
          >
            {headline}
          </div>
          {(subtitle || playerName) && (
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                letterSpacing: "0.18em",
                color: "var(--text)",
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              {playerName ? `// ${playerName} ` : ""}
              {subtitle || ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
