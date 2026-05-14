'use client';

// ============================================================
// ActiveConfigPanel — small collapsible badge that shows which
// power cards / risk modifiers / room modifiers / systems are
// active in the current game. Mirrors the lists in
// PreGameSettingsPanel so labels stay in lock-step with the
// host's setup screen. Reads `roomState.config` directly — same
// shape exposed to every client (including spectators) via
// `serializeRoom`.
//
// Visibility:
//   - Hidden entirely when nothing is enabled (config-disabled
//     game has nothing useful to surface).
//   - Otherwise renders as a small chip in the top-left corner;
//     click to expand into a sectioned list, click again or hit
//     the × to collapse.
// ============================================================

import { useMemo, useState } from 'react';

// Label tables kept ASCII-only here — these are display text only
// and don't need to share imports with the host settings panel
// (we want this to render independent of host bundle changes).
const POWER_CARDS = [
  { key: 'shield',   label: 'Shield' },
  { key: 'mirror',   label: 'Mirror' },
  { key: 'swap',     label: 'Swap' },
  { key: 'peek',     label: 'Peek' },
  { key: 'freeze',   label: 'Freeze' },
  { key: 'assassin', label: 'Assassin' },
];

const RISK_MODS = [
  { key: 'doubleBarrel',    label: 'Double Barrel' },
  { key: 'russianRoulette', label: 'Russian Roulette' },
  { key: 'hotPotato',       label: 'Hot Potato' },
  { key: 'redemptionSpin',  label: 'Redemption Spin' },
];

const ROOM_MODS = [
  { key: 'speedMode',   label: 'Speed Mode' },
  { key: 'suddenDeath', label: 'Sudden Death' },
  { key: 'mirrorMatch', label: 'Mirror Match' },
];

const SYSTEMS = [
  { key: 'bounty',       label: 'Bounty' },
  { key: 'betting',      label: 'Betting' },
  { key: 'deadMansHand', label: "Dead Man's Hand" },
  { key: 'lastStand',    label: 'Last Stand' },
];

function pickEnabled(items, source) {
  if (!source) return [];
  return items.filter(({ key }) => !!source[key]);
}

export function ActiveConfigPanel({ config }) {
  const [open, setOpen] = useState(false);

  const sections = useMemo(() => {
    if (!config) return [];
    return [
      { title: 'Power Cards', items: pickEnabled(POWER_CARDS, config?.powerCards?.enabled) },
      { title: 'Risk',        items: pickEnabled(RISK_MODS,   config?.riskModifiers) },
      { title: 'Room',        items: pickEnabled(ROOM_MODS,   config?.roomModifiers) },
      { title: 'Systems',     items: pickEnabled(SYSTEMS,     config?.systems) },
    ].filter((section) => section.items.length > 0);
  }, [config]);

  const totalEnabled = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.length, 0),
    [sections],
  );

  if (totalEnabled === 0) return null;

  // Collapsed chip — always rendered; tap to expand. Anchored to
  // the top-left where the OnlinePlayerUI keeps nothing else fixed
  // (the bottom-left already hosts the centre-on-table button).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Show active game settings (${totalEnabled} enabled)`}
        aria-expanded={false}
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 'max(12px, env(safe-area-inset-left))',
          minHeight: 32,
          padding: '6px 10px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          color: 'var(--text-dim)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 7800,
        }}
      >
        <span aria-hidden="true">⚙</span>
        <span>{totalEnabled} active</span>
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Active game settings"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: 'max(12px, env(safe-area-inset-left))',
        width: 'min(260px, calc(100vw - 24px))',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        padding: '12px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
        zIndex: 7800,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Active Settings
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide active settings"
          style={{
            minWidth: 28,
            minHeight: 28,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((section) => (
          <li key={section.title}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {section.items.map((item) => (
                <span
                  key={item.key}
                  style={{
                    padding: '2px 8px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    color: 'var(--text)',
                    fontSize: 11,
                  }}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
