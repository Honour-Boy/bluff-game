export function PlayerHeader({
  roomCode,
  roundNumber,
  username,
  isEliminated,
  onShowHowToPlay,
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      padding: '6px 0 12px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <h1
          className="candle-title"
          style={{
            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
            fontSize: 36,
            color: isEliminated ? 'var(--accent2)' : 'var(--accent)',
            lineHeight: 0.95,
            letterSpacing: '0.1em',
            textShadow: isEliminated
              ? '0 0 16px rgba(155,28,28,0.45)'
              : '0 0 22px rgba(200,146,46,0.35)',
          }}
        >
          BLUFF
        </h1>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 8,
          color: 'var(--text-dim)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginTop: 5,
        }}>
          Cipher {roomCode} · Round {roundNumber}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: isEliminated ? '#c85050' : 'var(--text)',
          lineHeight: 1,
          textShadow: isEliminated ? '0 0 10px rgba(155,28,28,0.3)' : 'none',
        }}>
          {username}
        </div>
        <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
          {isEliminated ? 'Eliminated' : 'Alive'}
        </span>
        <button
          onClick={onShowHowToPlay}
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            background: 'none',
            padding: '4px 10px',
            borderRadius: 3,
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          Rules
        </button>
      </div>
    </div>
  );
}
