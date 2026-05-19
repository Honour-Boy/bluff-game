import { PlayerList } from '../PlayerList';

export function HostRoundWinnerPanel({ isPlaying, alivePlayers, onRoundWin }) {
  if (!isPlaying) return null;

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
        DECLARE ROUND WINNER
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alivePlayers.map((player) => (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <span style={{ fontSize: 13 }}>{player.username}</span>
            <button
              className="success"
              style={{ padding: '4px 12px', fontSize: 11 }}
              onClick={() => onRoundWin(player.id)}
            >
              Win
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
    <div className="card">
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>PLAYERS ({players?.length || 0}/15)</span>
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
