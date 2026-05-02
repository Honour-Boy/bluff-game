"use client";

import { useState } from "react";
import { PowerCard, POWER_META } from "./PowerCard";
import { ROLE_META } from "./RoleRevealOverlay";

// ─── HowToPlayModal ───────────────────────────────────────────
// Reference for the full v2 ruleset. Collapsible accordion so the
// content fits on a phone — every section is closed by default
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
  shield: "Activates at turn start. The next bluff call against you is blocked outright — never officially registers.",
  mirror: "Activates at turn start. The next bluff consequence aimed at you bounces back to whoever caused it.",
  swap: "Activates at turn start, but only after a full round has passed since you drew it. Trade your played card with one from the round's pile, then re-judge the bluff.",
  peek: "Activates at turn start. You privately see the previous player's card before deciding to call bluff.",
  freeze: "Activates at turn start. Pick a player — their next turn is skipped entirely.",
  assassin: "Multi-turn arming. While armed, anyone who calls bluff on you is eliminated on the spot. Sheriff is immune. Decline to re-arm and you eat +4 cards.",
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
    desc: "Every spin rolls twice and takes the higher index. Lethal.",
  },
  {
    label: "Russian Roulette",
    desc: "Every chamber starts with three bullets loaded. The opening turns are already a coin flip.",
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
    desc: "15-second turn timer. Run the clock out and you auto-spin as the penalty.",
  },
  {
    label: "Sudden Death",
    desc: "Every 4 elimination-free turns, every alive chamber gains a bullet. Any elimination resets the counter.",
  },
  {
    label: "Mirror Match",
    desc: "When one player spins, the player opposite them at the table spins too. Requires an even player count at start.",
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
    body: "2–15 players per room. The host is a regular player. Cards deal automatically — 6 in your hand. The required shape (Circle, Triangle, Cross, Square, or Star) is shown on screen.",
  },
  {
    title: "EACH TURN",
    body: "Play one card from your hand that matches the required shape — or play a Whot/20 card, which matches anything. You can lie. Nobody sees your card unless someone calls bluff.",
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
        Auto-assigned in any room with 9+ players. Roles are{" "}
        <strong style={{ color: "var(--text)" }}>private</strong> — only you
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
        the gun behaves — stack them at your peril.
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

function OnlineVsPhysicalContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CopyBlock
        title="ONLINE MODE"
        body="The default v2 experience. Cards deal automatically. Bluff resolution is automatic. Power cards, secret roles, modifiers, and special systems — all of it lives here."
      />
      <CopyBlock
        title="PHYSICAL MODE"
        body="The original ruleset. Players hold real Whot cards. One person plays Game Master and runs the app — they don't play.\n\nv2 features (power cards, roles, modifiers, systems) are online-only. Physical mode is the base game and nothing else."
      />
    </div>
  );
}

// ─── Section list (in display order) ──────────────────────────
const SECTION_KEYS = [
  "basics",
  "power",
  "roles",
  "risk",
  "room",
  "systems",
  "modes",
];

const SECTIONS = {
  basics: { label: "The Basics", render: BasicsContent },
  power: { label: "Power Cards", render: PowerCardsContent },
  roles: { label: "Secret Roles", render: RolesContent },
  risk: { label: "Risk Modifiers", render: RiskModsContent },
  room: { label: "Room Modifiers", render: RoomModsContent },
  systems: { label: "Special Systems", render: SystemsContent },
  modes: { label: "Online vs Physical", render: OnlineVsPhysicalContent },
};

// ─── Accordion section ────────────────────────────────────────
function AccordionSection({ sectionKey, isOpen, onToggle }) {
  const section = SECTIONS[sectionKey];
  if (!section) return null;
  const Render = section.render;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: "100%",
          minHeight: 48,
          padding: "12px 14px",
          background: isOpen ? "var(--surface2)" : "transparent",
          border: "none",
          borderBottom: isOpen ? "1px solid var(--border)" : "none",
          color: isOpen ? "var(--accent)" : "var(--text)",
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 16,
          letterSpacing: "0.14em",
          textAlign: "left",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <span>{section.label}</span>
        <span
          aria-hidden
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 14,
            color: "var(--text-dim)",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
            display: "inline-block",
          }}
        >
          ›
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: 14 }}>
          <Render />
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────
export function HowToPlayModal({ onClose, initialTab = "physical" }) {
  // Map legacy `initialTab` to which accordion section opens first.
  // 'physical' → Basics (people read the original rules)
  // 'online'   → Power Cards (people in an online room want v2)
  const initialKey = initialTab === "online" ? "power" : "basics";
  const [openKey, setOpenKey] = useState(initialKey);

  const toggle = (key) => setOpenKey((current) => (current === key ? null : key));

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
          maxWidth: 520,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title + close */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
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
            }}
          >
            ✕
          </button>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          Tap a section to open
        </div>

        {/* Accordion */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SECTION_KEYS.map((key) => (
            <AccordionSection
              key={key}
              sectionKey={key}
              isOpen={openKey === key}
              onToggle={() => toggle(key)}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          className="primary"
          style={{ width: "100%", marginTop: 24, minHeight: 44 }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
