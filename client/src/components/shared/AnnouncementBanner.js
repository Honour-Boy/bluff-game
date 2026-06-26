"use client";

import { useEffect, useState } from "react";

// ─── AnnouncementBanner ───────────────────────────────────────
// A full-width dramatic sweep used by power-card triggers, bounty
// placements, sudden death, last stand entry, etc. Pure presentation
// - Phase B will plumb the trigger events.
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
//   playerName   : optional - appended after the kind glyph
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
  bounty_collected: {
    title: "BOUNTY COLLECTED",
    accent: "var(--accent)",
    bg: "linear-gradient(90deg, rgba(10,4,6,0.96) 0%, rgba(20,28,8,0.96) 50%, rgba(10,4,6,0.96) 100%)",
    glyph: "coin",
  },
  betting_open: {
    title: "PLACE YOUR BETS",
    accent: "var(--accent)",
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(18,22,8,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "coin",
  },
  betting_streak_reward: {
    title: "BETTING STREAK!",
    accent: "var(--accent)",
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(18,22,8,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "coin",
  },
  ghost_vote_started: {
    title: "GHOST COUNCIL CONVENES",
    accent: "#aa9ee0",
    bg: "linear-gradient(90deg, #07080a 0%, #0c0a14 50%, #07080a 100%)",
    glyph: "snow",
  },
  ghost_vote_result: {
    title: "GHOST COUNCIL DECIDES",
    accent: "#aa9ee0",
    bg: "linear-gradient(90deg, #07080a 0%, #0c0a14 50%, #07080a 100%)",
    glyph: "snow",
  },
  last_stand_entered: {
    title: "LAST STAND",
    accent: "#ff3552",
    bg: "linear-gradient(90deg, #050506 0%, #0a0204 50%, #050506 100%)",
    glyph: "duel",
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

  // ─── #121: distinct presets per resolved outcome ──────────────
  // Before #121 the kind→banner map squashed several distinct
  // outcomes onto bluff_blocked / assassin / sudden_death, so a swap,
  // a freeze, a medic save, etc. all rendered the WRONG banner. Each
  // outcome now owns an accurately-worded, visually-distinct preset.
  swap_resolved: {
    title: "SWAP RESOLVED",
    accent: "#7cd5ff", // ice blue
    bg: "linear-gradient(90deg, rgba(4,8,12,0.96) 0%, rgba(6,20,30,0.96) 50%, rgba(4,8,12,0.96) 100%)",
    glyph: "mirror",
  },
  freeze_applied: {
    title: "FROZEN",
    accent: "#7cd5ff", // ice blue
    bg: "linear-gradient(90deg, rgba(4,8,12,0.96) 0%, rgba(8,22,34,0.96) 50%, rgba(4,8,12,0.96) 100%)",
    glyph: "snow",
  },
  medic_deciding: {
    title: "MEDIC DECIDING",
    accent: "#5fd0a8", // teal-green
    bg: "linear-gradient(90deg, rgba(4,12,10,0.96) 0%, rgba(6,28,22,0.96) 50%, rgba(4,12,10,0.96) 100%)",
    glyph: "cross",
  },
  medic_saved: {
    title: "MEDIC SAVE",
    accent: "var(--alive)",
    bg: "linear-gradient(90deg, rgba(4,12,10,0.96) 0%, rgba(6,30,20,0.96) 50%, rgba(4,12,10,0.96) 100%)",
    glyph: "cross",
  },
  medic_skipped: {
    title: "NO SAVE",
    accent: "var(--eliminated)",
    bg: "linear-gradient(90deg, rgba(8,4,6,0.97) 0%, rgba(40,8,16,0.96) 50%, rgba(8,4,6,0.97) 100%)",
    glyph: "skull",
  },
  assassin_backfire: {
    title: "ASSASSIN BACKFIRES",
    accent: "#e0863a", // amber
    bg: "linear-gradient(90deg, rgba(12,6,4,0.97) 0%, rgba(36,16,4,0.96) 50%, rgba(12,6,4,0.97) 100%)",
    glyph: "skull",
  },
  gambler_caught: {
    title: "GAMBLER CAUGHT",
    accent: "#b8143a", // deep crimson
    bg: "linear-gradient(90deg, rgba(10,4,6,0.97) 0%, rgba(40,4,12,0.96) 50%, rgba(10,4,6,0.97) 100%)",
    glyph: "coin",
  },
  sheriff_relief: {
    title: "SHERIFF RELIEVED",
    accent: "var(--accent)", // lime
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(20,28,8,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "shield",
  },
  sheriff_protected: {
    title: "SHERIFF PROTECTED",
    accent: "var(--accent)", // lime
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(20,28,8,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "shield",
  },
  sniper_redirect: {
    title: "SNIPER REDIRECT",
    accent: "#b8143a", // deep crimson
    bg: "linear-gradient(90deg, rgba(10,4,6,0.97) 0%, rgba(30,6,10,0.96) 50%, rgba(10,4,6,0.97) 100%)",
    glyph: "duel",
  },
  system_notice: {
    title: "NOTICE",
    accent: "var(--text-dim, #9aa3ad)",
    bg: "linear-gradient(90deg, rgba(10,10,11,0.96) 0%, rgba(16,16,20,0.96) 50%, rgba(10,10,11,0.96) 100%)",
    glyph: "shield",
  },

  // ─── #6: Highlight callouts (in-play hype moments) ────────────
  first_blood: {
    title: "FIRST BLOOD",
    accent: "#b8143a", // deep crimson
    bg: "linear-gradient(90deg, rgba(10,4,6,0.97) 0%, rgba(46,4,12,0.96) 50%, rgba(10,4,6,0.97) 100%)",
    glyph: "skull",
  },
  survival_streak: {
    title: "NERVES OF STEEL",
    accent: "var(--accent)", // candlelight gold
    bg: "linear-gradient(90deg, rgba(12,9,4,0.96) 0%, rgba(34,24,6,0.96) 50%, rgba(12,9,4,0.96) 100%)",
    glyph: "shield",
  },
};

// Inline glyph SVGs - same approach as ShapeIcon / PowerCard
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
  cross: (c) => (
    <g fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 18 L50 82 M18 50 L82 50" />
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
  // Linger duration. The caller (PowerFlowOverlays) passes a long 10s read-time in
  // the TUTORIAL; real games keep the snappy default so the table isn't slowed.
  durationMs = 3500,
}) {
  // Hooks run unconditionally and FIRST so the unknown-kind early
  // return below never trips the Rules of Hooks.
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

  // #121: no generic fallback. An unknown `kind` must render NOTHING
  // rather than silently impersonating "BLUFF BLOCKED" (which actively
  // contradicts the real game state). The kind→preset mapping upstream
  // (buildAnnouncementBannerProps) is the first guard; this is the
  // belt-and-braces second one.
  const preset = PRESETS[kind];
  if (!preset) {
    if (typeof console !== "undefined") {
      console.warn("[AnnouncementBanner] unknown kind:", kind);
    }
    return null;
  }
  const accent = accentColor || preset.accent;
  const headline = title || preset.title;
  const draw = GLYPHS[preset.glyph] || GLYPHS.shield;

  // Toast drops in from the top and retracts upward on exit.
  const translate =
    phase === "enter" ? "translateY(-140%)" :
    phase === "exit"  ? "translateY(-140%)" :
                        "translateY(0)";
  const opacity = phase === "enter" ? 0 : 1;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "max(16px, env(safe-area-inset-top, 0px))",
        zIndex: 9500,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px",
        pointerEvents: "none",
      }}
    >
      {/* Compact top-centre toast (was a full-width across-screen sweep). */}
      <div
        style={{
          position: "relative",
          width: "auto",
          maxWidth: "min(440px, 100%)",
          background: preset.bg,
          border: `1px solid ${accent}`,
          borderRadius: 12,
          boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 0 24px ${accent}44, inset 0 0 28px ${accent}1a`,
          transform: translate,
          opacity,
          transition:
            "transform 320ms cubic-bezier(0.2, 0.8, 0.25, 1), opacity 180ms linear",
          display: "flex",
          alignItems: "center",
          gap: 13,
          padding: "12px 18px",
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
              transparent 18px,
              ${accent}08 18px,
              ${accent}08 20px
            )`,
            pointerEvents: "none",
          }}
        />

        {/* Glyph */}
        <div
          style={{
            position: "relative",
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            filter: `drop-shadow(0 0 8px ${accent}cc)`,
          }}
        >
          <svg viewBox="0 0 100 100" width={38} height={38} aria-hidden>
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
            gap: 2,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              letterSpacing: "0.12em",
              color: accent,
              textTransform: "uppercase",
              lineHeight: 1.05,
              textShadow: `0 0 12px ${accent}aa, 0 1px 0 rgba(0,0,0,0.6)`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {headline}
          </div>
          {(subtitle || playerName) && (
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "var(--text)",
                textTransform: "uppercase",
                opacity: 0.85,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
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
