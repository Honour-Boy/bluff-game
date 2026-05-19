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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 className="glitch" style={{ fontSize: 52, color: 'var(--accent)', lineHeight: 1 }}>BLUFF</h1>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginTop: 2 }}>
          GAME MASTER PANEL
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>ROOM CODE</div>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 36,
              letterSpacing: '0.2em',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '4px 16px',
              borderRadius: 'var(--radius)',
              background: 'rgba(232,255,74,0.04)',
              cursor: 'pointer',
            }}
            title="Click to copy"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
          >
            {roomCode}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
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
          style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
        >
          ? How to Play
        </button>
      </div>
    </div>
  );
}
