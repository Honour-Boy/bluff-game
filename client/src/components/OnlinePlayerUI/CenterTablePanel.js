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
            -
          </div>
        ) : (
          Array.from({ length: layers }).map((_, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                width: 44,
                height: 64,
                /* Card back — the equipped deck skin (#205): a frame skin's
                   SVG via --cardback-bg, else the gradient fallback (original
                   leather by default). */
                background: `var(--cardback-bg,
                  linear-gradient(135deg, var(--cardback-a, #1e1410) 0%, var(--cardback-b, #120d09) 50%, var(--cardback-c, #1a1108) 100%),
                  repeating-linear-gradient(
                    45deg,
                    transparent 0px,
                    transparent 3px,
                    rgba(255,255,255,0.02) 3px,
                    rgba(255,255,255,0.02) 4px
                  ))
                `,
                backgroundSize: '100% 100%',
                border: '1px solid var(--border-lit)',
                borderRadius: 5,
                top: (layers - 1 - index) * 2,
                left: (layers - 1 - index) * 2,
                boxShadow: index === 0
                  ? '0 4px 12px rgba(0,0,0,0.5)'
                  : 'none',
              }}
            >
              {/* Card back diamond filigree — hidden when a frame deck skin
                  carries its own artwork (--cardback-filigree-opacity: 0). */}
              <svg width="44" height="64" viewBox="0 0 44 64" style={{ position: 'absolute', inset: 0, opacity: 'var(--cardback-filigree-opacity, 0.25)' }} aria-hidden>
                <rect x="4" y="4" width="36" height="56" rx="3" fill="none" stroke="var(--cardback-accent, var(--accent))" strokeWidth="0.8"/>
                <polygon points="22,16 28,24 22,32 16,24" fill="none" stroke="var(--cardback-accent, var(--accent))" strokeWidth="0.7"/>
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

// ─── Lobby ambience — looping "imaginary deal" ───────────────────────────────
// While the table waits in the lobby, a phantom dealer flicks face-down cards
// out to five fanned seats and back, forever. Pure CSS (see lobbyDeal in
// helpers.js); decorative only (aria-hidden, pointer-events:none).
function LobbyDealCardBack() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--cardback-bg, linear-gradient(135deg, var(--cardback-a, #1e1410) 0%, var(--cardback-b, #120d09) 50%, var(--cardback-c, #1a1108) 100%))',
      backgroundSize: '100% 100%',
      border: '1px solid var(--border-lit)',
      borderRadius: 6,
      boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
      position: 'relative', overflow: 'hidden',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 36 52" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, opacity: 'var(--cardback-filigree-opacity, 0.28)' }} aria-hidden>
        <rect x="3" y="3" width="30" height="46" rx="3" fill="none" stroke="var(--cardback-accent, var(--accent))" strokeWidth="0.8" />
        <polygon points="18,13 23,20 18,27 13,20" fill="none" stroke="var(--cardback-accent, var(--accent))" strokeWidth="0.7" />
      </svg>
    </div>
  );
}

function LobbyDealAnimation() {
  // Fanned target offsets (px) + tilt for each dealt card, and a stagger delay
  // so the flicks cascade. Cards deal UP-and-out from the centre deck.
  const seats = [
    { lx: -116, ly: -14, lr: -20, delay: 0 },
    { lx: -58, ly: -34, lr: -10, delay: 0.34 },
    { lx: 0, ly: -42, lr: 0, delay: 0.68 },
    { lx: 58, ly: -34, lr: 10, delay: 1.02 },
    { lx: 116, ly: -14, lr: 20, delay: 1.36 },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        height: 96,
        width: '100%',
        maxWidth: 300,
        margin: '0 auto',
        pointerEvents: 'none',
      }}
    >
      {/* The phantom deck at centre-bottom */}
      <div style={{ position: 'absolute', left: '50%', bottom: 4, width: 36, height: 52, transform: 'translateX(-50%)' }}>
        <LobbyDealCardBack />
      </div>
      {/* Cards flicking out to the fanned seats, looping */}
      {seats.map((s, i) => (
        <div
          key={i}
          className="lobby-deal-card"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 4,
            width: 36,
            height: 52,
            marginLeft: -18,
            animationDelay: `${s.delay}s`,
            '--lx': `${s.lx}px`,
            '--ly': `${s.ly}px`,
            '--lr': `${s.lr}deg`,
          }}
        >
          <LobbyDealCardBack />
        </div>
      ))}
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
           on the felt - the old semi-transparent "dealer's tray" panel (its
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
          <div data-deck-anchor>
            <FaceDownStack count={deckSize} label="Draw" warning={deckSize < 5 && deckSize > 0} />
          </div>

          {/* Required suit - the table's bright focal point (dealer's tray) */}
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
                // #205 — the Required focal card follows the equipped deck
                // skin's face art; fallback = the original radial face.
                background: 'var(--cardface-bg, radial-gradient(ellipse at 50% 35%, rgba(45,34,18,0.95) 0%, rgba(18,13,8,0.95) 100%))',
                backgroundSize: '100% 100%',
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

      {/* ── Lobby - written on the felt, no panel box ── */}
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

          {/* Ambient looping deal while patrons wait for the game to begin. */}
          <LobbyDealAnimation />

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
           the spot") lives on the avatar popup (ChipPopup) - no felt narration. */}
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
                // #205 — themed like the Required focal card above so the
                // bluff-reveal pair matches the equipped deck skin.
                background: 'var(--cardface-bg, radial-gradient(ellipse at 50% 35%, rgba(45,34,18,0.95) 0%, rgba(18,13,8,0.95) 100%))',
                backgroundSize: '100% 100%',
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

      {/* ── Game over - written on the felt, no panel box ──
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
              {/* In a practice room the bot "hosts"; the guided layer owns the
                  next step (clinic hand-off / replay), so avoid the group-room
                  "awaiting the host" copy. */}
              {roomState?.isTutorial ? 'Setting up the next lesson…' : 'Awaiting the proprietor to reshuffle…'}
            </div>
          )}
        </div>
      )}

      {/* (Module 1.3) The floating "Last Event" label has been removed from the
          canvas entirely - per-player turn / spin status now lives in the
          contextual avatar popups (ChipPopup, see OnlinePlayerUI), keeping the
          felt clean. */}
    </div>
  );
}
