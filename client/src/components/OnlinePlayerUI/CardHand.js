import { useEffect, useRef, useState } from 'react';
import { ShapeIcon } from '../shared/ShapeIcon';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

const CARD_W = 58;
const CARD_H = 84;

// ─── Single card — physical card in a wooden cardholder ──────────────────────
// `arc` (shape fan only): precomputed { angle, scale, z } placing the card on
// the shared-pivot fan. When null (power slot) the card renders upright in flow.
function renderOneCard({
  card, index, isSelected, isJustPlayed = false, interactive, powerInteractive,
  powerLocked = false, onCardClick, onPowerCardClick, arc = null,
}) {
  const isPower = card.type === 'power';
  const isWhot = !isPower && card.shape === 'whot';
  const powerMeta = isPower ? POWER_META[card.power] : null;
  const powerColor = powerMeta?.color || 'var(--accent)';
  const drawPowerIcon = isPower ? (POWER_ICONS[card.power] || POWER_ICONS.shield) : null;
  const isArmed = card.armed === true;
  // Tutorial pre-arm lock: a defensive clinic card that can't be armed yet. Stays
  // tappable (the tap shows a "not yet" hint) but reads as disabled — dimmed.
  const isLocked = isPower && powerLocked && !isArmed;
  const effectiveInteractive = isPower
    ? (powerInteractive === undefined ? interactive : powerInteractive)
    : interactive;
  const cardInteractive = effectiveInteractive && !isArmed;
  const armedLabel = 'Activated - awaiting trigger';
  const lockedLabel = 'Not yet - you defend after the bot challenges you';

  const handleClick = () => {
    if (!cardInteractive) return;
    if (isPower) onPowerCardClick && onPowerCardClick(card.id);
    else onCardClick && onCardClick(card.id);
  };

  // Placement — arc (fan) vs. upright (power slot).
  let outerStyle;
  if (arc) {
    const transform = isSelected
      ? 'translateY(-26px) scale(1.12)'
      : `rotate(${arc.angle}deg) scale(${arc.scale})`;
    outerStyle = {
      position: 'absolute',
      left: `calc(50% - ${CARD_W / 2}px)`,
      bottom: 6,
      width: CARD_W,
      height: CARD_H,
      transformOrigin: 'bottom center',
      transform: isJustPlayed ? undefined : transform,
      zIndex: isJustPlayed ? 300 : isSelected ? 200 : arc.z,
      cursor: cardInteractive ? 'pointer' : 'default',
      pointerEvents: isArmed ? 'none' : 'auto',
      transition: isJustPlayed ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
      // base opacity is always 1 — nothing can leave a card stranded invisible
      opacity: 1,
    };
  } else {
    outerStyle = {
      position: 'relative',
      width: CARD_W,
      height: CARD_H,
      flexShrink: 0,
      transform: isSelected ? 'translateY(-10px) scale(1.06)' : undefined,
      // Only animate opacity while a tutorial pre-arm lock is in play, so normal
      // (non-tutorial) power cards keep the exact original transition.
      transition: isLocked
        ? 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s'
        : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
      cursor: isLocked ? 'help' : (cardInteractive ? 'pointer' : 'default'),
      pointerEvents: isArmed ? 'none' : 'auto',
      // Pre-arm lock: read as disabled (dimmed + desaturated) while still tappable.
      opacity: isLocked ? 0.4 : 1,
      filter: isLocked ? 'grayscale(0.5)' : undefined,
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
    ? '0 16px 32px rgba(0,0,0,0.75), 0 0 18px rgba(240,181,74,0.32)'
    : isPower
      ? `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${powerColor}44`
      : isWhot
        ? '0 4px 16px rgba(0,0,0,0.5), 0 0 8px rgba(240,181,74,0.25)'
        : '0 4px 12px rgba(0,0,0,0.5)';

  return (
    <div
      key={card.id}
      data-card-id={card.id}
      onClick={handleClick}
      title={isLocked ? lockedLabel : (isArmed ? armedLabel : (isPower && powerMeta ? `${powerMeta.label} - ${powerMeta.flavor}` : undefined))}
      aria-label={isPower && powerMeta ? `Power card: ${powerMeta.label}` : undefined}
      data-armed={isArmed ? 'true' : undefined}
      className={isJustPlayed ? 'card-play-physics' : undefined}
      style={outerStyle}
    >
      {/* Card face — ALL faces follow the equipped deck skin (#205): a frame
          skin's art ships via --cardface-bg with the shape/number (or power
          icon/label) overlaid in its empty centre. Each fallback is the card
          type's original dedicated gradient. */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: isPower
            ? 'var(--cardface-bg, linear-gradient(160deg, #1a0e08 0%, #0d0805 55%, #090503 100%))'
            : 'var(--cardface-bg, linear-gradient(160deg, #221a12 0%, #16110b 55%, #0f0b07 100%))',
          backgroundSize: '100% 100%',
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
              // Dark drop under the glow keeps the label readable over a
              // bright deck-skin field (kente).
              textShadow: `0 0 7px ${powerColor}88, 0 1px 2px rgba(0,0,0,0.85)`,
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
              // Bright-field skins (kente) set --cardface-ink dark so the
              // number stays legible; dark skins fall back to light text.
              color: isWhot
                ? 'var(--cardface-ink, var(--accent))'
                : 'var(--cardface-ink, var(--text-mid))',
              letterSpacing: '0.06em',
              textShadow: '0 1px 2px rgba(0,0,0,0.45)',
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

// ─── CardHand — true shared-pivot fan with drag-to-rotate (#4, redone) ────────
// Shape cards share ONE bottom-centre pivot and splay by rotation — a real
// semicircle, not a sliding row. Dragging the fan left/right rotates the whole
// arc so the side cards swing up to the readable centre. Selection is bullet-
// proof: NO pointer capture (so a tap's click still reaches the card), cards
// keep base opacity 1 (nothing can strand them invisible), and a real drag is
// suppressed from also firing a tap via a movement flag.
export function CardHand({
  hand,
  powerCardSlot = [],
  selectedCardId,
  onCardClick,
  onPowerCardClick,
  interactive = true,
  powerInteractive = undefined,
  // Tutorial: dim the power card(s) but keep them tappable, so a tap surfaces a
  // "not yet" coach hint instead of arming early (the defensive clinic drill).
  powerLocked = false,
  justPlayedCardId = null,
  // (Module 2.2) shorter fan area on compact/mobile docks.
  fanHeight = 128,
}) {
  const shapeCards = hand.filter((c) => c?.type !== 'power');
  const n = shapeCards.length;

  const MAX_SPREAD = 92;
  const step = n > 1 ? Math.min(12, MAX_SPREAD / (n - 1)) : 0;
  const half = (step * (n - 1)) / 2;

  const [rotateOffset, setRotateOffset] = useState(0);
  // {down, startX, startRot, moved} — moved starts false so the first tap works.
  const dragRef = useRef({ down: false, startX: 0, startRot: 0, moved: false });

  // Keep the offset within range as the hand grows/shrinks.
  useEffect(() => {
    setRotateOffset((o) => Math.max(-half, Math.min(half, o)));
  }, [half]);

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

  // #M6.4 — a 2-card hand must stay draggable/selectable. With the old `n > 2`
  // gate, dropping from 3→2 cards left `dragRef.moved` stuck `true` (onPointerDown
  // no longer ran to reset it), which permanently blocked the click guard and
  // froze selection on the final two cards. Allow drag for any multi-card hand,
  // and only honour the drag-suppression flag while dragging is actually enabled.
  const draggable = n > 1;
  const onPointerDown = (e) => {
    if (!draggable) return;
    dragRef.current = { down: true, startX: e.clientX, startRot: rotateOffset, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.down) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 6) d.moved = true;
    setRotateOffset(Math.max(-half, Math.min(half, d.startRot + dx * 0.32)));
  };
  const endPointer = () => { dragRef.current.down = false; };

  // A real drag must not also select. Only suppress when dragging is enabled —
  // otherwise a stale `moved` from an earlier larger hand could block the tap.
  const guardedCardClick = (id) => { if (draggable && dragRef.current.moved) return; onCardClick && onCardClick(id); };
  const guardedPowerClick = (id) => { if (draggable && dragRef.current.moved) return; onPowerCardClick && onPowerCardClick(id); };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {/* Shape cards fan - wooden cardholder trough.
          `data-tour-id="my-hand-fan"` anchors the tutorial nudge to the ACTUAL
          card fan (not the wider hand wrapper, whose centre is pulled right by the
          power slot - which made the nudge drift right of the cards). */}
      {n > 0 && (
        <div
          data-tour-id="my-hand-fan"
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(20,15,9,0.0) 0%, rgba(14,10,6,0.7) 100%)',
            borderTop: '2px solid var(--border-lit)',
            borderRadius: '0 0 6px 6px',
            // (Module 1.2) Tightened by 6px (18→12): the absolute "drag to browse"
            // label (top:2) now sits closer to the card rack.
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          {/* Swipe affordance - chevrons on the edges + a clear label hint that the
              fan can be dragged/swiped left+right to bring side cards to centre. */}
          {draggable && (
            <>
              <div aria-hidden style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                zIndex: 400, pointerEvents: 'none', color: 'var(--accent)',
                fontSize: 30, lineHeight: 1, fontWeight: 700,
                textShadow: '0 0 8px rgba(0,0,0,0.9)',
                animation: 'swipeHintL 1.5s ease-in-out infinite',
              }}>‹</div>
              <div aria-hidden style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                zIndex: 400, pointerEvents: 'none', color: 'var(--accent)',
                fontSize: 30, lineHeight: 1, fontWeight: 700,
                textShadow: '0 0 8px rgba(0,0,0,0.9)',
                animation: 'swipeHintR 1.5s ease-in-out infinite',
              }}>›</div>
              {/* A small explicit label (absolute, so it never grows the dock). */}
              <div aria-hidden style={{
                position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
                zIndex: 400, pointerEvents: 'none', whiteSpace: 'nowrap',
                fontFamily: "'Space Mono', monospace", fontSize: 7.5, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.8,
                background: 'rgba(16,12,8,0.72)', borderRadius: 999, padding: '1px 7px',
                textShadow: '0 1px 2px rgba(0,0,0,0.9)',
              }}>↔ drag to browse cards</div>
              <style>{'@keyframes swipeHintL{0%,100%{transform:translate(0,-50%);opacity:.55}50%{transform:translate(-4px,-50%);opacity:1}}@keyframes swipeHintR{0%,100%{transform:translate(0,-50%);opacity:.55}50%{transform:translate(4px,-50%);opacity:1}}'}</style>
            </>
          )}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerLeave={endPointer}
            onPointerCancel={endPointer}
            style={{
              position: 'relative',
              height: fanHeight,
              // (Module 1.1) Explicit 4px gap between the "drag to browse" nudge
              // indicator above and the in-hand card row below.
              paddingTop: 4,
              touchAction: 'pan-y',
              cursor: draggable ? 'grab' : 'default',
            }}
          >
            {shapeCards.map((card, index) => {
              const angle = (index - (n - 1) / 2) * step + rotateOffset;
              const centredness = 1 - Math.min(1, Math.abs(angle) / (MAX_SPREAD / 2 + 6));
              return renderOneCard({
                card,
                index,
                isSelected: selectedCardId === card.id,
                isJustPlayed: justPlayedCardId === card.id,
                interactive,
                powerInteractive,
                onCardClick: guardedCardClick,
                onPowerCardClick: guardedPowerClick,
                arc: {
                  angle,
                  scale: 1 + centredness * 0.06,
                  z: Math.round(centredness * 100) + 1,
                },
              });
            })}
          </div>
        </div>
      )}

      {/* Power card slot - separate brass bracket */}
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
              isSelected: selectedCardId === card.id,
              interactive,
              powerInteractive,
              powerLocked,
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
