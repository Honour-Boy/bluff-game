import { useState } from 'react';

// Covenant — The Pact selector. During pre_game ONE player is secretly chosen to
// forge a bond; instead of the normal power-card pick they choose a partner here.
// A sensible random default is already locked in server-side, so this is an
// override: pick whoever you trust (or close it and keep the default). Driven by
// `roomState.pact.amSelector` during the pre_game phase; gated to Covenant rooms.
export function PactSelectorOverlay({ players, defaultTargetId, onChoose, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(defaultTargetId || null);
  const gold = 'var(--accent, #d4af37)';

  const pick = (id) => {
    if (busy) return;
    setBusy(true);
    setChosen(id);
    Promise.resolve(onChoose?.(id)).catch(() => {}).finally(() => {
      setBusy(false);
      onDismiss?.();
    });
  };

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
          border: `1px solid ${gold}`,
          boxShadow: `0 0 26px ${gold}55`,
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.12em', color: gold, marginBottom: 6 }}>
          🜂 FORGE A PACT
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.55 }}>
          You&apos;ve been chosen to offer a secret bond. Pick the player you&apos;ll
          stand with — they&apos;ll decide whether to accept once the round begins.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
          {(players || []).map((player) => (
            <button
              key={player.id}
              onClick={() => pick(player.id)}
              disabled={busy}
              style={{
                padding: '12px 8px',
                minHeight: 44,
                background: chosen === player.id ? gold : 'var(--surface2)',
                border: `1px solid ${gold}66`,
                borderRadius: 6,
                color: chosen === player.id ? '#1a1206' : 'var(--text)',
                cursor: busy ? 'wait' : 'pointer',
                fontSize: 12,
                letterSpacing: '0.04em',
                fontWeight: chosen === player.id ? 700 : 400,
              }}
            >
              {player.username}
            </button>
          ))}
        </div>
        <button
          onClick={() => onDismiss?.()}
          disabled={busy}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: 11,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Keep my default partner
        </button>
      </div>
    </div>
  );
}
