export function PlayerPlayersPanel({
  players,
  currentPlayerId,
  myPlayerId,
  turnOrder,
  isSpinPending,
  spinTargetId,
}) {
  return (
    <div className="card">
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>PLAYERS</span>
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

          return (
            <div
              key={player.id}
              className={isCurrentPlayer && alive ? 'current-player-row' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: isMe ? 'rgba(232,255,74,0.04)' : 'var(--surface2)',
                border: `1px solid ${isCurrentPlayer && alive ? 'var(--warning)' : isMe ? 'var(--accent)33' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                opacity: alive ? 1 : 0.4,
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: isCurrentPlayer && alive ? '#0a0a0b' : 'var(--text-dim)',
                  background: isCurrentPlayer && alive ? 'var(--warning)' : 'transparent',
                  border: `1px solid ${alive ? 'var(--border)' : 'transparent'}`,
                  flexShrink: 0,
                }}
              >
                {alive ? turnPos + 1 : 'X'}
              </div>
              <div style={{ flex: 1, fontWeight: isMe ? 700 : 400, fontSize: 12 }}>
                {player.username}
                {isMe && <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 10 }}>(you)</span>}
                {isCurrentPlayer && alive && !isMe && (
                  <span style={{ color: 'var(--warning)', marginLeft: 6, fontSize: 9, letterSpacing: '0.1em' }}>TURN</span>
                )}
                {isSpinPending && player.id === spinTargetId && (
                  <span style={{ color: 'var(--accent2)', marginLeft: 6, fontSize: 9, letterSpacing: '0.1em' }}>SPINNING</span>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                {alive ? (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: 6 }).map((_, index) => {
                      const isBullet = player.chamber?.[index] === 'bullet';
                      return (
                        <div
                          key={index}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: isBullet ? 'var(--accent2)' : 'var(--surface2)',
                            border: `1px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <span style={{ fontSize: 9, color: 'var(--accent2)', letterSpacing: '0.1em' }}>OUT</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
