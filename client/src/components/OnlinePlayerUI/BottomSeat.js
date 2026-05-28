import { VoiceIndicator } from '../VoicePanel';
import { CardHand } from './CardHand';

// ─── BottomSeat — the player's first-person view at the table ─────────────────
// This is the cardholder trough and action controls at the bottom of the screen.
// It is styled as a first-person perspective facing the table edge: a dark wooden
// rail with the card fan visible just below eye level.
export function BottomSeat({
  voice,
  myPlayer,
  isEliminated,
  isMyTurn,
  isMyNextTurn = false,
  isPlaying,
  isLobby,
  isGameOver,
  callBluff,
  endTurn,
  isFirstTurn,
  bluffUsedThisTurn,
  cardPlayedThisTurn,
  bluffBlockedThisTurn,
  actionHint,
  showSpectatorView,
  alivePlayers,
  spectatingId,
  spectatedHand,
  handleSpectatePlayer,
  myHand,
  myPowerCardSlot = [],
  selectedCardId,
  handleCardClick,
  handlePowerCardClick,
  phase,
  leaveGame,
}) {
  const shapeCardCount = myHand.filter((card) => card?.type !== 'power').length;
  const powerCardCount = (myPowerCardSlot?.length || 0)
    + myHand.filter((card) => card?.type === 'power').length;

  return (
    <div
      className="topdown-bottom"
      style={{
        marginTop: 'auto',
        /* First-person wooden table rail */
        borderTop: '2px solid var(--border-lit)',
        background: `
          linear-gradient(
            to top,
            rgba(16,10,6,0.98) 0%,
            rgba(12,8,5,0.92) 30%,
            rgba(8,6,4,0.6) 70%,
            transparent 100%
          )
        `,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Nameplate + chamber indicator ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px 6px',
        flexWrap: 'wrap',
      }}>
        {/* Player name + turn tag */}
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 16,
          color: isEliminated
            ? 'var(--accent2)'
            : isMyTurn && isPlaying
              ? 'var(--accent)'
              : 'var(--text)',
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textShadow: isMyTurn && isPlaying && !isEliminated
            ? '0 0 14px rgba(200,146,46,0.4)'
            : 'none',
        }}>
          {voice && (
            <VoiceIndicator
              playerId={myPlayer.id}
              speakingIds={voice.speakingIds}
              voiceConnected={voice.isConnected}
              size={9}
            />
          )}
          {myPlayer.username}
          {isMyTurn && isPlaying && !isEliminated && (
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--accent)',
              border: '1px solid var(--accent-dim)',
              padding: '2px 8px',
              borderRadius: 2,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              boxShadow: '0 0 8px rgba(200,146,46,0.2)',
            }}>
              Your Turn
            </span>
          )}
          {!isMyTurn && isMyNextTurn && isPlaying && !isEliminated && (
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--accent-dim)',
              border: '1px solid var(--border-glow)',
              padding: '2px 8px',
              borderRadius: 2,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}>
              Up Next
            </span>
          )}
        </div>

        {/* Chamber status — 6-slot revolver display */}
        {!isEliminated && !isLobby && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'linear-gradient(160deg, var(--surface3) 0%, var(--surface2) 100%)',
            border: '1px solid var(--border-lit)',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 8,
              color: 'var(--text-dim)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}>
              Chamber
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 6 }).map((_, index) => {
                const isBullet = myPlayer.chamber?.[index] === 'bullet';
                return (
                  <div
                    key={index}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: isBullet
                        ? 'radial-gradient(circle at 35% 35%, #ff5555, var(--accent2))'
                        : 'var(--surface)',
                      border: `1px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                      boxShadow: isBullet ? '0 0 6px rgba(155,28,28,0.6)' : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.06em',
            }}>
              {myPlayer.chamber?.filter((slot) => slot === 'bullet').length ?? 1}/6
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons: Bluff + End Turn ── */}
      {isMyTurn && isPlaying && !isEliminated && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isFirstTurn && (
              <button
                className="danger"
                onClick={callBluff}
                disabled={bluffUsedThisTurn || bluffBlockedThisTurn}
                title={bluffBlockedThisTurn ? 'No card to challenge — last turn was frozen' : undefined}
                style={{
                  flex: 1,
                  opacity: bluffUsedThisTurn || bluffBlockedThisTurn ? 0.35 : 1,
                  cursor: bluffUsedThisTurn || bluffBlockedThisTurn ? 'not-allowed' : 'pointer',
                  padding: '14px',
                  letterSpacing: '0.16em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {/* Bell icon — "ring to challenge" */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Call Bluff
              </button>
            )}
            {cardPlayedThisTurn && (
              <button
                className="primary"
                onClick={endTurn}
                style={{
                  flex: 1,
                  padding: '14px',
                  letterSpacing: '0.16em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {/* Checkmark stamp */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                End Turn
              </button>
            )}
          </div>
          {actionHint && (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 13,
              color: 'var(--text-dim)',
              marginTop: 8,
              fontStyle: 'italic',
              paddingLeft: 2,
            }}>
              {actionHint}
            </div>
          )}
        </div>
      )}

      {/* ── Spectator view ── */}
      {showSpectatorView ? (
        <div
          style={{
            ...{
              background: 'linear-gradient(160deg, rgba(22,17,11,0.95) 0%, rgba(13,10,7,0.97) 100%)',
              border: '1px solid var(--border-lit)',
              borderRadius: 5,
              padding: '14px 16px',
              margin: '0 12px 10px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            },
          }}
        >
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Spectating
          </div>
          <div style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: 14,
            color: 'var(--text-dim)',
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}>
            You&apos;ve been eliminated. You may follow the game, but opponents&apos; hands are hidden.
          </div>
        </div>
      ) : (
        !isLobby && !isGameOver && (
          <div style={{ padding: '0 12px 8px' }}>
            {/* Hand label */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
              fontFamily: "'Cinzel', serif",
              fontSize: 8,
              color: 'var(--text-dim)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}>
              <span>Your Hand</span>
              <span>
                {shapeCardCount} card{shapeCardCount !== 1 ? 's' : ''}
                {powerCardCount > 0 && (
                  <span style={{ color: 'var(--accent)' }}> + {powerCardCount} power</span>
                )}
              </span>
            </div>
            <CardHand
              hand={myHand}
              powerCardSlot={myPowerCardSlot}
              selectedCardId={isMyTurn && isPlaying && !cardPlayedThisTurn ? selectedCardId : null}
              onCardClick={handleCardClick}
              onPowerCardClick={handlePowerCardClick}
              interactive={isMyTurn && isPlaying && !cardPlayedThisTurn}
              powerInteractive={isMyTurn && isPlaying}
            />
          </div>
        )
      )}

      {/* Leave game link */}
      {(() => {
        const leaveBlocked = isMyTurn && isPlaying && !isEliminated;
        return (
          <button
            onClick={() => {
              if (leaveBlocked) return;
              const isMidGame = !!phase && !['lobby', 'game_over'].includes(phase);
              if (isMidGame && !window.confirm(
                'Leave the table? You will forfeit and cannot rejoin this round.',
              )) return;
              leaveGame();
            }}
            disabled={leaveBlocked}
            title={leaveBlocked ? 'Finish or end your turn before leaving' : undefined}
            style={{
              display: 'block',
              margin: '4px auto 20px',
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              border: 'none',
              background: 'none',
              padding: '4px 8px',
              textDecoration: 'underline',
              cursor: leaveBlocked ? 'not-allowed' : 'pointer',
              opacity: leaveBlocked ? 0.35 : 0.6,
            }}
          >
            Leave Table
          </button>
        );
      })()}
    </div>
  );
}
