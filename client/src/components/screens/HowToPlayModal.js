"use client";

import { useEffect, useState } from "react";
import { PowerCard, POWER_META } from "../shared/PowerCard";
import { ROLE_META } from "../RoleRevealOverlay";
import { CloseIcon } from "../shared/CloseIcon";
import { TierBadge } from "../shared/TierBadge";

// ─── Rank & progression reference ─────────────────────────────
// Four tiers gate which mechanics a host's room may use AND which cosmetic set
// is unlocked. Levels 1–20 group into the tiers.
const TIERS = [
  {
    tier: "streets",
    levels: "Levels 1–2",
    unlocks: "The core game - play cards, call bluffs, spin the chamber.",
    cosmetics: "Steel · Classic Leather · Emerald (the base set).",
  },
  {
    tier: "backroads",
    levels: "Levels 3–8",
    unlocks: "Power cards, risk modifiers, room modifiers, and Bounty.",
    cosmetics: "The Noir set.",
  },
  {
    tier: "syndicate",
    levels: "Levels 9–13",
    unlocks: "Secret roles, Betting, Dead Man's Hand, and Last Stand.",
    cosmetics: "The Crimson + Neon sets.",
  },
  {
    tier: "covenant",
    levels: "Levels 14–20",
    unlocks: "The Pact and Blood Debt - always on in a Covenant room.",
    cosmetics: "The Kente + Cosmos sets.",
  },
];

const XP_SOURCES = [
  ["Victory", "Win the game (a shared win for a sealed Pact counts for both)."],
  ["Survived spins", "Every spin you walk away from."],
  ["Bluffs called right", "Catch a liar."],
  ["Bluffs defended", "Survive a wrong call against you."],
  ["Players eliminated", "Send someone to the spin that ends them."],
  ["Power cards resolved", "Land a power card's effect (Backroads+)."],
  ["Last Stand win", "Take the final duel (Syndicate+)."],
  ["Participation", "Play at least one card - no AFK farming."],
];

// ─── HowToPlayModal ───────────────────────────────────────────
// Reference for the full v2 ruleset. Collapsible accordion so the
// content fits on a phone - every section is closed by default
// except the one we open from `initialTab`.
//
// Props
//   onClose     : () => void
//   initialTab  : 'physical' | 'online'
//                 'physical' opens The Basics; 'online' opens Power
//                 Cards (the most interesting v2 surface for a
//                 player already in an online room).
// ──────────────────────────────────────────────────────────────

const POWER_ORDER = ["shield", "mirror", "swap", "peek", "freeze", "assassin"];

const POWER_TRIGGERS = {
  shield: "Activates at turn start. The next bluff call against you is blocked outright - never officially registers.",
  mirror: "Activates at turn start. The next bluff consequence aimed at you bounces back to whoever caused it.",
  swap: "Activates at turn start, but only after a full round has passed since you drew it. Trade your played card with one from the round's pile, then re-judge the bluff.",
  peek: "Activates at turn start. You privately see the previous player's card before deciding to call bluff.",
  freeze: "Activates at turn start. Pick a player - their next turn is skipped entirely.",
  assassin: "Activates at turn start; stays armed until a bluff lands on you. Wrong bluff call → the caller is eliminated. Correct bluff call → no spin, but you draw +3 penalty cards. Sheriff is immune.",
};

const ROLE_ORDER = [
  "barehand",
  "gambler",
  "sheriff",
  "medic",
  "saboteur",
  "sniper",
  "collector",
];

const RISK_MODS = [
  {
    label: "Double Barrel",
    desc: "Every chamber starts with two bullets loaded. The opening turns are already a coin flip.",
  },
  {
    label: "Russian Roulette",
    desc: "A failed bluff fires immediately - no pause to pull the trigger yourself.",
  },
  {
    label: "Hot Potato",
    desc: "Surviving a spin adds two bullets instead of one. The chamber fills fast.",
  },
  {
    label: "Redemption Spin",
    desc: "Eliminated players get one second-chance spin per round. Survive and you re-enter with a fresh chamber and three cards.",
  },
];

