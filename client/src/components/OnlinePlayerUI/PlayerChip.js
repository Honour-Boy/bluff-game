import { VoiceIndicator } from '../VoicePanel';
import { cardBackFor } from '../../lib/cosmetics';

// ─── Mini deck-skin card — the player's OWN equipped card back (#205) ─────────
// Deliberately resolved from player.cosmetics (broadcast to everyone), NOT the
// --cardback-bg CSS vars: those carry the VIEWER's skin, and the seat chip
// must show what its OWNER has equipped.
function MiniCardBack({ cardBackId, height = 17 }) {
  const back = cardBackFor(cardBackId);
  const width = Math.round(height * 0.72);
  const background = back.frame
    ? `url("${back.frame}") center / 100% 100% no-repeat`
    : `linear-gradient(135deg, ${back.a} 0%, ${back.b} 50%, ${back.c} 100%)`;
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: 2,
        background,
        border: '1px solid var(--border-lit)',
        flexShrink: 0,
      }}
    />
  );
}

// ─── Mini chamber dots — shown as risk bullets inside the chip ────────────────
function MiniRiskDots({ riskLevel = 1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: 6 }).map((_, index) => {
        const loaded = index < (riskLevel ?? 1);
        const danger = loaded && (riskLevel ?? 1) >= 5;
        return (
          <div
            key={index}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: loaded
                ? (danger ? 'var(--accent2)' : 'var(--warning)')
                : 'transparent',
              border: `1px solid ${loaded
                ? (danger ? 'var(--accent2)' : 'var(--warning)')
                : 'var(--border)'}`,
              boxShadow: loaded && danger ? '0 0 4px rgba(155,28,28,0.6)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── PlayerChip — carved wooden seat around the table ─────────────────────────
export function PlayerChip({
  player,
  isCurrentTurn,
  isNextTurn = false,
  isSpinTarget,
  voice,
  onClick,
  compact = false,
  bettingEnabled = false,
}) {
  const alive = player.status === 'alive';
  const width = compact ? 64 : 80;
  const height = compact ? 88 : 108;
  const streak = player.consecutiveCorrectBets || 0;
  const showStreak = bettingEnabled && streak > 0;
  const name = player.username || '';
  const truncated = name.length > 12 ? `${name.slice(0, 11)}…` : name;

  // Border colour: amber for active turn, blood-red for spin target
  const borderColor = isCurrentTurn && alive
    ? 'var(--warning)'
    : isSpinTarget
      ? 'var(--accent2)'
      : 'var(--border-lit)';

  const chipBg = isCurrentTurn && alive
    ? 'linear-gradient(160deg, #2a1e0a 0%, #1a1205 100%)'
    : isSpinTarget
      ? 'linear-gradient(160deg, #2a0a0a 0%, #1a0505 100%)'
      : 'linear-gradient(160deg, var(--surface3) 0%, var(--surface2) 100%)';

  const animationName = isCurrentTurn && alive
    ? 'chipTurnPulse'
    : isSpinTarget
      ? 'spinTargetPulse'
      : 'none';

  return (
    <button
      type="button"
      onClick={onClick}
      className="topdown-chip"
      style={{
        width,
        height,
        flexShrink: 0,
        padding: compact ? 5 : 7,
        background: chipBg,
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        opacity: alive ? 1 : 0.38,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        cursor: onClick ? 'pointer' : 'default',
        color: 'var(--text)',
        textAlign: 'center',
        animation: `${animationName} 1.8s ease-in-out infinite`,
        position: 'relative',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: 'border-color 0.2s',
        /* Subtle raised edge */
        boxShadow: '0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Bounty marker - tiny crimson badge */}
      {alive && player.hasBounty && (
        <span
          title="Bounty placed"
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontFamily: "'Cinzel', serif",
            fontSize: compact ? 8 : 9,
            color: 'var(--accent2)',
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          B
        </span>
      )}

      {/* Username */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: compact ? 8 : 10,
        fontWeight: 700,
        color: isCurrentTurn && alive
          ? 'var(--accent)'
          : isSpinTarget
            ? '#c85050'
            : 'var(--text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        letterSpacing: '0.04em',
        textDecoration: !alive ? 'line-through' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        justifyContent: 'center',
      }}>
        {voice && (
          <VoiceIndicator
            playerId={player.id}
            speakingIds={voice.speakingIds}
            voiceConnected={voice.isConnected}
            size={compact ? 6 : 7}
          />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {truncated}
        </span>
        {showStreak && (
          <span
            title={`Correct bet streak: ${streak}`}
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: compact ? 7 : 8,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'rgba(200,146,46,0.12)',
              border: '1px solid var(--accent-dim)',
              borderRadius: 4,
              padding: compact ? '0 3px' : '0 4px',
              lineHeight: 1.4,
              letterSpacing: 0,
              flexShrink: 0,
            }}
          >
            x{streak}
          </span>
        )}
      </div>

      {/* Hand size — fronted by this player's own equipped deck skin */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <MiniCardBack cardBackId={player.cosmetics?.cardBack} height={compact ? 14 : 17} />
        <span style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: compact ? 9 : 11,
          color: 'var(--text-dim)',
          letterSpacing: '0.02em',
          fontStyle: 'italic',
        }}>
          {player.handSize ?? '?'} cards
        </span>
      </div>

      {/* Risk dots */}
      {alive && <MiniRiskDots riskLevel={player.riskLevel} />}

      {/* Status label */}
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: compact ? 7 : 8,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        minHeight: compact ? 10 : 11,
        color: isCurrentTurn && alive
          ? 'var(--accent)'
          : isSpinTarget
            ? 'var(--accent2)'
            : isNextTurn && alive
              ? 'var(--accent-dim)'
              : 'transparent',
      }}>
        {isCurrentTurn && alive
          ? 'Turn'
          : isSpinTarget
            ? 'Spin'
            : (isNextTurn && alive ? 'Next' : '.')}
      </div>
    </button>
  );
}
