'use client';

// ============================================================
// PreGameSettingsPanel — host-only v2 toggles, collected before
// `create_room` is sent. Pure data collection — nothing reads
// these values yet (Phase A2 is pure plumbing per the v2 roadmap).
//
// Default config is exported so server + tests can share the
// canonical shape. All toggles default OFF; copiesPerDeck = 1.
// secretRoles is intentionally absent — that activates
// automatically when alive count >= 3 and is not host-toggleable.
// ============================================================

import { useState } from 'react';

export const DEFAULT_V2_CONFIG = {
  version: 1,
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
    rouletteRotation: false,
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
  { key: 'speedMode',        label: 'Speed Mode',        desc: '15s turn timer + auto-spin penalty' },
  { key: 'suddenDeath',      label: 'Sudden Death',      desc: 'Risk bumps every 4 elimination-free turns' },
  { key: 'mirrorMatch',      label: 'Mirror Match',      desc: 'Spin lands on the player opposite the table' },
  { key: 'rouletteRotation', label: 'Roulette Rotation', desc: 'Turn order reshuffles every cycle (3+ players)' },
];

const SYSTEMS = [
  { key: 'bounty',       label: 'Bounty',          desc: '3 spins survived → bounty placed on you' },
  { key: 'betting',      label: 'Betting',         desc: '10s window to wager on bluff outcomes' },
  { key: 'deadMansHand', label: 'Dead Man\'s Hand', desc: 'Ghost council vote when 3+ are eliminated' },
  { key: 'lastStand',    label: 'Last Stand',      desc: 'Final two players enter spin-vs-spin duel' },
];

