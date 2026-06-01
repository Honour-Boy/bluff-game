import { CardShape } from '../shared/CardShape';
import { BluffRevealCard } from './BluffRevealCard';
// Game settings (host config / read-only summary) and the group leaderboard now
// live in the Controls menu, not on the felt — keeps the table clean.

// ─── Face-down card stack — leather-back texture ──────────────────────────────
function FaceDownStack({ count, label, warning = false }) {
  const layers = Math.min(count, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 52, height: 72 }}>
        {count === 0 ? (
          <div style={{
            width: 44, height: 64,
            border: '1px dashed var(--border)',
            borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Cinzel', serif", fontSize: 10, color: 'var(--text-dim)',
            opacity: 0.5,
          }}>
            —
          </div>
        ) : (
          Array.from({ length: layers }).map((_, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                width: 44,
                height: 64,
                /* Leather-look card back */
                background: `
                  linear-gradient(135deg, #1e1410 0%, #120d09 50%, #1a1108 100%),
                  repeating-linear-gradient(
                    45deg,
                    transparent 0px,
                    transparent 3px,
                    rgba(255,255,255,0.02) 3px,
                    rgba(255,255,255,0.02) 4px
                  )
                `,
                border: '1px solid var(--border-lit)',
                borderRadius: 5,
                top: (layers - 1 - index) * 2,
                left: (layers - 1 - index) * 2,
                boxShadow: index === 0
                  ? '0 4px 12px rgba(0,0,0,0.5)'
                  : 'none',
              }}
            >
              {/* Card back diamond filigree */}
              <svg width="44" height="64" viewBox="0 0 44 64" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} aria-hidden>
                <rect x="4" y="4" width="36" height="56" rx="3" fill="none" stroke="var(--accent)" strokeWidth="0.8"/>
                <polygon points="22,16 28,24 22,32 16,24" fill="none" stroke="var(--accent)" strokeWidth="0.7"/>
              </svg>
            </div>
          ))
        )}
      </div>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: warning ? 'var(--warning)' : 'var(--text-dim)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 10,
        fontWeight: 700,
        color: warning ? 'var(--warning)' : 'var(--text-dim)',
        letterSpacing: '0.06em',
      }}>
        {count}
      </div>
    </div>
  );
}

