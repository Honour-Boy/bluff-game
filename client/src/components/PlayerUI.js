"use client";

"use client";

import { useState, useEffect, useRef } from "react";
import { CardShape } from "./CardShape";
import { ShapeIcon } from "./ShapeIcon";

import { ActionLog } from "./ActionLog";
import { HowToPlayModal } from "./HowToPlayModal";

// SVG cylinder constants
const CYL = 200; // SVG viewBox size
const CX = 100; // center x
const CY = 100; // center y
const ORBIT = 58; // chamber orbit radius
const CHAM_R = 20; // chamber circle radius

function CylinderSVG({
  bulletChambers,
  landingChamberIndex,
  rotation,
  animating,
  spinComplete,
}) {
  const chambers = [0, 1, 2, 3, 4, 5].map((i) => {
    const angleDeg = i * 60 - 90; // 0 → top (12 o'clock)
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: CX + ORBIT * Math.cos(angleRad),
      y: CY + ORBIT * Math.sin(angleRad),
      isBullet: bulletChambers.has(i),
      isLanding: spinComplete && i === landingChamberIndex,
    };
  });

  return (
    <div style={{ position: "relative", width: CYL, height: CYL }}>
      {/* Fixed pointer triangle at top */}
      <svg
        width={CYL}
        height={CYL}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <polygon
          points={`${CX},${CY - ORBIT - CHAM_R + 2} ${CX - 9},${CY - ORBIT - CHAM_R - 14} ${CX + 9},${CY - ORBIT - CHAM_R - 14}`}
          fill="var(--accent)"
        />
      </svg>

      {/* Rotating cylinder */}
      <svg
        width={CYL}
        height={CYL}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: animating
            ? "transform 8s cubic-bezier(0.1, 0, 0.2, 1)"
            : "none",
        }}
      >
        {/* Cylinder body */}
        <circle
          cx={CX}
          cy={CY}
          r={ORBIT + CHAM_R + 8}
          fill="#111118"
          stroke="#2a2a35"
          strokeWidth={2}
        />

        {/* Chambers */}
        {chambers.map((ch, i) => (
          <g key={i}>
            {/* Outer glow ring for landing chamber */}
            {ch.isLanding && (
              <circle
                cx={ch.x}
                cy={ch.y}
                r={CHAM_R + 5}
                fill="none"
                stroke={ch.isBullet ? "var(--accent2)" : "var(--alive)"}
                strokeWidth={3}
                opacity={0.8}
              />
            )}
            {/* Chamber body */}
            <circle
              cx={ch.x}
              cy={ch.y}
              r={CHAM_R}
              fill={ch.isBullet ? "#3a0808" : "#0d0d18"}
              stroke={
                ch.isLanding
                  ? ch.isBullet
                    ? "var(--accent2)"
                    : "var(--alive)"
                  : "#333"
              }
              strokeWidth={ch.isLanding ? 2.5 : 1.5}
            />
            {/* Bullet primer */}
            {ch.isBullet && (
              <circle
                cx={ch.x}
                cy={ch.y}
                r={CHAM_R * 0.42}
                fill={ch.isLanding ? "#ff3344" : "#882222"}
              />
            )}
          </g>
        ))}

        {/* Center pin */}
        <circle
          cx={CX}
          cy={CY}
          r={9}
          fill="#222230"
          stroke="#444"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

