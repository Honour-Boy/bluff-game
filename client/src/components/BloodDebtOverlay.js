import { useEffect, useMemo, useState } from 'react';

// Covenant — Blood Debt. The just-eliminated player (killed by a correct bluff
// call's spin) names which alive player carries their debt: the next time that
// player calls a bluff, an extra "debt spin" fires on them. Rendered from the
// private `blood_debt_assign` event (held in `bloodDebtPrompt`). A 10s deadline
// drives the countdown; on expiry or pick the overlay clears itself. The server
// defaults the debt to the bluff caller if the window lapses.
//
// Gated by the caller to Covenant rooms — no Blood Debt UI elsewhere.
export function BloodDebtOverlay({ prompt, onPick, onDismiss }) {
  const deadline = prompt?.deadline || null;
  const [secondsLeft, setSecondsLeft] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 10,
  );
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    if (Array.isArray(prompt?.alivePlayerNames)) return prompt.alivePlayerNames;
    return (prompt?.alivePlayerIds || []).map((id) => ({ id, username: id }));
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return undefined;
    const tick = () => {
      const left = deadline
        ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        : 0;
      setSecondsLeft(left);
      if (left <= 0) onDismiss?.();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [prompt, deadline, onDismiss]);

  if (!prompt) return null;

  const pick = (id) => {
    if (busy) return;
    setBusy(true);
    onPick?.(id);
    onDismiss?.();
  };

  const blood = 'var(--eliminated, #c0392b)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9150,
        padding: 24,
      }}
    >
      <div
        className="card fade-in"
        style={{
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          padding: '24px 20px',
          border: `1px solid ${blood}`,
          boxShadow: `0 0 26px ${blood}55`,
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.12em', color: blood, marginBottom: 6 }}>
          ⛧ BLOOD DEBT
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.55 }}>
          They put you in the ground. Choose who carries your debt — when they
          next call a bluff, the chamber turns for them too.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
          {targets.map((player) => (
            <button
              key={player.id}
              onClick={() => pick(player.id)}
              disabled={busy}
              style={{
                padding: '12px 8px',
                minHeight: 44,
                background: 'var(--surface2)',
                border: `1px solid ${blood}66`,
                borderRadius: 6,
                color: 'var(--text)',
                cursor: busy ? 'wait' : 'pointer',
                fontSize: 12,
                letterSpacing: '0.04em',
              }}
            >
              {player.username}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {secondsLeft > 0
            ? `${secondsLeft}s — or the debt falls to the one who pulled the trigger.`
            : 'The debt is sealed…'}
        </div>
      </div>
    </div>
  );
}
