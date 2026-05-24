import { VoiceIndicator } from '../VoicePanel';
import { CardHand } from './CardHand';

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
  // #139 — the power card lives in its own slot and must never change the
  // playable-card count. Count shape cards for the headline number and show
  // any held power card separately.
  const shapeCardCount = myHand.filter((card) => card?.type !== 'power').length;
  const powerCardCount = (myPowerCardSlot?.length || 0)
    + myHand.filter((card) => card?.type === 'power').length;

  return (
    <div
      className="topdown-bottom"
      style={{
        marginTop: 'auto',
        paddingTop: 12,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        borderTop: '1px solid var(--border)',
        background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            color: isEliminated ? 'var(--accent2)' : isMyTurn && isPlaying ? 'var(--warning)' : 'var(--text)',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {voice && (
            <VoiceIndicator
              playerId={myPlayer.id}
              speakingIds={voice.speakingIds}
              voiceConnected={voice.isConnected}
              size={9}
            />
          )}
          {myPlayer.username}{' '}
          {isMyTurn && isPlaying && !isEliminated && (
            <span style={{ fontSize: 10, color: 'var(--warning)', border: '1px solid var(--warning)', padding: '1px 5px', borderRadius: 2 }}>
              YOUR TURN
            </span>
          )}
          {!isMyTurn && isMyNextTurn && isPlaying && !isEliminated && (
            <span style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '1px 5px', borderRadius: 2 }}>
              UP NEXT
            </span>
          )}
        </div>

        {!isEliminated && !isLobby && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>CHAMBER</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: 6 }).map((_, index) => {
                const isBullet = myPlayer.chamber?.[index] === 'bullet';
                return (
                  <div
                    key={index}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: isBullet ? 'var(--accent2)' : 'var(--surface2)',
                      border: `1px solid ${isBullet ? 'var(--accent2)' : 'var(--border)'}`,
                      boxShadow: isBullet ? '0 0 5px rgba(255,74,110,0.5)' : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {myPlayer.chamber?.filter((slot) => slot === 'bullet').length ?? 1}/6
            </div>
          </div>
        )}
      </div>

      {isMyTurn && isPlaying && !isEliminated && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isFirstTurn && (
              // Playtest §1.1 — Call Bluff stays available for the whole active
              // turn window, even after a normal card has been played; only a
              // bluff already used or a frozen-skip turn (§1.2) disables it.
              <button
                className="danger"
                onClick={callBluff}
                disabled={bluffUsedThisTurn || bluffBlockedThisTurn}
                title={bluffBlockedThisTurn ? 'No card to challenge — last turn was frozen' : undefined}
                style={{
                  flex: 1,
                  opacity: bluffUsedThisTurn || bluffBlockedThisTurn ? 0.4 : 1,
                  cursor: bluffUsedThisTurn || bluffBlockedThisTurn ? 'not-allowed' : 'pointer',
                }}
              >
                Call Bluff
              </button>
            )}
            {cardPlayedThisTurn && (
              <button className="primary" onClick={endTurn} style={{ flex: 1 }}>
                End Turn
              </button>
            )}
          </div>
          {actionHint && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              {actionHint}
            </div>
          )}
        </div>
      )}

      {showSpectatorView ? (
        // §3.2 — anti-cheat lockout. An eliminated / dead player watches the
        // table but can NO LONGER reveal any living opponent's hand. The old
        // per-player hand picker is removed; only public info (risk, hand sizes
        // on the chips, announcements) remains visible.
        <div className="card" style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>
            SPECTATING
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            You&apos;ve been eliminated. You can follow the game, but opponents&apos;
            hands are hidden.
          </div>
        </div>
      ) : (
        !isLobby && !isGameOver && (
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                letterSpacing: '0.12em',
                marginBottom: 6,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>YOUR HAND</span>
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
              // Playtest §1.1 — power cards remain tappable for the whole active
              // turn (even after a shape card was played), while shape cards
              // lock once the single play is spent.
              powerInteractive={isMyTurn && isPlaying}
            />
          </div>
        )
      )}

      {/* §2.2 — Leave is available to host and members alike, but never
          mid-action: blocking it during your own active turn stops a player
          from abandoning a turn the table is waiting on. Host migration /
          group reset is handled server-side in leave_room. */}
      {(() => {
        const leaveBlocked = isMyTurn && isPlaying && !isEliminated;
        return (
          <button
            onClick={() => {
              if (leaveBlocked) return;
              const isMidGame = !!phase && !['lobby', 'game_over'].includes(phase);
              if (isMidGame && !window.confirm(
                'Leave the game? You will forfeit and cannot rejoin this round.',
              )) return;
              leaveGame();
            }}
            disabled={leaveBlocked}
            title={leaveBlocked ? 'Finish or end your turn before leaving' : undefined}
            style={{
              alignSelf: 'center',
              fontSize: 11,
              color: 'var(--text-dim)',
              border: 'none',
              background: 'none',
              padding: 0,
              textDecoration: 'underline',
              cursor: leaveBlocked ? 'not-allowed' : 'pointer',
              opacity: leaveBlocked ? 0.4 : 1,
              marginTop: 10,
              marginBottom: 24,
            }}
          >
            Leave game
          </button>
        );
      })()}
    </div>
  );
}
