import { useState } from 'react';

// Covenant — The Pact. A private offer shown to the chosen partner once play
// begins. Accepting seals a secret bond (neither can call the other's bluff,
// either can take the other's spin, and surviving as the last two wins together);
// denying strips the proposer's reserved power card. Driven by the reconnect-safe
// `roomState.pact` block ({ offerPending, selectorName }); gated by the caller to
// Covenant rooms only.
export function PactOfferOverlay({ selectorName, onRespond }) {
  const [busy, setBusy] = useState(false);
  const gold = 'var(--accent, #d4af37)';

  const respond = (accepted) => {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onRespond?.(accepted)).catch(() => {}).finally(() => setBusy(false));
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
          🜂 A PACT IS OFFERED
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6, lineHeight: 1.5 }}>
          <strong style={{ color: gold }}>{selectorName || 'Someone'}</strong> reaches across the table.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.55 }}>
          Seal the bond and neither of you can call the other&apos;s bluff. Stand
          as the last two and you win together. But if one of you falls, the other
          loses a round from their chamber.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={() => respond(true)}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 8px',
              minHeight: 46,
              background: gold,
              border: `1px solid ${gold}`,
              borderRadius: 6,
              color: '#1a1206',
              cursor: busy ? 'wait' : 'pointer',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            ACCEPT
          </button>
          <button
            onClick={() => respond(false)}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 8px',
              minHeight: 46,
              background: 'var(--surface2)',
              border: '1px solid var(--text-dim)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: busy ? 'wait' : 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            REFUSE
          </button>
        </div>
      </div>
    </div>
  );
}
