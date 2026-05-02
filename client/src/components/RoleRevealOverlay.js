"use client";

import { useEffect, useState } from "react";

// ─── RoleRevealOverlay ────────────────────────────────────────
// Plays once per game, privately, when the local player first
// learns their role at game start. Shows a single role card with
// name, icon, and a 2-sentence description for ~7.5 seconds, then
// fades into normal gameplay.
//
// Mounted by OnlinePlayerUI when:
//   - phase === 'playing'
//   - roundNumber === 1
//   - the local player hasn't seen the reveal yet (local state)
//
// Per spec, even Barehand players see a Barehand card so the
// "everyone reveals at the same time" pacing is preserved.
//
// Props
//   role        : 'barehand' | 'gambler' | 'sheriff' | 'medic'
//                 | 'saboteur' | 'sniper' | 'collector'
//   onComplete  : called once the fade-out finishes
//   durationMs  : linger duration (default 7500)
// ──────────────────────────────────────────────────────────────

export const ROLE_META = {
  barehand: {
    label: "Barehand",
    color: "#8a8f99", // neutral steel grey
    flavor: "No special abilities. Read the room and trust your instincts — the basics are all you need to win.",
  },
  gambler: {
    label: "The Gambler",
    color: "#e5a23c", // amber
    flavor: "Your risk doesn't grow on surviving spins — but get caught bluffing and your chamber jumps to four bullets.",
  },
  sheriff: {
    label: "The Sheriff",
    color: "#cfd2d6", // silver chrome (matches Shield)
    flavor: "Every correct bluff call drops your risk by one. The Assassin can't touch you when you call their bluff.",
  },
  medic: {
    label: "The Medic",
    color: "#7cd5ff", // ice blue
    flavor: "Once per game, save a player from elimination — yourself or anyone else. The save costs you two extra cards.",
  },
  saboteur: {
    label: "The Saboteur",
    color: "#7a3cff", // deep purple
    flavor: "Once per game, slip a card from your hand into another player's hand. Silent and untraceable.",
  },
  sniper: {
    label: "The Sniper",
    color: "#b8143a", // deep crimson
    flavor: "Once per game, after a bluff resolves, redirect the spin to anyone you choose. Mirror holders are off-limits.",
  },
  collector: {
    label: "The Collector",
    color: "#d96b1f", // burnt orange
    flavor: "You can hold up to three power cards at a time, not just one. Only one activation per turn though.",
  },
};

const ROLE_ICONS = {
  barehand: (c) => (
    // Open hand (palm + fingers)
    <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M30 60 L30 26 Q30 18 38 18 Q46 18 46 26 L46 50" />
      <path d="M46 50 L46 18 Q46 10 54 10 Q62 10 62 18 L62 50" />
      <path d="M62 50 L62 22 Q62 14 70 14 Q78 14 78 22 L78 56" />
      <path d="M30 60 Q22 64 22 76 Q22 90 50 90 Q78 90 78 76 L78 56" />
    </g>
  ),
  gambler: (c) => (
    // Stylised die showing 5 pips
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round">
      <rect x="18" y="18" width="64" height="64" rx="8" fill={`${c}11`} />
      <circle cx="32" cy="32" r="4" fill={c} />
      <circle cx="68" cy="32" r="4" fill={c} />
      <circle cx="50" cy="50" r="4" fill={c} />
      <circle cx="32" cy="68" r="4" fill={c} />
      <circle cx="68" cy="68" r="4" fill={c} />
    </g>
  ),
  sheriff: (c) => (
    // 5-point sheriff star with center circle
    <g fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M50 10 L60 38 L90 38 L66 56 L75 86 L50 68 L25 86 L34 56 L10 38 L40 38 Z" fill={`${c}22`} />
      <circle cx="50" cy="50" r="10" fill="none" stroke={c} />
    </g>
  ),
  medic: (c) => (
    // Medical cross inside a soft circle
    <g fill="none" stroke={c} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="50" cy="50" r="36" fill={`${c}11`} />
      <path d="M50 28 L50 72 M28 50 L72 50" />
    </g>
  ),
  saboteur: (c) => (
    // Hooded silhouette with crossed wrench/tool
    <g fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M30 84 L30 56 Q30 30 50 30 Q70 30 70 56 L70 84 Z" fill={`${c}22`} />
      <path d="M30 56 Q40 38 50 38 Q60 38 70 56" />
      <path d="M40 60 L60 60" stroke={`${c}aa`} />
      <path d="M22 22 L34 34 M78 22 L66 34" />
    </g>
  ),
  sniper: (c) => (
    // Crosshair / scope reticle
    <g fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="50" cy="50" r="32" fill={`${c}11`} />
      <circle cx="50" cy="50" r="6" fill={c} stroke="none" />
      <path d="M50 8 L50 28 M50 72 L50 92 M8 50 L28 50 M72 50 L92 50" />
    </g>
  ),
  collector: (c) => (
    // Three stacked cards
    <g fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <rect x="30" y="22" width="44" height="60" rx="4" fill={`${c}11`} transform="rotate(-12 52 52)" />
      <rect x="30" y="22" width="44" height="60" rx="4" fill={`${c}22`} />
      <rect x="30" y="22" width="44" height="60" rx="4" fill={`${c}33`} transform="rotate(12 52 52)" />
    </g>
  ),
};

