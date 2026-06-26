import { useState } from 'react';
import { PactModalShell, pactPrimaryBtnStyle, pactGhostBtnStyle } from './pact/PactSigil';

// Covenant - The Pact. A private offer shown to the chosen partner once play
// begins. Accepting seals a secret bond (neither can call the other's bluff,
// either can take the other's spin, surviving as the last two wins together);
// denying strips the proposer's reserved power card. Driven by the reconnect-safe
// `roomState.pact` block ({ offerPending, selectorName }); gated to Covenant rooms.
export function PactOfferOverlay({ selectorName, onRespond }) {
  const [busy, setBusy] = useState(false);

  const respond = (accepted) => {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onRespond?.(accepted)).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <PactModalShell
      title="A Pact is Offered"
      subtitle={<><strong style={{ color: 'var(--accent)' }}>{selectorName || 'Someone'}</strong> reaches across the table.</>}
    >
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.6 }}>
        Seal the bond and neither of you can call the other&apos;s bluff. Stand as
        the last two and you win together - but if one of you falls, the other
        loses a round from their chamber.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={() => respond(true)} disabled={busy} style={{ ...pactPrimaryBtnStyle(busy), flex: 1 }}>
          Seal the Pact
        </button>
        <button type="button" onClick={() => respond(false)} disabled={busy} style={{ ...pactGhostBtnStyle(busy, { danger: true }), flex: 1 }}>
          Refuse
        </button>
      </div>
    </PactModalShell>
  );
}
