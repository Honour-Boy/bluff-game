import { PlayerList } from '../PlayerList';

const cardStyle = {
  background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 'var(--radius-lg)',
  padding: '16px 14px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
};

export function HostRoundWinnerPanel({ isPlaying, alivePlayers, onRoundWin }) {
  if (!isPlaying) return null;

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
        Declare Round Victor
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alivePlayers.map((player) => (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 12px',
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 13,
              letterSpacing: '0.04em',
              color: 'var(--text)',
            }}>
              {player.username}
            </span>
            <button
              className="success"
              style={{ padding: '5px 14px', fontSize: 10 }}
              onClick={() => onRoundWin(player.id)}
            >
              Victor
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostPlayersPanel({
  players,
  alivePlayers,
  turnOrder,
  currentPlayerId,
  phase,
  voice,
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Patrons ({players?.length || 0}/15)</span>
        <span style={{ color: 'var(--alive)' }}>{alivePlayers.length} alive</span>
      </div>
      <PlayerList
        players={players}
        turnOrder={turnOrder}
        currentPlayerId={currentPlayerId}
        isHost
        phase={phase}
        speakingIds={voice?.speakingIds}
        voiceConnected={voice?.isConnected}
      />
    </div>
  );
}
