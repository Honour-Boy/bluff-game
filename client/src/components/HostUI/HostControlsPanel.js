export function HostControlsPanel({
  isLobby,
  isPlaying,
  isRoundEnd,
  isBluffResolution,
  isSpinPending,
  isGameOver,
  alivePlayers,
  startGame,
  nextTurn,
  resolveBluff,
  eliminationBanner,
  onDismissEliminationBanner,
  prevPlayer,
  currentPlayer,
  spinTargetPlayer,
  restartRoom,
  leaveGame,
}) {
  return (
    <div className="card">
      <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
        HOST CONTROLS
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {isLobby && (
          <button
            className="primary"
            onClick={startGame}
            disabled={alivePlayers.length < 2}
            title={alivePlayers.length < 2 ? 'Need at least 2 players' : 'Start the game'}
          >
            Start Game ({alivePlayers.length} players)
          </button>
        )}

        {(isPlaying || isRoundEnd) && (
          <button className="primary" onClick={nextTurn}>
            Next Turn
          </button>
        )}

        {isBluffResolution && (
          <div style={{ width: '100%' }}>
            {eliminationBanner && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  marginBottom: 12,
                  background: 'rgba(232,255,74,0.06)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                  color: 'var(--accent)',
                }}
              >
                <span>Player eliminated. New required card: <strong>{eliminationBanner}</strong></span>
                <button
                  onClick={onDismissEliminationBanner}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >
                  x
                </button>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 10, lineHeight: 1.6 }}>
              The current player called bluff on the previous player&apos;s last card.<br />
              <span style={{ color: 'var(--text-dim)' }}>Physically reveal the last card played, then confirm:</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <button className="success" onClick={() => resolveBluff(true)} style={{ flex: 1 }}>
                They were lying
              </button>
              <button className="danger" onClick={() => resolveBluff(false)} style={{ flex: 1 }}>
                They told the truth
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
              They were lying - <strong style={{ color: 'var(--accent2)' }}>{prevPlayer?.username ?? '?'}</strong> spins<br />
              They told the truth - <strong style={{ color: 'var(--accent2)' }}>{currentPlayer?.username ?? '?'}</strong> spins
            </div>
          </div>
        )}

        {isSpinPending && (
          <div
            style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(255,74,110,0.05)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              color: 'var(--accent2)',
              textAlign: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            Waiting for <strong>{spinTargetPlayer?.username ?? '...'}</strong> to pull the trigger...
          </div>
        )}

        {isGameOver && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={restartRoom}>
              Play Again
            </button>
            <button onClick={leaveGame}>
              Leave Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
