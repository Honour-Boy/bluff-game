import { CardShape } from '../shared/CardShape';
import { ShapeIcon } from '../shared/ShapeIcon';
import { ActionLog } from '../ActionLog';
import { CloseIcon } from '../shared/CloseIcon';

const phasePanelBase = {
  padding: '12px 16px',
  background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
};

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
  const tensionPhase = isBluffResolution || isSpinPending;
  const borderColor = tensionPhase
    ? 'var(--accent2)'
    : isGameOver
      ? 'var(--border-glow)'
      : isRoundEnd
        ? 'var(--alive)'
        : 'var(--border-lit)';

  const labelColor = tensionPhase
    ? '#c85050'
    : isGameOver
      ? 'var(--accent)'
      : isRoundEnd
        ? 'var(--alive)'
        : 'var(--text-dim)';

  const label = isLobby ? 'Waiting for patrons'
    : isPlaying ? 'Game in progress'
    : isBluffResolution ? 'Bluff called - reveal the last card'
    : isSpinPending ? `Awaiting ${spinTargetPlayer?.username ?? '...'} to spin`
    : isRoundEnd ? 'Round ended - patrons reshuffle'
    : isGameOver ? 'The game concludes'
    : '';

  return (
    <div style={{
      ...phasePanelBase,
      border: `1px solid ${borderColor}`,
      background: tensionPhase
        ? 'linear-gradient(160deg, rgba(30,8,8,0.96) 0%, rgba(16,5,5,0.97) 100%)'
        : phasePanelBase.background,
      boxShadow: tensionPhase
        ? `0 4px 14px rgba(0,0,0,0.5), 0 0 20px rgba(155,28,28,0.12)`
        : phasePanelBase.boxShadow,
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: labelColor,
      }}>
        {label}
      </div>
      {isGameOver && lastAction?.winnerName && (
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.06em',
          textShadow: '0 0 12px rgba(200,146,46,0.3)',
        }}>
          {lastAction.winnerName} prevails
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
  const cardStyle = {
    background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
    border: '1px solid var(--border-lit)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px 14px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
  };

  return (
    <>
      {(isPlaying || isBluffResolution || isSpinPending) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* Required card */}
          <div style={{ ...cardStyle, flex: 1, minWidth: 150 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 8,
              color: 'var(--text-dim)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}>
              Required Card
            </div>
            <div style={{
              padding: '8px',
              background: 'linear-gradient(160deg, rgba(30,22,14,0.9) 0%, rgba(16,12,8,0.9) 100%)',
              border: '1px solid var(--border-glow)',
              borderRadius: 4,
              display: 'inline-block',
              marginBottom: 8,
              boxShadow: '0 0 10px rgba(200,146,46,0.12)',
            }}>
              <CardShape type={currentCardType} size="md" />
            </div>
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 13,
              color: 'var(--text-dim)',
              lineHeight: 1.5,
              fontStyle: 'italic',
            }}>
              Announce to all patrons
            </div>
          </div>

          {/* Current player */}
          <div style={{ ...cardStyle, flex: 1, minWidth: 150 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 8,
              color: 'var(--text-dim)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}>
              Current Patron
            </div>
            {currentPlayer ? (
              <>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 24,
                  color: 'var(--accent)',
                  lineHeight: 1,
                  letterSpacing: '0.06em',
                  textShadow: '0 0 12px rgba(200,146,46,0.25)',
                }}>
                  {currentPlayer.username}
                </div>
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  marginTop: 6,
                  fontStyle: 'italic',
                }}>
                  Risk: {currentPlayer.riskLevel}/6
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>-</div>
            )}
          </div>
        </div>
      )}

      {lastAction && <ActionLog lastAction={lastAction} />}

      {isPlayingPhase && eliminationBanner && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(200,146,46,0.07)',
          border: '1px solid var(--border-glow)',
          borderRadius: 'var(--radius)',
          fontFamily: "'Crimson Text', serif",
          fontSize: 14,
          color: 'var(--accent)',
        }}>
          <span>
            Patron eliminated. New required card:&nbsp;
            <strong style={{ fontStyle: 'normal' }}>
              <ShapeIcon shape={eliminationBanner} size={14} />
              {' '}{eliminationBanner}
            </strong>
          </span>
          <button
            onClick={onDismissEliminationBanner}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}
    </>
  );
}
