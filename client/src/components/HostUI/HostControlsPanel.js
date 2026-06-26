import { CloseIcon } from '../shared/CloseIcon';

const cardStyle = {
  background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 'var(--radius-lg)',
  padding: '16px 14px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
};

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
    <div style={cardStyle}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: 'var(--text-dim)',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Master Controls
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {isLobby && (
          <button
            className="primary"
            onClick={startGame}
            disabled={alivePlayers.length < 2}
            title={alivePlayers.length < 2 ? 'Need at least 2 patrons' : 'Begin the game'}
            style={{ flex: 1, padding: '14px' }}
          >
            Open the Game ({alivePlayers.length} patrons)
          </button>
        )}

        {(isPlaying || isRoundEnd) && (
          <button className="primary" onClick={nextTurn} style={{ flex: 1, padding: '13px' }}>
            Next Turn →
          </button>
        )}

        {isBluffResolution && (
          <div style={{ width: '100%' }}>
            {eliminationBanner && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                marginBottom: 12,
                background: 'rgba(200,146,46,0.07)',
                border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius)',
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                color: 'var(--accent)',
              }}>
                <span>Patron eliminated. New required card: <strong>{eliminationBanner}</strong></span>
                <button
                  onClick={onDismissEliminationBanner}
                  aria-label="Dismiss"
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <CloseIcon size={15} />
                </button>
              </div>
            )}
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 15,
              color: 'var(--text)',
              marginBottom: 10,
              lineHeight: 1.65,
            }}>
              A bluff was called on the previous patron&apos;s card.
              <br />
              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Physically reveal the last card played, then confirm:</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <button className="danger" onClick={() => resolveBluff(true)} style={{ flex: 1, padding: '13px' }}>
                They were lying
              </button>
              <button className="success" onClick={() => resolveBluff(false)} style={{ flex: 1, padding: '13px' }}>
                They told the truth
              </button>
            </div>
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 13,
              color: 'var(--text-dim)',
              lineHeight: 1.7,
              fontStyle: 'italic',
            }}>
              Lying → <strong style={{ fontStyle: 'normal', color: '#c85050' }}>{prevPlayer?.username ?? '?'}</strong> faces the revolver
              <br />
              Truth → <strong style={{ fontStyle: 'normal', color: '#c85050' }}>{currentPlayer?.username ?? '?'}</strong> faces the revolver
            </div>
          </div>
        )}

        {isSpinPending && (
          <div style={{
            width: '100%',
            padding: '14px',
            background: 'linear-gradient(160deg, rgba(30,8,8,0.97) 0%, rgba(16,5,5,0.97) 100%)',
            border: '1px solid rgba(155,28,28,0.5)',
            borderRadius: 'var(--radius)',
            fontFamily: "'Crimson Text', serif",
            fontSize: 15,
            color: '#c85050',
            textAlign: 'center',
            fontStyle: 'italic',
            animation: 'pulse 1.8s ease-in-out infinite',
          }}>
            Awaiting <strong style={{ fontStyle: 'normal' }}>{spinTargetPlayer?.username ?? '...'}</strong> to pull the trigger…
          </div>
        )}

        {isGameOver && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={restartRoom} style={{ padding: '13px 20px' }}>
              Deal Again
            </button>
            <button onClick={leaveGame} style={{ padding: '13px 20px' }}>
              Leave Table
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
