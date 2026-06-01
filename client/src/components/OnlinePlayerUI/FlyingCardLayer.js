import { useCallback, useState } from 'react';
import { ShapeIcon } from '../shared/ShapeIcon';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

// ─── Card-fly animation (#5, done properly) ───────────────────────────────────
// A fixed-position clone of the played card flies from its spot in the hand to
// the centre discard pile, then fades. Because it's rendered fixed at the app
// root (top z-index) it can never be clipped by the hand trough's overflow —
// the problem that sank the earlier in-trough attempt.
//
// Usage:
//   const { flights, launch } = useCardFlight();
//   <FlyingCardLayer flights={flights} />
//   launch(card, fromRect, toRect)   // rects from getBoundingClientRect()

let _flightKey = 0;

export function useCardFlight() {
  const [flights, setFlights] = useState([]);
  // opts: { mode: 'out'|'in', back: boolean }. 'out' (default) arcs to the
  // target and fades (card → pile/deck); 'in' sails from the source and LANDS
  // face-down (deck → hand, used by the global-reshuffle deal-back).
  const launch = useCallback((card, from, to, opts = {}) => {
    if (!from || !to) return;
    const key = ++_flightKey;
    const mode = opts.mode === 'in' ? 'in' : 'out';
    const back = !!opts.back;
    setFlights((list) => [...list, { key, card, from, to, mode, back }]);
    // Remove once the CSS animation (~0.62s) has finished.
    setTimeout(() => setFlights((list) => list.filter((f) => f.key !== key)), 700);
  }, []);
  return { flights, launch };
}

// Leather card back — used while a card is travelling to/from the deck face-down.
function FlyingCardBack() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(135deg, #1e1410 0%, #120d09 50%, #1a1108 100%)',
      border: '1px solid var(--border-lit)',
      borderRadius: 7,
      boxShadow: '0 10px 26px rgba(0,0,0,0.6)',
      position: 'relative', overflow: 'hidden',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 44 64" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} aria-hidden>
        <rect x="4" y="4" width="36" height="56" rx="3" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
        <polygon points="22,16 28,24 22,32 16,24" fill="none" stroke="var(--accent)" strokeWidth="0.7" />
      </svg>
    </div>
  );
}

function FlyingCardFace({ card }) {
  const isPower = card.type === 'power';
  const isWhot = !isPower && card.shape === 'whot';
  const powerMeta = isPower ? POWER_META[card.power] : null;
  const powerColor = powerMeta?.color || 'var(--accent)';
  const drawPowerIcon = isPower ? (POWER_ICONS[card.power] || POWER_ICONS.shield) : null;
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: isPower
        ? 'linear-gradient(160deg, #1a0e08 0%, #0d0805 55%, #090503 100%)'
        : 'linear-gradient(160deg, #221a12 0%, #16110b 55%, #0f0b07 100%)',
      border: `2px solid ${isPower ? powerColor : isWhot ? 'var(--accent)' : 'var(--border-lit)'}`,
      borderRadius: 7,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      boxShadow: '0 10px 26px rgba(0,0,0,0.6), 0 0 16px rgba(240,181,74,0.25)',
    }}>
      {isPower ? (
        <svg viewBox="0 0 100 100" width={26} height={26} aria-hidden style={{ filter: `drop-shadow(0 0 5px ${powerColor}88)` }}>
          {drawPowerIcon(powerColor)}
        </svg>
      ) : (
        <>
          <ShapeIcon shape={card.shape} size={22} color={isWhot ? 'var(--accent)' : undefined} />
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700, color: isWhot ? 'var(--accent)' : 'var(--text-mid)', letterSpacing: '0.06em' }}>
            {isWhot ? 'WHOT' : card.number}
          </div>
        </>
      )}
    </div>
  );
}

export function FlyingCardLayer({ flights }) {
  if (!flights || flights.length === 0) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9700 }} aria-hidden="true">
      {flights.map(({ key, card, from, to, mode, back }) => {
        const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
        const rot = (key % 2 === 0 ? 1 : -1) * (6 + (key % 7));
        return (
          <div
            key={key}
            className={mode === 'in' ? 'card-fly-in' : 'card-fly'}
            style={{
              position: 'fixed',
              left: from.left,
              top: from.top,
              width: from.width || 58,
              height: from.height || 84,
              '--fly-dx': `${dx}px`,
              '--fly-dy': `${dy}px`,
              '--fly-rot': `${rot}deg`,
            }}
          >
            {back ? <FlyingCardBack /> : <FlyingCardFace card={card} />}
          </div>
        );
      })}
    </div>
  );
}
