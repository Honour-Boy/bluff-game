import { CardShape } from '../shared/CardShape';
import { ShapeIcon } from '../shared/ShapeIcon';
import { ActionLog } from '../ActionLog';
import { WaitingForPlayerBanner } from '../TurnStartNotice';
import { LeaderboardPanel } from '../LeaderboardPanel';
import { PreGameSettingsPanel } from '../screens/PreGameSettingsPanel';
import { LobbyConfigSummary } from '../LobbyConfigSummary';

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

// ─── Table panel base style ───────────────────────────────────────────────────
const tablePanelStyle = {
  background: 'linear-gradient(160deg, rgba(20,15,10,0.95) 0%, rgba(10,8,5,0.97) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 6,
  padding: '16px 14px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)',
};

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
}) {
  return (
    <div
      ref={tableCenterRef}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
    >
      {/* ── Active game: deck / required card / played pile ── */}
      {(isPlaying || isSpinPending || isRoundEnd) && (
        <div style={{
          ...tablePanelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          gap: 12,
          background: `
            radial-gradient(ellipse at center, rgba(39,84,55,0.88) 0%, rgba(14,26,17,0.96) 100%),
            linear-gradient(160deg, rgba(26,20,12,0.95) 0%, rgba(12,9,6,0.97) 100%)
          `,
        }}>
          <FaceDownStack count={deckSize} label="Draw" warning={deckSize < 5 && deckSize > 0} />

          {/* Required card type — carved oak frame */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 8,
              color: 'var(--text-dim)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}>
              Required
            </div>
            <div style={{
              padding: '8px 10px',
              background: 'linear-gradient(160deg, rgba(30,22,14,0.9) 0%, rgba(16,12,8,0.9) 100%)',
              border: '1px solid var(--border-glow)',
              borderRadius: 5,
              boxShadow: '0 0 12px rgba(200,146,46,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}>
              <CardShape type={currentCardType} size="md" />
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--accent)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}>
              {currentCardType}
            </div>
          </div>

          <FaceDownStack count={playedPileSize} label="Played" />
        </div>
      )}

      {/* ── Lobby ── */}
      {isLobby && (
        <div style={{ ...tablePanelStyle, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              {roomState?.config && (
                <PreGameSettingsPanel
                  config={roomState.config}
                  onChange={updateRoomConfig}
                  isGroupRoom={!!roomState?.groupId}
                  savedMeta={roomState?.groupSettingsMeta}
                  playerCount={alivePlayers.length}
                />
              )}
              <button
                className="primary"
                onClick={startGame}
                disabled={alivePlayers.length < 2}
                style={{ width: '100%', padding: '14px', fontSize: 13 }}
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
            </>
          ) : (
            <>
              {roomState?.config && <LobbyConfigSummary config={roomState.config} />}
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                color: 'var(--text-dim)',
                fontStyle: 'italic',
              }}>
                Waiting for the proprietor to deal…
              </div>
            </>
          )}
          {roomState?.groupId && (
            <LeaderboardPanel
              groupId={roomState.groupId}
              currentUserId={myPlayer?.id || null}
              getGroupLeaderboard={getGroupLeaderboard}
              leaderboardUpdateNonce={leaderboardUpdateNonce}
            />
          )}
        </div>
      )}

      {/* ── Spin pending: bluff resolution + revolver trigger ── */}
      {isSpinPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lastAction?.autoResolved && lastAction?.accuserName && (
            <div
              className="fade-in"
              style={{
                ...tablePanelStyle,
                border: `1px solid ${lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)'}`,
                background: lastAction.bluffCorrect
                  ? 'linear-gradient(160deg, rgba(10,30,15,0.97) 0%, rgba(6,16,10,0.97) 100%)'
                  : 'linear-gradient(160deg, rgba(30,8,8,0.97) 0%, rgba(16,5,5,0.97) 100%)',
              }}
            >
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                Bluff Called
              </div>
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 15,
                marginBottom: 8,
                lineHeight: 1.5,
              }}>
                <strong style={{ color: 'var(--text)' }}>{lastAction.accuserName}</strong>
                {' '}challenged{' '}
                <strong style={{ color: 'var(--text)' }}>{lastAction.accusedName}</strong>
              </div>
              {lastAction.revealedCard ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 8,
                    color: 'var(--text-dim)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    Revealed:
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px',
                    background: 'linear-gradient(160deg, var(--surface3) 0%, var(--surface2) 100%)',
                    border: '1px solid var(--border-lit)',
                    borderRadius: 4,
                    fontFamily: "'Cinzel', serif",
                    fontSize: 13,
                    fontWeight: 700,
                    animation: 'cardFlipIn 0.5s ease-out',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  }}>
                    <ShapeIcon shape={lastAction.revealedCard.shape} size={20} />
                    <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>
                      {lastAction.revealedCard.shape === 'whot' ? 'WHOT' : lastAction.revealedCard.shape}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{lastAction.revealedCard.number}</span>
                  </div>
                </div>
              ) : (
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  marginBottom: 10,
                  fontStyle: 'italic',
                }}>
                  No card was played.
                </div>
              )}
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 16,
                letterSpacing: '0.08em',
                color: lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}>
                {lastAction.bluffCorrect
                  ? `Bluff proven — ${lastAction.accusedName} was lying!`
                  : `Bluff wrong — ${lastAction.accusedName} told the truth!`}
              </div>
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 13,
                color: 'var(--text-dim)',
                fontStyle: 'italic',
              }}>
                → <strong style={{ fontStyle: 'normal' }}>{lastAction.spinTargetName}</strong> must face the revolver.
              </div>
            </div>
          )}

          {/* My spin turn — the revolver trigger panel */}
          {isMySpinTurn && !isEliminated && (
            <div style={{
              ...tablePanelStyle,
              border: '1px solid var(--accent2)',
              textAlign: 'center',
              background: 'linear-gradient(160deg, rgba(40,8,8,0.97) 0%, rgba(20,4,4,0.97) 100%)',
              boxShadow: '0 0 30px rgba(155,28,28,0.2), 0 8px 28px rgba(0,0,0,0.6)',
            }}>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--accent2)',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                marginBottom: 16,
                opacity: 0.9,
              }}>
                Your Fate Awaits
              </div>
              {/* Revolver trigger button */}
              <button
                className="danger"
                onClick={playerSpin}

                style={{
                  width: '100%',
                  fontSize: 15,
                  padding: '16px',
                  letterSpacing: '0.16em',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Cylinder icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginRight: 8, verticalAlign: 'middle' }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor"/>
                  <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                  <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                  <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
                </svg>
                Pull the Trigger
              </button>
            </div>
          )}

          {/* Waiting for other player to spin */}
          {!isMySpinTurn && spinTargetPlayer && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(155,28,28,0.07)',
              border: '1px solid rgba(155,28,28,0.4)',
              borderRadius: 5,
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: '#c85050',
              textAlign: 'center',
              fontStyle: 'italic',
              animation: 'pulse 1.8s ease-in-out infinite',
            }}>
              Waiting for <strong style={{ fontStyle: 'normal' }}>{spinTargetPlayer.username}</strong> to pull the trigger…
            </div>
          )}
        </div>
      )}

      {/* ── Game over ── */}
      {isGameOver && (
        <div style={{
          ...tablePanelStyle,
          textAlign: 'center',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 0 30px rgba(200,146,46,0.1), 0 8px 28px rgba(0,0,0,0.6)',
        }}>
          <div style={{
            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
            fontSize: 28,
            color: 'var(--accent)',
            marginBottom: 8,
            textShadow: '0 0 24px rgba(200,146,46,0.4)',
            letterSpacing: '0.08em',
          }}>
            {lastAction?.winnerId === myPlayer.id ? 'Victory' : `${lastAction?.winnerName ?? '?'} Prevails`}
          </div>
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
          {roomState?.groupId && (
            <div style={{ marginTop: 18, textAlign: 'left' }}>
              <LeaderboardPanel
                groupId={roomState.groupId}
                currentUserId={myPlayer?.id || null}
                highlightUserId={lastAction?.winnerId || null}
                getGroupLeaderboard={getGroupLeaderboard}
                leaderboardUpdateNonce={leaderboardUpdateNonce}
              />
            </div>
          )}
        </div>
      )}

      {/* #185 — Last Event panel uses displayedLastAction to gate spin reveals */}
      {displayedLastAction && <ActionLog lastAction={displayedLastAction} />}
      {!isMyTurn && isPlaying && currentPlayer && !isEliminated && (
        <WaitingForPlayerBanner playerName={currentPlayer.username} />
      )}
    </div>
  );
}
