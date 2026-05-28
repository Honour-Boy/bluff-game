import { VoicePanel } from '../VoicePanel';
import { ShareButton } from './shared';

export function HostHeader({
  roomCode,
  alivePlayersCount,
  roundNumber,
  voice,
  onShowHowToPlay,
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      padding: '6px 0 12px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <h1
          className="candle-title"
          style={{
            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
            fontSize: 44,
            color: 'var(--accent)',
            lineHeight: 0.95,
            letterSpacing: '0.1em',
            textShadow: '0 0 30px rgba(200,146,46,0.4)',
          }}
        >
          BLUFF
        </h1>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.22em',
          marginTop: 4,
          textTransform: 'uppercase',
        }}>
          Game Master
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 8,
            color: 'var(--text-dim)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 5,
          }}>
            Chamber Cipher
          </div>
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: 'var(--accent)',
              border: '1px solid var(--accent-dim)',
              padding: '4px 16px',
              borderRadius: 'var(--radius)',
              background: 'rgba(200,146,46,0.06)',
              cursor: 'pointer',
              display: 'inline-block',
              boxShadow: '0 0 10px rgba(200,146,46,0.1)',
              transition: 'box-shadow 0.15s',
            }}
            title="Click to copy"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(200,146,46,0.28)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 10px rgba(200,146,46,0.1)'; }}
          >
            {roomCode}
          </div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 8,
            color: 'var(--text-dim)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: 5,
          }}>
            {alivePlayersCount} alive · Round {roundNumber}
          </div>
          <div style={{ marginTop: 8 }}>
            <ShareButton roomCode={roomCode} />
          </div>
          {voice && (
            <div style={{ marginTop: 8 }}>
              <VoicePanel {...voice} />
            </div>
          )}
        </div>
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
