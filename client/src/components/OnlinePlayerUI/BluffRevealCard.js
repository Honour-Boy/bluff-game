import { useEffect, useState } from 'react';
import { ShapeIcon } from '../shared/ShapeIcon';

// ─── BluffRevealCard — the challenged card, flipped in 3D ─────────────────────
// (Module 3) On a bluff challenge the played card is docked next to the Required
// template and flipped face-up (preserve-3d / rotateY) for every client at once.
// It stays face-up until the liable player pulls the trigger, then reverse-flips
// face-down. `revealed` drives the flip; we start face-down on mount so entering
// the reveal animates the flip-up, and flipping `revealed` back to false plays
// the reverse animation. `outcomeColor` tints the face border (match vs lie).
export function BluffRevealCard({ card, revealed, outcomeColor = 'var(--accent)' }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    // Defer one frame so the initial (face-down) state paints before we flip —
    // otherwise the CSS transition has no "from" state and the flip won't animate.
    const id = requestAnimationFrame(() => setFlipped(!!revealed));
    return () => cancelAnimationFrame(id);
  }, [revealed]);

  const label = card
    ? (card.shape === 'whot' ? 'WHOT' : card.shape)
    : 'None';

  return (
    <div style={{ width: 66, height: 92, perspective: 700 }}>
      <div className={`reveal-card-3d${flipped ? ' flipped' : ''}`}>
        {/* Face-down leather back */}
        <div className="reveal-card-face reveal-card-back" aria-hidden="true">
          <svg width="40" height="58" viewBox="0 0 44 64" style={{ opacity: 0.3 }} aria-hidden>
            <rect x="4" y="4" width="36" height="56" rx="3" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
            <polygon points="22,16 28,24 22,32 16,24" fill="none" stroke="var(--accent)" strokeWidth="0.7" />
          </svg>
        </div>

        {/* Face-up: the actual played card (or a "no card" state) */}
        <div
          className="reveal-card-face reveal-card-front"
          style={{ borderColor: outcomeColor, boxShadow: `0 0 16px ${outcomeColor}55` }}
        >
          {card ? (
            <>
              <ShapeIcon shape={card.shape} size={26} />
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: 'var(--text)', lineHeight: 1 }}>
                {card.number}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              No card
            </div>
          )}
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
