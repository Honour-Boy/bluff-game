import { useEffect, useRef, useState } from 'react';
import { ShapeIcon } from '../shared/ShapeIcon';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

const CARD_W = 58;
const CARD_H = 84;

// ─── Single card — physical card in a wooden cardholder ──────────────────────
// `arc` (shape fan only): precomputed { angle, scale, z, lift } placing this
// card on the shared-pivot fan. When omitted (power slot) the card renders
// upright. `isDealtIn` plays a deal-from-deck flourish on the inner face so it
// never fights the outer arc transform.
function renderOneCard({
  card, index, totalCards, isSelected, isJustPlayed = false, isDealtIn = false,
  dealDelay = 0, interactive, powerInteractive, onCardClick, onPowerCardClick, arc = null,
}) {
  const isPower = card.type === 'power';
  const isWhot = !isPower && card.shape === 'whot';
  const powerMeta = isPower ? POWER_META[card.power] : null;
  const powerColor = powerMeta?.color || 'var(--accent)';
  const drawPowerIcon = isPower ? (POWER_ICONS[card.power] || POWER_ICONS.shield) : null;
  const isArmed = card.armed === true;
  const effectiveInteractive = isPower
    ? (powerInteractive === undefined ? interactive : powerInteractive)
    : interactive;
  const cardInteractive = effectiveInteractive && !isArmed;
  const armedLabel = 'Activated — awaiting trigger';

  const handleClick = () => {
    if (!cardInteractive) return;
    if (isPower) onPowerCardClick && onPowerCardClick(card.id);
    else onCardClick && onCardClick(card.id);
  };

  // ── Fan placement ──
  // Arc mode: every card shares one bottom-centre pivot and is fanned by a
  // rotation, so the whole hand is a real arc (no horizontal slide). The
  // card nearest the top (angle≈0) is lifted/scaled to read clearly.
  let outerStyle;
  if (arc) {
    const transform = isSelected
      ? `translateY(-26px) scale(1.12)`
      : `rotate(${arc.angle}deg) scale(${arc.scale})`;
    outerStyle = {
      position: 'absolute',
      left: `calc(50% - ${CARD_W / 2}px)`,
      bottom: 8,
      width: CARD_W,
      height: CARD_H,
      transformOrigin: 'bottom center',
      transform: isJustPlayed ? undefined : transform,
      zIndex: isJustPlayed ? 300 : isSelected ? 200 : arc.z,
      transition: isJustPlayed ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
      cursor: cardInteractive ? 'pointer' : 'default',
      pointerEvents: isArmed ? 'none' : 'auto',
    };
  } else {
    // Power slot — single upright card, no arc.
    outerStyle = {
      position: 'relative',
      width: CARD_W,
      height: CARD_H,
      flexShrink: 0,
      cursor: cardInteractive ? 'pointer' : 'default',
      pointerEvents: isArmed ? 'none' : 'auto',
      transform: isSelected ? 'translateY(-10px) scale(1.06)' : undefined,
      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
    };
  }

  const borderColor = isPower
    ? powerColor
    : isWhot
      ? 'var(--accent)'
      : isSelected
        ? 'var(--accent)'
        : 'var(--border-lit)';

  const boxShadow = isSelected
    ? '0 16px 32px rgba(0,0,0,0.75), 0 0 18px rgba(200,146,46,0.3)'
    : isPower
      ? `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${powerColor}44`
      : isWhot
        ? '0 4px 16px rgba(0,0,0,0.5), 0 0 8px rgba(200,146,46,0.25)'
        : '0 4px 12px rgba(0,0,0,0.5)';

  return (
    <div
      key={card.id}
      onClick={handleClick}
      title={isArmed ? armedLabel : (isPower && powerMeta ? `${powerMeta.label} — ${powerMeta.flavor}` : undefined)}
      aria-label={isPower && powerMeta ? `Power card: ${powerMeta.label}` : undefined}
      data-armed={isArmed ? 'true' : undefined}
      className={isJustPlayed ? 'card-play-physics' : undefined}
      style={outerStyle}
    >
      {/* Inner face — carries the deal-in flourish so it never fights the
          outer arc rotation. */}
      <div
        className={isDealtIn && !isJustPlayed ? 'card-deal-in' : undefined}
        style={{
          animationDelay: isDealtIn && !isJustPlayed && dealDelay ? `${dealDelay}s` : undefined,
          width: '100%',
          height: '100%',
          background: isPower
            ? `linear-gradient(160deg, #1a0e08 0%, #0d0805 55%, #090503 100%)`
            : `linear-gradient(160deg, #1e1812 0%, #13100c 55%, #0d0a07 100%)`,
          border: `2px solid ${borderColor}`,
          borderRadius: 7,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          boxShadow,
          opacity: isArmed ? 0.48 : 1,
          transition: 'opacity 0.15s ease, box-shadow 0.2s ease',
          userSelect: 'none',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Inner card sheen */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }} />

        {isPower ? (
          <>
            <svg
              viewBox="0 0 100 100"
              width={26}
              height={26}
              aria-hidden
              style={{ filter: `drop-shadow(0 0 5px ${powerColor}88)` }}
            >
              {drawPowerIcon(powerColor)}
            </svg>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              letterSpacing: '0.1em',
              color: powerColor,
              textTransform: 'uppercase',
              textShadow: `0 0 7px ${powerColor}88`,
              lineHeight: 1,
              textAlign: 'center',
              padding: '0 2px',
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
              fontFamily: "'Cinzel', serif",
              fontSize: 11,
              fontWeight: 700,
              color: isWhot ? 'var(--accent)' : 'var(--text-mid)',
              letterSpacing: '0.06em',
            }}>
              {isWhot ? 'WHOT' : card.number}
            </div>
          </>
        )}
      </div>

      {/* Armed badge */}
      {isArmed && (
        <span
          aria-label={armedLabel}
          title={armedLabel}
          role="img"
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: `1.5px solid ${powerColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 9px ${powerColor}99`,
            pointerEvents: 'none',
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" aria-hidden>
            <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke={powerColor} strokeWidth="2" strokeLinecap="round" />
            <rect x="5" y="10" width="14" height="9" rx="2" fill={powerColor} />
          </svg>
        </span>
      )}
    </div>
  );
}

