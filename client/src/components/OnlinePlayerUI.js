'use client';

import { useState, useEffect, useRef } from 'react';
import { CardShape } from './CardShape';
import { ShapeIcon, SHAPE_COLORS } from './ShapeIcon';

import { ActionLog } from './ActionLog';
import { HowToPlayModal } from './HowToPlayModal';
import { TurnActionModal, WaitingForPlayerBanner } from './TurnActionModal';

// ─── Constants ────────────────────────────────────────────────
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];

// ─── Cylinder SVG ────────────────────────────────────────────
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

// ─── Face-down card stack ─────────────────────────────────────
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

// ─── Flat horizontal card hand ────────────────────────────────
// Cards are left-aligned so the scroll area always starts at the first card.
// No rotation/fan — eliminates left-side clipping on small screens.
function CardHand({ hand, selectedCardId, onCardClick, interactive = true }) {
  const n = hand.length;
  if (n === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)', fontSize: 12 }}>
        No cards in hand
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 22,          // headroom for the lift animation on selected card
        minWidth: 'max-content', // content drives width — enables proper left-to-right scroll
      }}>
        {hand.map((card, i) => {
          const isSelected = selectedCardId === card.id;
          const isWhot = card.shape === 'whot';
          return (
            <div
              key={card.id}
              onClick={() => interactive && onCardClick && onCardClick(card.id)}
              style={{
                width: 58,
                height: 82,
                flexShrink: 0,
                transform: isSelected ? 'translateY(-16px) scale(1.05)' : 'none',
                zIndex: isSelected ? 100 : i + 1,
                cursor: interactive ? 'pointer' : 'default',
                transition: 'transform 0.15s ease',
                background: 'var(--surface2)',
                border: `2px solid ${isWhot ? 'var(--accent)' : isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                boxShadow: isSelected
                  ? '0 6px 20px rgba(0,0,0,0.6)'
                  : isWhot
                    ? '0 0 8px rgba(232,255,74,0.3)'
                    : 'none',
                userSelect: 'none',
              }}
            >
              <ShapeIcon
                shape={card.shape}
                size={22}
                color={isWhot ? 'var(--accent)' : undefined}
              />
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

// ─── Share button ─────────────────────────────────────────────
function ShareButton({ roomCode, senderName }) {
  const [showFallback, setShowFallback] = useState(false);

  const message = `Join ${senderName}'s Bluff game! Room code: ${roomCode}`;
  const url = typeof window !== 'undefined' ? `${window.location.origin}?join=${roomCode}` : '';
  const fullText = `${message}\n${url}`;

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Join my Bluff game!', text: message, url });
        return;
      } catch (e) {
        // User dismissed or share failed — fall through to fallback
        if (e.name === 'AbortError') return;
      }
    }
    setShowFallback(f => !f);
  };

  const enc = encodeURIComponent;
  const links = [
    { label: '💬 WhatsApp', href: `https://wa.me/?text=${enc(fullText)}` },
    { label: '✈️ Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}` },
    { label: '💬 SMS', href: `sms:?body=${enc(fullText)}` },
    { label: '📧 Email', href: `mailto:?subject=${enc('Join my Bluff game!')}&body=${enc(fullText)}` },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleShare}
        style={{
          fontSize: 11, color: 'var(--accent)',
          border: '1px solid var(--accent)',
          background: 'rgba(232,255,74,0.04)',
          padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
          letterSpacing: '0.06em',
        }}
      >
        🔗 Share Room
      </button>
      {showFallback && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: 8, zIndex: 2000,
          display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setShowFallback(false)}
              style={{
                display: 'block', padding: '7px 10px',
                color: 'var(--text)', fontSize: 12,
                textDecoration: 'none', borderRadius: 4,
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => setShowFallback(false)}
            style={{
              marginTop: 2, padding: '5px', fontSize: 11,
              color: 'var(--text-dim)', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Cancel
          </button>
        </div>
      )}
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
  acknowledgeSpinResult,
  spinDismissed,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingCard, setPendingCard] = useState(null);
  // Whot nomination: stores the cardId waiting for a shape to be picked
  const [whotPickerCard, setWhotPickerCard] = useState(null);
  // Turn action modal
  const [showTurnModal, setShowTurnModal] = useState(false);

  // Spectator state
  const [spectatingId, setSpectatingId] = useState(null);
  const [spectatedHand, setSpectatedHand] = useState([]);

  // Spin overlay state
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);

 // Elimination popup state (separate from spin overlay — shows after overlay closes)
  const prevStatusRef = useRef(null);
  const pendingEliminatedRef = useRef(false);
  const [justEliminated, setJustEliminated] = useState(false);

  // Trigger spin overlay when a spin_result arrives
  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== 'spin_result') return;

    const actionKey = `${action.spinTargetId}:${JSON.stringify(action.chamber)}`;
    if (lastSpinKeyRef.current === actionKey) return;
    lastSpinKeyRef.current = actionKey;

    const { spinIndex, eliminated, spinTargetName, spinTargetId: targetId, chamber } = action;
    const landingChamberIndex = spinIndex ?? 0;
    // Chamber i starts at (i*60 - 90)°. To land at top pointer: finalAngle = 10*360 - spinIndex*60
    const finalAngle = 10 * 360 - landingChamberIndex * 60;
    const bulletChambers = new Set(
      (chamber || []).map((v, i) => v === 'bullet' ? i : -1).filter(i => i !== -1)
    );

    setCylinderAnimating(false);
    setCylinderRotation(0);
    setSpinComplete(false);
    setSpinData({ spinIndex: landingChamberIndex, eliminated, spinTargetName, spinTargetId: targetId, bulletChambers, landingChamberIndex, finalAngle });

    // 80ms timeout lets React commit the reset render before starting animation
    // requestAnimationFrame was too fast — React batching swallowed the 0→finalAngle change
    const startTimer = setTimeout(() => {
      setCylinderAnimating(true);
      setCylinderRotation(finalAngle);
    }, 80);

    const completeTimer = setTimeout(() => setSpinComplete(true), 8080);
    return () => { clearTimeout(startTimer); clearTimeout(completeTimer); };
  }, [roomState?.lastAction]);

  // When the spin target clicks Continue, spinDismissed fires for everyone → auto-close overlay
  useEffect(() => {
    if (spinDismissed && spinData) {
      setSpinData(null);
    }
  }, [spinDismissed]); // eslint-disable-line

  // Auto-refresh spectated hand when action changes
  useEffect(() => {
    if (spectatingId && spectatePlayer) {
      spectatePlayer(spectatingId, (res) => {
        if (res.hand) setSpectatedHand(res.hand);
      });
    }
  }, [roomState?.lastAction]); // eslint-disable-line

  // Detect alive → eliminated, hold until spin overlay is dismissed
  useEffect(() => {
    const currentStatus = myPlayer?.status || null;
    if (prevStatusRef.current === 'alive' && currentStatus === 'eliminated') {
      pendingEliminatedRef.current = true;
    }
    prevStatusRef.current = currentStatus;
  }, [myPlayer?.status]); // eslint-disable-line

  // Once spin overlay clears (Continue clicked), show elimination popup if pending
  useEffect(() => {
    if (!spinData && pendingEliminatedRef.current) {
      pendingEliminatedRef.current = false;
      setTimeout(() => setJustEliminated(true), 300);
    }
  }, [spinData]); // eslint-disable-line

  // 15s auto-advance after spin result — dismiss overlay if spin target hasn't clicked Continue
  useEffect(() => {
    if (!spinComplete || !spinData) return;
    const amTarget = spinData.spinTargetId === myPlayer?.id;
    const timer = setTimeout(() => {
      if (amTarget) acknowledgeSpinResult?.();
      else setSpinData(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [spinComplete]); // eslint-disable-line

  // Open turn modal when it becomes this player's turn
  useEffect(() => {
    const isPlaying = roomState?.phase === 'playing';
    if (isMyTurn && isPlaying && !roomState?.cardPlayedThisTurn && myPlayer?.status === 'alive') {
      setShowTurnModal(true);
    } else {
      setShowTurnModal(false);
    }
  }, [isMyTurn, roomState?.phase, roomState?.cardPlayedThisTurn]); // eslint-disable-line

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

  // Previous player in turn order (for "Call X's bluff" label)
  const myTurnIdx = turnOrder?.indexOf(myPlayer.id) ?? -1;
  const prevPlayerId = myTurnIdx >= 0 && turnOrder?.length > 1
    ? turnOrder[(myTurnIdx - 1 + turnOrder.length) % turnOrder.length]
    : null;
  const prevPlayer = prevPlayerId ? players?.find(p => p.id === prevPlayerId) : null;

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
  const card = myHand.find(c => c.id === cardId);
  if (!card) return;
  setSelectedCardId(cardId);
  setPendingCard(card); // opens confirm dialog
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
              fontSize: 30, letterSpacing: '0.2em',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '4px 12px', borderRadius: 'var(--radius)',
              background: 'rgba(232,255,74,0.04)',
              cursor: 'pointer', display: 'inline-block', lineHeight: 1.2,
            }}
          >
            {roomCode}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.08em' }}>
            Round {roundNumber} · tap to copy
          </div>
          {/* Share button — available in lobby */}
          {isLobby && myPlayer && (
            <div style={{ marginTop: 8 }}>
              <ShareButton roomCode={roomCode} senderName={myPlayer.username} />
            </div>
          )}
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
          <FaceDownStack count={deckSize} label="DRAW" warning={deckSize < 5 && deckSize > 0} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>REQUIRED</div>
            <CardShape type={currentCardType} size="md" />
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {currentCardType?.toUpperCase()}
            </div>
          </div>
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

      {/* ── Chamber bullet count ── */}
{!isEliminated && !isLobby && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
    <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>CHAMBER</div>
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const isBullet = myPlayer.chamber?.[i] === 'bullet';
        return (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: isBullet ? 'var(--accent2)' : 'var(--surface2)',
            border: `1.5px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
            boxShadow: isBullet ? '0 0 6px rgba(255,74,110,0.5)' : 'none',
          }} />
        );
      })}
    </div>
    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 2 }}>
      {myPlayer.chamber?.filter(s => s === 'bullet').length ?? 1}/6
    </div>
  </div>
)}

      {/* ── My turn actions ── */}
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

      {/* Waiting for someone else's turn */}
      {!isMyTurn && isPlaying && currentPlayer && !isEliminated && (
        <WaitingForPlayerBanner playerName={currentPlayer.username} />
      )}

      {/* ── Spin pending ── */}
      {isSpinPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Bluff reveal panel */}
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

              {lastAction.revealedCard ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>
                    CARD REVEALED:
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 4,
                    fontSize: 13, fontWeight: 700,
                    animation: 'cardFlipIn 0.5s ease-out',
                  }}>
                    <ShapeIcon shape={lastAction.revealedCard.shape} size={20} />
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
              padding: '14px 16px', background: 'rgba(255,74,110,0.05)',
              border: '1px solid var(--accent2)', borderRadius: 'var(--radius)',
              fontSize: 12, color: 'var(--accent2)', textAlign: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              🔫 Waiting for <strong>{spinTargetPlayer.username}</strong> to pull the trigger...
            </div>
          )}
        </div>
      )}

      {/* ── Round end ── */}
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

      {/* ── Game over ── */}
      {isGameOver && (
        <div className="card" style={{ textAlign: 'center', border: '1px solid var(--accent)' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: 'var(--accent)', marginBottom: 8 }}>
            {lastAction?.winnerId === myPlayer.id ? '🎉 You Win!' : `${lastAction?.winnerName ?? '?'} Wins!`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Game over.</div>
          <button className="primary" onClick={leaveGame}>🔄 New Game</button>
        </div>
      )}

      {/* ── Card hand or spectator view ── */}
      {showSpectatorView ? (
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
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Select a player above to see their hand.</div>
          )}
        </div>
      ) : (
        !isLobby && !isGameOver && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>YOUR HAND</span>
              <span>{myHand.length} card{myHand.length !== 1 ? 's' : ''}</span>
            </div>
            <CardHand
              hand={myHand}
              selectedCardId={isMyTurn && isPlaying && !cardPlayedThisTurn ? selectedCardId : null}
              onCardClick={handleCardClick}
              interactive={isMyTurn && isPlaying && !cardPlayedThisTurn}
            />
          </div>
        )
      )}

      {/* Leave game — only in lobby or game_over */}
      {(!phase || ['lobby', 'game_over'].includes(phase)) && (
        <button
          onClick={leaveGame}
          style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', marginTop: 8 }}
        >
          Leave game
        </button>
      )}

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
                Chamber {spinData.landingChamberIndex + 1} · {spinData.eliminated ? 'bullet found' : 'empty'}
              </div>
              {isSpinTarget ? (
                /* Spin target: clicking Continue dismisses everyone's overlay */
                <button
                  className="primary"
                  onClick={acknowledgeSpinResult}
                  style={{ padding: '10px 32px', fontSize: 14 }}
                >
                  Continue
                </button>
              ) : (
                /* All other players: auto-dismissed when spin target clicks Continue */
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Waiting for {spinData.spinTargetName} to continue...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Card confirm dialog ── */}
{pendingCard && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 8600, padding: 24,
  }}>
    <div className="card fade-in" style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: '28px 24px' }}>
      <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.15em', marginBottom: 16 }}>
        PLAY THIS CARD?
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{
          width: 72, height: 100,
          background: 'var(--surface2)',
          border: '2px solid var(--accent)',
          borderRadius: 8,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8,
          boxShadow: '0 0 20px rgba(232,255,74,0.2)',
        }}>
          <ShapeIcon shape={pendingCard.shape} size={32} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>
            {pendingCard.number}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 20, textTransform: 'capitalize' }}>
        {pendingCard.shape === 'whot' ? 'Whot (wild card)' : `${pendingCard.shape} ${pendingCard.number}`}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="primary"
          style={{ flex: 1, padding: '12px' }}
          onClick={() => {
            if (pendingCard.shape === 'whot') {
              setWhotPickerCard(pendingCard.id);
            } else {
              playCardOnline(pendingCard.id);
              setSelectedCardId(null);
            }
            setPendingCard(null);
          }}
        >
          ▶ Play
        </button>
        <button
          style={{
            flex: 1, padding: '12px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-dim)',
            cursor: 'pointer', fontSize: 13,
          }}
          onClick={() => { setPendingCard(null); setSelectedCardId(null); }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
      {/* ── Whot shape picker overlay ── */}
      {whotPickerCard && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 8500, padding: 24,
        }}>
          <div className="card" style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.12em',
              color: 'var(--accent)', marginBottom: 6,
            }}>
              🃏 WHOT CARD
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18 }}>
              Choose the next required shape:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {SHAPES.map(shape => (
                <button
                  key={shape}
                  onClick={() => {
                    playCardOnline(whotPickerCard, shape);
                    setWhotPickerCard(null);
                    setSelectedCardId(null);
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '14px 8px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8, cursor: 'pointer', color: 'var(--text)',
                    transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <ShapeIcon shape={shape} size={28} />
                  <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{shape}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setWhotPickerCard(null); setSelectedCardId(null); }}
              style={{ fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Elimination popup — appears after spin overlay closes ── */}
      {justEliminated && !spinData && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 8800, padding: 24,
        }}>
          <div className="card fade-in" style={{ maxWidth: 360, width: '100%', textAlign: 'center', border: '1px solid var(--accent2)' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: 'var(--accent2)', marginBottom: 12 }}>
              💀 ELIMINATED
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
              You&apos;ve been eliminated from this round.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
              You can still watch the game from the spectator view.
            </div>
            <button
              className="primary"
              onClick={() => setJustEliminated(false)}
              style={{ padding: '10px 32px' }}
            >
              Continue Watching
            </button>
          </div>
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} initialTab="online" />}

      {/* Turn action modal — shown to active player at turn start */}
      <TurnActionModal
        visible={showTurnModal && !isEliminated}
        isFirstTurn={isFirstTurn}
        bluffUsed={bluffUsedThisTurn}
        cardPlayed={cardPlayedThisTurn}
        prevPlayerName={prevPlayer?.username || null}
        onCallBluff={() => { callBluff(); setShowTurnModal(false); }}
        onClose={() => setShowTurnModal(false)}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes cardFlipIn {
          0%   { transform: rotateY(90deg) scaleX(0.4); opacity: 0; }
          60%  { transform: rotateY(-8deg) scaleX(1.02); opacity: 1; }
          100% { transform: rotateY(0deg) scaleX(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
