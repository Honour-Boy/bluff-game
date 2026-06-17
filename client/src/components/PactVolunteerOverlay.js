import { useEffect, useRef, useState } from 'react';
import { PactModalShell, pactPrimaryBtnStyle } from './pact/PactSigil';

// Covenant — The Pact volunteer pull. When a spin is about to fall on your pact
// partner, you get this window to step in and take the bullet yourself. Driven by
// the private `pact_volunteer_prompt` event (held in `pactVolunteer`); a 6s
// deadline runs the countdown and on expiry the original target spins. Gated to
// Covenant rooms.
export function PactVolunteerOverlay({ prompt, onVolunteer, onDismiss }) {
  const deadline = prompt?.deadline || null;
  const totalRef = useRef(deadline ? Math.max(1, deadline - Date.now()) : 6000);
  const [msLeft, setMsLeft] = useState(() => (deadline ? Math.max(0, deadline - Date.now()) : 6000));
  const [busy, setBusy] = useState(false);
  const gold = 'var(--accent, #f0b54a)';

  useEffect(() => {
    if (!prompt) return undefined;
    const tick = () => {
      const left = deadline ? Math.max(0, deadline - Date.now()) : 0;
      setMsLeft(left);
      if (left <= 0) onDismiss?.();
    };
    tick();
    const t = setInterval(tick, 80);
    return () => clearInterval(t);
  }, [prompt, deadline, onDismiss]);

  if (!prompt) return null;

  const secondsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.max(0, Math.min(1, msLeft / totalRef.current));

  const volunteer = () => {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onVolunteer?.()).catch(() => {}).finally(() => onDismiss?.());
  };

  return (
    <PactModalShell title="Take the Bullet?" zIndex={9160}>
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.6 }}>
        The chamber turns for <strong style={{ color: 'var(--text)' }}>{prompt.spinTargetName || 'your partner'}</strong>.
        Step in and spin in their place — or let it fall on them.
      </div>

      <button
        type="button"
        onClick={volunteer}
        disabled={busy || secondsLeft <= 0}
        style={{ ...pactPrimaryBtnStyle(busy), width: '100%', marginBottom: 12 }}
      >
        Volunteer — {secondsLeft}s
      </button>

      {/* Depleting oath-timer bar. */}
      <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${gold}, #ffd980)`, boxShadow: `0 0 8px ${gold}`, transition: 'width 0.1s linear' }} />
      </div>

      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 11, fontStyle: 'italic', color: 'var(--text-dim)' }}>
        {secondsLeft > 0 ? 'Do nothing and the bullet stays with them.' : 'Too late…'}
      </div>
    </PactModalShell>
  );
}
