'use client';

import { useState, useEffect } from 'react';
import { CardShape } from './CardShape';
import { RiskMeter } from './RiskMeter';
import { ActionLog } from './ActionLog';
import { HowToPlayModal } from './HowToPlayModal';

export function PlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  callBluff,
  playCard,
  endTurn,
  playerSpin,
  leaveGame,
}) {
  const [spinOverlay, setSpinOverlay] = useState(null); // { eliminated, playerName }
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Show spin overlay whenever a spin_result comes in
  useEffect(() => {
    if (roomState?.lastAction?.type === 'spin_result') {
      const { spinTargetName, eliminated } = roomState.lastAction;
      setSpinOverlay({ eliminated, playerName: spinTargetName });
      const timer = setTimeout(() => setSpinOverlay(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [roomState?.lastAction]);

  if (!roomState || !myPlayer) {
    return (
      <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
        Connecting to game...
      </div>
    );
  }

  const {
    players, turnOrder, currentPlayerId, currentCardType,
    phase, roundNumber, lastAction,
    bluffUsedThisTurn, cardPlayedThisTurn, spinTargetId,
  } = roomState;

  const currentPlayer = players?.find(p => p.id === currentPlayerId);
  const isEliminated = myPlayer.status === 'eliminated';
  const isPlaying = phase === 'playing';
  const isLobby = phase === 'lobby';
  const isBluffResolution = phase === 'bluff_resolution';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';

  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;
  const spinTargetPlayer = isSpinPending ? players?.find(p => p.id === spinTargetId) : null;

  // Helper text for the action card
  let actionHint = '';
  if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint = 'Call bluff on the previous player\'s card, or play your card face-down.';
  } else if (bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint = 'Bluff already called this turn. Now play your card face-down.';
  } else if (cardPlayedThisTurn) {
    actionHint = 'Card played. End your turn when ready.';
  }

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            color: isEliminated ? 'var(--accent2)' : 'var(--text)',
            lineHeight: 1,
          }}>
            {myPlayer.username}
          </div>
          <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
            {isEliminated ? 'Eliminated' : 'Alive'}
          </span>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
          >
            ? How to Play
          </button>
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
                {lastAction?.winnerName ? `Game over! ${lastAction.winnerName} wins!` : 'Game over!'}
              </div>
            )}
            {isEliminated && isPlaying && (
              <div style={{ fontSize: 12, color: 'var(--accent2)' }}>You are spectating</div>
            )}
          </div>

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

      {/* Required card type */}
      {(isPlaying || isBluffResolution || isSpinPending) && currentCardType && (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
            REQUIRED CARD THIS TURN
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <CardShape type={currentCardType} size="md" />
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
              The host has announced the required card type.<br />
              Players must play a card face-down, claiming it matches.
            </div>
          </div>
        </div>
      )}

      {/* ── Player actions: my turn, playing phase ── */}
      {isMyTurn && isPlaying && !isEliminated && (
        <div className="card" style={{ border: '1px solid var(--warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.12em', marginBottom: 14 }}>
            YOUR ACTIONS
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="danger"
              onClick={callBluff}
              disabled={bluffUsedThisTurn}
              style={{
                flex: 1,
                opacity: bluffUsedThisTurn ? 0.4 : 1,
                cursor: bluffUsedThisTurn ? 'not-allowed' : 'pointer',
              }}
            >
              ⚠️ Call Bluff
            </button>
            <button
              className="success"
              onClick={playCard}
              disabled={cardPlayedThisTurn}
              style={{
                flex: 1,
                opacity: cardPlayedThisTurn ? 0.4 : 1,
                cursor: cardPlayedThisTurn ? 'not-allowed' : 'pointer',
              }}
            >
              🃏 Play Card
            </button>
          </div>
          {cardPlayedThisTurn && (
            <button
              className="primary"
              onClick={endTurn}
              style={{ width: '100%', marginTop: 10 }}
            >
              ✅ End Turn
            </button>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
            {actionHint}
          </div>
        </div>
      )}

      {/* ── Bluff resolution: I called it ── */}
      {isBluffResolution && isMyTurn && (
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255,74,110,0.05)',
          border: '1px solid var(--accent2)',
          borderRadius: 'var(--radius)',
          fontSize: 12,
          color: 'var(--accent2)',
          textAlign: 'center',
        }}>
          ⚠️ Waiting for host to reveal the last card played...
        </div>
      )}

      {/* ── Spin pending: it's my spin ── */}
      {isMySpinTurn && !isEliminated && (
        <div className="card" style={{ border: '1px solid var(--accent2)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: '0.12em', marginBottom: 14 }}>
            YOUR FATE AWAITS
          </div>
          <button
            className="danger"
            onClick={playerSpin}
            style={{ width: '100%', fontSize: 16, padding: '14px' }}
          >
            🔫 Pull the Trigger
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
            You must spin. Click to reveal your fate.
          </div>
        </div>
      )}

      {/* ── Spin pending: waiting for someone else ── */}
      {isSpinPending && !isMySpinTurn && spinTargetPlayer && (
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255,74,110,0.05)',
          border: '1px solid var(--accent2)',
          borderRadius: 'var(--radius)',
          fontSize: 12,
          color: 'var(--accent2)',
          textAlign: 'center',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          🔫 Waiting for <strong>{spinTargetPlayer.username}</strong> to pull the trigger...
        </div>
      )}

      {/* Action log */}
      {lastAction && <ActionLog lastAction={lastAction} />}

      {/* Player list */}
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
                  width: 20, height: 20, borderRadius: 2,
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
                  {isSpinPending && p.id === spinTargetId && (
                    <span style={{ color: 'var(--accent2)', marginLeft: 6, fontSize: 9, letterSpacing: '0.1em' }}>🔫 SPINNING</span>
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

      {/* Spin result overlay — shown on all screens */}
      {spinOverlay && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9000,
        }}>
          {/* Cylinder animation */}
          <div style={{ marginBottom: 32, position: 'relative', width: 120, height: 120 }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              border: '3px solid var(--accent2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40,
              animation: 'spinWheel 1.2s ease-out forwards',
            }}>
              🔫
            </div>
          </div>

          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            color: 'var(--text-dim)',
            letterSpacing: '0.2em',
            marginBottom: 12,
          }}>
            {spinOverlay.playerName}
          </div>

          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 52,
            color: spinOverlay.eliminated ? 'var(--accent2)' : 'var(--alive)',
            letterSpacing: '0.05em',
            lineHeight: 1,
            marginBottom: 24,
          }}>
            {spinOverlay.eliminated ? '💀 ELIMINATED' : '😮‍💨 SURVIVED'}
          </div>

          <button
            onClick={() => setSpinOverlay(null)}
            style={{ fontSize: 11, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

      <style>{`
        @keyframes spinWheel {
          0%   { transform: rotate(0deg);    }
          60%  { transform: rotate(1080deg); }
          80%  { transform: rotate(1060deg); }
          100% { transform: rotate(1080deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
