import { useEffect, useState } from 'react';

// Covenant — The Pact volunteer pull. When a spin is about to fall on your pact
// partner, you get this window to step in and take the bullet yourself. Driven by
// the private `pact_volunteer_prompt` event (held in `pactVolunteer`); a 6s
// deadline runs the countdown and on expiry the original target spins. Gated by
// the caller to Covenant rooms.
export function PactVolunteerOverlay({ prompt, onVolunteer, onDismiss }) {
  const deadline = prompt?.deadline || null;
  const [secondsLeft, setSecondsLeft] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 6,
  );
  const [busy, setBusy] = useState(false);
  const gold = 'var(--accent, #d4af37)';

  useEffect(() => {
    if (!prompt) return undefined;
    const tick = () => {
      const left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
      setSecondsLeft(left);
      if (left <= 0) onDismiss?.();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [prompt, deadline, onDismiss]);

  if (!prompt) return null;

  const volunteer = () => {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onVolunteer?.()).catch(() => {}).finally(() => onDismiss?.());
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9160,
        padding: 24,
      }}
    >
      <div
        className="card fade-in"
        style={{
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          padding: '22px 20px',
          border: `1px solid ${gold}`,
          boxShadow: `0 0 26px ${gold}55`,
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: gold, marginBottom: 6 }}>
          🜂 TAKE THE BULLET?
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.55 }}>
          The chamber turns for <strong style={{ color: 'var(--text)' }}>{prompt.spinTargetName || 'your partner'}</strong>.
          Step in and spin in their place — or let it fall on them.
        </div>
        <button
          onClick={volunteer}
          disabled={busy || secondsLeft <= 0}
          style={{
            width: '100%',
            padding: '13px 8px',
            minHeight: 46,
            background: gold,
            border: `1px solid ${gold}`,
            borderRadius: 6,
            color: '#1a1206',
            cursor: busy ? 'wait' : 'pointer',
            fontWeight: 700,
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}
        >
          VOLUNTEER ({secondsLeft}s)
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {secondsLeft > 0 ? 'Do nothing and the bullet stays with them.' : 'Too late…'}
        </div>
      </div>
    </div>
  );
}