// ─── Share button ─────────────────────────────────────────────
function ShareButton({ roomCode, senderName }) {
  const [showFallback, setShowFallback] = useState(false);
  const message = senderName
    ? `Join ${senderName}'s Bluff game! Room code: ${roomCode}`
    : `Join my Bluff game! Room code: ${roomCode}`;
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}?join=${roomCode}`
      : "";
  const fullText = `${message}\n${url}`;

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join my Bluff game!",
          text: message,
          url,
        });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    setShowFallback((f) => !f);
  };

  const enc = encodeURIComponent;
  const links = [
    { label: "💬 WhatsApp", href: `https://wa.me/?text=${enc(fullText)}` },
    {
      label: "✈️ Telegram",
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}`,
    },
    { label: "💬 SMS", href: `sms:?body=${enc(fullText)}` },
    {
      label: "📧 Email",
      href: `mailto:?subject=${enc("Join my Bluff game!")}&body=${enc(fullText)}`,
    },
  ];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={handleShare}
        style={{
          fontSize: 11,
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          background: "rgba(232,255,74,0.04)",
          padding: "5px 12px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.06em",
        }}
      >
        🔗 Share Room
      </button>
      {showFallback && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 8,
            zIndex: 2000,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 170,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setShowFallback(false)}
              style={{
                display: "block",
                padding: "7px 10px",
                color: "var(--text)",
                fontSize: 12,
                textDecoration: "none",
                borderRadius: 4,
                background: "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => setShowFallback(false)}
            style={{
              marginTop: 2,
              padding: "5px",
              fontSize: 11,
              color: "var(--text-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function PlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  callBluff,
  playCard,
  endTurn,
  playerSpin,
  leaveGame,
  acknowledgeSpinResult,
  spinDismissed,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Spin overlay state
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);

  // Elimination popup state
  const prevStatusRef = useRef(null);
  const [justEliminated, setJustEliminated] = useState(false);

  // When spin target clicks Continue → spinDismissed fires → auto-close for all players
  useEffect(() => {
    if (spinDismissed && spinData) {
      setSpinData(null);
    }
  }, [spinDismissed]); // eslint-disable-line

  // Detect transition from alive → eliminated
  useEffect(() => {
    const currentStatus = myPlayer?.status || null;
    if (prevStatusRef.current === "alive" && currentStatus === "eliminated") {
      setTimeout(() => setJustEliminated(true), 400);
    }
    prevStatusRef.current = currentStatus;
  }, [myPlayer?.status]); // eslint-disable-line

  // 15s auto-advance — dismiss overlay if spin target hasn't clicked Continue
  useEffect(() => {
    if (!spinComplete || !spinData) return;
    const amTarget = spinData.spinTargetId === myPlayer?.id;
    const timer = setTimeout(() => {
      if (amTarget) acknowledgeSpinResult?.();
      else setSpinData(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [spinComplete]); // eslint-disable-line

  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== "spin_result") return;

    // Deduplicate — only trigger once per unique spin
    const actionKey = `${action.spinTargetId}:${JSON.stringify(action.chamber)}`;
    if (lastSpinKeyRef.current === actionKey) return;
    lastSpinKeyRef.current = actionKey;

    const {
      spinIndex,
      eliminated,
      spinTargetName,
      spinTargetId: targetId,
      chamber,
    } = action;
    const landingChamberIndex = spinIndex ?? 0;
    // Chamber i starts at (i*60 - 90)°. To land at top pointer: finalAngle = 10*360 - spinIndex*60
    const finalAngle = 10 * 360 - landingChamberIndex * 60;
    const bulletChambers = new Set(
      (chamber || [])
        .map((v, i) => (v === "bullet" ? i : -1))
        .filter((i) => i !== -1),
    );

    // Reset first, then animate in next frames
    setCylinderRotation(0);
    setCylinderAnimating(false);
    setSpinComplete(false);
    setSpinData({
      spinIndex: landingChamberIndex,
      eliminated,
      spinTargetName,
      spinTargetId: targetId,
      bulletChambers,
      landingChamberIndex,
      finalAngle,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCylinderRotation(finalAngle);
        setCylinderAnimating(true);
      });
    });

    const timer = setTimeout(() => setSpinComplete(true), 8000);
    return () => clearTimeout(timer);
  }, [roomState?.lastAction]);

  if (!roomState || !myPlayer) {
    return (
      <div
        style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}
      >
        Connecting to game...
      </div>
    );
  }

  const {
    players,
    turnOrder,
    currentPlayerId,
    currentCardType,
    phase,
    roundNumber,
    lastAction,
    bluffUsedThisTurn,
    cardPlayedThisTurn,
    spinTargetId,
    isFirstTurn,
  } = roomState;

  const currentPlayer = players?.find((p) => p.id === currentPlayerId);
  const isEliminated = myPlayer.status === "eliminated";
  const isPlaying = phase === "playing";
  const isLobby = phase === "lobby";
  const isBluffResolution = phase === "bluff_resolution";
  const isSpinPending = phase === "spin_pending";
  const isRoundEnd = phase === "round_end";
  const isGameOver = phase === "game_over";

  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;
  const spinTargetPlayer = isSpinPending
    ? players?.find((p) => p.id === spinTargetId)
    : null;

  let actionHint = "";
  if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint = isFirstTurn
      ? "Play your card face-down. (No bluff allowed on the first turn.)"
      : "Call bluff on the previous player's card, or play your card face-down.";
  } else if (bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint =
      "Bluff already called this turn. Now play your card face-down.";
  } else if (cardPlayedThisTurn) {
    actionHint = "Card played. End your turn when ready.";
  }

  const isSpinTarget = spinData && spinData.spinTargetId === myPlayer.id;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 500,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 44,
              color: isEliminated ? "var(--accent2)" : "var(--accent)",
              lineHeight: 1,
            }}
          >
            BLUFF
          </h1>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              letterSpacing: "0.15em",
            }}
          >
            ROOM: {roomCode} · ROUND {roundNumber}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              color: isEliminated ? "var(--accent2)" : "var(--text)",
              lineHeight: 1,
            }}
          >
            {myPlayer.username}
          </div>
          <span className={`tag ${isEliminated ? "eliminated" : "alive"}`}>
            {isEliminated ? "Eliminated" : "Alive"}
          </span>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{
              fontSize: 10,
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
              background: "none",
              padding: "3px 8px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ? How to Play
          </button>
        </div>
      </div>

      {/* My status card */}
      <div
        className="card"
        style={{
          border: `1px solid ${isMyTurn && isPlaying ? "var(--warning)" : isEliminated ? "var(--accent2)" : "var(--border)"}`,
          background:
            isMyTurn && isPlaying ? "rgba(255,170,74,0.04)" : "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: "0.12em",
                marginBottom: 8,
              }}
            >
              YOUR STATUS
            </div>
            {isMyTurn && isPlaying && (
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 32,
                  color: "var(--warning)",
                  letterSpacing: "0.05em",
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                YOUR TURN
              </div>
            )}
            {!isMyTurn && isPlaying && currentPlayer && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  marginBottom: 8,
                }}
              >
                Waiting for{" "}
                <span style={{ color: "var(--text)" }}>
                  {currentPlayer.username}
                </span>
              </div>
            )}
            {isLobby && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-dim)",
                    marginBottom: 10,
                  }}
                >
                  Waiting for host to start...
                </div>
                <ShareButton
                  roomCode={roomCode}
                  senderName={myPlayer?.username}
                />
              </div>
            )}
            {isRoundEnd && (
              <div style={{ fontSize: 12, color: "var(--alive)" }}>
                Round ended. Waiting for next round...
              </div>
            )}
            {isGameOver && (
              <div style={{ fontSize: 12, color: "var(--accent)" }}>
                {lastAction?.winnerName
                  ? `Game over! ${lastAction.winnerName} wins!`
                  : "Game over!"}
              </div>
            )}
            {isEliminated && isPlaying && (
              <div style={{ fontSize: 12, color: "var(--accent2)" }}>
                You are spectating
              </div>
            )}
          </div>

          {!isEliminated && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  letterSpacing: "0.12em",
                  marginBottom: 8,
                }}
              >
                CHAMBER
              </div>
              <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const isBullet = myPlayer.chamber?.[i] === "bullet";
                  return (
                    <div
                      key={i}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: isBullet
                          ? "var(--accent2)"
                          : "var(--surface2)",
                        border: `1.5px solid ${isBullet ? "var(--accent2)" : "var(--border)"}`,
                        boxShadow: isBullet
                          ? "0 0 6px rgba(255,74,110,0.5)"
                          : "none",
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                {myPlayer.chamber?.filter((s) => s === "bullet").length ?? 1}/6
                bullets loaded
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Required card type */}
      {(isPlaying || isBluffResolution || isSpinPending) && currentCardType && (
        <div className="card">
          <div
            style={{
              fontSize: 10,
              color: "var(--text-dim)",
              letterSpacing: "0.12em",
              marginBottom: 14,
            }}
          >
            REQUIRED CARD THIS TURN
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <CardShape type={currentCardType} size="md" />
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                lineHeight: 1.7,
              }}
            >
              The host has announced the required card type.
              <br />
              Players must play a card face-down, claiming it matches.
            </div>
          </div>
        </div>
      )}

      {/* ── Player actions: my turn, playing phase ── */}
      {isMyTurn && isPlaying && !isEliminated && (
        <div className="card" style={{ border: "1px solid var(--warning)" }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--warning)",
              letterSpacing: "0.12em",
              marginBottom: 14,
            }}
          >
            YOUR ACTIONS
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Call Bluff — hidden entirely on the first turn */}
            {!isFirstTurn && (
              <button
                className="danger"
                onClick={callBluff}
                disabled={bluffUsedThisTurn}
                style={{
                  flex: 1,
                  opacity: bluffUsedThisTurn ? 0.4 : 1,
                  cursor: bluffUsedThisTurn ? "not-allowed" : "pointer",
                }}
              >
                ⚠️ Call Bluff
              </button>
            )}
            <button
              className="success"
              onClick={playCard}
              disabled={cardPlayedThisTurn}
              style={{
                flex: 1,
                opacity: cardPlayedThisTurn ? 0.4 : 1,
                cursor: cardPlayedThisTurn ? "not-allowed" : "pointer",
              }}
            >
              🃏 Play Card
            </button>
          </div>
          {cardPlayedThisTurn && (
            <button
              className="primary"
              onClick={endTurn}
              style={{ width: "100%", marginTop: 10 }}
            >
              ✅ End Turn
            </button>
          )}
          <div
            style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12 }}
          >
            {actionHint}
          </div>
        </div>
      )}

      {/* ── Bluff resolution: I called it ── */}
      {isBluffResolution && isMyTurn && (
        <div
          style={{
            padding: "14px 16px",
            background: "rgba(255,74,110,0.05)",
            border: "1px solid var(--accent2)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--accent2)",
            textAlign: "center",
          }}
        >
          ⚠️ Waiting for host to reveal the last card played...
        </div>
      )}

      {/* ── Spin pending: it's my spin ── */}
      {isMySpinTurn && !isEliminated && (
        <div
          className="card"
          style={{ border: "1px solid var(--accent2)", textAlign: "center" }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--accent2)",
              letterSpacing: "0.12em",
              marginBottom: 14,
            }}
          >
            YOUR FATE AWAITS
          </div>
          <button
            className="danger"
            onClick={playerSpin}
            style={{ width: "100%", fontSize: 16, padding: "14px" }}
          >
            🔫 Pull the Trigger
          </button>
          <div
            style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12 }}
          >
            You must spin. Click to reveal your fate.
          </div>
        </div>
      )}

      {/* ── Spin pending: waiting for someone else ── */}
      {isSpinPending && !isMySpinTurn && spinTargetPlayer && (
        <div
          style={{
            padding: "14px 16px",
            background: "rgba(255,74,110,0.05)",
            border: "1px solid var(--accent2)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--accent2)",
            textAlign: "center",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        >
          🔫 Waiting for <strong>{spinTargetPlayer.username}</strong> to pull
          the trigger...
        </div>
      )}

      {/* Action log */}
      {lastAction && <ActionLog lastAction={lastAction} />}

      {/* Player list */}
      <div className="card">
        <div
          style={{
            fontSize: 10,
            color: "var(--text-dim)",
            letterSpacing: "0.12em",
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>PLAYERS</span>
          <span style={{ color: "var(--alive)" }}>
            {players?.filter((p) => p.status === "alive").length || 0} alive
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {players?.map((p) => {
            const isCurrentP = p.id === currentPlayerId;
            const isMe = p.id === myPlayer.id;
            const alive = p.status === "alive";
            const turnPos = turnOrder.indexOf(p.id);
            return (
              <div
                key={p.id}
                className={isCurrentP && alive ? "current-player-row" : ""}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: isMe
                    ? "rgba(232,255,74,0.04)"
                    : "var(--surface2)",
                  border: `1px solid ${isCurrentP && alive ? "var(--warning)" : isMe ? "var(--accent)33" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  opacity: alive ? 1 : 0.4,
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: isCurrentP && alive ? "#0a0a0b" : "var(--text-dim)",
                    background:
                      isCurrentP && alive ? "var(--warning)" : "transparent",
                    border: `1px solid ${alive ? "var(--border)" : "transparent"}`,
                    flexShrink: 0,
                  }}
                >
                  {alive ? turnPos + 1 : "✕"}
                </div>
                <div
                  style={{
                    flex: 1,
                    fontWeight: isMe ? 700 : 400,
                    fontSize: 12,
                  }}
                >
                  {p.username}
                  {isMe && (
                    <span
                      style={{
                        color: "var(--accent)",
                        marginLeft: 6,
                        fontSize: 10,
                      }}
                    >
                      (you)
                    </span>
                  )}
                  {isCurrentP && alive && !isMe && (
                    <span
                      style={{
                        color: "var(--warning)",
                        marginLeft: 6,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                      }}
                    >
                      ← TURN
                    </span>
                  )}
                  {isSpinPending && p.id === spinTargetId && (
                    <span
                      style={{
                        color: "var(--accent2)",
                        marginLeft: 6,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                      }}
                    >
                      🔫 SPINNING
                    </span>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {alive ? (
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: 6 }).map((_, i) => {
                        const isBullet = p.chamber?.[i] === "bullet";
                        return (
                          <div
                            key={i}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: isBullet
                                ? "var(--accent2)"
                                : "var(--surface2)",
                              border: `1px solid ${isBullet ? "var(--accent2)" : "var(--border)"}`,
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--accent2)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      OUT
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leave game — hidden during active gameplay to prevent accidental disconnect */}
      {(!roomState?.phase ||
        ["lobby", "game_over"].includes(roomState?.phase)) && (
        <button
          onClick={leaveGame}
          style={{
            alignSelf: "flex-start",
            fontSize: 11,
            color: "var(--text-dim)",
            border: "none",
            background: "none",
            padding: 0,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Leave game
        </button>
      )}

      {/* ── Cylinder spin overlay ── */}
      {spinData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9000,
            padding: 24,
          }}
        >
          {/* Header */}
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22,
              letterSpacing: "0.15em",
              color: "var(--text-dim)",
              marginBottom: 32,
              textAlign: "center",
            }}
          >
            {spinData.spinTargetName} pulls the trigger...
          </div>

          {/* Cylinder */}
          <CylinderSVG
            bulletChambers={spinData.bulletChambers}
            landingChamberIndex={spinData.landingChamberIndex}
            rotation={cylinderRotation}
            animating={cylinderAnimating}
            spinComplete={spinComplete}
          />

          {/* Result — shown only after animation */}
          {spinComplete && (
            <div style={{ marginTop: 36, textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 56,
                  letterSpacing: "0.05em",
                  lineHeight: 1,
                  color: spinData.eliminated
                    ? "var(--accent2)"
                    : "var(--alive)",
                  textShadow: spinData.eliminated
                    ? "0 0 30px rgba(255,74,110,0.7)"
                    : "0 0 30px rgba(74,255,128,0.7)",
                  marginBottom: 14,
                }}
              >
                {spinData.eliminated ? "💀 ELIMINATED" : "😮‍💨 SURVIVED"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-dim)",
                  marginBottom: 28,
                }}
              >
                Chamber {spinData.landingChamberIndex + 1} ·{" "}
                {spinData.eliminated ? "bullet found" : "empty"}
              </div>
              {isSpinTarget ? (
                /* Spin target: clicking Continue broadcasts dismiss to all players */
                <button
                  className="primary"
                  onClick={acknowledgeSpinResult}
                  style={{ padding: "10px 32px", fontSize: 14 }}
                >
                  Continue
                </button>
              ) : (
                /* Everyone else: auto-dismissed when the spin target clicks Continue */
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-dim)",
                    fontStyle: "italic",
                  }}
                >
                  Waiting for {spinData.spinTargetName} to continue...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Elimination popup ── */}
      {justEliminated && !spinData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 8800,
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            style={{
              maxWidth: 360,
              width: "100%",
              textAlign: "center",
              border: "1px solid var(--accent2)",
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 56,
                color: "var(--accent2)",
                marginBottom: 12,
              }}
            >
              💀 ELIMINATED
            </div>
            <div
              style={{ fontSize: 14, color: "var(--text)", marginBottom: 8 }}
            >
              You&apos;ve been eliminated.
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                marginBottom: 24,
                lineHeight: 1.6,
              }}
            >
              The host will manage the rest of the game.
            </div>
            <button
              className="primary"
              onClick={() => setJustEliminated(false)}
              style={{ padding: "10px 32px" }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* How to Play modal */}
      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
