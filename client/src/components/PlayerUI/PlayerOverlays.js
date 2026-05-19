import { Suspense } from 'react';
import { CylinderSVG } from './shared';

export function PlayerSpinOverlay({
  spinData,
  cylinderRotation,
  cylinderAnimating,
  spinComplete,
  isSpinTarget,
  acknowledgeSpinResult,
}) {
  if (!spinData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22,
          letterSpacing: '0.15em',
          color: 'var(--text-dim)',
          marginBottom: 32,
          textAlign: 'center',
        }}
      >
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
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 56,
              letterSpacing: '0.05em',
              lineHeight: 1,
              color: spinData.eliminated ? 'var(--accent2)' : 'var(--alive)',
              textShadow: spinData.eliminated
                ? '0 0 30px rgba(255,74,110,0.7)'
                : '0 0 30px rgba(74,255,128,0.7)',
              marginBottom: 14,
            }}
          >
            {spinData.eliminated ? 'ELIMINATED' : 'SURVIVED'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
            Chamber {spinData.landingChamberIndex + 1} · {spinData.eliminated ? 'bullet found' : 'empty'}
          </div>
          {isSpinTarget ? (
            <button
              className="primary"
              onClick={acknowledgeSpinResult}
              style={{ padding: '10px 32px', fontSize: 14 }}
            >
              Continue
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Waiting for {spinData.spinTargetName} to continue...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PlayerEliminationOverlay({ show, onClose }) {
  if (!show) return null;

  return (
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
          ELIMINATED
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
          You&apos;ve been eliminated.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
          The host will manage the rest of the game.
        </div>
        <button
          className="primary"
          onClick={onClose}
          style={{ padding: '10px 32px' }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function PlayerHowToPlayModal({ show, HowToPlayModal, onClose }) {
  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <HowToPlayModal onClose={onClose} />
    </Suspense>
  );
}
