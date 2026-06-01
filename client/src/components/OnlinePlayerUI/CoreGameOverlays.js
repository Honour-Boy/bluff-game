import { lazy, Suspense } from 'react';
import { CardShape } from '../shared/CardShape';
import { ShapeIcon } from '../shared/ShapeIcon';
import { TurnStartNotice } from '../TurnStartNotice';
import { SpinOverlay } from './SpinOverlay';

const HowToPlayModal = lazy(() =>
  import('../screens/HowToPlayModal').then((module) => ({ default: module.HowToPlayModal })),
);

export function CoreGameOverlays({
  spinData,
  spinComplete,
  cylinderRotation,
  cylinderAnimating,
  isSpinTarget,
  acknowledgeSpinResult,
  pendingCard,
  setPendingCard,
  whotPickerCard,
  setWhotPickerCard,
  setSelectedCardId,
  playCardOnline,
  launchCardFlight,
  justEliminated,
  setJustEliminated,
  showHowToPlay,
  setShowHowToPlay,
  showTurnModal,
  isEliminated,
  showPowerPrompt,
  amSwapHolder,
  peekedCard,
  isFirstTurn,
  bluffBlockedThisTurn,
  setShowTurnModal,
}) {
  // Launch a hand→pile card-fly. The hand card element (data-card-id) is still
  // in the DOM at play time; the discard pile is data-flight-target.
  const flyToPile = (card) => {
    if (!launchCardFlight || !card || typeof document === 'undefined') return;
    const fromEl = document.querySelector(`[data-card-id="${card.id}"]`);
    const toEl = document.querySelector('[data-flight-target]');
    if (fromEl && toEl) {
      launchCardFlight(card, fromEl.getBoundingClientRect(), toEl.getBoundingClientRect());
    }
  };

  return (
    <>
      <SpinOverlay
        spinData={spinData}
        spinComplete={spinComplete}
        cylinderRotation={cylinderRotation}
        cylinderAnimating={cylinderAnimating}
        isSpinTarget={isSpinTarget}
        acknowledgeSpinResult={acknowledgeSpinResult}
      />

      {pendingCard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8600,
            padding: 24,
          }}
        >
          <div className="card fade-in" style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: '28px 24px' }}>
            <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.15em', marginBottom: 16 }}>
              PLAY THIS CARD?
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div
                style={{
                  width: 72,
                  height: 100,
                  background: 'var(--surface2)',
                  border: '2px solid var(--accent)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 0 20px rgba(232,255,74,0.2)',
                }}
              >
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
                    flyToPile(pendingCard);
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
                  flex: 1,
                  padding: '12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={() => {
                  setPendingCard(null);
                  setSelectedCardId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {whotPickerCard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8500,
            padding: 24,
          }}
        >
          <div className="card" style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 6 }}>
              🃏 WHOT CARD
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18 }}>
              Choose the next required shape:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {['circle', 'triangle', 'cross', 'square', 'star'].map((shape) => (
                <button
                  key={shape}
                  onClick={() => {
                    flyToPile({ id: whotPickerCard, type: 'shape', shape: 'whot' });
                    playCardOnline(whotPickerCard, shape);
                    setWhotPickerCard(null);
                    setSelectedCardId(null);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '14px 8px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: 'var(--text)',
                    transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <ShapeIcon shape={shape} size={28} />
                  <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{shape}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setWhotPickerCard(null);
                setSelectedCardId(null);
              }}
              style={{ fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {justEliminated && !spinData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8800,
            padding: 24,
          }}
        >
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
            <button className="primary" onClick={() => setJustEliminated(false)} style={{ padding: '10px 32px' }}>
              Continue Watching
            </button>
          </div>
        </div>
      )}

      {showHowToPlay && (
        <Suspense fallback={null}>
          <HowToPlayModal onClose={() => setShowHowToPlay(false)} initialTab="online" />
        </Suspense>
      )}

      <TurnStartNotice
        visible={showTurnModal && !isEliminated && !showPowerPrompt && !amSwapHolder && !peekedCard}
        isFirstTurn={isFirstTurn}
        bluffBlocked={bluffBlockedThisTurn}
        onAcknowledge={() => setShowTurnModal(false)}
      />
    </>
  );
}
