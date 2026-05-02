'use client';

// ============================================================
// PreGameSettingsPanel — host-only v2 toggles, collected before
// `create_room` is sent. Pure data collection — nothing reads
// these values yet (Phase A2 is pure plumbing per the v2 roadmap).
//
// Default config is exported so server + tests can share the
// canonical shape. All toggles default OFF; copiesPerDeck = 1.
// secretRoles is intentionally absent — that activates
// automatically when alive count >= 9 and is not host-toggleable.
// ============================================================

import { useState } from 'react';

export const DEFAULT_V2_CONFIG = {
  powerCards: {
    enabled: {
      shield: false,
      mirror: false,
      swap: false,
      peek: false,
      freeze: false,
      assassin: false,
    },
    copiesPerDeck: 1,
  },
  riskModifiers: {
    doubleBarrel: false,
    russianRoulette: false,
    hotPotato: false,
    redemptionSpin: false,
  },
  roomModifiers: {
    speedMode: false,
    suddenDeath: false,
    mirrorMatch: false,
  },
  systems: {
    bounty: false,
    betting: false,
    deadMansHand: false,
    lastStand: false,
  },
};

const POWER_CARDS = [
  { key: 'shield',   label: 'Shield',   desc: 'Block one incoming bluff penalty' },
  { key: 'mirror',   label: 'Mirror',   desc: 'Reflect a bluff back at the caller' },
  { key: 'swap',     label: 'Swap',     desc: 'Trade hands after a full round' },
  { key: 'peek',     label: 'Peek',     desc: 'Privately see another player\'s card' },
  { key: 'freeze',   label: 'Freeze',   desc: 'Skip a target player\'s next turn' },
  { key: 'assassin', label: 'Assassin', desc: 'Multi-turn arming + penalty cards' },
];

const RISK_MODS = [
  { key: 'doubleBarrel',    label: 'Double Barrel',    desc: 'Two bullets in the chamber from start' },
  { key: 'russianRoulette', label: 'Russian Roulette', desc: 'Failed bluff = immediate spin' },
  { key: 'hotPotato',       label: 'Hot Potato',       desc: 'Pass the gun before each turn' },
  { key: 'redemptionSpin',  label: 'Redemption Spin',  desc: 'Eliminated players get one more chance' },
];

const ROOM_MODS = [
  { key: 'speedMode',   label: 'Speed Mode',   desc: '15s turn timer + auto-spin penalty' },
  { key: 'suddenDeath', label: 'Sudden Death', desc: 'Risk bumps every 4 elimination-free turns' },
  { key: 'mirrorMatch', label: 'Mirror Match', desc: 'Spin lands on the player opposite the table' },
];

const SYSTEMS = [
  { key: 'bounty',       label: 'Bounty',          desc: '3 spins survived → bounty placed on you' },
  { key: 'betting',      label: 'Betting',         desc: '10s window to wager on bluff outcomes' },
  { key: 'deadMansHand', label: 'Dead Man\'s Hand', desc: 'Ghost council vote when 3+ are eliminated' },
  { key: 'lastStand',    label: 'Last Stand',      desc: 'Final two players enter spin-vs-spin duel' },
];

// ─── Shared toggle row ────────────────────────────────────
function ToggleRow({ id, label, desc, checked, onChange }) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 12px',
        minHeight: 44,
        background: checked ? 'rgba(232,255,74,0.04)' : 'var(--surface)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        userSelect: 'none',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 20, height: 20,
          marginTop: 2,
          accentColor: 'var(--accent)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          color: checked ? 'var(--accent)' : 'var(--text)',
          marginBottom: 2,
        }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
    </label>
  );
}

// ─── Section wrapper ──────────────────────────────────────
function Section({ title, children, footer }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.18em',
        marginTop: 4,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
      {footer}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────
export function PreGameSettingsPanel({ config, onChange }) {
  const [open, setOpen] = useState(false);

  // Active count for collapsed-state hint
  const activeCount =
    Object.values(config.powerCards.enabled).filter(Boolean).length +
    Object.values(config.riskModifiers).filter(Boolean).length +
    Object.values(config.roomModifiers).filter(Boolean).length +
    Object.values(config.systems).filter(Boolean).length;

  const setPowerCard = (key, value) => {
    onChange({
      ...config,
      powerCards: {
        ...config.powerCards,
        enabled: { ...config.powerCards.enabled, [key]: value },
      },
    });
  };

  const setCopies = (value) => {
    const clamped = Math.max(1, Math.min(2, Number(value) || 1));
    onChange({
      ...config,
      powerCards: { ...config.powerCards, copiesPerDeck: clamped },
    });
  };

  const setRisk = (key, value) => {
    onChange({ ...config, riskModifiers: { ...config.riskModifiers, [key]: value } });
  };

  const setRoom = (key, value) => {
    onChange({ ...config, roomModifiers: { ...config.roomModifiers, [key]: value } });
  };

  const setSystem = (key, value) => {
    onChange({ ...config, systems: { ...config.systems, [key]: value } });
  };

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--surface)',
      overflow: 'hidden',
    }}>
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 14px',
          background: 'var(--surface2)',
          border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          fontFamily: "'Space Mono', monospace",
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
            V2 GAME SETTINGS
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
            {activeCount === 0
              ? 'Defaults — all extras off'
              : `${activeCount} ${activeCount === 1 ? 'option' : 'options'} enabled`}
          </span>
        </span>
        <span style={{
          fontSize: 16,
          color: 'var(--accent)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          maxHeight: '60vh',
          overflowY: 'auto',
        }}>
          {/* Power Cards */}
          <Section
            title="POWER CARDS"
            footer={
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                marginTop: 4,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text)' }}>
                    COPIES PER DECK
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    1 = single deck · 2 = doubled deck
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={2}
                  value={config.powerCards.copiesPerDeck}
                  onChange={(e) => setCopies(e.target.value)}
                  style={{
                    width: 60,
                    height: 44,
                    fontSize: 16,
                    textAlign: 'center',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    fontFamily: "'Space Mono', monospace",
                  }}
                />
              </div>
            }
          >
            {POWER_CARDS.map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                id={`pc-${key}`}
                label={label}
                desc={desc}
                checked={config.powerCards.enabled[key]}
                onChange={(v) => setPowerCard(key, v)}
              />
            ))}
          </Section>

          {/* Risk Modifiers */}
          <Section title="RISK MODIFIERS">
            {RISK_MODS.map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                id={`risk-${key}`}
                label={label}
                desc={desc}
                checked={config.riskModifiers[key]}
                onChange={(v) => setRisk(key, v)}
              />
            ))}
          </Section>

          {/* Room Modifiers */}
          <Section title="ROOM MODIFIERS">
            {ROOM_MODS.map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                id={`room-${key}`}
                label={label}
                desc={desc}
                checked={config.roomModifiers[key]}
                onChange={(v) => setRoom(key, v)}
              />
            ))}
          </Section>

          {/* Special Systems */}
          <Section
            title="SPECIAL SYSTEMS"
            footer={
              <div style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                lineHeight: 1.6,
                padding: '8px 12px',
                background: 'var(--surface2)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius)',
                marginTop: 4,
              }}>
                Secret roles activate automatically when 9+ players are alive — not host-toggleable.
              </div>
            }
          >
            {SYSTEMS.map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                id={`sys-${key}`}
                label={label}
                desc={desc}
                checked={config.systems[key]}
                onChange={(v) => setSystem(key, v)}
              />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
