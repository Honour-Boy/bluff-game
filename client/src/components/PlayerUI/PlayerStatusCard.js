import { VoicePanel } from '../VoicePanel';
import { ShareButton } from './shared';

function ChamberPreview({ chamber }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
        CHAMBER
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {Array.from({ length: 6 }).map((_, index) => {
          const isBullet = chamber?.[index] === 'bullet';
          return (
            <div
              key={index}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: isBullet ? 'var(--accent2)' : 'var(--surface2)',
                border: `1.5px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                boxShadow: isBullet ? '0 0 6px rgba(255,74,110,0.5)' : 'none',
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
        {chamber?.filter((slot) => slot === 'bullet').length ?? 1}/6 bullets loaded
      </div>
    </div>
  );
}

export function PlayerStatusCard({
  roomCode,
  myPlayer,
  currentPlayer,
  isMyTurn,
  isPlaying,
  isLobby,
  isRoundEnd,
  isGameOver,
  isEliminated,
  lastAction,
  voice,
}) {
  return (
    <div
      className="card"
      style={{
        border: `1px solid ${isMyTurn && isPlaying ? 'var(--warning)' : isEliminated ? 'var(--accent2)' : 'var(--border)'}`,
        background: isMyTurn && isPlaying ? 'rgba(255,170,74,0.04)' : 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
            YOUR STATUS
          </div>
          {isMyTurn && isPlaying && (
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                color: 'var(--warning)',
                letterSpacing: '0.05em',
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              YOUR TURN
            </div>
          )}
          {!isMyTurn && isPlaying && currentPlayer && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
              Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer.username}</span>
            </div>
          )}
          {isLobby && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>Waiting for host to start...</div>
              <ShareButton roomCode={roomCode} senderName={myPlayer?.username} />
            </div>
          )}
          {voice && (
            <div style={{ marginTop: 12 }}>
              <VoicePanel {...voice} />
            </div>
          )}
          {isRoundEnd && <div style={{ fontSize: 12, color: 'var(--alive)' }}>Round ended. Waiting for next round...</div>}
          {isGameOver && (
            <div style={{ fontSize: 12, color: 'var(--accent)' }}>
              {lastAction?.winnerName ? `Game over! ${lastAction.winnerName} wins!` : 'Game over!'}
            </div>
          )}
          {isEliminated && isPlaying && <div style={{ fontSize: 12, color: 'var(--accent2)' }}>You are spectating</div>}
        </div>

        {!isEliminated && <ChamberPreview chamber={myPlayer?.chamber} />}
      </div>
    </div>
  );
}