// ─── CardHand — true stacked fan with drag-to-rotate (#4) ─────────────────────
// Shape cards share a single bottom-centre pivot and are fanned out by rotation
// — a real semicircle, not a flat scrolling row. With more cards than fit
// comfortably, dragging the fan left/right rotates the whole arc so the side
// cards swing up to the readable centre (instead of sliding past). Tapping a
// card still selects it; a drag is suppressed from also firing a tap.
export function CardHand({
  hand,
  powerCardSlot = [],
  selectedCardId,
  onCardClick,
  onPowerCardClick,
  interactive = true,
  powerInteractive = undefined,
  justPlayedCardId = null,
}) {
  const shapeCards = hand.filter(c => c?.type !== 'power');
  const n = shapeCards.length;

  // Fan geometry: gentle per-card angle, capped so big hands still fit one arc.
  const MAX_SPREAD = 92; // total degrees the fan may open to
  const step = n > 1 ? Math.min(12, MAX_SPREAD / (n - 1)) : 0;
  const spread = step * (n - 1);
  const half = spread / 2;

  // Rotation offset (deg) the player drags to bring either end of the fan up
  // to the readable centre. Clamped so an end card can reach upright but no
  // further. Re-clamped whenever the hand size changes.
  const [rotateOffset, setRotateOffset] = useState(0);
  const dragRef = useRef({ active: false, startX: 0, startOffset: 0, moved: false });
  // Set true for the duration of a drag so the card's onClick can ignore the
  // synthetic click that follows a pointer drag.
  const draggedRef = useRef(false);

  useEffect(() => {
    setRotateOffset((o) => Math.max(-half, Math.min(half, o)));
  }, [half]);

  // Track which ids are newly arrived so freshly dealt/drawn cards animate in.
  const prevIdsRef = useRef(null);
  const [dealtInIds, setDealtInIds] = useState(() => new Set(shapeCards.map(c => c.id)));
  useEffect(() => {
    const curr = shapeCards.map(c => c.id);
    const prev = prevIdsRef.current;
    if (prev === null) {
      // First mount: animate the whole opening hand in.
      setDealtInIds(new Set(curr));
    } else {
      const prevSet = new Set(prev);
      // Only ids not present last render animate in; everything else (incl. a
      // play that just removed a card) settles to an empty animate-set.
      setDealtInIds(new Set(curr.filter(id => !prevSet.has(id))));
    }
    prevIdsRef.current = curr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeCards.map(c => c.id).join('|')]);

  if (shapeCards.length === 0 && powerCardSlot.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '20px 0',
        fontFamily: "'Crimson Text', serif",
        color: 'var(--text-dim)',
        fontSize: 14,
        fontStyle: 'italic',
      }}>
        No cards in hand
      </div>
    );
  }

  const draggable = n > 1;
  const onPointerDown = (e) => {
    if (!draggable) return;
    dragRef.current = { active: true, startX: e.clientX, startOffset: rotateOffset, moved: false };
    draggedRef.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) { d.moved = true; draggedRef.current = true; }
    // ~0.32° per px feels natural; positive drag-right rotates the fan so the
    // left-hand cards swing up to centre.
    const next = d.startOffset + dx * 0.32;
    setRotateOffset(Math.max(-half, Math.min(half, next)));
  };
  const endPointer = (e) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    // Clear the drag flag on the next tick so the trailing click is swallowed.
    setTimeout(() => { draggedRef.current = false; }, 0);
  };

  // Wrap card click so a drag does not also select.
  const guardedCardClick = (id) => { if (!draggedRef.current) onCardClick && onCardClick(id); };
  const guardedPowerClick = (id) => { if (!draggedRef.current) onPowerCardClick && onPowerCardClick(id); };

  // Stagger only across the cards arriving THIS render (so a single drawn card
  // pops immediately, while a full opening deal cascades in).
  const dealRank = new Map();
  shapeCards.filter(c => dealtInIds.has(c.id)).forEach((c, i) => dealRank.set(c.id, i));

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {/* Shape cards fan — wooden cardholder trough */}
      {n > 0 && (
        <div style={{
          flex: '1 1 auto',
          minWidth: 0,
          background: 'linear-gradient(180deg, rgba(16,10,6,0.0) 0%, rgba(12,8,4,0.7) 100%)',
          borderTop: '2px solid var(--border-lit)',
          borderRadius: '0 0 6px 6px',
          paddingTop: 6,
          paddingBottom: 4,
        }}>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            style={{
              position: 'relative',
              height: 132,
              touchAction: 'pan-y',
              cursor: draggable ? 'grab' : 'default',
            }}
          >
            {shapeCards.map((card, index) => {
              // Card's angle on the fan, after the player's rotation sweep.
              const angle = (index - (n - 1) / 2) * step + rotateOffset;
              // Cards closest to upright read best: lift them in z + scale.
              const centredness = 1 - Math.min(1, Math.abs(angle) / (MAX_SPREAD / 2 + 6));
              const scale = 1 + centredness * 0.06;
              const z = Math.round(centredness * 100) + 1;
              return renderOneCard({
                card,
                index,
                totalCards: n,
                isSelected: selectedCardId === card.id,
                isJustPlayed: justPlayedCardId === card.id,
                isDealtIn: dealtInIds.has(card.id),
                dealDelay: Math.min((dealRank.get(card.id) || 0) * 0.05, 0.5),
                interactive,
                powerInteractive,
                onCardClick: guardedCardClick,
                onPowerCardClick: guardedPowerClick,
                arc: { angle, scale, z, lift: centredness },
              });
            })}
          </div>
        </div>
      )}

      {/* Power card slot — separate brass bracket */}
      {powerCardSlot.length > 0 && (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 5,
          paddingBottom: 4,
        }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 8,
            color: 'var(--accent-dim)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            Power
          </div>
          {powerCardSlot.map((card, index) =>
            renderOneCard({
              card,
              index,
              totalCards: 1,
              isSelected: selectedCardId === card.id,
              interactive,
              powerInteractive,
              onCardClick: guardedCardClick,
              onPowerCardClick: guardedPowerClick,
              arc: null,
            })
          )}
        </div>
      )}
    </div>
  );
}
