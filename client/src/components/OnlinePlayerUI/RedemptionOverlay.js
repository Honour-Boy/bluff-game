'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Redemption Spin prompt (Phase E1). Shown room-wide while phase is
 * `redemption_pending`. The eliminated player who is being offered the spin
 * gets a "Pull the Trigger" button (one chance: survive → rejoin, bullet → out);
 * everyone else sees a waiting notice. The result itself is animated by the
 * normal spin overlay (the server resolves it as a spin_result flagged
 * `redemption`). A server safety timeout takes the spin if the deadline passes,
 * so this overlay can never hang the room.
 */
export default function RedemptionOverlay({ redemption, isMine, onSpin, busy }) {
  const [remaining, setRemaining] = useState(redemption?.msRemaining ?? 0);
  const deadlineRef = useRef(Date.now() + (redemption?.msRemaining ?? 0));

  useEffect(() => {
    deadlineRef.current = Date.now() + (redemption?.msRemaining ?? 0);
    setRemaining(redemption?.msRemaining ?? 0);
    const id = setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [redemption?.msRemaining]);

  if (!redemption) return null;
  const secs = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(9, 7, 5, 0.82)',
        padding: 20,
      }}
    >
      <div
        className="fade-in"
        style={{
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
          padding: '28px 22px',
          borderRadius: 14,
          background: 'linear-gradient(180deg, #1a1208 0%, #120c06 100%)',
          border: '1px solid rgba(155, 28, 28, 0.55)',
          boxShadow: '0 0 28px rgba(155, 28, 28, 0.35)',
          fontFamily: "'Crimson Text', serif",
          color: 'var(--text, #e8ddc7)',
        }}
      >
        <div
          style={{
            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
            fontSize: 22,
            letterSpacing: '0.06em',
            color: 'var(--danger, #9b1c1c)',
            marginBottom: 10,
          }}
        >
          REDEMPTION
        </div>

        {isMine ? (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 18px' }}>
              You were eliminated - but the table grants you one last spin.
              Survive and you rejoin with a fresh chamber and hand. Miss, and
              you&apos;re out for good.
            </p>
            <button
              type="button"
              onClick={onSpin}
              disabled={busy}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid rgba(155, 28, 28, 0.8)',
                background: busy
                  ? 'rgba(60, 20, 20, 0.6)'
                  : 'linear-gradient(180deg, #b3261f 0%, #7d1414 100%)',
                color: '#fff',
                fontFamily: "'Cinzel', serif",
                fontSize: 15,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: busy ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
              }}
            >
              {busy ? 'Spinning…' : 'Pull the Trigger'}
            </button>
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--text-dim, #b9a98a)',
                fontFamily: "'Cinzel', serif",
                letterSpacing: '0.1em',
              }}
            >
              Auto-spins in {secs}s
            </div>
          </>
        ) : (
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>
            <strong>{redemption.playerName || 'A fallen player'}</strong> is
            taking their redemption spin…
          </p>
        )}
      </div>
    </div>
  );
}
