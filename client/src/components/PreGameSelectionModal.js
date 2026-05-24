"use client";

import { useEffect, useState } from "react";
import { POWER_META, POWER_ICONS } from "./shared/PowerCard";
import { ShapeIcon } from "./shared/ShapeIcon";

// ─── PreGameSelectionModal ────────────────────────────────────
// Shown during the `pre_game` phase once the server opens selection
// (#116). Each player gets their own face-down pool (6 power types +
// 1 random normal card). The player picks ONE blind; on confirm it
// flips to reveal what they claimed and the modal switches to a live
// "waiting for N players" state. A countdown reflects the server's
// 15s auto-resolve deadline — when it lapses the server assigns a
// random pick and advances to play, so no client action is required.
//
// Props
//   pool        : Card[]  — this player's options (face-down until picked)
//   deadline    : number  — ms-epoch auto-resolve time (or null)
//   pendingCount: number  — players still choosing (incl. me until I pick)
//   totalCount  : number  — alive players
//   selectedId  : string  — server-confirmed pick id (null until confirmed)
//   busy        : bool    — a pick request is in flight
//   reviewUntil : number  — ms-epoch end of a private late-pick review buffer
//                           (§2.1); when set the modal stays on the reveal
//                           with its own countdown instead of the waiting copy.
//   onSelect    : (optionId) => Promise<{ success, late, reviewMs }>
//   onLatePick  : (reviewMs, optionId) => void  — raised when the server flags
//                           the pick as late (≥12s in), so the parent can hold
//                           this player's reveal open past the shared finalize.
// ──────────────────────────────────────────────────────────────

function RevealedCard({ card }) {
  if (!card) return null;
  if (card.type === "power") {
    const meta = POWER_META[card.power] || POWER_META.shield;
    const draw = POWER_ICONS[card.power] || POWER_ICONS.shield;
    return (
      <div
        style={{
          width: 116,
          height: 168,
          background: "linear-gradient(160deg, #0d0d10 0%, #08080a 55%, #050507 100%)",
          border: `2px solid ${meta.color}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          boxShadow: `0 0 18px ${meta.color}55, inset 0 0 10px ${meta.color}1a`,
        }}
      >
        <svg viewBox="0 0 100 100" width={56} height={56} aria-label={meta.label} style={{ filter: `drop-shadow(0 0 8px ${meta.color}aa)` }}>
          {draw(meta.color)}
        </svg>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "0.12em", color: meta.color, textTransform: "uppercase", textShadow: `0 0 8px ${meta.color}aa` }}>
          {meta.label}
        </div>
      </div>
    );
  }
  // Normal shape card.
  return (
    <div
      style={{
        width: 116,
        height: 168,
        background: "var(--surface2)",
        border: "2px solid var(--border)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <ShapeIcon shape={card.shape} size={48} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "var(--text)", letterSpacing: "0.08em" }}>
        {card.number}
      </div>
    </div>
  );
}

export function PreGameSelectionModal({
  pool = [],
  deadline = null,
  pendingCount = 0,
  totalCount = 0,
  selectedId = null,
  busy = false,
  reviewUntil = null,
  onSelect,
  onLatePick,
}) {
  const [localPickId, setLocalPickId] = useState(null);
  const confirmedId = selectedId || localPickId;
  const confirmed = !!confirmedId;
  const revealed = confirmed ? pool.find((c) => c.id === confirmedId) : null;

  // Live countdown to the server deadline.
  const [secondsLeft, setSecondsLeft] = useState(null);
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

  // §2.1 — private review buffer countdown for a late pick. Independent of
  // the auto-pick `deadline`; it ticks down the parent-held reviewUntil so the
  // late picker gets a guaranteed look at their card before joining the table.
  const [reviewSecondsLeft, setReviewSecondsLeft] = useState(null);
  useEffect(() => {
    if (!reviewUntil) {
      setReviewSecondsLeft(null);
      return undefined;
    }
    const tick = () => setReviewSecondsLeft(Math.max(0, Math.ceil((reviewUntil - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [reviewUntil]);

  const handlePick = async (optionId) => {
    if (busy || confirmed) return;
    setLocalPickId(optionId); // optimistic — flip to the locked-in view
    const res = await onSelect?.(optionId);
    // Revert if the server rejected the pick (e.g. window already closed).
    if (res && res.success === false) {
      setLocalPickId(null);
      return;
    }
    // §2.1 — a late pick earns a private review buffer; hand the parent the
    // reviewMs + chosen id so it can keep this reveal mounted past finalize.
    if (res && res.late && res.reviewMs) onLatePick?.(res.reviewMs, optionId);
  };

  const accent = "var(--accent)";

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at center, rgba(8,8,12,0.96) 0%, rgba(0,0,0,0.98) 70%)",
        padding: 24,
      }}
    >
      <div
        className="card fade-in"
        style={{
          width: 460,
          maxWidth: "94%",
          textAlign: "center",
          padding: "26px 22px",
          border: `1px solid ${accent}`,
          boxShadow: `0 0 40px ${accent}33`,
        }}
      >
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.26em", color: `${accent}cc`, textTransform: "uppercase", marginBottom: 6 }}>
          Pre-Game Selection
        </div>

        {!confirmed ? (
          <>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: "0.06em", color: "var(--text)", marginBottom: 4 }}>
              Claim your edge
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>
              One card is yours to keep — face-down. Pick on instinct.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))",
                gap: 10,
                marginBottom: 18,
              }}
            >
              {pool.map((card, index) => (
                <button
                  key={card.id}
                  onClick={() => handlePick(card.id)}
                  disabled={busy}
                  aria-label={`Face-down option ${index + 1}`}
                  style={{
                    height: 104,
                    background: "linear-gradient(160deg, #14141a 0%, #0a0a0e 100%)",
                    border: `2px solid ${accent}55`,
                    borderRadius: 8,
                    color: `${accent}aa`,
                    cursor: busy ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 34,
                    letterSpacing: "0.05em",
                    boxShadow: `inset 0 0 12px ${accent}1a`,
                    transition: "transform 0.12s ease, border-color 0.12s ease",
                  }}
                >
                  ?
                </button>
              ))}
            </div>

            {secondsLeft != null && (
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: secondsLeft <= 5 ? "var(--eliminated)" : "var(--text-dim)", letterSpacing: "0.1em" }}>
                Auto-pick in {secondsLeft}s
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: "0.06em", color: "var(--alive)", marginBottom: 14 }}>
              Locked in
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <RevealedCard card={revealed} />
            </div>
            {reviewUntil ? (
              <>
                <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Picked late — here&apos;s a private look before you join. You sit
                  out the opening turn.
                </div>
                {reviewSecondsLeft != null && (
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--accent)", letterSpacing: "0.1em", marginTop: 8 }}>
                    Joining in {reviewSecondsLeft}s
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {pendingCount > 0
                    ? `Waiting for ${pendingCount} ${pendingCount === 1 ? "player" : "players"} to choose…`
                    : "All players ready — dealing in…"}
                </div>
                {totalCount > 0 && (
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.08em", marginTop: 6, opacity: 0.7 }}>
                    {totalCount - pendingCount}/{totalCount} ready
                  </div>
                )}
                {/* §3.1 — the shared 15s selection countdown stays visible AFTER
                    a player locks in, so they always see how long the window has
                    left instead of the timer vanishing on confirm. */}
                {secondsLeft != null && (
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: secondsLeft <= 5 ? "var(--eliminated)" : "var(--text-dim)", letterSpacing: "0.1em", marginTop: 10 }}>
                    {secondsLeft}s left
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
