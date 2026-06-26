import { useState } from 'react';
import { PactModalShell, pactGhostBtnStyle } from './pact/PactSigil';

// Covenant - The Pact selector. During pre_game ONE player is secretly chosen to
// forge a bond; instead of the normal power-card pick they choose a partner here.
// A sensible random default is already locked in server-side, so this is an
// override: pick whoever you trust (or close it and keep the default). Driven by
// `roomState.pact.amSelector` during the pre_game phase; gated to Covenant rooms.
export function PactSelectorOverlay({ players, defaultTargetId, onChoose, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(defaultTargetId || null);
  const gold = 'var(--accent, #f0b54a)';

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
    <PactModalShell
      title="Forge a Pact"
      subtitle="You alone may forge a secret bond this round."
    >
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.6 }}>
        Choose the one you&apos;ll stand with. They decide whether to accept once
        the cards are dealt.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 10, marginBottom: 16 }}>
        {(players || []).map((player) => {
          const active = chosen === player.id;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => pick(player.id)}
              disabled={busy}
              style={{
                padding: '13px 8px',
                minHeight: 48,
                background: active
                  ? 'linear-gradient(180deg, #ffd980 0%, #f0b54a 48%, #c8902f 100%)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${gold}${active ? '' : '55'}`,
                borderRadius: 7,
                color: active ? '#1a1206' : 'var(--text)',
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: "'Cinzel', serif",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.04em',
                boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 14px rgba(240,181,74,0.25)' : 'none',
                transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {player.username}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onDismiss?.()}
        disabled={busy}
        style={{ ...pactGhostBtnStyle(busy), width: '100%' }}
      >
        Keep my chosen partner
      </button>
    </PactModalShell>
  );
}
