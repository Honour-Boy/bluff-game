'use client';

import { RiskMeter } from './RiskMeter';
import { VoiceIndicator } from './VoicePanel';

export function PlayerList({ players, turnOrder, currentPlayerId, isHost, phase, speakingIds, voiceConnected }) {
  if (!players || players.length === 0) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
        No players yet. Share the room code!
      </div>
    );
  }

  // Order players: turn order first, then spectators
  const ordered = [
    ...turnOrder.map(id => players.find(p => p.id === id)).filter(Boolean),
    ...players.filter(p => p.status === 'eliminated'),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ordered.map((player, idx) => {
        const isCurrent = player.id === currentPlayerId;
        const isAlive = player.status === 'alive';
        const turnPosition = turnOrder.indexOf(player.id);

        return (
          <div
            key={player.id}
            className={isCurrent && isAlive ? 'current-player-row' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--surface2)',
              border: `1px solid ${isCurrent && isAlive ? 'var(--warning)' : isAlive ? 'var(--border)' : '#1a1a22'}`,
              borderRadius: 'var(--radius)',
              opacity: isAlive ? 1 : 0.45,
              gap: 12,
              transition: 'all 0.2s ease',
            }}
          >
            {/* Turn position */}
            <div style={{
              width: 24,
              height: 24,
              borderRadius: 2,
              background: isCurrent && isAlive ? 'var(--warning)' : 'var(--surface)',
              border: `1px solid ${isCurrent && isAlive ? 'var(--warning)' : 'var(--border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: isCurrent && isAlive ? '#0a0a0b' : 'var(--text-dim)',
              flexShrink: 0,
            }}>
              {isAlive ? turnPosition + 1 : '✕'}
            </div>

            {/* Player name + status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700,
                fontSize: 13,
                color: isCurrent && isAlive ? 'var(--warning)' : isAlive ? 'var(--text)' : 'var(--text-dim)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <VoiceIndicator playerId={player.id} speakingIds={speakingIds} voiceConnected={voiceConnected} />
                {player.username}
                {isCurrent && isAlive && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: 'var(--warning)',
                    border: '1px solid var(--warning)',
                    padding: '1px 5px',
                    borderRadius: 2,
                    verticalAlign: 'middle',
                  }}>TURN</span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                {isAlive
                  ? <RiskMeter riskLevel={player.riskLevel} size="sm" />
                  : <span style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: '0.1em' }}>ELIMINATED</span>
                }
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}