// ─── Shared toggle row ────────────────────────────────────
// `disabled` greys the row out and blocks toggling; `disabledReason` is shown
// in place of the description so the host sees WHY it can't be selected
// (e.g. "Needs 3+ players"). A disabled option can never be switched on.
function ToggleRow({ id, label, desc, checked, onChange, disabled = false, disabledReason = null }) {
  const showChecked = checked && !disabled;
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 12px',
        minHeight: 44,
        background: showChecked ? 'rgba(232,255,74,0.04)' : 'var(--surface)',
        border: `1px solid ${showChecked ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={showChecked}
        disabled={disabled}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        style={{
          width: 20, height: 20,
          marginTop: 2,
          accentColor: 'var(--accent)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          color: showChecked ? 'var(--accent)' : 'var(--text)',
          marginBottom: 2,
        }}>
          {label.toUpperCase()}
        </div>
        <div style={{
          fontSize: 11,
          color: disabled ? 'var(--eliminated)' : 'var(--text-dim)',
          lineHeight: 1.5,
          fontStyle: disabled ? 'italic' : 'normal',
        }}>
          {disabled && disabledReason ? disabledReason : desc}
        </div>
      </div>
    </label>
  );
}

// ─── Section header buttons (Select All / Deselect All) ───
// Plain "link"-style buttons; minHeight respects mobile tap target.
function SectionButton({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        minHeight: 32,
        padding: '4px 10px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 999,
        color: 'var(--text-dim)',
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────
function Section({ title, children, footer, onSelectAll, onDeselectAll }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 4,
      }}>
        <div style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.18em',
        }}>
          {title}
        </div>
        {(onSelectAll || onDeselectAll) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {onSelectAll && (
              <SectionButton onClick={onSelectAll} ariaLabel={`Enable all in ${title}`}>All</SectionButton>
            )}
            {onDeselectAll && (
              <SectionButton onClick={onDeselectAll} ariaLabel={`Disable all in ${title}`}>None</SectionButton>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
      {footer}
    </div>
  );
}

function setAllInGroup(items, value) {
  const out = {};
  for (const { key } of items) out[key] = value;
  return out;
}

// ─── Player-count gating ──────────────────────────────────
// A few modifiers/systems are meaningless or unfair below a player-count
// threshold and the server auto-disables them at start_game anyway. We
// reflect that in the lobby so the host never picks something that won't
// apply. `mode: 'disable'` greys the toggle with a reason but keeps it
// visible; `mode: 'hide'` removes the row entirely.
//   • Roulette Rotation — needs 3+ (with 2 the only repeat-free order is
//     plain alternation, so it's a no-op). Shown-but-disabled below 3.
//   • Mirror Match — spins land on the opposite seat, so it needs an even
//     table of 4+. Hidden otherwise.
//   • Last Stand — the final-two duel only makes sense with a real field,
//     so it's hidden at 4 players or fewer.
// `playerCount == null` means "caller didn't supply a count" → no gating.
function gatingFor(playerCount) {
  if (playerCount == null) return {};
  const even = playerCount % 2 === 0;
  const gate = {};
  if (playerCount < 3) {
    gate.rouletteRotation = { mode: 'disable', reason: 'Needs 3 or more players' };
  }
  if (!(playerCount >= 4 && even)) {
    gate.mirrorMatch = { mode: 'hide' };
  }
  if (playerCount < 5) {
    gate.lastStand = { mode: 'hide' };
  }
  return gate;
}

function formatSavedMeta(savedMeta) {
  if (!savedMeta?.updatedAt) return null;
  try {
    const timestamp = new Date(savedMeta.updatedAt).toLocaleString();
    if (savedMeta.updatedByUsername) {
      return `Settings saved - updated ${timestamp} by @${savedMeta.updatedByUsername}`;
    }
    return `Settings saved - updated ${timestamp}`;
  } catch (_) {
    if (savedMeta.updatedByUsername) {
      return `Settings saved by @${savedMeta.updatedByUsername}`;
    }
    return 'Settings saved';
  }
}

// ─── Main component ───────────────────────────────────────
export function PreGameSettingsPanel({ config, onChange, isGroupRoom = false, savedMeta = null, playerCount = null }) {
  const [open, setOpen] = useState(false);
  const gating = gatingFor(playerCount);

  // Render a toggle row, applying player-count gating: hidden rows return
  // null; disabled rows render greyed-out with the reason in place of desc.
  const renderToggle = (idPrefix, { key, label, desc }, checked, onToggle) => {
    const g = gating[key];
    if (g?.mode === 'hide') return null;
    return (
      <ToggleRow
        key={key}
        id={`${idPrefix}-${key}`}
        label={label}
        desc={desc}
        checked={checked}
        onChange={(v) => onToggle(key, v)}
        disabled={g?.mode === 'disable'}
        disabledReason={g?.reason || null}
      />
    );
  };

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

  // ─── #66 — Select All / Deselect All helpers ─────────────
  const setAllPowerCards = (value) => {
    onChange({
      ...config,
      powerCards: {
        ...config.powerCards,
        enabled: setAllInGroup(POWER_CARDS, value),
      },
    });
  };
  const setAllRisk = (value) => {
    onChange({ ...config, riskModifiers: setAllInGroup(RISK_MODS, value) });
  };
  const setAllRoom = (value) => {
    onChange({ ...config, roomModifiers: setAllInGroup(ROOM_MODS, value) });
  };
  const setAllSystems = (value) => {
    onChange({ ...config, systems: setAllInGroup(SYSTEMS, value) });
  };
  const setAllGlobal = (value) => {
    onChange({
      ...config,
      powerCards: { ...config.powerCards, enabled: setAllInGroup(POWER_CARDS, value) },
      riskModifiers: setAllInGroup(RISK_MODS, value),
      roomModifiers: setAllInGroup(ROOM_MODS, value),
      systems: setAllInGroup(SYSTEMS, value),
    });
  };
  const resetToDefaults = () => {
    onChange({ ...DEFAULT_V2_CONFIG });
  };
  const savedMetaText = isGroupRoom ? formatSavedMeta(savedMeta) : null;

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
          {savedMetaText && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
              {savedMetaText}
            </span>
          )}
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
          {/* Global Enable/Disable bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
              ALL SETTINGS
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <SectionButton onClick={() => setAllGlobal(true)} ariaLabel="Enable everything">
                Enable Everything
              </SectionButton>
              <SectionButton onClick={() => setAllGlobal(false)} ariaLabel="Disable everything">
                Disable Everything
              </SectionButton>
            </div>
          </div>

          {/* Power Cards */}
          <Section
            title="POWER CARDS"
            onSelectAll={() => setAllPowerCards(true)}
            onDeselectAll={() => setAllPowerCards(false)}
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
          <Section
            title="RISK MODIFIERS"
            onSelectAll={() => setAllRisk(true)}
            onDeselectAll={() => setAllRisk(false)}
          >
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
          <Section
            title="ROOM MODIFIERS"
            onSelectAll={() => setAllRoom(true)}
            onDeselectAll={() => setAllRoom(false)}
          >
            {ROOM_MODS.map((item) =>
              renderToggle('room', item, config.roomModifiers[item.key], setRoom),
            )}
          </Section>

          {/* Special Systems */}
          <Section
            title="SPECIAL SYSTEMS"
            onSelectAll={() => setAllSystems(true)}
            onDeselectAll={() => setAllSystems(false)}
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
                Secret roles activate automatically when 3+ players are alive — not host-toggleable.
              </div>
            }
          >
            {SYSTEMS.map((item) =>
              renderToggle('sys', item, config.systems[item.key], setSystem),
            )}
          </Section>
          {isGroupRoom && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              paddingTop: 4,
            }}>
              <button
                type="button"
                onClick={resetToDefaults}
                style={{
                  minHeight: 36,
                  padding: '8px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
