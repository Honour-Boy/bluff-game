import { CardShape } from '../shared/CardShape';
import { ShapeIcon } from '../shared/ShapeIcon';
import { ActionLog } from '../ActionLog';

export function HostPhaseBanner({
  isLobby,
  isPlaying,
  isBluffResolution,
  isSpinPending,
  isRoundEnd,
  isGameOver,
  spinTargetPlayer,
  lastAction,
}) {
  return (
    <div
      style={{
        padding: '10px 16px',
        background: 'var(--surface)',
        border: `1px solid ${isBluffResolution || isSpinPending ? 'var(--accent2)' : isGameOver ? 'var(--accent)' : isRoundEnd ? 'var(--alive)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: isBluffResolution || isSpinPending ? 'var(--accent2)' : isGameOver ? 'var(--accent)' : isRoundEnd ? 'var(--alive)' : 'var(--text-dim)',
        }}
      >
        {isLobby && 'Waiting for players'}
        {isPlaying && 'Game in progress'}
        {isBluffResolution && 'Bluff called - reveal last card'}
        {isSpinPending && `Waiting for ${spinTargetPlayer?.username ?? '...'} to spin`}
        {isRoundEnd && 'Round ended - players reshuffle'}
        {isGameOver && 'Game over'}
      </div>
      {isGameOver && lastAction?.winnerName && (
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
          Winner: {lastAction.winnerName}
        </div>
      )}
    </div>
  );
}

export function HostGameSummary({
  isPlaying,
  isBluffResolution,
  isSpinPending,
  currentCardType,
  currentPlayer,
  lastAction,
  isPlayingPhase,
  eliminationBanner,
  onDismissEliminationBanner,
}) {
  return (
    <>
      {(isPlaying || isBluffResolution || isSpinPending) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 12 }}>
              REQUIRED CARD
            </div>
            <CardShape type={currentCardType} size="md" />
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
              Announce this physically to players
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 12 }}>
              CURRENT PLAYER
            </div>
            {currentPlayer ? (
              <>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--warning)', lineHeight: 1 }}>
                  {currentPlayer.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  Risk: {currentPlayer.riskLevel}/6
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>-</div>
            )}
          </div>
        </div>
      )}

      {lastAction && <ActionLog lastAction={lastAction} />}

      {isPlayingPhase && eliminationBanner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(232,255,74,0.06)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            color: 'var(--accent)',
          }}
        >
          <span>
            Player eliminated. New required card:&nbsp;
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShapeIcon shape={eliminationBanner} size={14} />
              {eliminationBanner}
            </strong>
          </span>
          <button
            onClick={onDismissEliminationBanner}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            x
          </button>
        </div>
      )}
    </>
  );
}
