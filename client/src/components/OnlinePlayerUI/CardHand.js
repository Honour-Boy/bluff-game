import { ShapeIcon } from '../shared/ShapeIcon';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

// ─── Single card — physical card in a wooden cardholder ──────────────────────
function renderOneCard({ card, index, totalCards, isSelected, interactive, powerInteractive, onCardClick, onPowerCardClick }) {
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

  // Fan effect: slight rotation and slight vertical stagger
  const fanAngle = totalCards > 1
    ? ((index / (totalCards - 1)) - 0.5) * Math.min(totalCards * 4, 20)
    : 0;
  const fanLift = totalCards > 1
    ? -Math.abs((index / (totalCards - 1)) - 0.5) * 6
    : 0;

  const borderColor = isPower
    ? powerColor
    : isWhot
      ? 'var(--accent)'
      : isSelected
        ? 'var(--accent)'
        : 'var(--border-lit)';

  // Shadow: selected card gets dramatic lift-and-glow
  const boxShadow = isSelected
    ? '0 16px 32px rgba(0,0,0,0.75), 0 0 18px rgba(200,146,46,0.3)'
    : isPower
      ? `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${powerColor}44`
      : isWhot
        ? '0 4px 16px rgba(0,0,0,0.5), 0 0 8px rgba(200,146,46,0.25)'
        : '0 4px 12px rgba(0,0,0,0.5)';

  const transform = isSelected
    ? 'translateY(-22px) rotate(0deg) scale(1.08)'
    : `translateY(${fanLift}px) rotate(${fanAngle}deg)`;

  return (
    <div
      key={card.id}
      onClick={handleClick}
      title={isArmed ? armedLabel : (isPower && powerMeta ? `${powerMeta.label} — ${powerMeta.flavor}` : undefined)}
      aria-label={isPower && powerMeta ? `Power card: ${powerMeta.label}` : undefined}
      data-armed={isArmed ? 'true' : undefined}

      style={{
        position: 'relative',
        width: 58,
        height: 84,
        flexShrink: 0,
        transform,
        zIndex: isSelected ? 100 : index + 1,
        cursor: cardInteractive ? 'pointer' : 'default',
        pointerEvents: isArmed ? 'none' : 'auto',
        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease',
        transformOrigin: 'bottom center',
      }}
    >
      {/* Card face */}
      <div
        style={{
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
          /* Parchment corner marks */
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

// ─── CardHand — physical fan in a wooden cardholder ──────────────────────────
export function CardHand({
  hand,
  powerCardSlot = [],
  selectedCardId,
  onCardClick,
  onPowerCardClick,
  interactive = true,
  powerInteractive = undefined,
}) {
  const shapeCards = hand.filter(c => c?.type !== 'power');

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

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {/* Shape cards fan — wooden cardholder trough */}
      {shapeCards.length > 0 && (
        <div style={{
          flex: '1 1 auto',
          minWidth: 0,
          /* Wooden cardholder trough */
          background: 'linear-gradient(180deg, rgba(16,10,6,0.0) 0%, rgba(12,8,4,0.7) 100%)',
          borderTop: '2px solid var(--border-lit)',
          borderRadius: '0 0 6px 6px',
          paddingTop: 6,
          paddingBottom: 4,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 4,
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 26,
            minWidth: 'max-content',
          }}>
            {shapeCards.map((card, index) =>
              renderOneCard({
                card,
                index,
                totalCards: shapeCards.length,
                isSelected: selectedCardId === card.id,
                interactive,
                powerInteractive,
                onCardClick,
                onPowerCardClick,
              })
            )}
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
              onCardClick,
              onPowerCardClick,
            })
          )}
        </div>
      )}
    </div>
  );
}
