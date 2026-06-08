import { useEffect, useState } from 'react';
import { POWER_META, POWER_ICONS } from '../shared/PowerCard';

// ─── BluffInterceptOverlay (§1.1) ─────────────────────────────
// Shown during the `bluff_intercept_pending` phase. When a bluff is called,
// the accused (the previous player, OFF-turn) gets a short window to arm a
// DEFENSIVE power card in response before the bluff resolves:
//   • The accused (amAccused) sees a full-screen modal with their armable
//     cards + a Pass option + an 8s countdown. Arming or passing closes the
//     window and the bluff resolves immediately.
//   • Everyone else sees a small "deciding…" banner.
//
// Props
//   pending      : serialized room.pendingBluffIntercept (or null)
//   bluffIntercept: (cardId|null) => Promise   — arm-or-pass action
// ──────────────────────────────────────────────────────────────

const ACCENT = 'var(--warning)';

function ArmCardButton({ option, busy, onArm }) {
  const meta = POWER_META[option.power] || POWER_META.shield;
  const draw = POWER_ICONS[option.power] || POWER_ICONS.shield;
  return (
    <button
      onClick={() => onArm(option.cardId)}
      disabled={busy}
      title={meta.flavor}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: 104,
        height: 150,
        background: 'linear-gradient(160deg, #0d0d10 0%, #08080a 55%, #050507 100%)',
        border: `2px solid ${meta.color}`,
        borderRadius: 8,
        cursor: busy ? 'wait' : 'pointer',
        boxShadow: `0 0 16px ${meta.color}55, inset 0 0 10px ${meta.color}1a`,
      }}
    >
      <svg viewBox="0 0 100 100" width={48} height={48} aria-label={meta.label} style={{ filter: `drop-shadow(0 0 8px ${meta.color}aa)` }}>
        {draw(meta.color)}
      </svg>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.12em', color: meta.color, textTransform: 'uppercase' }}>
        {meta.label}
      </div>
    </button>
  );
}

export function BluffInterceptOverlay({ pending, bluffIntercept, tutorial = false }) {
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const deadline = pending?.deadline || null;
  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null);
      return undefined;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!pending) return null;

  const amAccused = !!pending.amAccused;
  const options = pending.options || [];

  const respond = async (cardId) => {
    if (busy) return;
    setBusy(true);
    const res = await bluffIntercept?.(cardId);
    // On failure (e.g. window already closed) drop the busy lock so the player
    // can retry within whatever time is left.
    if (res && res.success === false) setBusy(false);
  };

  // Bystanders: lightweight "deciding" banner.
  if (!amAccused) {
    return (
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 'calc(38vh + 110px)',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 8650,
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        <div className="card" style={{ maxWidth: 340, textAlign: 'center', padding: '14px 18px', border: `1px solid ${ACCENT}`, background: 'rgba(20,16,4,0.96)' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: ACCENT, marginBottom: 4 }}>
            BLUFF CALLED — DEFENDING?
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {pending.accuserName || 'Someone'} challenged {pending.accusedName || 'a player'}, who may play a defence…
          </div>
        </div>
      </div>
    );
  }

  // The accused: full decision modal.
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9300,
        padding: 24,
      }}
    >
      <div className="card fade-in" style={{ maxWidth: 460, width: '100%', textAlign: 'center', padding: '26px 22px', border: `1px solid ${ACCENT}`, boxShadow: `0 0 40px ${ACCENT}33` }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.22em', color: `${ACCENT}cc`, textTransform: 'uppercase', marginBottom: 6 }}>
          Bluff Called On You
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: 'var(--text)', marginBottom: 8, letterSpacing: '0.05em' }}>
          {pending.accuserName || 'A player'} is challenging you.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.55 }}>
          {tutorial
            ? 'Tap your power card below to defend — take your time, the coach has you.'
            : 'Play a defensive card to respond before it resolves — or pass and let the call stand.'}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          {options.map((option) => (
            <ArmCardButton key={option.cardId} option={option} busy={busy} onArm={respond} />
          ))}
        </div>

        {/* In the clinic there's no auto-timeout and passing would skip the
            lesson, so hide both — the learner must use the power. */}
        {!tutorial && (
          <button
            onClick={() => respond(null)}
            disabled={busy}
            style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              textDecoration: 'underline',
              marginBottom: 8,
            }}
          >
            Pass — let the call resolve
          </button>
        )}

        {!tutorial && secondsLeft != null && (
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: secondsLeft <= 3 ? 'var(--eliminated)' : 'var(--text-dim)', letterSpacing: '0.1em' }}>
            Auto-resolves in {secondsLeft}s
          </div>
        )}
      </div>
    </div>
  );
}
