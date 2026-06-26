// ─── XpSummary — the end-of-game XP strip (#205, #307) ────────────────────────
// Rendered under the victory declaration at game_over when the server sent
// this client a private `xp_awarded` payload. Shows the gain, an animated
// level-progress bar, level-up + tier-promotion banners, any newly-unlocked
// cosmetics, and a sign-in nudge for guests (whose XP isn't persisted).

import { tierMeta } from '../../lib/tiers';

// Ordered so the breakdown reads top-to-bottom by significance. Keys mirror
// the server's `computeXpAward` breakdown shape (all eight action types).
const BREAKDOWN_LABELS = {
  win: 'Victory',
  spinsSurvived: 'Spins survived',
  correctBluffCalls: 'Bluffs called right',
  bluffDefended: 'Bluffs defended',
  playersEliminated: 'Players eliminated',
  powerCardsResolved: 'Power cards resolved',
  lastStandWin: 'Last Stand win',
  participation: 'Played',
};

export function XpSummary({ xpAward, isMobile = false }) {
  if (!xpAward) return null;
  const {
    gained, breakdown, guest,
    totalXp, level, leveledUp, unlocked,
    levelFloorXp, nextLevelXp,
    newLevel, newTier, previousTier,
  } = xpAward;

  // Render breakdown rows in the canonical order, non-zero only.
  const parts = Object.keys(BREAKDOWN_LABELS)
    .filter((k) => (breakdown?.[k] || 0) > 0)
    .map((k) => `${BREAKDOWN_LABELS[k]} +${breakdown[k]}`);

  // A tier promotion happened if the award crossed a tier boundary.
  const tierUp = !guest && newTier && previousTier && newTier !== previousTier;
  const newTierStyle = newTier ? tierMeta(newTier) : null;

  const span = (nextLevelXp ?? 0) - (levelFloorXp ?? 0);
  const progressPct = !guest && span > 0
    ? Math.max(0, Math.min(100, Math.round(((totalXp - levelFloorXp) / span) * 100)))
    : 0;

  return (
    <div style={{
      flex: '0 0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      padding: '2px 16px 6px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: isMobile ? 13 : 15,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: 'var(--alive)',
        textShadow: '0 0 14px rgba(74,255,128,0.35)',
      }}>
        +{gained} XP
      </div>

      {parts.length > 0 && (
        <div style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: 12,
          fontStyle: 'italic',
          color: 'var(--text-dim)',
        }}>
          {parts.join(' · ')}
        </div>
      )}

      {guest ? (
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}>
          Sign in to keep your XP &amp; unlock cosmetics
        </div>
      ) : (
        <>
          <div style={{
            width: 'min(260px, 70vw)',
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--alive))',
              transition: 'width 1.2s cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: leveledUp ? 'var(--accent)' : 'var(--text-dim)',
          }}>
            {leveledUp ? `Level up! → Level ${newLevel ?? level}` : `Level ${level} · ${totalXp} XP`}
          </div>
          {tierUp && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: isMobile ? 11 : 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: newTierStyle.color,
              textShadow: newTierStyle.glow ? `0 0 12px ${newTierStyle.glow}` : 'none',
            }}>
              Welcome to {newTierStyle.name}!
            </div>
          )}
          {(unlocked?.length || 0) > 0 && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'var(--accent)',
            }}>
              Unlocked: {unlocked.map((u) => u.label).join(', ')} — see Cosmetics in the settings menu
            </div>
          )}
        </>
      )}
    </div>
  );
}