const ROOM_MODS = [
  {
    label: "Speed Mode",
    desc: "25-second turn timer, visible to everyone. Run the clock out and your turn is automatically ended (you forfeit the rest of it) - no spin.",
  },
  {
    label: "Sudden Death",
    desc: "Every 4 elimination-free turns, every alive chamber gains a bullet. Any elimination resets the counter.",
  },
  {
    label: "Mirror Match",
    desc: "When one player spins, the player opposite them at the table spins too. Requires an even player count at start.",
  },
  {
    label: "Roulette Rotation",
    desc: "Turn order is reshuffled every cycle instead of a fixed loop. Everyone still takes exactly one turn per cycle and nobody plays twice in a row. Only the next player is revealed. Requires 3+ players.",
  },
];

const SYSTEMS = [
  {
    label: "Bounty",
    desc: "Survive 3 spins in a row → a bounty drops on your head. Whoever bluff-calls you correctly drops a risk level.",
  },
  {
    label: "Betting",
    desc: "10-second window before each spin lets non-targets wager on the outcome. Hit 3 in a row and your risk drops by one.",
  },
  {
    label: "Dead Man's Hand",
    desc: "Once 3+ players are eliminated, the ghost council votes on a global twist every time the alive count drops further.",
  },
  {
    label: "Last Stand",
    desc: "When only two remain, hands clear, chambers reset, and the game becomes a stripped-down spin-vs-spin duel. No power cards. No roles.",
  },
];

const BASICS_SECTIONS = [
  {
    title: "THE TABLE",
    body: "2–15 players per room. The host is a regular player. Cards deal automatically - 6 in your hand. The required shape (Circle, Triangle, Cross, Square, or Star) is shown on screen.",
  },
  {
    title: "EACH TURN",
    body: "Play one card from your hand that matches the required shape - or play a Whot/20 card, which matches anything. You can lie. Nobody sees your card unless someone calls bluff.",
  },
  {
    title: "CALLING A BLUFF",
    body: "Before playing, you may challenge the previous player's card. The game reveals it.\n\nIf they lied → they spin.\nIf they told the truth → you spin.\n\nThe first player of the round can't be challenged. One bluff call per turn.",
  },
  {
    title: "THE GUN",
    body: "Each player has a 6-slot revolver chamber. It starts with one bullet at a random slot. On a spin, the server picks a slot. Land on a bullet → eliminated. Survive → a new bullet is added for next time.\n\nChambers persist across rounds. The game escalates.",
  },
  {
    title: "WINNING A ROUND",
    body: "First to empty their hand wins the round. Everyone is redealt 6 fresh cards. Chambers carry over.",
  },
  {
    title: "WINNING THE GAME",
    body: "Last player alive wins.",
  },
];

const TITLE_ICON_STYLE = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 13,
  letterSpacing: "0.15em",
  color: "var(--accent)",
};

// ─── Tiny role chip (text + colored dot) ──────────────────────
function RoleChip({ roleKey }) {
  const meta = ROLE_META[roleKey];
  if (!meta) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        background: "var(--surface2)",
        border: `1px solid ${meta.color}33`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: "var(--radius)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 10,
          height: 10,
          minWidth: 10,
          borderRadius: "50%",
          background: meta.color,
          boxShadow: `0 0 8px ${meta.color}aa`,
          marginTop: 5,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 14,
            letterSpacing: "0.1em",
            color: meta.color,
            lineHeight: 1.1,
          }}
        >
          {meta.label.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.55,
            marginTop: 4,
          }}
        >
          {meta.flavor}
        </div>
      </div>
    </div>
  );
}

// ─── Bullet row for modifiers/systems ─────────────────────────
function BulletRow({ label, desc }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent2)",
        borderRadius: "var(--radius)",
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 14,
          letterSpacing: "0.1em",
          color: "var(--accent2)",
          lineHeight: 1.1,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.55,
          marginTop: 4,
        }}
      >
        {desc}
      </div>
    </div>
  );
}

