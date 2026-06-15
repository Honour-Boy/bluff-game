'use client';

import { useEffect, useRef, useState } from 'react';

// ============================================================
// IntroLoading — branded 3s progress beat after the intro video
// ============================================================
//
// Shown for a fixed 3s once the intro splash video finishes, then calls
// `onDone`. A themed determinate progress bar sweeps 1 → 100% across the
// 3s (driven by rAF so the bar fill and the live % readout stay in lock-
// step), under a slowly-spinning revolver cylinder and the wordmark.
// Purely cosmetic — it masks the auth/socket bootstrap finishing
// underneath while the early-return holds the app.

const HOLD_MS = 3000;

// Six chambers around a ring (the revolver motif), placed by polar coords.
function Cylinder() {
  const r = 30; // ring radius within an 80×80 box (centre 40,40)
  const holes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2; // start at top
    return { cx: 40 + r * Math.cos(a), cy: 40 + r * Math.sin(a) };
  });
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      style={{ animation: 'spin 3.2s linear infinite' }}
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="37" fill="none" stroke="rgba(240,181,74,0.35)" strokeWidth="2" />
      <circle cx="40" cy="40" r="8" fill="none" stroke="rgba(240,181,74,0.5)" strokeWidth="2" />
      {holes.map((h, i) => (
        <circle
          key={i}
          cx={h.cx}
          cy={h.cy}
          r="6"
          fill={i === 0 ? 'var(--accent)' : 'rgba(240,181,74,0.18)'}
          stroke="rgba(240,181,74,0.5)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

export function IntroLoading({ onDone }) {
  const doneRef = useRef(false);
  const [pct, setPct] = useState(1); // sweeps 1 → 100 over HOLD_MS

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / HOLD_MS);
      // Start at 1% so the bar is alive immediately, finish exactly at 100%.
      setPct(Math.max(1, Math.round(t * 100)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        background: 'radial-gradient(circle at 50% 42%, rgba(240,181,74,0.07), var(--bg) 68%)',
        animation: 'fadeIn 0.4s ease',
      }}
    >
      {/* Local keyframe for the moving sheen across the fill. */}
      <style>{`@keyframes introSheen { from { transform: translateX(-120%); } to { transform: translateX(320%); } }`}</style>

      <Cylinder />

      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 72,
        lineHeight: 1,
        color: 'var(--accent)',
        letterSpacing: '0.06em',
        textShadow: '0 0 24px rgba(240,181,74,0.35)',
      }}>
        BLUFF
      </div>

      {/* Fancy determinate bar — gradient fill + travelling sheen, width driven
          by the live % so it sweeps 1 → 100 across the 3s. */}
      <div style={{
        width: 240,
        height: 8,
        borderRadius: 999,
        background: 'rgba(240,181,74,0.12)',
        border: '1px solid rgba(240,181,74,0.18)',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          position: 'relative',
          height: '100%',
          width: `${pct}%`,
          borderRadius: 999,
          background: 'linear-gradient(90deg, rgba(155,28,28,0.85), var(--accent))',
          boxShadow: '0 0 12px rgba(240,181,74,0.6)',
          transition: 'width 90ms linear',
        }}>
          {/* travelling highlight */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
            animation: 'introSheen 1.1s ease-in-out infinite',
          }} />
        </div>
      </div>

      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        color: 'var(--accent)',
        letterSpacing: '0.28em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {pct}%
      </div>
    </div>
  );
}
