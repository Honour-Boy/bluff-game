'use client';

// ============================================================
// ChamberSpinner — the spinning revolver-cylinder loading motif
// ============================================================
//
// Single source of truth for the on-theme loading spinner used across every
// loading state (auth bootstrap, Suspense fallbacks, in-app spinners) and the
// post-intro IntroLoading beat. Six chambers around a ring, placed by polar
// coords, rotated via the global `spin` keyframe (globals.css). Size-configurable
// so a small inline spinner and a big splash spinner share one definition.
//
// CSS-var themed (`--accent`); no new styling system.

export function ChamberSpinner({ size = 80, spinMs = 3200, style }) {
  const r = 30; // ring radius within an 80×80 box (centre 40,40)
  const holes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2; // start at top
    return { cx: 40 + r * Math.cos(a), cy: 40 + r * Math.sin(a) };
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={{ animation: `spin ${spinMs}ms linear infinite`, ...style }}
      role="status"
      aria-label="Loading"
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
