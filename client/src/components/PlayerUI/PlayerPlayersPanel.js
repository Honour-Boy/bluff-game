export function PlayerPlayersPanel({
  players,
  currentPlayerId,
  myPlayerId,
  turnOrder,
  isSpinPending,
  spinTargetId,
}) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
      border: '1px solid var(--border-lit)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 14px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: 'var(--text-dim)',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        marginBottom: 14,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Patrons</span>
        <span style={{ color: 'var(--alive)' }}>
          {players?.filter((player) => player.status === 'alive').length || 0} alive
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {players?.map((player) => {
          const isCurrentPlayer = player.id === currentPlayerId;
          const isMe = player.id === myPlayerId;
          const alive = player.status === 'alive';
          const turnPos = turnOrder.indexOf(player.id);
          const isSpinning = isSpinPending && player.id === spinTargetId;

          return (
            <div
              key={player.id}
              className={isCurrentPlayer && alive ? 'current-player-row' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                background: isMe
                  ? 'rgba(200,146,46,0.05)'
                  : isSpinning
                    ? 'rgba(155,28,28,0.07)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${
                  isSpinning ? 'rgba(155,28,28,0.4)'
                    : isCurrentPlayer && alive ? 'var(--border-glow)'
                    : isMe ? 'var(--border-lit)'
                    : 'var(--border)'
                }`,
                borderRadius: 'var(--radius)',
                opacity: alive ? 1 : 0.38,
                transition: 'all 0.2s',
              }}
            >
              {/* Turn position badge */}
              <div style={{
                width: 20,
                height: 20,
                borderRadius: 3,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                fontWeight: 700,
                color: isCurrentPlayer && alive ? '#0a0804' : 'var(--text-dim)',
                background: isCurrentPlayer && alive ? 'var(--accent)' : 'transparent',
                border: `1px solid ${alive ? 'var(--border)' : 'transparent'}`,
              }}>
                {alive ? turnPos + 1 : '—'}
              </div>

              {/* Name + labels */}
              <div style={{ flex: 1 }}>
                <span style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 12,
                  fontWeight: isMe ? 700 : 400,
                  letterSpacing: '0.04em',
                  color: isCurrentPlayer && alive ? 'var(--accent)' : 'var(--text)',
                  textDecoration: !alive ? 'line-through' : 'none',
                }}>
                  {player.username}
                </span>
                {isMe && (
                  <span style={{
                    marginLeft: 7,
                    fontFamily: "'Cinzel', serif",
                    fontSize: 8,
                    color: 'var(--accent-dim)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}>
                    (you)
                  </span>
                )}
                {isCurrentPlayer && alive && !isMe && (
                  <span style={{
                    marginLeft: 7,
                    fontFamily: "'Cinzel', serif",
                    fontSize: 8,
                    color: 'var(--accent)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}>
                    Turn
                  </span>
                )}
                {isSpinning && (
                  <span style={{
                    marginLeft: 7,
                    fontFamily: "'Cinzel', serif",
                    fontSize: 8,
                    color: 'var(--accent2)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}>
                    Spinning
                  </span>
                )}
              </div>

              {/* Chamber mini-dots */}
              <div style={{ flexShrink: 0 }}>
                {alive ? (
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 6 }).map((_, index) => {
                      const isBullet = player.chamber?.[index] === 'bullet';
                      return (
                        <div
                          key={index}
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isBullet
                              ? 'radial-gradient(circle at 35% 35%, #ff5555, var(--accent2))'
                              : 'var(--surface2)',
                            border: `1px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                            boxShadow: isBullet ? '0 0 4px rgba(155,28,28,0.5)' : 'none',
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <span style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 8,
                    color: 'var(--accent2)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    opacity: 0.7,
                  }}>
                    Out
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
