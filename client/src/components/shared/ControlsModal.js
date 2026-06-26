'use client';

// ─── ControlsModal - a small centred dialog for things launched from the
// in-game Controls menu (game settings, leaderboard). Backdrop click + the
// close button dismiss it; the body scrolls when content is tall so it never
// pushes the table layout around.
export function ControlsModal({ title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9300,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          maxHeight: '85dvh', overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border-lit)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.12em', color: 'var(--accent)' }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span className="bluff-close-x" aria-hidden="true">X</span>
          </button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}
