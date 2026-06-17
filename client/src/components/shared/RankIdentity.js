// ============================================================
// RankIdentity — the player's rank/level/XP, surfaced everywhere
// ============================================================
// Rank (tier), level, and XP progress used to live only inside the Cosmetics
// panel. This widget makes them evident wherever a player's identity shows.
//
//   variant="full"  — a prominent identity panel (Landing header): tier sigil
//                     + tier name + Level N + an XP-to-next bar with counts.
//   variant="chip"  — a compact pill (groups, lobby, etc.): sigil + Lv N + tier.
//
// Accepts the `get_progression` progression object ({ level, xp, levelFloorXp,
// nextLevelXp }); tier is derived from level. Pure inline styles, no deps.

import { tierForLevel, tierMeta } from '../../lib/tiers';
import { TierSigil } from './TierSigil';

const MAX_LEVEL = 20;

function xpProgress(p) {
  const level = p?.level || 1;
  const isMax = level >= MAX_LEVEL;
  const span = (p?.nextLevelXp ?? 0) - (p?.levelFloorXp ?? 0);
  const pct = isMax
    ? 100
    : (p && span > 0 ? Math.max(0, Math.min(100, Math.round(((p.xp - p.levelFloorXp) / span) * 100))) : 0);
  return { level, isMax, pct };
}

export function RankIdentity({ progression, variant = 'full', isGuest = false, style = {} }) {
  const p = progression || { level: 1, xp: 0, levelFloorXp: 0, nextLevelXp: 150 };
  const { level, isMax, pct } = xpProgress(p);
  const tier = tierForLevel(level);
  const meta = tierMeta(tier);

  // ── Compact pill ──
  if (variant === 'chip') {
    return (
      <span
        title={`${meta.name} · Level ${level}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px 3px 5px', borderRadius: 999,
          border: `1px solid ${meta.color}`, background: 'rgba(0,0,0,0.28)',
          boxShadow: meta.glow ? `0 0 10px ${meta.glow}` : 'none',
          fontFamily: "'Cinzel', serif", whiteSpace: 'nowrap', lineHeight: 1.2,
          ...style,
        }}
      >
        <TierSigil tier={tier} size={17} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: meta.color }}>
          {meta.label}
        </span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          LV {level}
        </span>
      </span>
    );
  }

  // ── Full identity panel ──
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px', borderRadius: 12,
        background: 'linear-gradient(150deg, rgba(255,255,255,0.04), rgba(0,0,0,0.22))',
        border: `1px solid ${meta.color}55`,
        boxShadow: meta.glow ? `0 0 22px ${meta.glow}` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      <TierSigil tier={tier} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: meta.color, textShadow: meta.glow ? `0 0 10px ${meta.glow}` : 'none' }}>
            {meta.name}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-mid)' }}>
            {isMax ? 'Max Level' : `Level ${level}`}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${meta.fill}, var(--accent))`, boxShadow: meta.glow ? `0 0 8px ${meta.glow}` : 'none', transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-dim)', marginTop: 4 }}>
          {isGuest
            ? 'Guest — sign in to keep your XP & rank'
            : isMax
              ? `${p.xp} XP · the top of the ladder`
              : `${p.xp} / ${p.nextLevelXp} XP · ${p.nextLevelXp - p.xp} to next level`}
        </div>
      </div>
    </div>
  );
}
