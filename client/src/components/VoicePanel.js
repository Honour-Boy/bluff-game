'use client';

// ─── VoicePanel — connect / mute / leave ──────────────────────
// Compact pill that lives at the top of HostUI / PlayerUI /
// OnlinePlayerUI. Three states:
//   - idle       → "🎤 Join Voice" button
//   - connecting → "Connecting…" disabled
//   - connected  → mute toggle + leave link
//   - error      → red message + retry
//
// Issue #102 — the panel sits inside a flex-wrap header next to
// the top-right info HUD. The connected state is wider than idle,
// so transitioning between them was reflowing the parent and
// pushing the HUD onto a new line. Wrap content in a fixed-size
// slot so dimensions stay constant across every state — internal
// content can wrap, but the outer footprint never changes.

const SLOT_WIDTH = 240;
const SLOT_MIN_HEIGHT = 36;

const SLOT_STYLE = {
  width: SLOT_WIDTH,
  minHeight: SLOT_MIN_HEIGHT,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
};

export function VoicePanel({ status, error, muted, isConnected, connect, disconnect, toggleMute }) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: 11,
    letterSpacing: '0.06em',
    color: 'var(--text-dim)',
  };

  if (status === 'idle' || status === 'error') {
    return (
      <div data-testid="voice-panel-slot" style={SLOT_STYLE}>
        <button
          type="button"
          onClick={connect}
          style={{
            ...baseStyle,
            cursor: 'pointer',
            color: 'var(--text)',
            borderColor: status === 'error' ? 'var(--accent2)' : 'var(--border)',
          }}
        >
          🎤 Join Voice
        </button>
        {status === 'error' && error && (
          <div style={{ fontSize: 10, color: 'var(--accent2)', flexBasis: '100%' }}>{error}</div>
        )}
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div data-testid="voice-panel-slot" style={SLOT_STYLE}>
        <div style={baseStyle}>Connecting…</div>
      </div>
    );
  }

  // connected — (Module 5.2) the mute toggle reads a flat "Muted" / "Mic on",
  // and the toggle + Leave Voice sit on a single horizontal row (no wrap).
  return (
    <div data-testid="voice-panel-slot" style={{ ...SLOT_STYLE, flexWrap: 'nowrap' }}>
      <button
        type="button"
        onClick={toggleMute}
        style={{
          ...baseStyle,
          padding: '6px 10px',
          cursor: 'pointer',
          color: muted ? 'var(--text-dim)' : 'var(--alive)',
          borderColor: muted ? 'var(--border)' : 'var(--alive)',
          whiteSpace: 'nowrap',
        }}
      >
        {muted ? '🔇 Muted' : '🎙 Mic ON'}
      </button>
      <button
        type="button"
        onClick={disconnect}
        style={{
          ...baseStyle,
          padding: '6px 10px',
          background: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Leave Voice
      </button>
    </div>
  );
}

// ─── Small dot/icon next to a player's name ─────────────────────
export function VoiceIndicator({ playerId, speakingIds, voiceConnected, size = 10 }) {
  if (!voiceConnected) return null;
  const isSpeaking = speakingIds?.has(playerId);
  return (
    <span
      title={isSpeaking ? 'Speaking' : 'Quiet'}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: isSpeaking ? 'var(--alive)' : 'var(--border)',
        boxShadow: isSpeaking ? '0 0 6px var(--alive)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
        flexShrink: 0,
      }}
    />
  );
}
