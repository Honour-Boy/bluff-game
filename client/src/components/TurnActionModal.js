'use client';

/**
 * TurnActionModal — shown to the active player when it's their turn (online mode).
 *
 * Props:
 *   visible         — whether to render the modal
 *   isFirstTurn     — disables Call Bluff on the very first turn
 *   bluffUsed       — true once bluff has been called this turn
 *   cardPlayed      — true once a card has been played this turn
 *   prevPlayerName  — name of the previous player (shown in "Call [X] bluff" label)
 *   onCallBluff     — called when player taps "Call Bluff"
 *   onClose         — dismiss modal (player wants to pick a card manually from hand)
 */
export function TurnActionModal({
  visible,
  isFirstTurn,
  bluffUsed,
  cardPlayed,
  prevPlayerName,
  onCallBluff,
  onClose,
}) {
  if (!visible) return null;

  // If card already played, just show "End Turn" reminder and close handle
  if (cardPlayed) return null; // action panel handles End Turn inline

  const canBluff = !isFirstTurn && !bluffUsed && !cardPlayed;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.80)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 8000,
      padding: '0 0 32px 0',
    }}>
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 16px',
          border: '1px solid var(--warning)',
          padding: '24px 20px',
        }}
      >
        <div style={{
          fontSize: 10, color: 'var(--warning)',
          letterSpacing: '0.15em', marginBottom: 6,
        }}>
          YOUR TURN
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 20 }}>
          What would you like to do?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Call Bluff */}
          <button
            className="danger"
            onClick={onCallBluff}
            disabled={!canBluff}
            style={{
              padding: '14px',
              opacity: canBluff ? 1 : 0.35,
              cursor: canBluff ? 'pointer' : 'not-allowed',
              fontSize: 13,
            }}
          >
            ⚠️ Call {prevPlayerName ? `${prevPlayerName}'s` : ''} Bluff
            {isFirstTurn && <span style={{ fontSize: 10, color: 'inherit', marginLeft: 8, opacity: 0.7 }}>(not on first turn)</span>}
          </button>

          {/* Play a card */}
          <button
            className="primary"
            onClick={onClose}
            style={{ padding: '14px', fontSize: 13 }}
          >
            🃏 Play a Card from Hand
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 16, lineHeight: 1.6 }}>
          {canBluff
            ? 'Call bluff if you think the previous player lied about their card, or pick a card from your hand to play.'
            : bluffUsed
              ? 'Bluff called. Now play a card from your hand.'
              : 'Play a card from your hand.'}
        </div>
      </div>
    </div>
  );
}

// ─── Waiting status banner ─────────────────────────────────────
/**
 * Shown to non-active players while the active player is choosing.
 */
export function WaitingForPlayerBanner({ playerName }) {
  if (!playerName) return null;
  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 12,
      color: 'var(--text-dim)',
    }}>
      <span style={{
        display: 'inline-block',
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--warning)',
        animation: 'pulseDot 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} />
      <span>
        <strong style={{ color: 'var(--text)' }}>{playerName}</strong> is choosing an action...
      </span>
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
