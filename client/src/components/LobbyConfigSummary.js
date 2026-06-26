'use client';

// ============================================================
// LobbyConfigSummary - read-only view of room.config for non-host
// players sitting in the lobby. Updates live every time the host
// edits the settings (server broadcasts a fresh room_state).
//
// Sister component to ActiveConfigPanel (#68) - the in-game panel.
// This one renders inline (not fixed-positioned) inside the lobby
// card and always lists every section so non-hosts see "Nothing
// enabled yet" instead of a missing area.
// ============================================================

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
  { key: 'speedMode',        label: 'Speed Mode' },
  { key: 'suddenDeath',      label: 'Sudden Death' },
  { key: 'mirrorMatch',      label: 'Mirror Match' },
  { key: 'rouletteRotation', label: 'Roulette Rotation' },
];

const SYSTEMS = [
  { key: 'bounty',       label: 'Bounty' },
  { key: 'betting',      label: 'Betting' },
  { key: 'deadMansHand', label: "Dead Man's Hand" },
  { key: 'lastStand',    label: 'Last Stand' },
];

function pickLabels(items, source) {
  if (!source) return [];
  return items.filter(({ key }) => !!source[key]).map((item) => item.label);
}

function Row({ title, items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <div style={{
        fontSize: 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        minWidth: 86,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text)', flex: 1, lineHeight: 1.5 }}>
        {items.length > 0 ? items.join(', ') : <span style={{ color: 'var(--text-dim)' }}>None</span>}
      </div>
    </div>
  );
}

export function LobbyConfigSummary({ config }) {
  const rows = [
    { title: 'Power Cards', items: pickLabels(POWER_CARDS, config?.powerCards?.enabled) },
    { title: 'Risk',        items: pickLabels(RISK_MODS,   config?.riskModifiers) },
    { title: 'Room',        items: pickLabels(ROOM_MODS,   config?.roomModifiers) },
    { title: 'Systems',     items: pickLabels(SYSTEMS,     config?.systems) },
  ];

  return (
    <div
      aria-label="Lobby settings summary"
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{
        fontSize: 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.15em',
        marginBottom: 2,
      }}>
        GAME SETTINGS (HOST EDITING)
      </div>
      {rows.map((row) => (
        <Row key={row.title} title={row.title} items={row.items} />
      ))}
    </div>
  );
}
