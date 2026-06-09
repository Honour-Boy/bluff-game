import { useEffect, useRef, useState } from 'react';
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
  endTurnLocked = false,
  endTurnLockHint = '',
  isFirstTurn,
  bluffUsedThisTurn,
  cardPlayedThisTurn,
  bluffBlockedThisTurn,
  // Tutorial clinic — own-turn drills (Peek/Freeze/Assassin) disable Call Bluff
  // so the learner stays on script.
  bluffLocked = false,
  actionHint,
  // (Module 5) unified status ticker text (active → instructions; otherwise →
  // what the active player is doing). (Module 3) spin-turn morph.
  tickerText = '',
  isMySpinTurn = false,
  playerSpin,
  // (Module 2/3) responsive sizing + the bluff-outcome line that, on mobile,
  // rides above the morphed Pull Trigger.
  isMobile = false,
  bluffOutcomeText = '',
  bluffOutcomeColor = 'var(--accent2)',
  showSpectatorView,
  alivePlayers,
  spectatingId,
  spectatedHand,
  handleSpectatePlayer,
  myHand,
  myPowerCardSlot = [],
  powerLocked = false,
  selectedCardId,
  handleCardClick,
  handlePowerCardClick,
  phase,
  leaveGame,
  // (Global redeal) while true the hand fan is emptied (faded out) so the
  // fly-out → deal-back card flight reads as the dock being re-dealt.
  reshuffling = false,
}) {
  const shapeCardCount = myHand.filter((card) => card?.type !== 'power').length;
  const powerCardCount = (myPowerCardSlot?.length || 0)
    + myHand.filter((card) => card?.type === 'power').length;

  // Track which card was just played so CardHand can animate it sliding to the pile.
  // Capture the selectedCardId the moment cardPlayedThisTurn transitions false→true.
  const prevPlayedRef = useRef(false);
  const prevSelectedRef = useRef(null);
  const [justPlayedCardId, setJustPlayedCardId] = useState(null);

  useEffect(() => {
    if (selectedCardId) prevSelectedRef.current = selectedCardId;
    if (!prevPlayedRef.current && cardPlayedThisTurn && prevSelectedRef.current) {
      setJustPlayedCardId(prevSelectedRef.current);
      // Clear after the animation duration (450 ms) so the card returns to normal
      const t = setTimeout(() => setJustPlayedCardId(null), 500);
      return () => clearTimeout(t);
    }
    prevPlayedRef.current = !!cardPlayedThisTurn;
    return undefined;
  }, [cardPlayedThisTurn, selectedCardId]);

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
      {/* ── Nameplate + chamber indicator (Module 2.3) ──
           Username + chamber on a single, no-wrap horizontal row; compacted on
           mobile so the text never wraps on narrow phones. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 8 : 12,
        padding: isMobile ? '7px 10px 4px' : '10px 12px 6px',
        flexWrap: 'nowrap',
      }}>
        {/* Player name + turn tag */}
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: isMobile ? 13 : 16,
          color: isEliminated
            ? 'var(--accent2)'
            : isMyTurn && isPlaying
              ? 'var(--accent)'
              : 'var(--text)',
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 6 : 8,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
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
            gap: isMobile ? 6 : 8,
            padding: isMobile ? '4px 8px' : '6px 12px',
            flexShrink: 0,
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
              display: isMobile ? 'none' : 'block',
            }}>
              Chamber
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 2 : 3 }}>
              {Array.from({ length: 6 }).map((_, index) => {
                const isBullet = myPlayer.chamber?.[index] === 'bullet';
                const dot = isMobile ? 9 : 12;
                return (
                  <div
                    key={index}
                    style={{
                      width: dot,
                      height: dot,
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

      {/* ── Status ticker (Module 5) ──
           One line directly under the nameplate and above the dock. For the
           active player it carries the explicit instruction; for everyone else
           it reports what the active player is doing. The End Turn action lives
           here (right-aligned) so the dock below is purely cards. */}
      {!isLobby && !isGameOver && !showSpectatorView && (tickerText || (isMyTurn && isPlaying && cardPlayedThisTurn)) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '0 12px 8px',
        }}>
          <div style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: 13,
            color: isMyTurn && isPlaying ? 'var(--text-mid)' : 'var(--text-dim)',
            fontStyle: 'italic',
            minWidth: 0, flex: 1,
          }}>
            {tickerText}
          </div>
          {isMyTurn && isPlaying && !isEliminated && cardPlayedThisTurn && (
            <button
              className="primary"
              onClick={endTurn}
              // Power Clinic: disabled until the drill's scripted action is done
              // (the server refuses it too). Tooltip explains what's still needed.
              disabled={endTurnLocked}
              title={endTurnLocked ? endTurnLockHint : undefined}
              style={{
                flexShrink: 0, padding: '10px 16px', letterSpacing: '0.14em',
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: endTurnLocked ? 0.45 : 1,
                cursor: endTurnLocked ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              End Turn
            </button>
          )}
        </div>
      )}

      {/* ── Card area: spectator notice · pull-trigger morph · the dock ── */}
      {showSpectatorView ? (
        <div
          style={{
            background: 'linear-gradient(160deg, rgba(22,17,11,0.95) 0%, rgba(13,10,7,0.97) 100%)',
            border: '1px solid var(--border-lit)',
            borderRadius: 5,
            padding: '14px 16px',
            margin: '0 12px 10px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
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
      ) : isMySpinTurn && !isEliminated ? (
        // (Module 3) Pull-trigger morph. When this client is the one who must
        // spin, the entire card hand is REPLACED by a single high-contrast
        // action panel — the cards are obscured so a stray tap can't misfire.
        // The instant the spin resolves server-side, isMySpinTurn flips false
        // and the dock below restores to its exact prior layout.
        <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* (Module 3.3) On mobile the bluff outcome rides right above the
              trigger (the felt copy is desktop-only). */}
          {isMobile && bluffOutcomeText && (
            <div style={{
              fontFamily: "'Cinzel', serif", fontSize: 12, fontWeight: 700,
              letterSpacing: '0.04em', color: bluffOutcomeColor,
              textTransform: 'uppercase', textAlign: 'center',
            }}>
              {bluffOutcomeText}
            </div>
          )}
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 9, color: 'var(--accent2)',
            letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.9,
          }}>
            Your Fate Awaits
          </div>
          <button
            className="danger"
            onClick={playerSpin}
            style={{
              width: 'min(420px, 100%)', fontSize: 16, padding: '18px',
              letterSpacing: '0.18em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              <circle cx="5" cy="12" r="1.5" fill="currentColor" />
              <circle cx="19" cy="12" r="1.5" fill="currentColor" />
            </svg>
            Pull the Trigger
          </button>
        </div>
      ) : (
        !isLobby && !isGameOver && (
          // (Module 2.2) The bottom-right FAB is gone, so the dock spans the full
          // width. (Module 4) Three columns: BLUFF | played cards | power cards.
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

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              {/* LEFT column — the unified Call Bluff target (Module 4). Same
                  card-style control on desktop and mobile; no floating overhead
                  button above the rail. */}
              {!isFirstTurn && (() => {
                const bluffDisabled = !isMyTurn || !isPlaying || isEliminated
                  || bluffUsedThisTurn || bluffBlockedThisTurn || bluffLocked;
                return (
                  <button
                    className="danger"
                    onClick={callBluff}
                    disabled={bluffDisabled}
                    title={bluffBlockedThisTurn
                      ? 'No card to challenge — last turn was frozen'
                      : 'Call bluff on the previous player'}
                    style={{
                      flexShrink: 0,
                      width: 64, height: 96, padding: 6,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      borderRadius: 8,
                      letterSpacing: '0.12em',
                      opacity: bluffDisabled ? 0.4 : 1,
                      cursor: bluffDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {/* Crosshair / target — "take aim and call it" */}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                    </svg>
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10 }}>BLUFF</span>
                  </button>
                );
              })()}

              {/* CENTER (played cards) + RIGHT (power cards) — CardHand lays out
                  the shape fan and the power-card bracket side by side.
                  No Y-lift: the old desktop translateY(-12px) dragged the card-
                  holder's top border up into the "Your Hand / N cards" label row,
                  drawing a line across the card count. The fan sits in its own
                  flow now, clear of the label.
                  (Module 2.2) A shorter fan on mobile keeps the dock compact. */}
              <div
                // Stable anchor for the tutorial idle "tap a card" nudge — it
                // measures this element's rect so the bubble sits centred over
                // the real card fan on any viewport (not a fixed bottom offset).
                data-tour-id="my-hand"
                style={{
                  flex: 1,
                  minWidth: 0,
                  // (Global redeal) empty the fan during the fly-out/deal-back so
                  // the flying card backs are the only cards visible mid-swap.
                  opacity: reshuffling ? 0 : 1,
                  transition: 'opacity .3s',
                }}
              >
                <CardHand
                  hand={myHand}
                  powerCardSlot={myPowerCardSlot}
                  powerLocked={powerLocked}
                  selectedCardId={isMyTurn && isPlaying && !cardPlayedThisTurn ? selectedCardId : null}
                  onCardClick={handleCardClick}
                  onPowerCardClick={handlePowerCardClick}
                  interactive={isMyTurn && isPlaying && !cardPlayedThisTurn}
                  powerInteractive={isMyTurn && isPlaying}
                  justPlayedCardId={justPlayedCardId}
                  fanHeight={isMobile ? 104 : 128}
                />
              </div>
            </div>
          </div>
        )
      )}

      {/* Leave moved into the settings/FAB menu (#B) to declutter the dock. */}
      <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }} />
    </div>
  );
}
