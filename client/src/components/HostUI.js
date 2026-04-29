'use client';

import { useState, useEffect, useRef } from 'react';
import { CardShape } from './CardShape';
import { PlayerList } from './PlayerList';
import { ActionLog } from './ActionLog';
import { HowToPlayModal } from './HowToPlayModal';

const CARD_ICONS = { square: '⬛', circle: '⭕', triangle: '🔺', cross: '✖️', star: '⭐' };

// Seeded shuffle — same algorithm as PlayerUI for consistent chamber layout
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CYL = 200, CX = 100, CY = 100, ORBIT = 58, CHAM_R = 20;

function CylinderSVG({ bulletChambers, landingChamberIndex, rotation, animating, spinComplete }) {
  const chambers = [0, 1, 2, 3, 4, 5].map(i => {
    const angleRad = ((i * 60 - 90) * Math.PI) / 180;
    return {
      x: CX + ORBIT * Math.cos(angleRad),
      y: CY + ORBIT * Math.sin(angleRad),
      isBullet: bulletChambers.has(i),
      isLanding: spinComplete && i === landingChamberIndex,
    };
  });
  return (
    <div style={{ position: 'relative', width: CYL, height: CYL }}>
      <svg width={CYL} height={CYL} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}>
        <polygon
          points={`${CX},${CY - ORBIT - CHAM_R + 2} ${CX - 9},${CY - ORBIT - CHAM_R - 14} ${CX + 9},${CY - ORBIT - CHAM_R - 14}`}
          fill="var(--accent)"
        />
      </svg>
      <svg
        width={CYL} height={CYL}
        style={{
          position: 'absolute', top: 0, left: 0,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: animating ? 'transform 8s cubic-bezier(0.1, 0, 0.2, 1)' : 'none',
        }}
      >
        <circle cx={CX} cy={CY} r={ORBIT + CHAM_R + 8} fill="#111118" stroke="#2a2a35" strokeWidth={2} />
        {chambers.map((ch, i) => (
          <g key={i}>
            {ch.isLanding && (
              <circle cx={ch.x} cy={ch.y} r={CHAM_R + 5} fill="none"
                stroke={ch.isBullet ? 'var(--accent2)' : 'var(--alive)'}
                strokeWidth={3} opacity={0.8} />
            )}
            <circle cx={ch.x} cy={ch.y} r={CHAM_R}
              fill={ch.isBullet ? '#3a0808' : '#0d0d18'}
              stroke={ch.isLanding ? (ch.isBullet ? 'var(--accent2)' : 'var(--alive)') : '#333'}
              strokeWidth={ch.isLanding ? 2.5 : 1.5} />
            {ch.isBullet && (
              <circle cx={ch.x} cy={ch.y} r={CHAM_R * 0.42}
                fill={ch.isLanding ? '#ff3344' : '#882222'} />
            )}
          </g>
        ))}
        <circle cx={CX} cy={CY} r={9} fill="#222230" stroke="#444" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

export function HostUI({
  roomCode,
  roomState,
  startGame,
  nextTurn,
  resolveBluff,
  declareRoundWin,
  leaveGame,
}) {
  const [confirmAction, setConfirmAction] = useState(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [eliminationBanner, setEliminationBanner] = useState(null);

  // Spin overlay (host sees same cylinder as players)
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);

  useEffect(() => {
    const action = roomState?.lastAction;
    if (!action) return;

    // Show elimination banner when a new card type was generated
    if (action.type === 'spin_result' && action.newCardType) {
      setEliminationBanner(action.newCardType);
    }

    if (action.type !== 'spin_result') return;
    const actionKey = `${action.spinTargetId}:${action.roll}`;
    if (lastSpinKeyRef.current === actionKey) return;
    lastSpinKeyRef.current = actionKey;

    const { roll, eliminated, spinTargetName, spinTargetId: targetId, riskLevelBefore } = action;
    const landingChamberIndex = (roll - 1) % 6;
    const finalAngle = 10 * 360 + landingChamberIndex * 60;
    const safeRiskBefore = riskLevelBefore ?? 1;
    const shuffled = seededShuffle([0, 1, 2, 3, 4, 5], roll);
    const bulletChambers = new Set(shuffled.slice(0, safeRiskBefore));

    setCylinderRotation(0);
    setCylinderAnimating(false);
    setSpinComplete(false);
    setSpinData({ roll, eliminated, spinTargetName, spinTargetId: targetId, riskLevelBefore: safeRiskBefore, bulletChambers, landingChamberIndex, finalAngle });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCylinderRotation(finalAngle);
        setCylinderAnimating(true);
      });
    });

    const timer = setTimeout(() => setSpinComplete(true), 8000);
    return () => clearTimeout(timer);
  }, [roomState?.lastAction]);

  if (!roomState) {
    return (
      <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
        Connecting...
      </div>
    );
  }

  const {
    players, turnOrder, currentPlayerId, currentCardType,
    phase, roundNumber, lastAction, currentTurnIndex, spinTargetId,
  } = roomState;

  const currentPlayer = players?.find(p => p.id === currentPlayerId);
  const alivePlayers = players?.filter(p => p.status === 'alive') || [];
  const isLobby = phase === 'lobby';
  const isPlaying = phase === 'playing';
  const isBluffResolution = phase === 'bluff_resolution';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';

  // Derive prev player for bluff resolution display
  const prevIdx = turnOrder?.length
    ? (currentTurnIndex - 1 + turnOrder.length) % turnOrder.length
    : 0;
  const prevPlayerId = turnOrder?.[prevIdx];
  const prevPlayer = players?.find(p => p.id === prevPlayerId);
  const spinTargetPlayer = players?.find(p => p.id === spinTargetId);

  const handleRoundWin = (playerId) => {
    setConfirmAction({ type: 'roundWin', payload: playerId });
  };

  const executeConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'roundWin') declareRoundWin(confirmAction.payload);
    setConfirmAction(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto' }}>

      {/* Header */}
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
              {alivePlayers.length} alive · Round {roundNumber}
            </div>
          </div>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
          >
            ? How to Play
          </button>
        </div>
      </div>

      {/* Phase banner */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--surface)',
        border: `1px solid ${isBluffResolution || isSpinPending ? 'var(--accent2)' : isGameOver ? 'var(--accent)' : isRoundEnd ? 'var(--alive)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: isBluffResolution || isSpinPending ? 'var(--accent2)' : isGameOver ? 'var(--accent)' : isRoundEnd ? 'var(--alive)' : 'var(--text-dim)',
        }}>
          {isLobby && '⏳ Waiting for players'}
          {isPlaying && '🎮 Game in progress'}
          {isBluffResolution && '⚠️ Bluff called — reveal last card!'}
          {isSpinPending && `🔫 Waiting for ${spinTargetPlayer?.username ?? '...'} to spin`}
          {isRoundEnd && '🏆 Round ended — players reshuffle'}
          {isGameOver && '🎉 Game over!'}
        </div>
        {isGameOver && lastAction?.winnerName && (
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
            Winner: {lastAction.winnerName}
          </div>
        )}
      </div>

      {/* Current card & player */}
      {(isPlaying || isBluffResolution || isSpinPending) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 12 }}>
              REQUIRED CARD
            </div>
            <CardShape type={currentCardType} size="md" />
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
              Announce this physically to players
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 12 }}>
              CURRENT PLAYER
            </div>
            {currentPlayer ? (
              <>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--warning)', lineHeight: 1 }}>
                  {currentPlayer.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  Risk: {currentPlayer.riskLevel}/6
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>—</div>
            )}
          </div>
        </div>
      )}

      {/* Action log */}
      {lastAction && <ActionLog lastAction={lastAction} />}

      {/* Elimination banner — shown during playing phase after a spin result */}
      {isPlaying && eliminationBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(232,255,74,0.06)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--accent)',
        }}>
          <span>
            Player eliminated. New required card:&nbsp;
            <strong>{CARD_ICONS[eliminationBanner]} {eliminationBanner}</strong>
          </span>
          <button
            onClick={() => setEliminationBanner(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* Host controls */}
      <div className="card">
        <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
          HOST CONTROLS
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isLobby && (
            <button
              className="primary"
              onClick={startGame}
              disabled={alivePlayers.length < 2}
              title={alivePlayers.length < 2 ? 'Need at least 2 players' : 'Start the game'}
            >
              ▶ Start Game ({alivePlayers.length} players)
            </button>
          )}

          {(isPlaying || isRoundEnd) && (
            <button className="primary" onClick={nextTurn}>
              → Next Turn
            </button>
          )}

          {/* Bluff resolution */}
          {isBluffResolution && (
            <div style={{ width: '100%' }}>
              {/* Elimination banner */}
              {eliminationBanner && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', marginBottom: 12,
                  background: 'rgba(232,255,74,0.06)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius)',
                  fontSize: 12, color: 'var(--accent)',
                }}>
                  <span>
                    Player eliminated. New required card:&nbsp;
                    <strong>{CARD_ICONS[eliminationBanner]} {eliminationBanner}</strong>
                  </span>
                  <button
                    onClick={() => setEliminationBanner(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  >✕</button>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 10, lineHeight: 1.6 }}>
                The current player called bluff on the previous player's last card.<br />
                <span style={{ color: 'var(--text-dim)' }}>Physically reveal the last card played, then confirm:</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="success" onClick={() => resolveBluff(true)} style={{ flex: 1 }}>
                  ✓ They were lying
                </button>
                <button className="danger" onClick={() => resolveBluff(false)} style={{ flex: 1 }}>
                  ✗ They told the truth
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                They were lying → <strong style={{ color: 'var(--accent2)' }}>{prevPlayer?.username ?? '?'}</strong> spins<br />
                They told the truth → <strong style={{ color: 'var(--accent2)' }}>{currentPlayer?.username ?? '?'}</strong> spins
              </div>
            </div>
          )}

          {/* Spin pending */}
          {isSpinPending && (
            <div style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(255,74,110,0.05)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              color: 'var(--accent2)',
              textAlign: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              🔫 Waiting for <strong>{spinTargetPlayer?.username ?? '...'}</strong> to pull the trigger...
            </div>
          )}

          {isGameOver && (
            <button className="primary" onClick={leaveGame}>
              🔄 New Game
            </button>
          )}
        </div>
      </div>

      {/* Declare Round Winner — only during playing phase */}
      {isPlaying && (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
            DECLARE ROUND WINNER
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alivePlayers.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ fontSize: 13 }}>{p.username}</span>
                <button
                  className="success"
                  style={{ padding: '4px 12px', fontSize: 11 }}
                  onClick={() => handleRoundWin(p.id)}
                >
                  🏆 Win
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="card">
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>PLAYERS ({players?.length || 0}/15)</span>
          <span style={{ color: 'var(--alive)' }}>{alivePlayers.length} alive</span>
        </div>
        <PlayerList
          players={players}
          turnOrder={turnOrder}
          currentPlayerId={currentPlayerId}
          isHost={true}
          phase={phase}
        />
      </div>

      {/* Round win confirm modal */}
      {confirmAction && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 8000,
        }}>
          <div className="card fade-in" style={{ maxWidth: 360, width: '90%', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, marginBottom: 12 }}>
              🏆 Confirm Round Win
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 24 }}>
              Declare this player the round winner?
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="success" onClick={executeConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave */}
      <button
        onClick={leaveGame}
        style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}
      >
        Leave game
      </button>

      {/* How to Play modal */}
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

      {/* ── Host cylinder spin overlay ── */}
      {spinData && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 9000, padding: 24,
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22, letterSpacing: '0.15em',
            color: 'var(--text-dim)', marginBottom: 32, textAlign: 'center',
          }}>
            {spinData.spinTargetName} pulls the trigger...
          </div>

          <CylinderSVG
            bulletChambers={spinData.bulletChambers}
            landingChamberIndex={spinData.landingChamberIndex}
            rotation={cylinderRotation}
            animating={cylinderAnimating}
            spinComplete={spinComplete}
          />

          {spinComplete && (
            <div style={{ marginTop: 36, textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 56, letterSpacing: '0.05em', lineHeight: 1,
                color: spinData.eliminated ? 'var(--accent2)' : 'var(--alive)',
                textShadow: spinData.eliminated
                  ? '0 0 30px rgba(255,74,110,0.7)'
                  : '0 0 30px rgba(74,255,128,0.7)',
                marginBottom: 14,
              }}>
                {spinData.eliminated ? '💀 ELIMINATED' : '😮‍💨 SURVIVED'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
                Rolled {spinData.roll} — Risk was {spinData.riskLevelBefore}/6
              </div>
              <button
                className="primary"
                onClick={() => setSpinData(null)}
                style={{ padding: '10px 32px', fontSize: 14 }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
