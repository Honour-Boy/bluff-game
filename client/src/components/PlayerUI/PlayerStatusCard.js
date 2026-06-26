import { VoicePanel } from '../VoicePanel';
import { ShareButton } from './shared';

function ChamberPreview({ chamber }) {
  return (
    <div>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: 'var(--text-dim)',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        Chamber
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {Array.from({ length: 6 }).map((_, index) => {
          const isBullet = chamber?.[index] === 'bullet';
          return (
            <div
              key={index}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: isBullet
                  ? 'radial-gradient(circle at 35% 35%, #ff5555, var(--accent2))'
                  : 'var(--surface2)',
                border: `1.5px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                boxShadow: isBullet ? '0 0 6px rgba(155,28,28,0.6)' : 'none',
              }}
            />
          );
        })}
      </div>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
      }}>
        {chamber?.filter((slot) => slot === 'bullet').length ?? 1}/6 loaded
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
  const borderColor = isMyTurn && isPlaying
    ? 'var(--border-glow)'
    : isEliminated
      ? 'rgba(155,28,28,0.5)'
      : 'var(--border-lit)';

  const bg = isMyTurn && isPlaying
    ? 'linear-gradient(160deg, rgba(30,20,8,0.96) 0%, rgba(16,12,6,0.97) 100%)'
    : 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      background: bg,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 14px',
      boxShadow: isMyTurn && isPlaying
        ? '0 0 20px rgba(200,146,46,0.12), 0 6px 18px rgba(0,0,0,0.4)'
        : '0 6px 18px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 8,
            color: 'var(--text-dim)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Your Status
          </div>

          {isMyTurn && isPlaying && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.06em',
              lineHeight: 1,
              marginBottom: 8,
              textShadow: '0 0 16px rgba(200,146,46,0.4)',
            }}>
              Your Turn
            </div>
          )}

          {!isMyTurn && isPlaying && currentPlayer && (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: 'var(--text-dim)',
              marginBottom: 8,
              fontStyle: 'italic',
            }}>
              Awaiting <span style={{ color: 'var(--text)', fontStyle: 'normal', fontFamily: "'Cinzel', serif", fontSize: 13 }}>{currentPlayer.username}</span>…
            </div>
          )}

          {isLobby && (
            <div>
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                color: 'var(--text-dim)',
                marginBottom: 10,
                fontStyle: 'italic',
              }}>
                Waiting for the proprietor to deal…
              </div>
              <ShareButton roomCode={roomCode} senderName={myPlayer?.username} />
            </div>
          )}

          {voice && (
            <div style={{ marginTop: 12 }}>
              <VoicePanel {...voice} />
            </div>
          )}

          {isRoundEnd && (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: 'var(--alive)',
              fontStyle: 'italic',
            }}>
              Round ended. Awaiting the next deal…
            </div>
          )}

          {isGameOver && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 14,
              color: 'var(--accent)',
              letterSpacing: '0.06em',
              textShadow: '0 0 10px rgba(200,146,46,0.25)',
            }}>
              {lastAction?.winnerName ? `${lastAction.winnerName} prevails!` : 'The game concludes.'}
            </div>
          )}

          {isEliminated && isPlaying && (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: '#c85050',
              fontStyle: 'italic',
            }}>
              You are watching from the shadows…
            </div>
          )}
        </div>

        {!isEliminated && <ChamberPreview chamber={myPlayer?.chamber} />}
      </div>
    </div>
  );
}
