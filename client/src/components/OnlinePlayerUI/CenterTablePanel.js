import { CardShape } from '../shared/CardShape';
import { ShapeIcon } from '../shared/ShapeIcon';
import { ActionLog } from '../ActionLog';
import { WaitingForPlayerBanner } from '../TurnStartNotice';
import { LeaderboardPanel } from '../LeaderboardPanel';
import { PreGameSettingsPanel } from '../screens/PreGameSettingsPanel';
import { LobbyConfigSummary } from '../LobbyConfigSummary';

function FaceDownStack({ count, label, warning = false }) {
  const layers = Math.min(count, 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 52, height: 72 }}>
        {count === 0 ? (
          <div style={{ width: 44, height: 64, border: '1px dashed var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-dim)' }}>
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
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                top: (layers - 1 - index) * 2,
                left: (layers - 1 - index) * 2,
              }}
            />
          ))
        )}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: warning ? 'var(--warning)' : 'var(--text-dim)' }}>
        {count} cards
      </div>
    </div>
  );
}

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
    <div ref={tableCenterRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      {(isPlaying || isSpinPending || isRoundEnd) && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12, padding: '18px 14px', background: 'radial-gradient(ellipse at center, var(--surface) 0%, var(--bg) 100%)', border: '1px solid var(--border)' }}>
          <FaceDownStack count={deckSize} label="DRAW" warning={deckSize < 5 && deckSize > 0} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>REQUIRED</div>
            <CardShape type={currentCardType} size="md" />
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{currentCardType?.toUpperCase()}</div>
          </div>
          <FaceDownStack count={playedPileSize} label="PLAYED" />
        </div>
      )}

      {isLobby && (
        <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            LOBBY - {alivePlayers.length} player{alivePlayers.length !== 1 ? 's' : ''} joined
          </div>
          {isHost ? (
            <>
              {roomState?.config && (
                <PreGameSettingsPanel
                  config={roomState.config}
                  onChange={updateRoomConfig}
                  isGroupRoom={!!roomState?.groupId}
                  savedMeta={roomState?.groupSettingsMeta}
                />
              )}
              <button className="primary" onClick={startGame} disabled={alivePlayers.length < 2} style={{ width: '100%', padding: '14px', fontSize: 13 }}>
                Start Game ({alivePlayers.length} players)
              </button>
              {alivePlayers.length < 2 && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Need at least 2 players to start.</div>}
            </>
          ) : (
            <>
              {roomState?.config && <LobbyConfigSummary config={roomState.config} />}
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Waiting for the host to start the game...</div>
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

      {isSpinPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lastAction?.autoResolved && lastAction?.accuserName && (
            <div className="card fade-in" style={{ border: `1px solid ${lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)'}`, background: lastAction.bluffCorrect ? 'rgba(74,255,128,0.04)' : 'rgba(255,74,110,0.04)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>BLUFF CALLED</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong style={{ color: 'var(--text)' }}>{lastAction.accuserName}</strong>
                {' '}called bluff on{' '}
                <strong style={{ color: 'var(--text)' }}>{lastAction.accusedName}</strong>
              </div>
              {lastAction.revealedCard ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0 }}>CARD REVEALED:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, fontWeight: 700, animation: 'cardFlipIn 0.5s ease-out' }}>
                    <ShapeIcon shape={lastAction.revealedCard.shape} size={20} />
                    <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>
                      {lastAction.revealedCard.shape === 'whot' ? 'WHOT' : lastAction.revealedCard.shape}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{lastAction.revealedCard.number}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>No card was played.</div>
              )}
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.08em', color: lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)', marginBottom: 4 }}>
                {lastAction.bluffCorrect
                  ? `Bluff correct - ${lastAction.accusedName} was lying!`
                  : `Bluff wrong - ${lastAction.accusedName} told the truth!`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>-&gt; <strong>{lastAction.spinTargetName}</strong> must spin.</div>
            </div>
          )}

          {isMySpinTurn && !isEliminated && (
            <div className="card" style={{ border: '1px solid var(--accent2)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: '0.12em', marginBottom: 14 }}>YOUR FATE AWAITS</div>
              <button className="danger" onClick={playerSpin} style={{ width: '100%', fontSize: 16, padding: '14px' }}>
                Pull the Trigger
              </button>
            </div>
          )}

          {!isMySpinTurn && spinTargetPlayer && (
            <div style={{ padding: '14px 16px', background: 'rgba(255,74,110,0.05)', border: '1px solid var(--accent2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--accent2)', textAlign: 'center', animation: 'pulse 1.5s ease-in-out infinite' }}>
              Waiting for <strong>{spinTargetPlayer.username}</strong> to pull the trigger...
            </div>
          )}
        </div>
      )}

      {isGameOver && (
        <div className="card" style={{ textAlign: 'center', border: '1px solid var(--accent)' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--accent)', marginBottom: 8 }}>
            {lastAction?.winnerId === myPlayer.id ? 'You Win!' : `${lastAction?.winnerName ?? '?'} Wins!`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Game over.</div>
          {isHost ? (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="primary" onClick={restartRoom}>Play Again</button>
              <button onClick={leaveGame}>Leave Room</button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Waiting for host to start a new game...</div>
          )}
          {roomState?.groupId && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
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

      {/* #185 — the Last Event line reads `displayedLastAction`, which holds a
          spin outcome back until its cylinder animation finishes. All other
          action types are identical to `lastAction`. */}
      {displayedLastAction && <ActionLog lastAction={displayedLastAction} />}
      {!isMyTurn && isPlaying && currentPlayer && !isEliminated && (
        <WaitingForPlayerBanner playerName={currentPlayer.username} />
      )}
    </div>
  );
}
