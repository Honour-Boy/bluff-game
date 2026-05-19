export function PlayerHeader({
  roomCode,
  roundNumber,
  username,
  isEliminated,
  onShowHowToPlay,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ fontSize: 44, color: isEliminated ? 'var(--accent2)' : 'var(--accent)', lineHeight: 1 }}>
          BLUFF
        </h1>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
          ROOM: {roomCode} · ROUND {roundNumber}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            color: isEliminated ? 'var(--accent2)' : 'var(--text)',
            lineHeight: 1,
          }}
        >
          {username}
        </div>
        <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
          {isEliminated ? 'Eliminated' : 'Alive'}
        </span>
        <button
          onClick={onShowHowToPlay}
          style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            background: 'none',
            padding: '3px 8px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          ? How to Play
        </button>
      </div>
    </div>
  );
}