// ─── Power card detail row (visual + flavor + trigger) ────────
function PowerCardRow({ type }) {
  const meta = POWER_META[type];
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: 10,
        background: "var(--surface2)",
        border: `1px solid ${meta.color}33`,
        borderRadius: "var(--radius)",
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <PowerCard type={type} size="sm" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 16,
            letterSpacing: "0.1em",
            color: meta.color,
            lineHeight: 1.1,
            textShadow: `0 0 8px ${meta.color}55`,
          }}
        >
          {meta.label.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text)",
            lineHeight: 1.55,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          “{meta.flavor}”
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.55,
            marginTop: 6,
          }}
        >
          {POWER_TRIGGERS[type]}
        </div>
      </div>
    </div>
  );
}

// ─── Plain copy block (Basics + Online vs Physical) ───────────
function CopyBlock({ title, body }) {
  return (
    <div>
      <div style={{ ...TITLE_ICON_STYLE, marginBottom: 6 }}>{title}</div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          lineHeight: 1.7,
          whiteSpace: "pre-line",
        }}
      >
        {body}
      </div>
    </div>
  );
}

// ─── Section content factories ────────────────────────────────
function BasicsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {BASICS_SECTIONS.map((s) => (
        <CopyBlock key={s.title} title={s.title} body={s.body} />
      ))}
    </div>
  );
}

function PowerCardsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Six wild cards seeded into the deck. Hold one at a time (Collector
        holds three). Drawing a second auto-discards and replaces with a
        shape card. Each one prompts you at turn start: activate or skip.
      </div>
      {POWER_ORDER.map((type) => (
        <PowerCardRow key={type} type={type} />
      ))}
    </div>
  );
}

function RolesContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Auto-assigned in any room with 3+ players. Roles are{" "}
        <strong style={{ color: "var(--text)" }}>private</strong> - only you
        ever see your own. Revealed once, at game start.
      </div>
      {ROLE_ORDER.map((roleKey) => (
        <RoleChip key={roleKey} roleKey={roleKey} />
      ))}
    </div>
  );
}

function RiskModsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Host enables these from the pre-game settings panel. They change how
        the gun behaves - stack them at your peril.
      </div>
      {RISK_MODS.map((m) => (
        <BulletRow key={m.label} label={m.label} desc={m.desc} />
      ))}
    </div>
  );
}

function RoomModsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Host enables these before the game starts. They reshape the turn
        loop itself.
      </div>
      {ROOM_MODS.map((m) => (
        <BulletRow key={m.label} label={m.label} desc={m.desc} />
      ))}
    </div>
  );
}

function SystemsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Optional layers the host can stack on top. Each one bolts a new
        sub-game into the round.
      </div>
      {SYSTEMS.map((m) => (
        <BulletRow key={m.label} label={m.label} desc={m.desc} />
      ))}
    </div>
  );
}

function ProgressionContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          lineHeight: 1.6,
          padding: "8px 10px",
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        Finishing online games earns XP. XP raises your <strong style={{ color: "var(--text)" }}>Level</strong> (1–20),
        and levels group into four <strong style={{ color: "var(--text)" }}>Tiers</strong>. Your tier sets which
        mechanics a room you host can switch on - and unlocks a matching cosmetic set.
      </div>

      {TIERS.map((t) => (
        <div
          key={t.tier}
          style={{
            padding: "10px 12px",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TierBadge tier={t.tier} size="lg" />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--text-dim)",
                textTransform: "uppercase",
              }}
            >
              {t.levels}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>Unlocks:</strong> {t.unlocks}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>Cosmetics:</strong> {t.cosmetics}
          </div>
        </div>
      ))}

      <div style={{ ...TITLE_ICON_STYLE, marginTop: 4 }}>HOW XP IS EARNED</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {XP_SOURCES.map(([label, desc]) => (
          <div
            key={label}
            style={{
              padding: "7px 10px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--radius)",
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 13,
                letterSpacing: "0.08em",
                color: "var(--accent)",
              }}
            >
              {label.toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginLeft: 8 }}>
              {desc}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", lineHeight: 1.6, marginTop: 2 }}>
          Higher tiers pay more XP per event - and unlock event types lower tiers can't earn from.
        </div>
      </div>
    </div>
  );
}

function OnlineVsPhysicalContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CopyBlock
        title="ONLINE MODE"
        body="The default v2 experience. Cards deal automatically. Bluff resolution is automatic. Power cards, secret roles, modifiers, and special systems - all of it lives here."
      />
      <CopyBlock
        title="PHYSICAL MODE"
        body="The original ruleset. Players hold real Whot cards. One person plays Game Master and runs the app - they don't play.\n\nv2 features (power cards, roles, modifiers, systems) are online-only. Physical mode is the base game and nothing else."
      />
    </div>
  );
}

// ─── Section list (in display order) ──────────────────────────
const SECTION_KEYS = [
  "basics",
  "progression",
  "power",
  "roles",
  "risk",
  "room",
  "systems",
  "modes",
];

const SECTIONS = {
  basics: { label: "The Basics", render: BasicsContent },
  progression: { label: "Rank & Progression", render: ProgressionContent },
  power: { label: "Power Cards", render: PowerCardsContent },
  roles: { label: "Secret Roles", render: RolesContent },
  risk: { label: "Risk Modifiers", render: RiskModsContent },
  room: { label: "Room Modifiers", render: RoomModsContent },
  systems: { label: "Special Systems", render: SystemsContent },
  modes: { label: "Online vs Physical", render: OnlineVsPhysicalContent },
};

// ─── Jump tab (one per section, in the quick-nav strip) ───────
function JumpTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={{
        flex: "0 0 auto",
        padding: "6px 12px",
        minHeight: 0,
        borderRadius: 999,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "rgba(240,181,74,0.12)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-dim)",
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ─── Modal - paged wizard ─────────────────────────────────────
// One section per page with Back / Next at the foot (Basics → Rank &
// Progression → Power Cards → …). A quick-nav pill strip lets you jump, and
// ←/→ page through; Esc closes. `initialTab` picks the opening page:
//   'physical' → Basics (the original rules)
//   'online'   → Power Cards (the v2 surface people in an online room want)
export function HowToPlayModal({ onClose, initialTab = "physical" }) {
  const initialKey = initialTab === "online" ? "power" : "basics";
  const total = SECTION_KEYS.length;
  const [index, setIndex] = useState(
    Math.max(0, SECTION_KEYS.indexOf(initialKey)),
  );

  const go = (i) => setIndex(Math.max(0, Math.min(total - 1, i)));
  const key = SECTION_KEYS[index];
  const section = SECTIONS[key];
  const Render = section.render;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const nextLabel = isLast ? null : SECTIONS[SECTION_KEYS[index + 1]].label;

  // Esc closes; ←/→ page through the sections.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setIndex((v) => Math.min(total - 1, v + 1));
      else if (e.key === "ArrowLeft") setIndex((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9500,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card fade-in"
        style={{
          maxWidth: 540,
          width: "100%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title + close */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 26,
              color: "var(--accent)",
              letterSpacing: "0.1em",
            }}
          >
            HOW TO PLAY BLUFF
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              fontSize: 20,
              minWidth: 44,
              minHeight: 44,
              color: "var(--text-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Quick-nav pill strip (jump to any section) */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 6,
            marginBottom: 14,
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {SECTION_KEYS.map((k, i) => (
            <JumpTab
              key={k}
              label={SECTIONS[k].label}
              active={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>

        {/* Current section heading + position */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22,
              color: "var(--text)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {section.label}
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
              whiteSpace: "nowrap",
            }}
          >
            {index + 1} / {total}
          </div>
        </div>

        {/* Section content - the only scrolling region, so the nav stays put.
            Keyed on the section so each page fades in fresh. */}
        <div
          key={key}
          className="fade-in"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}
        >
          <Render />
        </div>

        {/* Footer nav - Back / Next (last page closes). */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={isFirst}
            style={{ flex: 1, minHeight: 46 }}
          >
            ‹ Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="primary"
              style={{ flex: 2, minHeight: 46 }}
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="primary"
              style={{ flex: 2, minHeight: 46 }}
            >
              Next: {nextLabel} ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
