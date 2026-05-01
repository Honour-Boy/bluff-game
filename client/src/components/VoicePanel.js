'use client';

// ─── VoicePanel — connect / mute / leave ──────────────────────
// Compact pill that lives at the top of HostUI / PlayerUI /
// OnlinePlayerUI. Three states:
//   - idle       → "🎤 Join Voice" button
//   - connecting → "Connecting…" disabled
//   - connected  → mute toggle + leave link
//   - error      → red message + retry

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
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
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
          <div style={{ fontSize: 10, color: 'var(--accent2)', maxWidth: 220 }}>{error}</div>
        )}
      </div>
    );
  }

  if (status === 'connecting') {
    return <div style={baseStyle}>Connecting…</div>;
  }

  // connected
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={toggleMute}
        style={{
          ...baseStyle,
          cursor: 'pointer',
          color: muted ? 'var(--text-dim)' : 'var(--alive)',
          borderColor: muted ? 'var(--border)' : 'var(--alive)',
        }}
      >
        {muted ? '🔇 Muted — click to talk' : '🎙 Mic ON — click to mute'}
      </button>
      <button
        type="button"
        onClick={disconnect}
        style={{
          ...baseStyle,
          background: 'none',
          cursor: 'pointer',
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
