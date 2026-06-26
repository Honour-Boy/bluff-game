'use client';

// ============================================================
// ChamberSpinner — the spinning revolver-cylinder loading motif
// ============================================================
//
// Single source of truth for the on-theme loading spinner used across every
// loading state (auth bootstrap, Suspense fallbacks, in-app spinners) and the
// post-intro IntroLoading beat. A metallic cylinder: six chambers around a hub
// (alternating loaded brass rounds / empty holes so the rotation reads), a
// bright rim light-catch and a motion trail that — because the whole SVG spins
// via the global `spin` keyframe — make it look like real spinning metal.
// Size-configurable so a small inline spinner and a big splash spinner share
// one definition. CSS-var themed (`--accent`); no new styling system.
//
// SVG gradient ids are constant (SSR-stable — no hydration mismatch). If two
// spinners ever mount at once the duplicate defs are identical, so shared
// resolution is harmless; in practice only one loading surface shows at a time.

export function ChamberSpinner({ size = 80, spinMs = 2000, style }) {
  const r = 28; // chamber-ring radius within an 80×80 box (centre 40,40)
  const holes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2; // start at top
    return {
      cx: 40 + r * Math.cos(a),
      cy: 40 + r * Math.sin(a),
      loaded: i % 2 === 0, // alternate loaded/empty → the spin is legible
    };
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
      <defs>
        <radialGradient id="cs-body" cx="38%" cy="34%" r="74%">
          <stop offset="0%" stopColor="#6a5836" />
          <stop offset="55%" stopColor="#3a2c18" />
          <stop offset="100%" stopColor="#221a0e" />
        </radialGradient>
        <linearGradient id="cs-ring" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6bd6a" />
          <stop offset="50%" stopColor="#b8862f" />
          <stop offset="100%" stopColor="#6a4f22" />
        </linearGradient>
        <radialGradient id="cs-hole" cx="50%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#1c140a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id="cs-bullet" cx="42%" cy="36%" r="66%">
          <stop offset="0%" stopColor="#ffe9b0" />
          <stop offset="45%" stopColor="#e6bd6a" />
          <stop offset="100%" stopColor="#8a6418" />
        </radialGradient>
      </defs>

      {/* Cylinder body + gilt rim */}
      <circle cx="40" cy="40" r="37" fill="url(#cs-body)" stroke="url(#cs-ring)" strokeWidth="3" />
      {/* Bright light-catch arc on the rim — rotates with the svg → spinning metal */}
      <path d="M40 3 A37 37 0 0 1 77 40" fill="none" stroke="rgba(255,240,205,0.85)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      {/* Faint motion-trail arc opposite the highlight */}
      <path d="M11 62 A37 37 0 0 1 6 34" fill="none" stroke="rgba(240,181,74,0.22)" strokeWidth="5" strokeLinecap="round" />

      {/* Chambers — loaded ones carry a brass round */}
      {holes.map((h, i) => (
        <g key={i}>
          <circle cx={h.cx} cy={h.cy} r="7.5" fill="url(#cs-hole)" stroke="rgba(240,181,74,0.45)" strokeWidth="1.4" />
          {h.loaded && (
            <circle cx={h.cx} cy={h.cy} r="4.6" fill="url(#cs-bullet)" stroke="#5a3f15" strokeWidth="0.8" />
          )}
        </g>
      ))}

      {/* Hub + centre pin */}
      <circle cx="40" cy="40" r="9" fill="url(#cs-body)" stroke="url(#cs-ring)" strokeWidth="2" />
      <circle cx="40" cy="40" r="2.4" fill="url(#cs-bullet)" />
    </svg>
  );
}