export function RoleRevealOverlay({ role, onComplete, durationMs = 7500 }) {
  const meta = ROLE_META[role] || ROLE_META.barehand;
  const draw = ROLE_ICONS[role] || ROLE_ICONS.barehand;

  const [phase, setPhase] = useState("enter"); // 'enter' | 'hold' | 'exit'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 450);
    const t2 = setTimeout(() => setPhase("exit"), 450 + durationMs);
    const t3 = setTimeout(() => onComplete && onComplete(), 450 + durationMs + 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [durationMs, onComplete]);

  const opacity = phase === "enter" ? 0 : phase === "exit" ? 0 : 1;
  const scale = phase === "enter" ? 0.86 : phase === "exit" ? 1.06 : 1;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at center, rgba(8,8,12,0.95) 0%, rgba(0,0,0,0.98) 70%)",
        opacity: phase === "exit" ? 0 : 1,
        transition: "opacity 400ms ease",
        pointerEvents: phase === "exit" ? "none" : "auto",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 280,
          maxWidth: "90%",
          background:
            "linear-gradient(160deg, #0e0e12 0%, #08080a 55%, #050507 100%)",
          border: `2px solid ${meta.color}`,
          borderRadius: 12,
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          boxShadow: `
            0 0 60px ${meta.color}66,
            0 0 120px ${meta.color}22,
            inset 0 0 60px ${meta.color}1a,
            inset 0 1px 0 rgba(255,255,255,0.04)
          `,
          transform: `scale(${scale})`,
          opacity,
          transition: "transform 450ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 380ms ease",
          textAlign: "center",
        }}
      >
        {/* Top rail */}
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.28em",
            color: `${meta.color}cc`,
            textTransform: "uppercase",
          }}
        >
          Your Secret Role
        </div>

        {/* Icon */}
        <div
          style={{
            width: 144,
            height: 144,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            filter: `drop-shadow(0 0 18px ${meta.color}aa)`,
          }}
        >
          <svg viewBox="0 0 100 100" width={144} height={144} aria-label={meta.label}>
            {draw(meta.color)}
          </svg>
        </div>

        {/* Name */}
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 38,
            letterSpacing: "0.12em",
            color: meta.color,
            textTransform: "uppercase",
            lineHeight: 1,
            textShadow: `0 0 18px ${meta.color}aa, 0 2px 0 rgba(0,0,0,0.6)`,
          }}
        >
          {meta.label}
        </div>

        {/* Flavor */}
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.55,
            letterSpacing: "0.04em",
            borderTop: `1px solid ${meta.color}22`,
            paddingTop: 16,
            maxWidth: 240,
          }}
        >
          {meta.flavor}
        </div>

        {/* Footer hint — privacy message */}
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            color: "var(--text-dim)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          // Only you can see this
        </div>
      </div>
    </div>
  );
}
