'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CardShape } from './CardShape';
import { ShapeIcon, SHAPE_COLORS } from './ShapeIcon';

import { ActionLog } from './ActionLog';
import { HowToPlayModal } from './HowToPlayModal';
import { TurnActionModal, WaitingForPlayerBanner } from './TurnActionModal';
import { VoicePanel, VoiceIndicator } from './VoicePanel';
import { PowerCard, POWER_META, POWER_ICONS } from './PowerCard';
import { AnnouncementBanner } from './AnnouncementBanner';
import { ActiveConfigPanel } from './ActiveConfigPanel';
import { PreGameSettingsPanel } from './PreGameSettingsPanel';
import { LobbyConfigSummary } from './LobbyConfigSummary';
import { RoleRevealOverlay, ROLE_META } from './RoleRevealOverlay';
import {
  useAnnouncementSpeech,
  loadSpeechEnabled,
  saveSpeechEnabled,
} from '../hooks/useAnnouncementSpeech';
import {
  BettingPopup,
  BettingWaitOverlay,
  GhostVotePopup,
  GhostVoteWaitOverlay,
  LastStandCinematic,
} from './SystemsOverlays';

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
export function CardHand({ hand, selectedCardId, onCardClick, interactive = true }) {
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
          const isPower = card.type === 'power';
          const isWhot = !isPower && card.shape === 'whot';
          const powerMeta = isPower ? POWER_META[card.power] : null;
          const powerColor = powerMeta?.color || 'var(--accent)';
          const drawPowerIcon = isPower ? (POWER_ICONS[card.power] || POWER_ICONS.shield) : null;

          const borderColor = isPower
            ? powerColor
            : isWhot
              ? 'var(--accent)'
              : isSelected
                ? 'var(--accent)'
                : 'var(--border)';

          const boxShadow = isSelected
            ? '0 6px 20px rgba(0,0,0,0.6)'
            : isPower
              ? `0 0 8px ${powerColor}55, inset 0 0 6px ${powerColor}22`
              : isWhot
                ? '0 0 8px rgba(232,255,74,0.3)'
                : 'none';

          const powerTooltip = isPower && powerMeta
            ? `${powerMeta.label} — ${powerMeta.flavor}`
            : undefined;

          // Issue #64 — once a power card is activated/armed the
          // backend sets `card.armed = true` on it (gameEngine.js,
          // activatePowerCard). The card must persist in the hand
          // until its trigger fires (e.g. Assassin waiting for a
          // bluff call), but it should look + behave inert: half
          // opacity on the card body, lock badge on top, no pointer
          // events, no click handler. The lock badge is kept as a
          // sibling outside the dimmed inner div so it stays vivid —
          // child opacity multiplies with parent, so nesting the
          // badge under the dimmed card would fade it too.
          const isArmed = card.armed === true;
          const cardInteractive = interactive && !isArmed;

          return (
            <div
              key={card.id}
              onClick={() => cardInteractive && onCardClick && onCardClick(card.id)}
              title={isArmed ? 'Activated — awaiting trigger' : powerTooltip}
              aria-label={isPower && powerMeta ? `Power card: ${powerMeta.label}` : undefined}
              data-armed={isArmed ? 'true' : undefined}
              style={{
                position: 'relative',
                width: 58,
                height: 82,
                flexShrink: 0,
                transform: isSelected ? 'translateY(-16px) scale(1.05)' : 'none',
                zIndex: isSelected ? 100 : i + 1,
                cursor: cardInteractive ? 'pointer' : 'default',
                pointerEvents: isArmed ? 'none' : 'auto',
                transition: 'transform 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: isPower
                    ? 'linear-gradient(160deg, #0d0d10 0%, #08080a 55%, #050507 100%)'
                    : 'var(--surface2)',
                  border: `2px solid ${borderColor}`,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  boxShadow,
                  opacity: isArmed ? 0.5 : 1,
                  transition: 'opacity 0.15s ease',
                  userSelect: 'none',
                  overflow: 'hidden',
                }}
              >
                {isPower ? (
                  <>
                    <svg
                      viewBox="0 0 100 100"
                      width={28}
                      height={28}
                      aria-hidden
                      style={{ filter: `drop-shadow(0 0 4px ${powerColor}aa)` }}
                    >
                      {drawPowerIcon(powerColor)}
                    </svg>
                    <div style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: powerColor,
                      textTransform: 'uppercase',
                      textShadow: `0 0 6px ${powerColor}aa`,
                      lineHeight: 1,
                    }}>
                      {powerMeta?.label ?? 'Power'}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              {isArmed && (
                <span
                  aria-label="Activated — awaiting trigger"
                  role="img"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    fontSize: 12,
                    lineHeight: 1,
                    pointerEvents: 'none',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
                  }}
                >
                  🔒
                </span>
              )}
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

