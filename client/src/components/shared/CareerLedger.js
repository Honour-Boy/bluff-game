// ============================================================
// CareerLedger — lifetime stats that feed a player's XP
// ============================================================
// So a player can see what's carrying them. Reads `progression.stats` (served
// by get_progression) + `progression.gamesPlayed`; any missing field counts as
// 0 so a pre-stats payload renders a clean zero board. Pure inline styles, no
// deps — surfaced in the Landing profile drawer (the rank/XP home).

export function CareerLedger({ progression }) {
  const s = progression?.stats || {};
  const games = progression?.gamesPlayed ?? 0;
  const wins = s.wins ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

  const headline = [
    { label: 'Games', value: games },
    { label: 'Win Rate', value: `${winRate}%` },
  ];
  const rows = [
    { label: 'Wins', value: wins },
    { label: 'Spins Survived', value: s.spinsSurvived ?? 0 },
    { label: 'Bluffs Called Right', value: s.correctBluffCalls ?? 0 },
    { label: 'Bluffs Defended', value: s.bluffsDefended ?? 0 },
    { label: 'Eliminations', value: s.playersEliminated ?? 0 },
    { label: 'Power Cards Used', value: s.powerCardsResolved ?? 0 },
    { label: 'Last Stands Won', value: s.lastStandWins ?? 0 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {headline.map((h) => (
          <div key={h.label} style={{
            flex: 1,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '9px 10px',
          }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              {h.label}
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
              {h.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 14px' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: "'Crimson Text', serif", fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.2 }}>
              {r.label}
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
