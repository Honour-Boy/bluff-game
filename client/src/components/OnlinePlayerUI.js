'use client';

import { useState, useEffect, useRef } from 'react';
import { CardShape } from './CardShape';
import { RiskMeter } from './RiskMeter';
import { ActionLog } from './ActionLog';
import { HowToPlayModal } from './HowToPlayModal';

// ─── Shape icons ──────────────────────────────────────────────
const SHAPE_ICONS = {
  circle: '⭕',
  triangle: '🔺',
  cross: '✖️',
  square: '⬛',
  star: '⭐',
  whot: '🃏',
};

// ─── Seeded shuffle (same PRNG as PlayerUI/HostUI) ────────────
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

// ─── Cylinder SVG (matches PlayerUI/HostUI exactly) ──────────
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
          transition: animating ? 'transform 8s cubic-bezier(0.1, 0, 0.15, 1)' : 'none',
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

// ─── Face-down card stack visual ──────────────────────────────
function FaceDownStack({ count, label, warning = false }) {
  const layers = Math.min(count, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 52, height: 72 }}>
        {count === 0 ? (
          <div style={{
            width: 44, height: 64, border: '1px dashed var(--border)',
            borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: 'var(--text-dim)',
          }}>—</div>
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: 44, height: 64,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              top: (layers - 1 - i) * 2,
              left: (layers - 1 - i) * 2,
            }} />
          ))
        )}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: warning ? 'var(--warning)' : 'var(--text-dim)' }}>
        {count} cards
      </div>
    </div>
  );
}