// ─── Compact risk meter (6 dots, no label) ───────────────────
// A condensed version of <RiskMeter> for the player chips. Plays
// well at chip widths around 64–80px.
function MiniRiskDots({ riskLevel = 1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const loaded = i < (riskLevel ?? 1);
        const danger = loaded && (riskLevel ?? 1) >= 5;
        return (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: loaded
                ? (danger ? 'var(--accent2)' : 'var(--warning)')
                : 'transparent',
              border: `1px solid ${loaded ? (danger ? 'var(--accent2)' : 'var(--warning)') : 'var(--border)'}`,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Player chip (top-down view) ─────────────────────────────
// Compact portrait showing another player's at-a-glance state:
// truncated name, card count, risk meter, bounty icon, turn ring.
// Sized 80×110 desktop / 64×88 mobile.
function PlayerChip({
  player,
  isCurrentTurn,
  isSpinTarget,
  voice,
  onClick,
  compact = false,
  bettingEnabled = false,
}) {
  const alive = player.status === 'alive';
  const w = compact ? 64 : 80;
  const h = compact ? 88 : 110;
  // Issue #80 — betting streak badge. Visible publicly to all
  // clients (including spectators) when the Betting system is on
  // and the player has a non-zero correct-bet streak. Server resets
  // this to 0 after the -1-bullet reward fires at streak 3.
  const streak = player.consecutiveCorrectBets || 0;
  const showStreak = bettingEnabled && streak > 0;

  const name = player.username || '';
  const truncated = name.length > 12 ? name.slice(0, 11) + '…' : name;

  const borderColor = isCurrentTurn && alive
    ? 'var(--warning)'
    : isSpinTarget
      ? 'var(--accent2)'
      : 'var(--border)';

  return (
    <button
      type="button"
      onClick={onClick}
      className="topdown-chip"
      style={{
        width: w,
        height: h,
        flexShrink: 0,
        padding: compact ? 5 : 7,
        background: 'var(--surface2)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        opacity: alive ? 1 : 0.4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        cursor: onClick ? 'pointer' : 'default',
        color: 'var(--text)',
        textAlign: 'center',
        boxShadow: isCurrentTurn && alive ? '0 0 12px rgba(255,170,74,0.35)' : 'none',
        animation: isCurrentTurn && alive ? 'chipTurnPulse 1.6s ease-in-out infinite' : 'none',
        position: 'relative',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Bounty icon — top-right corner */}
      {alive && player.hasBounty && (
        <span
          title="Bounty placed"
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontSize: compact ? 9 : 11,
            color: '#ff3552',
            lineHeight: 1,
          }}
        >
          ☠
        </span>
      )}

      {/* Name + voice indicator */}
      <div style={{
        fontSize: compact ? 9 : 11,
        fontWeight: 700,
        color: isCurrentTurn && alive ? 'var(--warning)' : 'var(--text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        letterSpacing: '0.02em',
        textDecoration: !alive ? 'line-through' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        justifyContent: 'center',
      }}>
        {voice && (
          <VoiceIndicator
            playerId={player.id}
            speakingIds={voice.speakingIds}
            voiceConnected={voice.isConnected}
            size={compact ? 6 : 7}
          />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {truncated}
        </span>
        {/* Issue #80 — betting streak badge. Public to all clients
            when Betting system is enabled and streak > 0. */}
        {showStreak && (
          <span
            title={`Correct bet streak: ${streak}`}
            style={{
              fontSize: compact ? 8 : 9,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'rgba(232,255,74,0.12)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              padding: compact ? '0 3px' : '0 4px',
              lineHeight: 1.4,
              letterSpacing: 0,
              flexShrink: 0,
            }}
          >
            🎯×{streak}
          </span>
        )}
      </div>

      {/* Card count */}
      <div style={{
        fontSize: compact ? 9 : 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.04em',
      }}>
        🃏 {player.handSize ?? '?'}
      </div>

      {/* Risk meter (compact dots) */}
      {alive && (
        <MiniRiskDots riskLevel={player.riskLevel} />
      )}

      {/* Bottom row: turn or spin indicator */}
      <div style={{
        fontSize: compact ? 8 : 9,
        letterSpacing: '0.08em',
        minHeight: compact ? 10 : 12,
        color: isCurrentTurn && alive
          ? 'var(--warning)'
          : isSpinTarget
            ? 'var(--accent2)'
            : 'transparent',
      }}>
        {isCurrentTurn && alive ? 'TURN' : isSpinTarget ? '🔫 SPIN' : '·'}
      </div>
    </button>
  );
}

// ─── Order other players clockwise from the local seat ──────
// Local user is at the bottom; clockwise around the table is
// next-in-turn → … → previous-in-turn. Returns the `others` list
// re-sorted so element 0 is the player who plays immediately after
// the local user, and the last element is the player who plays
// immediately before. Players that are present but missing from
// `turnOrder` (spectators, eliminated mid-game) are appended at the
// end in their original order. If turnOrder is missing/empty or the
// local user isn't in it, returns `others` unchanged.
export function orderClockwiseFromLocal(others, turnOrder, localId) {
  const list = Array.isArray(others) ? others : [];
  if (list.length === 0) return list;
  if (!Array.isArray(turnOrder) || turnOrder.length === 0) return list;
  const myIdx = turnOrder.indexOf(localId);
  if (myIdx === -1) return list;

  const byId = new Map(list.map(p => [p.id, p]));
  const ordered = [];
  const seen = new Set();
  for (let i = 1; i < turnOrder.length; i++) {
    const id = turnOrder[(myIdx + i) % turnOrder.length];
    const p = byId.get(id);
    if (p) { ordered.push(p); seen.add(id); }
  }
  for (const p of list) if (!seen.has(p.id)) ordered.push(p);
  return ordered;
}

// ─── Distribute other players around the table ──────────────
// Excludes the local player. Returns { top, left, right }.
//
//   1-3 others   → all top
//   4-6 others   → 2 top, rest split L/R
//   7-10 others  → split top/L/R roughly evenly
//   11-14 others → ~6 L, ~6 R, remainder top
//   15+ others   → caps the sides at 6 each, overflow on top
//
// When a side ends up with more than 6 players the chip strip wraps
// into a second inner row — handled by `flexWrap: 'wrap'` in the
// renderer, not here.
//
// Issue #82: `others` is expected to be clockwise-ordered from the
// local seat (use `orderClockwiseFromLocal` upstream). Seats are
// then filled clockwise starting at the right column nearest the
// local user, across the top right-to-left, and down the left
// column. The returned arrays match the JSX rendering order of each
// container so that:
//   - right column (flex column, top→bottom): chip closest to "you"
//     ends up at the bottom (last in array)
//   - top row (flex row, left→right): chip nearest to the right
//     side ends up rightmost (last in array)
//   - left column (flex column, top→bottom): chip closest to "you"
//     ends up at the bottom (last in array)
export function distributePlayers(others) {
  const list = Array.isArray(others) ? others : [];
  const n = list.length;
  if (n === 0) return { top: [], left: [], right: [] };

  let topCount;
  if (n <= 3) {
    topCount = n;
  } else if (n <= 6) {
    topCount = 2;
  } else if (n <= 10) {
    topCount = Math.ceil(n / 3);
  } else {
    // 11+: cap sides at 6 each, push remainder to top
    const sideMax = 6;
    topCount = Math.max(0, n - 2 * sideMax);
  }

  const remaining = n - topCount;
  // Right side fills first (clockwise sweep starts there). For odd
  // counts the extra goes to the right so the next-in-turn player
  // is guaranteed a right-side seat.
  const rightCount = Math.ceil(remaining / 2);
  const leftCount = remaining - rightCount;

  const rightSlice = list.slice(0, rightCount);
  const topSlice = list.slice(rightCount, rightCount + topCount);
  const leftSlice = list.slice(rightCount + topCount, rightCount + topCount + leftCount);

  return {
    // Right column is read bottom→top in clockwise order (closest
    // neighbour at the bottom). CSS renders top→bottom, so reverse.
    right: rightSlice.slice().reverse(),
    // Top row is read right→left in clockwise order (continuation
    // from the right column). CSS renders left→right, so reverse.
    top: topSlice.slice().reverse(),
    // Left column is read top→bottom in clockwise order, matching
    // CSS default — no reverse needed.
    left: leftSlice,
  };
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
  spectatePlayer,
  leaveGame,
  restartRoom,
  acknowledgeSpinResult,
  spinDismissed,
  activatePowerCard,
  swapPick,
  updateRoomConfig,
  medicDecide,
  saboteurTransfer,
  sniperRedirect,
  medicPrompt,
  sniperPrompt,
  powerEventQueue,
  consumePowerEvent,
  // v2 Phase F — Systems
  placeBet,
  ghostVote,
  lastStandSpin,
  lastStandEndTurn,
  voice,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingCard, setPendingCard] = useState(null);
  // Whot nomination: stores the cardId waiting for a shape to be picked
  const [whotPickerCard, setWhotPickerCard] = useState(null);
  // Turn action modal
  const [showTurnModal, setShowTurnModal] = useState(false);

  // Top-down layout: anchor we scroll back to when the user taps "Center".
  // Refers to the central card-table block.
  const tableCenterRef = useRef(null);
  const scrollToCenter = () => {
    if (tableCenterRef.current) {
      tableCenterRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

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

  // ─── v2 Phase B — power card activation prompt ──────────
  // Shown at the START of the local player's turn when they hold a
  // power card and haven't yet decided whether to activate. Dismissed
  // (skipped or activated) for the duration of this turn — we tag
  // the dismissal with a turn key so a fresh turn re-prompts.
  // peekedCard is the privately-revealed card on Peek activation; it
  // displays for ~3 seconds then auto-dismisses.
  const [powerPromptTurnKey, setPowerPromptTurnKey] = useState(null);
  const [powerPromptDismissedFor, setPowerPromptDismissedFor] = useState(null);
  const [peekedCard, setPeekedCard] = useState(null);
  const [activating, setActivating] = useState(false);

  // ─── v2 Phase C — Swap picker state ──────────────────────
  // The Swap holder is shown an anonymised picker of cards in the
  // played pile. Each option is just an id; no shape, no number.
  const [swapping, setSwapping] = useState(false);

  // ─── v2 Phase D — Role reveal state ──────────────────────
  // Plays once at the start of the first round. Local-only flag —
  // a refresh re-shows it (sessionStorage-backed dedupe is overkill
  // for a 7.5s overlay, and reconnects already pause for the spin
  // overlay anyway).
  const [roleRevealSeen, setRoleRevealSeen] = useState(false);

  // ─── v2 Phase D — role action busy flags ─────────────────
  const [medicDeciding, setMedicDeciding] = useState(false);
  const [sniperDeciding, setSniperDeciding] = useState(false);
  const [saboteurOpen, setSaboteurOpen] = useState(false);
  const [saboteurBusy, setSaboteurBusy] = useState(false);

  // ─── v2 Phase F — Systems busy flags ─────────────────────
  const [bettingBusy, setBettingBusy] = useState(false);
  const [ghostVotingBusy, setGhostVotingBusy] = useState(false);
  const [lastStandSpinBusy, setLastStandSpinBusy] = useState(false);

  // ─── v2 spoken announcements ─────────────────────────────
  // Default ON (loaded from localStorage). The hook watches the head
  // of powerEventQueue and speaks each new event via the browser's
  // native speechSynthesis. Toggle button lives next to the chat 💬.
  const [speechEnabled, setSpeechEnabled] = useState(true);
  useEffect(() => {
    // Read once on mount (browser-only — `loadSpeechEnabled` already
    // guards typeof window).
    setSpeechEnabled(loadSpeechEnabled());
  }, []);
  const toggleSpeech = () => {
    setSpeechEnabled((prev) => {
      const next = !prev;
      saveSpeechEnabled(next);
      return next;
    });
  };
  const announcementHead = Array.isArray(powerEventQueue) && powerEventQueue.length > 0
    ? powerEventQueue[0]
    : null;
  useAnnouncementSpeech(announcementHead, { enabled: speechEnabled });

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

  // Spin target clicks Continue → spinDismissed fires for everyone.
  // Defer the dismiss until the local cylinder animation has completed,
  // so slow clients still see the verdict instead of the overlay vanishing
  // mid-spin.
  useEffect(() => {
    if (spinDismissed && spinData && spinComplete) {
      setSpinData(null);
      setSpinComplete(false);
    }
  }, [spinDismissed, spinComplete]); // eslint-disable-line

  // Issue #81 — the server now streams the spectated hand inside
  // every room_state for spectator callers (`roomState.spectatedHand`),
  // so we no longer need to poll `spectate_player` on every lastAction.
  // Keep `setSpectatedHand` updated from the live snapshot so the
  // existing CardHand consumer below stays in sync. The initial
  // `spectate_player` call still happens in handleSpectatePlayer to
  // tell the server which target this socket is watching.
  useEffect(() => {
    const live = roomState?.spectatedHand;
    if (Array.isArray(live)) setSpectatedHand(live);
  }, [roomState?.spectatedHand]);

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

  // ─── v2 Phase B — auto-dismiss the peeked card preview ──
  useEffect(() => {
    if (!peekedCard) return;
    const t = setTimeout(() => setPeekedCard(null), 3000);
    return () => clearTimeout(t);
  }, [peekedCard]);

  // ─── v2 Phase B — track the current turn key ────────────
  // When the active turn key changes, reset the prompt-dismissed
  // flag so a brand-new turn shows the prompt again.
  //
  // myTurnKey is declared inline here rather than below with the
  // rest of the derived constants because this useEffect references
  // it in its dependency array — deps are read synchronously during
  // render, so the const must be in scope at this line. Hoisting
  // the const further down (where the rest of the derived state
  // lives) caused a TDZ "Cannot access before initialization"
  // crash that broke the whole online-mode screen.
  const myTurnKey = `${roomState?.currentPlayerId || ''}:${roomState?.currentTurnIndex || 0}:${roomState?.roundNumber || 0}`;
  useEffect(() => {
    if (!isMyTurn) return;
    setPowerPromptTurnKey(myTurnKey);
  }, [myTurnKey, isMyTurn]);

  // ─── v2 Phase D — reset role-reveal flag if we re-enter lobby ─
  // (Server restart, "new game" flow, etc.) Lets the same browser
  // session see role reveal again on a fresh game.
  useEffect(() => {
    if (roomState?.phase === 'lobby') setRoleRevealSeen(false);
  }, [roomState?.phase]);

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
    bluffBlockedThisTurn = false,
    deckSize = 0, playedPileSize = 0, myHand = [],
  } = roomState;

  const isEliminated = myPlayer.status === 'eliminated';
  const isSpectator = myPlayer.isSpectator;
  const showSpectatorView = isEliminated || isSpectator;

  // ─── Derive: do we have a power card to activate? ────────
  // The held power card is whatever power-typed card is currently
  // in myHand. There's at most one (hand cap = 1).
  const heldPowerCard = (roomState?.myHand || []).find(c => c?.type === 'power') || null;
  const armedPowerCard = myPlayer?.armedPowerCard || null;
  // myTurnKey is declared above where its useEffect needs it — see comment there.

  const isPlaying = phase === 'playing';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const isLobby = phase === 'lobby';
  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;

  const spinTargetPlayer = players?.find(p => p.id === spinTargetId);
  const isSpinTarget = spinData?.spinTargetId === myPlayer.id;
  const currentPlayer = players?.find(p => p.id === currentPlayerId);
  // Sort "other players" clockwise from the local seat so the
  // top-down layout reflects actual turn order (issue #82). Memoised
  // so downstream `distributed`/`renderChip` memoisation (issue #61)
  // stays valid across renders where neither players nor turnOrder
  // change identity.
  const otherPlayers = useMemo(() => {
    const others = players?.filter(p => p.id !== myPlayer.id) || [];
    return orderClockwiseFromLocal(others, turnOrder, myPlayer.id);
  }, [players, turnOrder, myPlayer.id]);
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
      if (bluffBlockedThisTurn) {
        actionHint = 'Last turn was frozen — no card to challenge. Play a card from your hand.';
      } else {
        actionHint = isFirstTurn
          ? 'Play a card from your hand. (No bluff on the first turn.)'
          : "Play a card from your hand, or call bluff on the previous player.";
      }
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

  // Memoised so renderChip's useCallback dep is stable — without
  // this the chip click handlers re-create on every render and the
  // memoisation upstream is moot (issue #61).
  const handleSpectatePlayer = useCallback((targetId) => {
    setSpectatingId(targetId);
    spectatePlayer(targetId, (res) => {
      setSpectatedHand(res.hand || []);
    });
  }, [spectatePlayer]);

  // ─── v2 Phase B — power card activation prompt visibility ─
  // Only show when:
  //  - it's my turn AND we're in 'playing'
  //  - I'm alive (not eliminated/spectator)
  //  - I haven't already played a card or used bluff this turn
  //  - I hold a power card
  //  - I haven't already armed something this turn
  //  - I haven't dismissed the prompt for this exact turn
  //  - the previous spin overlay isn't still up
  const showPowerPrompt =
    isMyTurn &&
    !isEliminated &&
    !showSpectatorView &&
    roomState?.phase === 'playing' &&
    !roomState?.cardPlayedThisTurn &&
    !roomState?.bluffUsedThisTurn &&
    !!heldPowerCard &&
    !armedPowerCard &&
    powerPromptDismissedFor !== powerPromptTurnKey &&
    !spinData &&
    !justEliminated;

  // ─── v2 Phase C — Swap pending visibility ───────────────
  // The pause kicks in when the SERVER sets phase to 'swap_pending'
  // on a bluff into a Swap-armed player. Only the Swap holder sees
  // the picker; everyone else just sees a "Player is choosing..."
  // banner via the action log.
  const isSwapPending = roomState?.phase === 'swap_pending';
  const amSwapHolder = isSwapPending && roomState?.swapHolderId === myPlayer?.id;
  const swapPickOptions = roomState?.swapPickOptions || [];

  const handleActivatePower = async () => {
    if (!activatePowerCard || activating) return;
    setActivating(true);
    try {
      const res = await activatePowerCard();
      // Always dismiss the prompt for this turn so we don't loop on
      // an error.
      setPowerPromptDismissedFor(powerPromptTurnKey);
      if (res?.success && res?.power === 'peek') {
        // Show the peeked card briefly. lastPlayedCard may be null
        // (no card has been played yet this round) — render that
        // explicitly rather than crash.
        setPeekedCard(res.peekedCard || { _empty: true });
      }
    } finally {
      setActivating(false);
    }
  };

  const handleSkipPower = () => {
    setPowerPromptDismissedFor(powerPromptTurnKey);
  };

  // ─── v2 Phase C — Swap pick handler ─────────────────────
  const handleSwapPick = async (cardId) => {
    if (!swapPick || swapping || !cardId) return;
    setSwapping(true);
    try {
      await swapPick(cardId);
    } finally {
      setSwapping(false);
    }
  };

  // ─── v2 Phase D — role action handlers ──────────────────
  const handleMedicDecide = async (save) => {
    if (!medicDecide || medicDeciding) return;
    setMedicDeciding(true);
    try {
      await medicDecide(save);
    } finally {
      setMedicDeciding(false);
    }
  };

  const handleSniperRedirect = async (newTargetId) => {
    if (!sniperRedirect || sniperDeciding) return;
    setSniperDeciding(true);
    try {
      await sniperRedirect(newTargetId);
    } finally {
      setSniperDeciding(false);
    }
  };

  const handleSaboteurPick = async (targetId) => {
    if (!saboteurTransfer || saboteurBusy) return;
    setSaboteurBusy(true);
    try {
      const res = await saboteurTransfer(targetId);
      if (res?.success) setSaboteurOpen(false);
    } finally {
      setSaboteurBusy(false);
    }
  };

  // ─── v2 Phase D — derived role state ─────────────────────
  const myRole = myPlayer?.role || 'barehand';
  const showRoleReveal =
    !roleRevealSeen
    && roomState?.phase === 'playing'
    && roomState?.roundNumber === 1
    && !!myPlayer?.role;
  const isMedic = myRole === 'medic';
  const isSaboteur = myRole === 'saboteur';
  const isSniper = myRole === 'sniper';
  const medicPending = roomState?.pendingMedicSave || null;
  const sniperPending = roomState?.pendingSniperRedirect || null;
  const amTargetMedic = !!medicPending?.amTargetMedic;
  const amTargetSniper = !!sniperPending?.amTargetSniper;
  const sniperEligibleTargets = sniperPending?.eligibleTargetIds || sniperPrompt?.eligibleTargetIds || [];
  const saboteurAvailable = isSaboteur
    && myPlayer?.status === 'alive'
    && (myPlayer?.saboteurAbilityAvailable !== false)
    && (roomState?.myHand?.length || 0) > 3;

  // ─── Top-down player distribution ────────────────────────
  // Excludes the local player. Issue #61: memoise both `distributed`
  // and `renderChip` so they don't recompute on every room_state
  // tick. The list is small but it ran the full slice/find/map every
  // time any field on `roomState` changed, including during the
  // role-reveal window — contributing to the perceived lag.
  const distributed = useMemo(() => distributePlayers(otherPlayers), [otherPlayers]);
  // Issue #80 — Betting system flag from room config. Drives whether
  // PlayerChip renders the 🎯×N streak badge.
  const bettingEnabled = !!roomState?.config?.systems?.betting;
  const renderChip = useCallback((p) => (
    <PlayerChip
      key={p.id}
      player={p}
      isCurrentTurn={p.id === currentPlayerId}
      isSpinTarget={isSpinPending && p.id === spinTargetId}
      voice={voice}
      onClick={showSpectatorView ? () => handleSpectatePlayer(p.id) : undefined}
      bettingEnabled={bettingEnabled}
    />
  ), [currentPlayerId, isSpinPending, spinTargetId, voice, showSpectatorView, handleSpectatePlayer, bettingEnabled]);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* ── Top header strip ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        padding: '4px 4px 12px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{
            fontSize: 24, color: isEliminated ? 'var(--accent2)' : 'var(--accent)',
            lineHeight: 1, fontFamily: "'Bebas Neue', sans-serif", margin: 0,
          }}>
            BLUFF
          </h1>
          <div
            title="Click to copy"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18, letterSpacing: '0.18em',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '2px 10px', borderRadius: 'var(--radius)',
              background: 'rgba(232,255,74,0.04)',
              cursor: 'pointer', display: 'inline-block', lineHeight: 1.2,
              alignSelf: 'flex-start',
            }}
          >
            {roomCode}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            Round {roundNumber} · tap to copy
          </div>
          {isLobby && myPlayer && (
            <ShareButton roomCode={roomCode} senderName={myPlayer.username} />
          )}
          {voice && <VoicePanel {...voice} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
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

      {/* ── Top region (~25vh) — top-side player chips ── */}
      <div className="topdown-top" style={{
        minHeight: '22vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', gap: 8,
        padding: '8px 4px',
      }}>
        {distributed.top.length > 0 ? (
          distributed.top.map(renderChip)
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            {otherPlayers.length === 0 ? '(waiting for players…)' : ''}
          </div>
        )}
      </div>

      {/* ── Middle region (~50vh) — left chips | center table | right chips ── */}
      <div className="topdown-middle" style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        minHeight: '46vh',
        padding: '4px 0',
      }}>
        {/* Left side chips */}
        <div className="topdown-side" style={{
          display: 'flex', flexDirection: 'column',
          flexWrap: 'wrap', gap: 8,
          maxHeight: '46vh',
          alignContent: 'flex-start',
        }}>
          {distributed.left.map(renderChip)}
        </div>

        {/* Center: card table */}
        <div ref={tableCenterRef} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          gap: 10,
        }}>
          {(isPlaying || isSpinPending || isRoundEnd) && (
            <div className="card" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-around',
              gap: 12, padding: '18px 14px',
              background: 'radial-gradient(ellipse at center, var(--surface) 0%, var(--bg) 100%)',
              border: '1px solid var(--border)',
            }}>
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

          {/* Lobby card sits at the table center */}
          {isLobby && (
            <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
                LOBBY — {alivePlayers.length} player{alivePlayers.length !== 1 ? 's' : ''} joined
              </div>
              {isHost ? (
                <>
                  {/* #66 — settings live here now; host edits and every */}
                  {/* lobby member sees the change via room_state. */}
                  {roomState?.config && (
                    <PreGameSettingsPanel
                      config={roomState.config}
                      onChange={updateRoomConfig}
                    />
                  )}
                  <button
                    className="primary"
                    onClick={startGame}
                    disabled={alivePlayers.length < 2}
                    style={{ width: '100%', padding: '14px', fontSize: 13 }}
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
                <>
                  {roomState?.config && <LobbyConfigSummary config={roomState.config} />}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    Waiting for the host to start the game...
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bluff-reveal panel + spin trigger live in the centre during spin_pending */}
          {isSpinPending && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                </div>
              )}

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

          {/* Game over banner over the table */}
          {isGameOver && (
            <div className="card" style={{ textAlign: 'center', border: '1px solid var(--accent)' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--accent)', marginBottom: 8 }}>
                {lastAction?.winnerId === myPlayer.id ? '🎉 You Win!' : `${lastAction?.winnerName ?? '?'} Wins!`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Game over.</div>
              {isHost ? (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="primary" onClick={restartRoom}>🔄 Play Again</button>
                  <button onClick={leaveGame}>Leave Room</button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Waiting for host to start a new game...
                </div>
              )}
            </div>
          )}

          {/* Last-action log + waiting banner sit just below the table */}
          {lastAction && <ActionLog lastAction={lastAction} />}

          {!isMyTurn && isPlaying && currentPlayer && !isEliminated && (
            <WaitingForPlayerBanner playerName={currentPlayer.username} />
          )}
        </div>

        {/* Right side chips */}
        <div className="topdown-side" style={{
          display: 'flex', flexDirection: 'column',
          flexWrap: 'wrap', gap: 8,
          maxHeight: '46vh',
          alignContent: 'flex-start',
        }}>
          {distributed.right.map(renderChip)}
        </div>
      </div>

      {/* ── Bottom seat (~25vh) — local player ── */}
      <div className="topdown-bottom" style={{
        marginTop: 'auto',
        paddingTop: 12,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        borderTop: '1px solid var(--border)',
        background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
      }}>
        {/* Local nameplate */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginBottom: 8, flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            color: isEliminated ? 'var(--accent2)' : isMyTurn && isPlaying ? 'var(--warning)' : 'var(--text)',
            letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {voice && (
              <VoiceIndicator
                playerId={myPlayer.id}
                speakingIds={voice.speakingIds}
                voiceConnected={voice.isConnected}
                size={9}
              />
            )}
            {myPlayer.username} {isMyTurn && isPlaying && !isEliminated && <span style={{ fontSize: 10, color: 'var(--warning)', border: '1px solid var(--warning)', padding: '1px 5px', borderRadius: 2 }}>YOUR TURN</span>}
          </div>

          {/* Chamber strip */}
          {!isEliminated && !isLobby && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>CHAMBER</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const isBullet = myPlayer.chamber?.[i] === 'bullet';
                  return (
                    <div key={i} style={{
                      width: 11, height: 11, borderRadius: '50%',
                      background: isBullet ? 'var(--accent2)' : 'var(--surface2)',
                      border: `1px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                      boxShadow: isBullet ? '0 0 5px rgba(255,74,110,0.5)' : 'none',
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {myPlayer.chamber?.filter(s => s === 'bullet').length ?? 1}/6
              </div>
            </div>
          )}
        </div>

        {/* Action buttons (Call Bluff / End Turn) */}
        {isMyTurn && isPlaying && !isEliminated && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!isFirstTurn && (
                <button
                  className="danger"
                  onClick={callBluff}
                  disabled={bluffUsedThisTurn || cardPlayedThisTurn || bluffBlockedThisTurn}
                  title={bluffBlockedThisTurn ? 'No card to challenge — last turn was frozen' : undefined}
                  style={{
                    flex: 1,
                    opacity: bluffUsedThisTurn || cardPlayedThisTurn || bluffBlockedThisTurn ? 0.4 : 1,
                    cursor: bluffUsedThisTurn || cardPlayedThisTurn || bluffBlockedThisTurn ? 'not-allowed' : 'pointer',
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
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                {actionHint}
              </div>
            )}
          </div>
        )}

        {/* Hand (or spectator picker) */}
        {showSpectatorView ? (
          <div className="card" style={{ marginTop: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>
              👁 SPECTATING
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
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

        {/* Leave game — always available. Mid-game prompts to confirm
            because leave-mid-game forfeits (server marks the player
            eliminated; can't rejoin this game). Lobby and game_over
            leave with no prompt.

            Issue #60: alignSelf must NOT be 'flex-start' (left edge)
            in this layout — the Centralize button below is fixed at
            left:16/bottom:16 and would overlap a left-aligned Leave
            link when the user is scrolled to the bottom of the page.
            Centred keeps it clear of both Centralize (left) and the
            chat 💬 button (right). */}
        <button
          onClick={() => {
            const isMidGame = !!phase && !['lobby', 'game_over'].includes(phase);
            if (isMidGame && !window.confirm(
              'Leave the game? You will forfeit and cannot rejoin this round.'
            )) return;
            leaveGame();
          }}
          style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', marginTop: 10, marginBottom: 24 }}
        >
          Leave game
        </button>
      </div>

      {/* ── Active config panel (#68): collapsible top-left badge ── */}
      <ActiveConfigPanel config={roomState?.config} />

      {/* ── Centralize button (fixed, bottom-left to avoid the chat 💬 at bottom-right) ── */}
      <button
        type="button"
        onClick={scrollToCenter}
        title="Centre on the table"
        aria-label="Centre on the table"
        style={{
          position: 'fixed',
          left: 16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          width: 44, height: 44,
          borderRadius: '50%',
          background: 'var(--surface2)',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          zIndex: 7900,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        ↻
      </button>

      {/* ── Speech toggle (fixed, bottom-right, stacked above chat 💬). The
            chat button is 56px tall + 16px from the bottom; we sit at
            ~84px above that so they don't overlap. Persists to
            localStorage via toggleSpeech. ── */}
      <button
        type="button"
        onClick={toggleSpeech}
        title={speechEnabled ? 'Mute spoken announcements' : 'Unmute spoken announcements'}
        aria-label={speechEnabled ? 'Mute spoken announcements' : 'Unmute spoken announcements'}
        aria-pressed={speechEnabled}
        style={{
          position: 'fixed',
          right: 'max(22px, env(safe-area-inset-right))',
          // Sit above the 56px chat button (which is 16px from bottom).
          // 16 + 56 + 12 gap = 84.
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
          width: 44, height: 44,
          borderRadius: '50%',
          background: 'var(--surface2)',
          border: `1px solid ${speechEnabled ? 'var(--accent)' : 'var(--border)'}`,
          color: speechEnabled ? 'var(--accent)' : 'var(--text-dim)',
          fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          zIndex: 7900,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {speechEnabled ? '🔊' : '🔇'}
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

      {/* Turn action modal — shown to active player at turn start.
          Suppressed while the power-card prompt is up so the player
          decides activation FIRST (per spec). */}
      <TurnActionModal
        visible={showTurnModal && !isEliminated && !showPowerPrompt && !amSwapHolder && !peekedCard}
        isFirstTurn={isFirstTurn}
        bluffUsed={bluffUsedThisTurn}
        cardPlayed={cardPlayedThisTurn}
        prevPlayerName={prevPlayer?.username || null}
        onCallBluff={() => { callBluff(); setShowTurnModal(false); }}
        onClose={() => setShowTurnModal(false)}
      />

      {/* ── v2 Phase B — Power-card activation prompt ── */}
      {showPowerPrompt && heldPowerCard && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 8400, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 360, width: '100%', textAlign: 'center',
            padding: '28px 24px',
            border: `1px solid ${POWER_META[heldPowerCard.power]?.color || 'var(--accent)'}`,
          }}>
            <div style={{
              fontSize: 10, color: 'var(--text-dim)',
              letterSpacing: '0.15em', marginBottom: 14,
            }}>
              POWER CARD
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <PowerCard type={heldPowerCard.power} size="md" />
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.08em',
              color: POWER_META[heldPowerCard.power]?.color || 'var(--accent)',
              marginBottom: 8,
            }}>
              Activate {POWER_META[heldPowerCard.power]?.label || heldPowerCard.power}?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.5 }}>
              {POWER_META[heldPowerCard.power]?.flavor || ''}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="primary"
                onClick={handleActivatePower}
                disabled={activating}
                style={{ flex: 1, padding: '12px' }}
              >
                {activating ? '…' : '⚡ Activate'}
              </button>
              <button
                onClick={handleSkipPower}
                style={{
                  flex: 1, padding: '12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase B — Peek result reveal (private, ~3s) ── */}
      {peekedCard && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 8500, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 320, width: '100%', textAlign: 'center',
            padding: '28px 24px',
            border: `1px solid ${POWER_META.peek.color}`,
          }}>
            <div style={{
              fontSize: 10, color: POWER_META.peek.color,
              letterSpacing: '0.15em', marginBottom: 14,
            }}>
              PEEK · LAST PLAYED
            </div>
            {peekedCard?._empty || !peekedCard?.shape ? (
              <div style={{ fontSize: 14, color: 'var(--text-dim)', padding: '20px 0' }}>
                No card has been played yet this round.
              </div>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '12px 0',
              }}>
                <div style={{
                  width: 80, height: 112,
                  background: 'var(--surface2)',
                  border: '2px solid var(--accent)',
                  borderRadius: 8,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 0 20px rgba(232,255,74,0.2)',
                  animation: 'cardFlipIn 0.5s ease-out',
                }}>
                  <ShapeIcon shape={peekedCard.shape} size={36} />
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>
                    {peekedCard.shape === 'whot' ? 'WHOT' : peekedCard.number}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                  {peekedCard.shape === 'whot' ? 'Whot (wild)' : `${peekedCard.shape} ${peekedCard.number}`}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 16, fontStyle: 'italic' }}>
              Only you can see this. Closing in a moment...
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase C — Announcement banner queue ── */}
      {/* Renders the head of the queue. The banner self-times and
          calls onComplete when its sweep-out finishes; we then dequeue
          and the next event in line gets rendered. Banner is keyed by
          the queue id so React fully remounts between events. */}
      {Array.isArray(powerEventQueue) && powerEventQueue.length > 0 && (() => {
        const evt = powerEventQueue[0];
        const kind = (() => {
          switch (evt.kind) {
            case 'shield_blocked':   return 'bluff_blocked';
            case 'mirror_reflected': return 'bluff_reflected';
            case 'assassin_strike':  return 'assassin';
            case 'assassin_backfire': return 'bluff_blocked';
            case 'swap_resolved':    return 'bluff_blocked';
            case 'freeze_skip':      return 'sudden_death'; // ice-blue preset
            // v2 Phase D — role banners.
            case 'gambler_caught':   return 'assassin';     // crimson, dramatic
            case 'sheriff_relief':   return 'bluff_blocked'; // lime — relief
            case 'sheriff_protected': return 'bluff_blocked'; // lime — Sheriff palette
            case 'medic_save':       return 'sudden_death'; // ice blue — Medic palette
            case 'sniper_redirect':  return 'assassin';     // crimson — Sniper palette
            default: return 'bluff_blocked';
          }
        })();
        const titleByKind = {
          shield_blocked:   'BLUFF BLOCKED',
          mirror_reflected: 'BLUFF REFLECTED',
          assassin_strike:  'ASSASSIN STRIKE',
          assassin_backfire: 'ASSASSIN BACKFIRES',
          swap_resolved:    'SWAP RESOLVED',
          freeze_skip:      'FREEZE',
          gambler_caught:   'GAMBLER CAUGHT',
          sheriff_relief:   'SHERIFF RELIEVED',
          sheriff_protected: 'SHERIFF PROTECTED',
          medic_save:       'MEDIC SAVE',
          sniper_redirect:  'SNIPER REDIRECT',
        };
        const subtitle = (() => {
          if (evt.kind === 'mirror_reflected') {
            return evt.redirectedToName ? `→ ${evt.redirectedToName}` : '';
          }
          if (evt.kind === 'assassin_strike') {
            return evt.eliminatedName ? `${evt.eliminatedName} eliminated` : '';
          }
          if (evt.kind === 'assassin_backfire') {
            const n = evt.cardsDrawn || 3;
            return `${evt.holderName || 'Holder'} draws +${n}`;
          }
          if (evt.kind === 'swap_resolved') return 'card swapped';
          if (evt.kind === 'freeze_skip') {
            return evt.skippedName ? `${evt.skippedName} is skipped` : 'turn skipped';
          }
          if (evt.kind === 'gambler_caught') return 'risk jumps to 4';
          if (evt.kind === 'sheriff_relief') return 'one bullet removed';
          if (evt.kind === 'sheriff_protected') return 'assassin held back';
          if (evt.kind === 'medic_save') {
            return evt.revivedPlayerName ? `${evt.revivedPlayerName} revived` : 'player revived';
          }
          if (evt.kind === 'sniper_redirect') {
            return evt.toName ? `→ ${evt.toName}` : 'spin redirected';
          }
          return '';
        })();
        return (
          <AnnouncementBanner
            key={evt.id}
            kind={kind}
            title={titleByKind[evt.kind]}
            subtitle={subtitle}
            playerName={evt.holderName}
            onComplete={consumePowerEvent}
          />
        );
      })()}

      {/* ── v2 Phase C — Swap picker modal ── */}
      {amSwapHolder && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 8700, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 420, width: '100%', textAlign: 'center',
            padding: '24px 20px',
            border: `1px solid ${POWER_META.swap.color}`,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.12em',
              color: POWER_META.swap.color, marginBottom: 6,
            }}>
              SWAP — PICK A CARD
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Choose blindly. The cards below are ALL face-down — no shapes, no names. Your played card will be swapped with the one you pick, then both reveal face-up.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
              gap: 10,
              marginBottom: 16,
              maxHeight: '50vh',
              overflowY: 'auto',
              padding: 4,
            }}>
              {swapPickOptions.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-dim)', padding: 20 }}>
                  No cards in the played pile. Cancel & spin instead.
                </div>
              ) : swapPickOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSwapPick(opt.id)}
                  disabled={swapping}
                  style={{
                    width: 56, height: 80,
                    background: 'linear-gradient(160deg, #14141a 0%, #08080a 100%)',
                    border: `1.5px solid ${POWER_META.swap.color}66`,
                    borderRadius: 6,
                    cursor: swapping ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: `${POWER_META.swap.color}aa`,
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 18, letterSpacing: '0.1em',
                    boxShadow: `inset 0 0 12px ${POWER_META.swap.color}22`,
                    transition: 'transform 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!swapping) {
                      e.currentTarget.style.borderColor = POWER_META.swap.color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = `${POWER_META.swap.color}66`;
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  ?
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {swapping ? 'Swapping…' : 'Tap any card to swap.'}
            </div>
          </div>
        </div>
      )}

      {/* ── Other players see "X is choosing..." while Swap pauses ── */}
      {isSwapPending && !amSwapHolder && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 8650, padding: 24,
          pointerEvents: 'none',
        }}>
          <div className="card" style={{
            maxWidth: 320, textAlign: 'center', padding: '20px 24px',
            border: `1px solid ${POWER_META.swap.color}`,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.12em',
              color: POWER_META.swap.color, marginBottom: 8,
            }}>
              SWAP IN PROGRESS
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {players?.find(p => p.id === roomState?.swapHolderId)?.username || 'Player'} is choosing a card…
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase D — Role reveal overlay ── */}
      {showRoleReveal && (
        <RoleRevealOverlay
          role={myRole}
          onComplete={() => setRoleRevealSeen(true)}
        />
      )}

      {/* ── v2 Phase D — Saboteur trigger button (alive Saboteur only) ── */}
      {saboteurAvailable && !showRoleReveal && (
        <button
          onClick={() => setSaboteurOpen(true)}
          style={{
            position: 'fixed',
            bottom: 90,
            right: 12,
            padding: '12px 16px',
            minHeight: 44,
            background: 'rgba(122,60,255,0.12)',
            border: `1px solid ${ROLE_META.saboteur.color}`,
            borderRadius: 'var(--radius)',
            color: ROLE_META.saboteur.color,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 13,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            boxShadow: `0 0 12px ${ROLE_META.saboteur.color}33`,
            zIndex: 8200,
          }}
          title="Saboteur — silently move a random card from your hand into another player's hand. Once per game."
        >
          🕶 SABOTAGE
        </button>
      )}

      {/* ── v2 Phase D — Saboteur target picker ── */}
      {saboteurOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 8950, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 380, width: '100%', textAlign: 'center',
            padding: '24px 20px',
            border: `1px solid ${ROLE_META.saboteur.color}`,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.12em',
              color: ROLE_META.saboteur.color, marginBottom: 6,
            }}>
              SABOTAGE
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Pick a target. One random card will move from your hand into theirs. They won't be told.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 8,
              marginBottom: 14,
            }}>
              {alivePlayers
                .filter(p => p.id !== myPlayer.id)
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSaboteurPick(p.id)}
                    disabled={saboteurBusy}
                    style={{
                      padding: '12px 8px',
                      minHeight: 44,
                      background: 'var(--surface2)',
                      border: `1px solid ${ROLE_META.saboteur.color}66`,
                      borderRadius: 6,
                      color: 'var(--text)',
                      cursor: saboteurBusy ? 'wait' : 'pointer',
                      fontSize: 12,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {p.username}
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>🃏 {p.handSize ?? '?'}</div>
                  </button>
                ))}
            </div>
            <button
              onClick={() => setSaboteurOpen(false)}
              disabled={saboteurBusy}
              style={{
                fontSize: 11, color: 'var(--text-dim)',
                background: 'none', border: 'none',
                cursor: saboteurBusy ? 'wait' : 'pointer', textDecoration: 'underline',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── v2 Phase D — Medic save prompt ── */}
      {amTargetMedic && medicPending && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9100, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 380, width: '100%', textAlign: 'center',
            padding: '28px 24px',
            border: `1px solid ${ROLE_META.medic.color}`,
          }}>
            <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 12 }}>
              MEDIC — SAVE THEM?
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 26, color: 'var(--text)', marginBottom: 8, letterSpacing: '0.05em',
            }}>
              {medicPending.eliminatedPlayerName || 'A player'} is about to be eliminated.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 22, lineHeight: 1.55 }}>
              Save them? You'll take +2 cards as the cost. This is your only Medic save — once per game.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="primary"
                disabled={medicDeciding}
                onClick={() => handleMedicDecide(true)}
                style={{ flex: 1, padding: '12px', minHeight: 44 }}
              >
                {medicDeciding ? '…' : '✚ Save them'}
              </button>
              <button
                disabled={medicDeciding}
                onClick={() => handleMedicDecide(false)}
                style={{
                  flex: 1, padding: '12px', minHeight: 44,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  cursor: medicDeciding ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
              >
                Let them go
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase D — Medic deciding banner (everyone else) ── */}
      {medicPending && !amTargetMedic && (
        <div style={{
          position: 'fixed',
          left: 0, right: 0,
          top: 'calc(38vh + 110px)',
          display: 'flex', justifyContent: 'center',
          zIndex: 8650, padding: '0 16px',
          pointerEvents: 'none',
        }}>
          <div className="card" style={{
            maxWidth: 320, textAlign: 'center', padding: '14px 18px',
            border: `1px solid ${ROLE_META.medic.color}`,
            background: 'rgba(8,12,20,0.96)',
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: ROLE_META.medic.color, marginBottom: 4 }}>
              MEDIC IS DECIDING…
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {medicPending.eliminatedPlayerName || 'Someone'} hangs in the balance.
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase D — Sniper redirect picker ── */}
      {amTargetSniper && sniperPending && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9100, padding: 24,
        }}>
          <div className="card fade-in" style={{
            maxWidth: 420, width: '100%', textAlign: 'center',
            padding: '24px 20px',
            border: `1px solid ${ROLE_META.sniper.color}`,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, letterSpacing: '0.12em',
              color: ROLE_META.sniper.color, marginBottom: 6,
            }}>
              SNIPER — REDIRECT THE SHOT?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Currently aimed at <strong style={{ color: 'var(--text)' }}>{sniperPending.originalSpinTargetName || 'someone'}</strong>.
              Pick a new target — Mirror holders are off-limits — or pass.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 8,
              marginBottom: 14,
            }}>
              {alivePlayers.map(p => {
                const eligible = sniperEligibleTargets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => eligible && handleSniperRedirect(p.id)}
                    disabled={!eligible || sniperDeciding}
                    style={{
                      padding: '12px 8px',
                      minHeight: 44,
                      background: eligible ? 'var(--surface2)' : 'rgba(40,40,40,0.4)',
                      border: `1px solid ${eligible ? `${ROLE_META.sniper.color}66` : 'var(--border)'}`,
                      borderRadius: 6,
                      color: eligible ? 'var(--text)' : 'var(--text-dim)',
                      cursor: !eligible ? 'not-allowed' : sniperDeciding ? 'wait' : 'pointer',
                      fontSize: 12,
                      letterSpacing: '0.04em',
                      opacity: eligible ? 1 : 0.45,
                    }}
                    title={!eligible ? 'Cannot redirect — Mirror holder or self.' : undefined}
                  >
                    {p.username}
                    {p.id === sniperPending.originalSpinTargetId && (
                      <div style={{ fontSize: 9, color: ROLE_META.sniper.color, marginTop: 3 }}>current target</div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handleSniperRedirect(null)}
              disabled={sniperDeciding}
              style={{
                fontSize: 11, color: 'var(--text-dim)',
                background: 'none', border: 'none',
                cursor: sniperDeciding ? 'wait' : 'pointer', textDecoration: 'underline',
              }}
            >
              Pass — let the original target spin
            </button>
          </div>
        </div>
      )}

      {/* ── Issue #81 — Spectator ghost prompts ──
            When the local player is spectating and their selected
            target is the one currently being prompted, render a
            dimmed read-only copy of the prompt so spectators can
            follow what their player is seeing. `currentPromptTarget`
            is only sent to eliminated callers (secret-role privacy
            stays intact for living players).
        */}
      {showSpectatorView && spectatingId && (() => {
        const promptTarget = roomState?.currentPromptTarget;
        if (!promptTarget || promptTarget.playerId !== spectatingId) return null;

        const targetPlayer = players?.find(p => p.id === spectatingId);
        const ghostFrame = {
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.78)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9050, padding: 24,
          pointerEvents: 'none',
        };

        if (promptTarget.kind === 'medic_save_pending' && medicPending) {
          return (
            <div style={ghostFrame} data-testid="spectator-ghost-medic">
              <div className="card" style={{
                maxWidth: 380, width: '100%', textAlign: 'center',
                padding: '28px 24px',
                border: `1px solid ${ROLE_META.medic.color}`,
                opacity: 0.55,
              }}>
                <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 8 }}>
                  👁 SPECTATING · {targetPlayer?.username || 'Player'}
                </div>
                <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 12 }}>
                  MEDIC — SAVE THEM?
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22, color: 'var(--text)', marginBottom: 8, letterSpacing: '0.05em',
                }}>
                  {medicPending.eliminatedPlayerName || 'A player'} is about to be eliminated.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  They are choosing whether to save them.
                </div>
              </div>
            </div>
          );
        }

        if (promptTarget.kind === 'sniper_redirect_pending' && sniperPending) {
          return (
            <div style={ghostFrame} data-testid="spectator-ghost-sniper">
              <div className="card" style={{
                maxWidth: 420, width: '100%', textAlign: 'center',
                padding: '24px 20px',
                border: `1px solid ${ROLE_META.sniper.color}`,
                opacity: 0.55,
              }}>
                <div style={{ fontSize: 10, color: ROLE_META.sniper.color, letterSpacing: '0.18em', marginBottom: 8 }}>
                  👁 SPECTATING · {targetPlayer?.username || 'Player'}
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 20, letterSpacing: '0.12em',
                  color: ROLE_META.sniper.color, marginBottom: 6,
                }}>
                  SNIPER — REDIRECT THE SHOT?
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Aimed at <strong style={{ color: 'var(--text)' }}>{sniperPending.originalSpinTargetName || 'someone'}</strong>. They are picking a new target.
                </div>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* ── Issue #81 — Spectator ghost Activate/Skip prompt ──
            Derived (not server-pushed): the spectated player's turn
            is open in 'playing' phase, they haven't acted yet, and
            their hand (visible via spectatedHand) contains a power
            card that isn't already armed. Mirror of the local
            `showPowerPrompt` derivation, but viewed from outside.
        */}
      {showSpectatorView && spectatingId && (() => {
        if (roomState?.phase !== 'playing') return null;
        if (roomState?.currentPlayerId !== spectatingId) return null;
        if (roomState?.cardPlayedThisTurn || roomState?.bluffUsedThisTurn) return null;
        const targetPlayer = players?.find(p => p.id === spectatingId);
        if (!targetPlayer || targetPlayer.armedPowerCard) return null;
        const targetHand = roomState?.spectatedHand || spectatedHand || [];
        const targetPower = targetHand.find(c => c?.type === 'power');
        if (!targetPower) return null;
        return (
          <div
            data-testid="spectator-ghost-activate"
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9020, padding: 24,
              pointerEvents: 'none',
            }}
          >
            <div className="card" style={{
              maxWidth: 360, width: '100%', textAlign: 'center',
              padding: '22px 20px',
              border: '1px solid var(--accent)',
              opacity: 0.55,
            }}>
              <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 8 }}>
                👁 SPECTATING · {targetPlayer?.username || 'Player'}
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: 'var(--text)', letterSpacing: '0.06em', marginBottom: 6 }}>
                ACTIVATE POWER CARD?
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {targetPlayer?.username || 'They'} are deciding whether to use {targetPower.power || 'their power'}.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── v2 Phase D — Sniper deciding banner (everyone else) ── */}
      {sniperPending && !amTargetSniper && (
        <div style={{
          position: 'fixed',
          left: 0, right: 0,
          top: 'calc(38vh + 110px)',
          display: 'flex', justifyContent: 'center',
          zIndex: 8650, padding: '0 16px',
          pointerEvents: 'none',
        }}>
          <div className="card" style={{
            maxWidth: 320, textAlign: 'center', padding: '14px 18px',
            border: `1px solid ${ROLE_META.sniper.color}`,
            background: 'rgba(20,4,8,0.96)',
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: ROLE_META.sniper.color, marginBottom: 4 }}>
              REDIRECT INCOMING…
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {sniperPending.originalSpinTargetName || 'Someone'} was the target.
            </div>
          </div>
        </div>
      )}

      {/* ── v2 Phase F — Betting overlay ── */}
      {(() => {
        const betting = roomState?.betting;
        if (!betting) return null;
        if (myPlayer?.id === betting.spinTargetId) {
          return <BettingWaitOverlay closesAt={betting.closesAt} />;
        }
        if (!betting.eligibleIds?.includes(myPlayer?.id)) return null;
        return (
          <BettingPopup
            betting={betting}
            players={roomState?.players}
            myBet={betting.myBet}
            onBet={async (prediction) => {
              if (bettingBusy) return;
              setBettingBusy(true);
              try { await placeBet?.(prediction); }
              finally { setBettingBusy(false); }
            }}
          />
        );
      })()}

      {/* ── v2 Phase F — Ghost vote overlay (DMH) ── */}
      {(() => {
        const gv = roomState?.ghostVote;
        if (!gv) return null;
        if (gv.amGhostVoter) {
          return (
            <GhostVotePopup
              ghostVote={gv}
              myVote={gv.myVote}
              onVote={async (option) => {
                if (ghostVotingBusy) return;
                setGhostVotingBusy(true);
                try { await ghostVote?.(option); }
                finally { setGhostVotingBusy(false); }
              }}
            />
          );
        }
        return <GhostVoteWaitOverlay closesAt={gv.closesAt} />;
      })()}

      {/* ── v2 Phase F — Last Stand cinematic ── */}
      {roomState?.phase === 'last_stand' && roomState?.lastStand && (
        <LastStandCinematic
          lastStand={roomState.lastStand}
          players={roomState.players}
          myPlayerId={myPlayer?.id}
          spinPending={lastStandSpinBusy}
          onSpin={async () => {
            if (lastStandSpinBusy) return;
            setLastStandSpinBusy(true);
            try { await lastStandSpin?.(); }
            finally { setLastStandSpinBusy(false); }
          }}
        />
      )}

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
        @keyframes chipTurnPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(255,170,74,0.25); }
          50%      { box-shadow: 0 0 18px rgba(255,170,74,0.55); }
        }
        /* Mobile: smaller chips, tighter middle grid */
        @media (max-width: 640px) {
          .topdown-middle { gap: 6px !important; }
          .topdown-side { max-height: 48vh !important; }
          .topdown-chip {
            width: 64px !important;
            height: 88px !important;
            padding: 5px !important;
          }
        }
      `}</style>
    </div>
  );
}
