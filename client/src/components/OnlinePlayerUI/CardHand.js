import { ShapeIcon } from '../shared/ShapeIcon';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

function renderOneCard({ card, index, isSelected, interactive, powerInteractive, onCardClick, onPowerCardClick }) {
  const isPower = card.type === 'power';
  const isWhot = !isPower && card.shape === 'whot';
  const powerMeta = isPower ? POWER_META[card.power] : null;
  const powerColor = powerMeta?.color || 'var(--accent)';
  const drawPowerIcon = isPower ? (POWER_ICONS[card.power] || POWER_ICONS.shield) : null;
  const isArmed = card.armed === true;
  // Playtest §1.1 — power cards can carry their own interactivity flag so they
  // stay tappable after a shape card has been played this turn. Falls back to
  // `interactive` when not supplied (every existing caller keeps prior behaviour).
  const effectiveInteractive = isPower
    ? (powerInteractive === undefined ? interactive : powerInteractive)
    : interactive;
  const cardInteractive = effectiveInteractive && !isArmed;
  const armedLabel = 'Activated — awaiting trigger';

  // #139 — power cards are activated through their own confirmation flow and
  // must NEVER be routed through the normal play path (onCardClick). Shape
  // cards keep the play flow; power cards open the activation modal.
  const handleClick = () => {
    if (!cardInteractive) return;
    if (isPower) onPowerCardClick && onPowerCardClick(card.id);
    else onCardClick && onCardClick(card.id);
  };

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

  return (
    <div
      key={card.id}
      onClick={handleClick}
      title={isArmed ? armedLabel : powerTooltip}
      aria-label={isPower && powerMeta ? `Power card: ${powerMeta.label}` : undefined}
      data-armed={isArmed ? 'true' : undefined}
      style={{
        position: 'relative',
        width: 58,
        height: 82,
        flexShrink: 0,
        transform: isSelected ? 'translateY(-16px) scale(1.05)' : 'none',
        zIndex: isSelected ? 100 : index + 1,
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
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 10,
                letterSpacing: '0.12em',
                color: powerColor,
                textTransform: 'uppercase',
                textShadow: `0 0 6px ${powerColor}aa`,
                lineHeight: 1,
              }}
            >
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
            <div
              style={{
                fontSize: 10,
                color: isWhot ? 'var(--accent)' : 'var(--text-dim)',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              {isWhot ? 'WHOT' : card.number}
            </div>
          </>
        )}
      </div>
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
            boxShadow: `0 0 8px ${powerColor}99`,
            pointerEvents: 'none',
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" aria-hidden>
            <path
              d="M7 10V7a5 5 0 0 1 10 0v3"
              fill="none"
              stroke={powerColor}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect x="5" y="10" width="14" height="9" rx="2" fill={powerColor} />
          </svg>
        </span>
      )}
    </div>
  );
}

export function CardHand({ hand, powerCardSlot = [], selectedCardId, onCardClick, onPowerCardClick, interactive = true, powerInteractive = undefined }) {
  const shapeCards = hand.filter(c => c?.type !== 'power');

  if (shapeCards.length === 0 && powerCardSlot.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)', fontSize: 12 }}>
        No cards in hand
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {shapeCards.length > 0 && (
        <div style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 6,
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 22,
              minWidth: 'max-content',
            }}
          >
            {shapeCards.map((card, index) =>
              renderOneCard({ card, index, isSelected: selectedCardId === card.id, interactive, powerInteractive, onCardClick, onPowerCardClick })
            )}
          </div>
        </div>
      )}

      {powerCardSlot.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>POWER</div>
          {powerCardSlot.map((card, index) =>
            renderOneCard({ card, index, isSelected: selectedCardId === card.id, interactive, powerInteractive, onCardClick, onPowerCardClick })
          )}
        </div>
      )}
    </div>
  );
}
