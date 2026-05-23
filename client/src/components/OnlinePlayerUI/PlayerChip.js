import { VoiceIndicator } from '../VoicePanel';

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
              border: `1px solid ${loaded ? (danger ? 'var(--accent2)' : 'var(--warning)') : 'var(--border)'}`,
            }}
          />
        );
      })}
    </div>
  );
}

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
  const height = compact ? 88 : 110;
  const streak = player.consecutiveCorrectBets || 0;
  const showStreak = bettingEnabled && streak > 0;
  const name = player.username || '';
  const truncated = name.length > 12 ? `${name.slice(0, 11)}...` : name;

  const borderColor = isCurrentTurn && alive
    ? 'var(--warning)'
    : isSpinTarget
      ? 'var(--accent2)'
      : 'var(--border)';

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
        background: 'var(--surface2)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        opacity: alive ? 1 : 0.4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 3,
        cursor: onClick ? 'pointer' : 'default',
        color: 'var(--text)',
        textAlign: 'center',
        boxShadow: isCurrentTurn && alive ? '0 0 12px rgba(255,170,74,0.35)' : 'none',
        animation: isCurrentTurn && alive ? 'chipTurnPulse 1.6s ease-in-out infinite' : 'none',
        position: 'relative',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {alive && player.hasBounty && (
        <span
          title="Bounty placed"
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontSize: compact ? 9 : 11,
            color: '#ff3552',
            lineHeight: 1,
          }}
        >
          B
        </span>
      )}

      <div
        style={{
          fontSize: compact ? 9 : 11,
          fontWeight: 700,
          color: isCurrentTurn && alive ? 'var(--warning)' : 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          letterSpacing: '0.02em',
          textDecoration: !alive ? 'line-through' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          justifyContent: 'center',
        }}
      >
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
              fontSize: compact ? 8 : 9,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'rgba(232,255,74,0.12)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
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

      <div
        style={{
          fontSize: compact ? 9 : 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.04em',
        }}
      >
        {player.handSize ?? '?'} cards
      </div>

      {alive && <MiniRiskDots riskLevel={player.riskLevel} />}

      <div
        style={{
          fontSize: compact ? 8 : 9,
          letterSpacing: '0.08em',
          minHeight: compact ? 10 : 12,
          color: isCurrentTurn && alive
            ? 'var(--warning)'
            : isSpinTarget
              ? 'var(--accent2)'
              : isNextTurn && alive
                ? 'var(--accent)'
                : 'transparent',
        }}
      >
        {isCurrentTurn && alive
          ? 'TURN'
          : isSpinTarget
            ? 'SPIN'
            : (isNextTurn && alive ? 'NEXT' : '.')}
      </div>
    </button>
  );
}
