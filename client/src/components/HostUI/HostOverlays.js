import { Suspense } from 'react';
import { CylinderSVG } from './shared';

export function HostConfirmModal({ confirmAction, onCancel, onConfirm }) {
  if (!confirmAction) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 8000,
      }}
    >
      <div className="card fade-in" style={{ maxWidth: 360, width: '90%', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, marginBottom: 12 }}>
          Confirm Round Win
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 24 }}>
          Declare this player the round winner?
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="success" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export function HostSpinOverlay({
  spinData,
  spinComplete,
  cylinderRotation,
  cylinderAnimating,
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
          <button
            className="primary"
            onClick={acknowledgeSpinResult}
            style={{ padding: '10px 32px', fontSize: 14 }}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

export function HostHowToPlayModal({ showHowToPlay, onClose, HowToPlayModal }) {
  if (!showHowToPlay) return null;

  return (
    <Suspense fallback={null}>
      <HowToPlayModal onClose={onClose} />
    </Suspense>
  );
}