// ─── Fanned card hand ─────────────────────────────────────────
function CardHand({ hand, selectedCardId, onCardClick, interactive = true }) {
  const n = hand.length;
  if (n === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)', fontSize: 12 }}>
        No cards in hand
      </div>
    );
  }

  const maxAngle = Math.min(30, n * 4);
  const overlap = n > 1 ? Math.max(-32, -56 + Math.floor(320 / n)) : 0;

  return (
    // Outer div scrolls horizontally when cards overflow the screen width
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
      <div style={{
        display: 'inline-flex',    // shrink-wraps to card content width
        minWidth: '100%',          // but fills full width when cards are few (enables centering)
        justifyContent: 'center',
        alignItems: 'flex-end',
        height: 130,
        paddingBottom: 8,
        paddingLeft: 8,
        paddingRight: 8,
      }}>
        {hand.map((card, i) => {
          const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
          const rotation = t * maxAngle;
          const isSelected = selectedCardId === card.id;
          const isWhot = card.shape === 'whot';

          return (
            <div
              key={card.id}
              onClick={() => interactive && onCardClick && onCardClick(card.id)}
              style={{
                width: 56,
                height: 80,
                flexShrink: 0,
                marginRight: i < n - 1 ? overlap : 0,
                transform: `rotate(${rotation}deg)${isSelected ? ' translateY(-16px) scale(1.05)' : ''}`,
                transformOrigin: 'center 200px',
                zIndex: isSelected ? 100 : i + 1,
                cursor: interactive ? 'pointer' : 'default',
                transition: 'transform 0.15s ease',
                background: 'var(--surface2)',
                border: `2px solid ${isWhot ? 'var(--accent)' : isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                boxShadow: isSelected
                  ? '0 4px 16px rgba(0,0,0,0.6)'
                  : isWhot
                    ? '0 0 8px rgba(232,255,74,0.25)'
                    : 'none',
                userSelect: 'none',
              }}
            >
              <div style={{ fontSize: 20, lineHeight: 1 }}>
                {isWhot ? '🃏' : SHAPE_ICONS[card.shape]}
              </div>
              <div style={{
                fontSize: 10,
                color: isWhot ? 'var(--accent)' : 'var(--text-dim)',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}>
                {isWhot ? 'WHOT' : card.number}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export function OnlinePlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  isHost = false,
  startGame,
  playCardOnline,
  callBluff,
  endTurn,
  playerSpin,
  startNextRound,
  spectatePlayer,
  leaveGame,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Spectator state
  const [spectatingId, setSpectatingId] = useState(null);
  const [spectatedHand, setSpectatedHand] = useState([]);

  // Spin overlay state
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);

  // Trigger spin overlay when a spin_result arrives
  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== 'spin_result') return;

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

  // Auto-refresh spectated hand when action changes
  useEffect(() => {
    if (spectatingId && spectatePlayer) {
      spectatePlayer(spectatingId, (res) => {
        if (res.hand) setSpectatedHand(res.hand);
      });
    }
  }, [roomState?.lastAction]); // eslint-disable-line

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
    bluffUsedThisTurn, cardPlayedThisTurn, spinTargetId, isFirstTurn,
    deckSize = 0, playedPileSize = 0, myHand = [],
  } = roomState;

  const isEliminated = myPlayer.status === 'eliminated';
  const isSpectator = myPlayer.isSpectator;
  const showSpectatorView = isEliminated || isSpectator;

  const isPlaying = phase === 'playing';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const isLobby = phase === 'lobby';
  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;

  const spinTargetPlayer = players?.find(p => p.id === spinTargetId);
  const isSpinTarget = spinData?.spinTargetId === myPlayer.id;
  const currentPlayer = players?.find(p => p.id === currentPlayerId);
  const otherPlayers = players?.filter(p => p.id !== myPlayer.id) || [];
  const alivePlayers = players?.filter(p => p.status === 'alive') || [];

  // Action hint for playing phase
  let actionHint = '';
  if (isMyTurn && isPlaying) {
    if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
      actionHint = isFirstTurn
        ? 'Play a card from your hand. (No bluff on the first turn.)'
        : "Play a card from your hand, or call bluff on the previous player.";
    } else if (bluffUsedThisTurn && !cardPlayedThisTurn) {
      actionHint = 'Bluff called. Now play your card.';
    } else if (cardPlayedThisTurn) {
      actionHint = 'Card played. End your turn when ready.';
    }
  }

  const handleCardClick = (cardId) => {
    if (!isMyTurn || !isPlaying || cardPlayedThisTurn) return;
    if (selectedCardId === cardId) {
      playCardOnline(cardId);
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  };

  const handleSpectatePlayer = (targetId) => {
    setSpectatingId(targetId);
    spectatePlayer(targetId, (res) => {
      setSpectatedHand(res.hand || []);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500, margin: '0 auto', paddingBottom: 180 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, color: isEliminated ? 'var(--accent2)' : 'var(--accent)', lineHeight: 1, fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8 }}>
            BLUFF
          </h1>
          {/* Room code — large, bordered, copyable */}
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>ROOM CODE</div>
          <div
            title="Click to copy"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 30,
              letterSpacing: '0.2em',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '4px 12px',
              borderRadius: 'var(--radius)',
              background: 'rgba(232,255,74,0.04)',
              cursor: 'pointer',
              display: 'inline-block',
              lineHeight: 1.2,
            }}
          >
            {roomCode}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.08em' }}>
            Round {roundNumber} · tap to copy
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: isEliminated ? 'var(--accent2)' : 'var(--text)', lineHeight: 1 }}>
            {myPlayer.username}
          </div>
          <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
            {isEliminated ? 'Eliminated' : isHost ? 'Host · Alive' : 'Alive'}
          </span>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
          >
            ? How to Play
          </button>
        </div>
      </div>

      {/* ── Other players bar ── */}
      {otherPlayers.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4, minWidth: 'max-content' }}>
            {otherPlayers.map(p => {
              const isCurrentTurnPlayer = p.id === currentPlayerId;
              const alive = p.status === 'alive';
              return (
                <div
                  key={p.id}
                  style={{
                    maxWidth: 100, minWidth: 70,
                    padding: '6px 8px',
                    background: 'var(--surface2)',
                    border: `1px solid ${isCurrentTurnPlayer && alive ? 'var(--warning)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    opacity: alive ? 1 : 0.4,
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: isCurrentTurnPlayer && alive ? 'var(--warning)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: !alive ? 'line-through' : 'none',
                  }}>
                    {p.username}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>
                    🃏 {p.handSize ?? '?'}
                    {isSpinPending && p.id === spinTargetId && (
                      <span style={{ color: 'var(--accent2)', marginLeft: 4 }}>🔫</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Central hub ── */}
      {(isPlaying || isSpinPending || isRoundEnd) && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 16, padding: '20px 16px' }}>
          {/* Draw pile */}
          <FaceDownStack count={deckSize} label="DRAW" warning={deckSize < 5 && deckSize > 0} />

          {/* Required shape */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>REQUIRED</div>
            <CardShape type={currentCardType} size="md" />
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {currentCardType?.toUpperCase()}
            </div>
          </div>

          {/* Played pile */}
          <FaceDownStack count={playedPileSize} label="PLAYED" />
        </div>
      )}

      {/* ── Lobby state ── */}
      {isLobby && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
            LOBBY — {alivePlayers.length} player{alivePlayers.length !== 1 ? 's' : ''} joined
          </div>
          {isHost ? (
            <>
              <button
                className="primary"
                onClick={startGame}
                disabled={alivePlayers.length < 2}
                style={{ width: '100%', padding: '14px', fontSize: 13, marginBottom: 10 }}
              >
                ▶ Start Game ({alivePlayers.length} players)
              </button>
              {alivePlayers.length < 2 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Need at least 2 players to start.
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Waiting for the host to start the game...
            </div>
          )}
        </div>
      )}

      {/* ── Action log ── */}
      {lastAction && <ActionLog lastAction={lastAction} />}

      {/* ── Risk meter (when alive, not lobby) ── */}
      {!isEliminated && !isLobby && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>RISK</div>
          <RiskMeter riskLevel={myPlayer.riskLevel} size="sm" />
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {myPlayer.riskLevel}/6
            {myPlayer.riskLevel >= 5 && <span style={{ color: 'var(--accent2)', marginLeft: 6 }}>⚠️ High risk</span>}
          </div>
        </div>
      )}

      {/* ── Player actions (context sensitive) ── */}

      {/* My turn — playing phase */}
      {isMyTurn && isPlaying && !isEliminated && (
        <div className="card" style={{ border: '1px solid var(--warning)' }}>
          <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.12em', marginBottom: 14 }}>
            YOUR TURN
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isFirstTurn && (
              <button
                className="danger"
                onClick={callBluff}
                disabled={bluffUsedThisTurn || cardPlayedThisTurn}
                style={{
                  flex: 1,
                  opacity: bluffUsedThisTurn || cardPlayedThisTurn ? 0.4 : 1,
                  cursor: bluffUsedThisTurn || cardPlayedThisTurn ? 'not-allowed' : 'pointer',
                }}
              >
                ⚠️ Call Bluff
              </button>
            )}
            {cardPlayedThisTurn && (
              <button className="primary" onClick={endTurn} style={{ flex: 1 }}>
                ✅ End Turn
              </button>
            )}
          </div>
          {actionHint && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
              {actionHint}
            </div>
          )}
        </div>
      )}

      {/* Waiting for someone else */}
      {!isMyTurn && isPlaying && currentPlayer && !isEliminated && (
        <div style={{
          padding: '12px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--text-dim)',
        }}>
          Waiting for <span style={{ color: 'var(--text)', fontWeight: 700 }}>{currentPlayer.username}</span> to play...
        </div>
      )}

      {/* Spin pending — bluff reveal + spin prompt */}
      {isSpinPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Bluff reveal panel (online auto-resolved bluffs) */}
          {lastAction?.autoResolved && lastAction?.accuserName && (
            <div className="card fade-in" style={{
              border: `1px solid ${lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)'}`,
              background: lastAction.bluffCorrect ? 'rgba(74,255,128,0.04)' : 'rgba(255,74,110,0.04)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>
                BLUFF CALLED
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong style={{ color: 'var(--text)' }}>{lastAction.accuserName}</strong>
                {' '}called bluff on{' '}
                <strong style={{ color: 'var(--text)' }}>{lastAction.accusedName}</strong>
              </div>

              {/* Revealed card */}
              {lastAction.revealedCard ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>
                    CARD REVEALED:
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 13, fontWeight: 700,
                  }}>
                    <span>{lastAction.revealedCard.shape === 'whot' ? '🃏' : SHAPE_ICONS[lastAction.revealedCard.shape]}</span>
                    <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>
                      {lastAction.revealedCard.shape === 'whot' ? 'WHOT' : lastAction.revealedCard.shape}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{lastAction.revealedCard.number}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
                  No card was played.
                </div>
              )}

              {/* Verdict */}
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 18, letterSpacing: '0.08em',
                color: lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)',
                marginBottom: 4,
              }}>
                {lastAction.bluffCorrect
                  ? `✓ Bluff correct — ${lastAction.accusedName} was lying!`
                  : `✗ Bluff wrong — ${lastAction.accusedName} told the truth!`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                → <strong>{lastAction.spinTargetName}</strong> must spin.
              </div>
            </div>
          )}

          {/* My spin button */}
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
                You must spin. Tap to reveal your fate.
              </div>
            </div>
          )}

          {/* Waiting for someone else to spin */}
          {!isMySpinTurn && spinTargetPlayer && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(255,74,110,0.05)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              fontSize: 12, color: 'var(--accent2)',
              textAlign: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              🔫 Waiting for <strong>{spinTargetPlayer.username}</strong> to pull the trigger...
            </div>
          )}
        </div>
      )}

      {/* Round end */}
      {isRoundEnd && (
        <div className="card" style={{ textAlign: 'center', border: '1px solid var(--alive)' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--alive)', marginBottom: 8 }}>
            {lastAction?.winnerId === myPlayer.id ? '🏆 You Won This Round!' : `🏆 ${lastAction?.winnerName ?? '?'} Won This Round!`}
          </div>
          {isHost && (
            <button className="primary" onClick={startNextRound} style={{ marginTop: 12 }}>
              ▶ Next Round
            </button>
          )}
          {!isHost && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              Waiting for host to start the next round...
            </div>
          )}
        </div>
      )}

      {/* Game over */}
      {isGameOver && (
        <div className="card" style={{ textAlign: 'center', border: '1px solid var(--accent)' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: 'var(--accent)', marginBottom: 8 }}>
            {lastAction?.winnerId === myPlayer.id ? '🎉 You Win!' : `${lastAction?.winnerName ?? '?'} Wins!`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Game over.</div>
          <button className="primary" onClick={leaveGame}>
            🔄 New Game
          </button>
        </div>
      )}

      {/* ── Card hand or spectator view ── */}
      {showSpectatorView ? (
        // ── Spectator view ──
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
            👁 SPECTATING
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {alivePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => handleSpectatePlayer(p.id)}
                style={{
                  padding: '6px 12px', fontSize: 12,
                  border: `1px solid ${spectatingId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: spectatingId === p.id ? 'rgba(232,255,74,0.06)' : 'var(--surface2)',
                  color: spectatingId === p.id ? 'var(--accent)' : 'var(--text)',
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                }}
              >
                {p.username} 🃏{p.handSize ?? '?'}
              </button>
            ))}
          </div>
          {spectatingId && spectatedHand.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
                {alivePlayers.find(p => p.id === spectatingId)?.username}&apos;s hand
              </div>
              <CardHand hand={spectatedHand} selectedCardId={null} interactive={false} />
            </>
          )}
          {spectatingId && spectatedHand.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No cards to show.</div>
          )}
          {!spectatingId && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Select a player above to see their hand.
            </div>
          )}
        </div>
      ) : (
        // ── Active player hand ──
        !isLobby && !isGameOver && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>YOUR HAND</span>
              <span>{myHand.length} card{myHand.length !== 1 ? 's' : ''}</span>
            </div>
            {isMyTurn && isPlaying && !cardPlayedThisTurn && selectedCardId && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 6, textAlign: 'center' }}>
                Tap again to play this card
              </div>
            )}
            <CardHand
              hand={myHand}
              selectedCardId={isMyTurn && isPlaying && !cardPlayedThisTurn ? selectedCardId : null}
              onCardClick={handleCardClick}
              interactive={isMyTurn && isPlaying && !cardPlayedThisTurn}
            />
          </div>
        )
      )}

      <button
        onClick={leaveGame}
        style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', marginTop: 8 }}
      >
        Leave game
      </button>

      {/* ── Spin overlay ── */}
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
                className={isSpinTarget ? 'primary' : undefined}
                onClick={() => setSpinData(null)}
                style={!isSpinTarget ? {
                  fontSize: 12, color: 'var(--text-dim)',
                  border: '1px solid var(--border)', background: 'none',
                  padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
                } : { padding: '10px 32px', fontSize: 14 }}
              >
                {isSpinTarget ? 'Continue' : 'Got it'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} initialTab="online" />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
