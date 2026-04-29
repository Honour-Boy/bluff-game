'use client';

import { CardShape } from './CardShape';
import { RiskMeter } from './RiskMeter';
import { ActionLog } from './ActionLog';

export function PlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  callBluff,
  playerContinue,
  leaveGame,
}) {
  if (!roomState || !myPlayer) {
    return (
      <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
        Connecting to game...
      </div>
    );
  }

  const { players, turnOrder, currentPlayerId, currentCardType, phase, roundNumber, lastAction } = roomState;
  const currentPlayer = players?.find(p => p.id === currentPlayerId);
  const isAlive = myPlayer.status === 'alive';
  const isPlaying = phase === 'playing';
  const isLobby = phase === 'lobby';
  const isBluffResolution = phase === 'bluff_resolution';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const isEliminated = myPlayer.status === 'eliminated';

  // Determine the player whose turn it is before me (so I know when to call bluff)
  const myTurnIndex = turnOrder.indexOf(myPlayer.id);
  const nextPlayerIndex = (myTurnIndex + 1) % turnOrder.length;
  const nextPlayerId = turnOrder[nextPlayerIndex];
  const isNextTurn = myPlayer.id === nextPlayerId && isPlaying; // It'll be my turn next

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 44, color: isEliminated ? 'var(--accent2)' : 'var(--accent)', lineHeight: 1 }}>
            BLUFF
          </h1>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
            ROOM: {roomCode} · ROUND {roundNumber}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            color: isEliminated ? 'var(--accent2)' : 'var(--text)',
            lineHeight: 1,
          }}>
            {myPlayer.username}
          </div>
          <div style={{ marginTop: 4 }}>
            <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
              {isEliminated ? 'Eliminated' : 'Alive'}
            </span>
          </div>
        </div>
      </div>

      {/* My status card */}
      <div className="card" style={{
        border: `1px solid ${isMyTurn && isPlaying ? 'var(--warning)' : isEliminated ? 'var(--accent2)' : 'var(--border)'}`,
        background: isMyTurn && isPlaying ? 'rgba(255,170,74,0.04)' : 'var(--surface)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
              YOUR STATUS
            </div>
            {isMyTurn && isPlaying && (
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                color: 'var(--warning)',
                letterSpacing: '0.05em',
                lineHeight: 1,
                marginBottom: 8,
              }}>
                YOUR TURN
              </div>
            )}
            {!isMyTurn && isPlaying && currentPlayer && (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer.username}</span>
              </div>
            )}
            {isLobby && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Waiting for host to start...</div>
            )}
            {isRoundEnd && (
              <div style={{ fontSize: 12, color: 'var(--alive)' }}>Round ended. Waiting for next round...</div>
            )}
            {isGameOver && (
              <div style={{ fontSize: 12, color: 'var(--accent)' }}>
                {lastAction?.winnerName
                  ? `Game over! ${lastAction.winnerName} wins!`
                  : 'Game over!'}
              </div>
            )}
            {isEliminated && isPlaying && (
              <div style={{ fontSize: 12, color: 'var(--accent2)' }}>You are spectating</div>
            )}
          </div>

          {/* Risk meter */}
          {!isEliminated && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
                RISK LEVEL
              </div>
              <RiskMeter riskLevel={myPlayer.riskLevel} size="md" />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                {myPlayer.riskLevel === 1 && 'Low risk'}
                {myPlayer.riskLevel === 2 && 'Building up...'}
                {myPlayer.riskLevel === 3 && 'Getting risky'}
                {myPlayer.riskLevel === 4 && 'High stakes!'}
                {myPlayer.riskLevel === 5 && '⚠️ Danger zone!'}
                {myPlayer.riskLevel === 6 && '💀 Maximum risk!'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Current card type */}
      {(isPlaying || isBluffResolution) && currentCardType && (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
            REQUIRED CARD THIS TURN
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <CardShape type={currentCardType} size="md" />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                The host has announced the required card type.<br />
                Players must play a card face-down, claiming it matches.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player actions */}
      {isMyTurn && isPlaying && !isEliminated && (
        <div className="card" style={{ border: '1px solid var(--warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.12em', marginBottom: 14 }}>
            YOUR ACTIONS
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="success" onClick={playerContinue} style={{ flex: 1 }}>
              ✅ Continue Turn
            </button>
            <button className="danger" onClick={callBluff} style={{ flex: 1 }}>
              ⚠️ Call Bluff
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
            Calling bluff reveals the last 3 cards. Correct → prev player spins. Wrong → you spin.
          </div>
        </div>
      )}

      {/* Bluff resolution waiting */}
      {isBluffResolution && (
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255,74,110,0.05)',
          border: '1px solid var(--accent2)',
          borderRadius: 'var(--radius)',
          fontSize: 12,
          color: 'var(--accent2)',
          textAlign: 'center',
        }}>
          ⚠️ Bluff called! Host is revealing the last 3 cards...
        </div>
      )}

      {/* Action log */}
      {lastAction && <ActionLog lastAction={lastAction} />}

      {/* Player list — all players */}
      <div className="card">
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>PLAYERS</span>
          <span style={{ color: 'var(--alive)' }}>
            {players?.filter(p => p.status === 'alive').length || 0} alive
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {players?.map((p) => {
            const isCurrentP = p.id === currentPlayerId;
            const isMe = p.id === myPlayer.id;
            const alive = p.status === 'alive';
            const turnPos = turnOrder.indexOf(p.id);

            return (
              <div
                key={p.id}
                className={isCurrentP && alive ? 'current-player-row' : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: isMe ? 'rgba(232,255,74,0.04)' : 'var(--surface2)',
                  border: `1px solid ${isCurrentP && alive ? 'var(--warning)' : isMe ? 'var(--accent)33' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  opacity: alive ? 1 : 0.4,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  color: isCurrentP && alive ? '#0a0a0b' : 'var(--text-dim)',
                  background: isCurrentP && alive ? 'var(--warning)' : 'transparent',
                  border: `1px solid ${alive ? 'var(--border)' : 'transparent'}`,
                  flexShrink: 0,
                }}>
                  {alive ? turnPos + 1 : '✕'}
                </div>

                <div style={{ flex: 1, fontWeight: isMe ? 700 : 400, fontSize: 12 }}>
                  {p.username}
                  {isMe && <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 10 }}>(you)</span>}
                  {isCurrentP && alive && !isMe && (
                    <span style={{ color: 'var(--warning)', marginLeft: 6, fontSize: 9, letterSpacing: '0.1em' }}>← TURN</span>
                  )}
                </div>

                <div style={{ flexShrink: 0 }}>
                  {alive
                    ? <RiskMeter riskLevel={p.riskLevel} size="sm" />
                    : <span style={{ fontSize: 9, color: 'var(--accent2)', letterSpacing: '0.1em' }}>OUT</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={leaveGame}
        style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}
      >
        Leave game
      </button>
    </div>
  );
}
