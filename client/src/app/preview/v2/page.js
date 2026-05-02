"use client";

// ─── /preview/v2 ──────────────────────────────────────────────
// Internal preview route for the Phase G2 + G3 visual components.
// Not linked from the main app — visit /preview/v2 directly.
// ──────────────────────────────────────────────────────────────

import { useState } from "react";
import { PowerCard, POWER_TYPES, POWER_META } from "../../../components/PowerCard";
import { PowerCardBack } from "../../../components/PowerCardBack";
import { AnnouncementBanner } from "../../../components/AnnouncementBanner";
import { CardShape } from "../../../components/CardShape";

const BANNER_KINDS = [
  { kind: "bluff_blocked", label: "Bluff Blocked", subtitle: "Shield activated" },
  { kind: "bluff_reflected", label: "Bluff Reflected", subtitle: "Mirror redirected" },
  { kind: "assassin", label: "Assassin Strike", subtitle: "Bluff call punished" },
  { kind: "elimination", label: "Elimination", subtitle: "A player is out" },
  { kind: "bounty", label: "Bounty Placed", subtitle: "Three survivals in a row" },
  { kind: "sudden_death", label: "Sudden Death", subtitle: "Risk escalated" },
  { kind: "last_stand", label: "Last Stand", subtitle: "Two remain" },
];

const SECTION_TITLE = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 28,
  letterSpacing: "0.12em",
  color: "var(--accent)",
  textTransform: "uppercase",
  marginBottom: 14,
  borderBottom: "1px solid var(--border)",
  paddingBottom: 8,
};

const SECTION_SUB = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 11,
  color: "var(--text-dim)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 16,
};

export default function PreviewV2Page() {
  const [activeBanner, setActiveBanner] = useState(null);
  // Bumping this key remounts the banner so re-clicking the same
  // kind plays the animation again.
  const [bannerKey, setBannerKey] = useState(0);

  const fireBanner = (cfg) => {
    setActiveBanner(cfg);
    setBannerKey((k) => k + 1);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "32px 24px 80px",
        maxWidth: 1240,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 36 }}>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 56,
            letterSpacing: "0.12em",
            color: "var(--text)",
            lineHeight: 1,
          }}
        >
          BLUFF · v2 visual preview
        </h1>
        <p style={SECTION_SUB}>
          Phase G2 + G3 — power cards, power back, announcement banner, whot refresh.
        </p>
      </header>

      {/* Power cards × all sizes */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={SECTION_TITLE}>Power cards · all types · all sizes</h2>
        {["lg", "md", "sm"].map((size) => (
          <div key={size} style={{ marginBottom: 28 }}>
            <div style={SECTION_SUB}>Size: {size}</div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 20,
                alignItems: "flex-end",
              }}
            >
              {POWER_TYPES.map((type) => (
                <div
                  key={type}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <PowerCard type={type} size={size} />
                  <div
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 10,
                      color: "var(--text-dim)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {POWER_META[type].label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Power card back */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={SECTION_TITLE}>Power card back · face-down treatment</h2>
        <div style={SECTION_SUB}>
          Distinct from the regular shape-card back — reads as &ldquo;something special, but unknown&rdquo;.
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
          {["sm", "md", "lg"].map((size) => (
            <div
              key={size}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <PowerCardBack size={size} />
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {size}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Whot card refresh */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={SECTION_TITLE}>Whot card refresh (CardShape)</h2>
        <div style={SECTION_SUB}>
          Subtle premium polish — gradient backplate, gold/silver edge accents,
          refined typography. Sits visually between regular shapes and power cards.
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
          {["circle", "triangle", "cross", "square", "star", "whot"].map((shape) => (
            <div
              key={shape}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CardShape type={shape} size="lg" />
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {shape}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Announcement banner triggers */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={SECTION_TITLE}>Announcement banner · click to trigger</h2>
        <div style={SECTION_SUB}>
          Sweep-in 350ms · linger 3.5s · sweep-out 300ms.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {BANNER_KINDS.map((b) => (
            <button
              key={b.kind}
              onClick={() => fireBanner({ ...b, playerName: "Player_07" })}
              style={{
                padding: "10px 16px",
                fontSize: 11,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {/* Live banner */}
      {activeBanner && (
        <AnnouncementBanner
          key={bannerKey}
          kind={activeBanner.kind}
          subtitle={activeBanner.subtitle}
          playerName={activeBanner.playerName}
          onComplete={() => setActiveBanner(null)}
        />
      )}
    </div>
  );
}