// ─── CenterTablePanel — the felt surface at the heart of the table ────────────
export function CenterTablePanel({
  tableCenterRef,
  isPlaying,
  isSpinPending,
  isRoundEnd,
  isGameOver,
  isLobby,
  deckSize,
  currentCardType,
  playedPileSize,
  alivePlayers,
  isHost,
  roomState,
  updateRoomConfig,
  startGame,
  getGroupLeaderboard,
  leaderboardUpdateNonce,
  myPlayer,
  lastAction,
  displayedLastAction,
  isMySpinTurn,
  isEliminated,
  playerSpin,
  spinTargetPlayer,
  restartRoom,
  leaveGame,
  isMyTurn,
  currentPlayer,
  revealFlipped = false,
  isMobile = false,
}) {
  // (Module 3) The challenged card border + outcome line read green when the
  // accused told the truth (card matched) and red when they bluffed (mismatch).
  const outcomeColor = lastAction?.bluffCorrect ? 'var(--accent2)' : 'var(--alive)';
  return (
    <div
      ref={tableCenterRef}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
    >
      {/* ── Active game: deck / required card / played pile ──
           (Module 1) The deck, required suit, and played pile now sit DIRECTLY
           on the felt — the old semi-transparent "dealer's tray" panel (its
           background / brass hairline / inner shadow) is removed so there is no
           opacity box layered behind the table content. */}
      {(isPlaying || isRoundEnd) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          gap: 10,
          padding: '6px 4px',
        }}>
          <FaceDownStack count={deckSize} label="Draw" warning={deckSize < 5 && deckSize > 0} />

          {/* Required suit — the table's bright focal point (dealer's tray) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--accent)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}>
              Required
            </div>
            <div
              className="focal-breathe"
              style={{
                padding: '12px 14px',
                background: 'radial-gradient(ellipse at 50% 35%, rgba(45,34,18,0.95) 0%, rgba(18,13,8,0.95) 100%)',
                border: '2px solid var(--accent)',
                borderRadius: 8,
              }}
            >
              <CardShape type={currentCardType} size="md" />
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              color: 'var(--accent)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              textShadow: '0 0 10px var(--glow-gold)',
            }}>
              {currentCardType}
            </div>
          </div>

          <div data-flight-target>
            <FaceDownStack count={playedPileSize} label="Played" />
          </div>
        </div>
      )}

      {/* ── Lobby — written on the felt, no panel box ── */}
      {isLobby && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, padding: '6px 8px', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}>
            Waiting Room · {alivePlayers.length} patron{alivePlayers.length !== 1 ? 's' : ''} seated
          </div>
          {isHost ? (
            <>
              <button
                className="primary"
                onClick={startGame}
                disabled={alivePlayers.length < 2}
                style={{
                  alignSelf: 'center',
                  width: 'auto',
                  maxWidth: '100%',
                  padding: '9px 20px',
                  fontSize: 12,
                }}
              >
                Open the Game ({alivePlayers.length} players)
              </button>
              {alivePlayers.length < 2 && (
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  fontStyle: 'italic',
                }}>
                  At least 2 patrons needed to begin.
                </div>
              )}
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                Set powers &amp; house rules from the Controls menu
              </div>
            </>
          ) : (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: 'var(--text-dim)',
              fontStyle: 'italic',
            }}>
              Waiting for the proprietor to deal…
            </div>
          )}
        </div>
      )}

      {/* ── Spin pending: 3D bluff reveal (Module 3) ──
           The challenged card flips face-up beside the Required template for
           every client at once; it reverse-flips when the trigger is pulled
           (driven by `revealFlipped`). The high-contrast Pull Trigger now lives
           above the liable player's seat (index.js) and per-player status ("On
           the spot") lives on the avatar popup (ChipPopup) — no felt narration. */}
      {isSpinPending && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '4px 2px', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}>
            {lastAction?.accuserName ? 'Bluff Reveal' : 'Reveal'}
          </div>

          {/* Required template  vs  the played card flipping face-up.
              (Module 1.4) Centred and snug so the flip stays inside the felt. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, maxWidth: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 7, color: 'var(--accent)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Required
              </div>
              <div style={{
                padding: '11px 13px',
                background: 'radial-gradient(ellipse at 50% 35%, rgba(45,34,18,0.95) 0%, rgba(18,13,8,0.95) 100%)',
                border: '2px solid var(--accent)',
                borderRadius: 8,
              }}>
                <CardShape type={currentCardType} size="md" />
              </div>
            </div>

            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', paddingBottom: 30, textTransform: 'uppercase' }}>
              vs
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Played
              </div>
              <BluffRevealCard
                card={lastAction?.revealedCard || null}
                revealed={revealFlipped}
                outcomeColor={outcomeColor}
              />
            </div>
          </div>

          {/* Outcome line (Module 3.3). Desktop: heavy bold + larger on the felt.
              Mobile: smaller; and suppressed for the spinner because it is shown
              above their Pull-Trigger morph instead (BottomSeat). */}
          {lastAction?.accusedName && !(isMobile && isMySpinTurn) && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: isMobile ? 13 : 23,
              fontWeight: isMobile ? 700 : 800,
              letterSpacing: '0.06em',
              color: outcomeColor,
              textTransform: 'uppercase',
              textAlign: 'center',
              marginTop: isMobile ? 2 : 6,
              textShadow: isMobile ? 'none' : '0 2px 12px rgba(0,0,0,0.7)',
            }}>
              {lastAction.bluffCorrect
                ? `${lastAction.accusedName} bluffed`
                : `${lastAction.accusedName} was not lying`}
            </div>
          )}
        </div>
      )}

      {/* ── Game over — written on the felt, no panel box ──
           (Module 7) The victory declaration now floats ABOVE the table
           (rendered in OnlinePlayerUI) and the "view standings" hint is a
           detached strip at the very bottom of the layout. The felt keeps only
           the closing line + the host's Deal Again / Leave Table controls so
           those actions render INSIDE the table wrapper. */}
      {isGameOver && (
        <div style={{
          textAlign: 'center',
          padding: '6px 8px',
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        }}>
          <div style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: 14,
            color: 'var(--text-dim)',
            marginBottom: 18,
            fontStyle: 'italic',
          }}>
            The game concludes.
          </div>

          {isHost ? (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="primary" onClick={restartRoom}>Deal Again</button>
              <button onClick={leaveGame}>Leave Table</button>
            </div>
          ) : (
            <div style={{
              fontFamily: "'Crimson Text', serif",
              fontSize: 13,
              color: 'var(--text-dim)',
              fontStyle: 'italic',
            }}>
              Awaiting the proprietor to reshuffle…
            </div>
          )}
        </div>
      )}

      {/* (Module 1.3) The floating "Last Event" label has been removed from the
          canvas entirely — per-player turn / spin status now lives in the
          contextual avatar popups (ChipPopup, see OnlinePlayerUI), keeping the
          felt clean. */}
    </div>
  );
}
