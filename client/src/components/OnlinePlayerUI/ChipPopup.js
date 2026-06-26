// ─── ChipPopup - a contextual bubble anchored above a player's avatar ─────────
// (Module 2) Replaces the large global status banners that used to run across
// the centre of the table. Render it as a child of a `position: relative`
// wrapper around a PlayerChip; it floats just above the chip with a little
// pointer, scaling to its content with NO independent scroll of its own.
//
// `tone` themes the bubble; `pulse` adds a soft attention pulse (uses the global
// `pulse` keyframe). `interactive` flips pointer-events back on for bubbles that
// hold a button (e.g. the Pull Trigger in Module 3) - status bubbles stay
// click-through so they never steal taps from the table beneath them.
export function ChipPopup({ tone = 'neutral', pulse = false, interactive = false, children }) {
  const tones = {
    neutral: { color: 'var(--text)', border: 'var(--border-lit)' },
    turn: { color: 'var(--accent)', border: 'var(--accent-dim)' },
    danger: { color: 'var(--accent2)', border: 'var(--accent2)' },
  };
  const t = tones[tone] || tones.neutral;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          padding: interactive ? '6px 10px' : '4px 9px',
          borderRadius: 6,
          background: 'rgba(14,10,7,0.96)',
          border: `1px solid ${t.border}`,
          color: t.color,
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
          animation: pulse ? 'pulse 1.6s ease-in-out infinite' : undefined,
        }}
      >
        {children}
      </div>
      {/* downward pointer toward the avatar */}
      <div
        aria-hidden="true"
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: `5px solid ${t.border}`,
        }}
      />
    </div>
  );
}
