'use client';

// ─── IssueReportButton — floating "Report" pill (UAT only) ────────────────────
// Surfaced on non-room screens (landing / groups), bottom-right, where there's
// no game UI to collide with. In-room the SettingsGear "Report an issue" row
// covers it (the bottom rail there holds Bluff / power / End Turn). UAT-only.

export function IssueReportButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Report an issue"
      title="Report an issue"
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        right: 'max(16px, env(safe-area-inset-right, 0px))',
        zIndex: 9200,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 15px',
        borderRadius: 999,
        border: '1px solid var(--accent2)',
        background: 'rgba(20,12,10,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: 'var(--accent)',
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
        <path d="M10.3 3.6 2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8A1.8 1.8 0 0 0 21.5 18L13.7 3.6a1.9 1.9 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
      Report
    </button>
  );
}
