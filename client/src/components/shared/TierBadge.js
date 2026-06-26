// ─── TierBadge - progression tier chip (Phase 5, #305) ────────────────────────
// A small inline chip naming the player's (or room's) tier, colour-treated per
// tier using existing globals.css tokens. Used in CosmeticsPanel, LandingScreen,
// and the OnlinePlayerUI lobby (host's tier). Pure presentational - pass a tier
// string ('streets' | 'backroads' | 'syndicate' | 'covenant'); unknown values
// fall back to Streets.

import { tierMeta } from '../../lib/tiers';
import { TierSigil } from './TierSigil';

export function TierBadge({ tier, size = 'sm', showSigil = true, style = {} }) {
  if (!tier) return null;
  const meta = tierMeta(tier);
  const small = size === 'sm';
  return (
    <span
      title={meta.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? 5 : 7,
        padding: small ? '2px 9px 2px 5px' : '3px 13px 3px 6px',
        borderRadius: 999,
        fontFamily: "'Cinzel', serif",
        fontSize: small ? 9 : 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: meta.color,
        border: `1px solid ${meta.color}`,
        background: 'rgba(0,0,0,0.25)',
        boxShadow: meta.glow ? `0 0 10px ${meta.glow}` : 'none',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {showSigil && <TierSigil tier={tier} size={small ? 15 : 19} />}
      {meta.label}
    </span>
  );
}
