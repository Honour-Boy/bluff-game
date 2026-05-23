"use client";

/**
 * TurnStartNotice — a simple "it's your turn" acknowledgement shown once at the
 * start of the active player's turn (online mode).
 *
 * There is intentionally NO action choice here. The player dismisses this with
 * OK and then performs any of the three turn actions — play a card, call bluff,
 * activate a power card — in ANY order (and up to all three), straight from the
 * inline controls / hand. Each action locks its own control once spent; this
 * modal never gates them.
 *
 * Props:
 *   visible        — whether to render the notice
 *   isFirstTurn    — note that Call Bluff is unavailable on the very first turn
 *   bluffBlocked   — note that the previous turn was a frozen skip (§1.2), so
 *                    there is nothing to challenge this turn
 *   onAcknowledge  — called when the player taps OK (dismisses the notice)
 */
export function TurnStartNotice({
  visible,
  isFirstTurn,
  bluffBlocked,
  onAcknowledge,
}) {
  if (!visible) return null;

  const hint = bluffBlocked
    ? "The previous turn was frozen, so there's nothing to challenge. Play a card or activate a power card."
    : isFirstTurn
      ? "Play a card or activate a power card. (No bluff on the first turn.)"
      : "Play a card, call the previous player's bluff, or activate a power card — in any order.";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.80)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 8000,
        padding: "0 0 32px 0",
      }}
    >
      <div
        className="card fade-in"
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "0 16px",
          border: "1px solid var(--warning)",
          padding: "24px 20px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--warning)",
            letterSpacing: "0.15em",
            marginBottom: 6,
          }}
        >
          YOUR TURN
        </div>
        <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 18 }}>
          It&apos;s your turn.
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          {hint}
        </div>

        <button
          className="primary"
          onClick={onAcknowledge}
          style={{ width: "100%", padding: "14px", fontSize: 13 }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ─── Waiting status banner ─────────────────────────────────────
/**
 * Shown to non-active players while the active player takes their turn.
 */
export function WaitingForPlayerBanner({ playerName }) {
  if (!playerName) return null;
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        color: "var(--text-dim)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--warning)",
          animation: "pulseDot 1.2s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      <span>
        <strong style={{ color: "var(--text)" }}>{playerName}</strong> is
        taking their turn...
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
