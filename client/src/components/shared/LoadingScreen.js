'use client';

import { useEffect, useState } from 'react';
import { ChamberSpinner } from './ChamberSpinner';

// ============================================================
// LoadingScreen — branded full-screen loading splash
// ============================================================
//
// The on-theme loading surface: the spinning revolver cylinder (ChamberSpinner)
// over the BLUFF wordmark, with a cycling flavour label so a held screen reads
// as "working" rather than "stuck". Used for the auth bootstrap and the route
// Suspense fallback. The label list is shared via `useCyclingLabel` so the
// post-intro IntroLoading beat can reuse the same voice.

export const LOADING_LINES = [
  'Loading the chamber…',
  'Shuffling the deck…',
  'Counting the bullets…',
  'Lighting the candles…',
  'Spinning the cylinder…',
  'Calling your bluff…',
];

// Rotates through `lines` on an interval. The default arg is the module-level
// constant (stable reference) so the effect doesn't re-arm every render.
export function useCyclingLabel(lines = LOADING_LINES, intervalMs = 1500) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % lines.length), intervalMs);
    return () => clearInterval(id);
  }, [lines, intervalMs]);
  return lines[i];
}

export function LoadingSplash({ size = 76 }) {
  const label = useCyclingLabel();
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: 'radial-gradient(circle at 50% 42%, rgba(240,181,74,0.06), var(--bg) 70%)',
        animation: 'fadeIn 0.4s ease',
      }}
    >
      <ChamberSpinner size={size} />
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 64,
          lineHeight: 1,
          color: 'var(--accent)',
          letterSpacing: '0.06em',
          textShadow: '0 0 24px rgba(240,181,74,0.3)',
        }}
      >
        BLUFF
      </div>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          color: 'var(--text-dim)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          minHeight: 16,
          transition: 'opacity 0.3s ease',
        }}
        aria-live="polite"
      >
        {label}
      </div>
    </div>
  );
}
