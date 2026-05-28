import { CenterTablePanel } from './CenterTablePanel';

// ─── TableScene — the dark wood poker table, top-down view ────────────────────
// The table surface is rendered as a radial felt-green oval surrounded by a
// dark mahogany rail. Players sit around it as carved wooden chips.
export function TableScene({
  tableCenterRef,
  distributed,
  otherPlayers,
  renderChip,
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
      className="topdown-table-scene"
      style={{
        flex: 1,
        position: 'relative',
        /* Felt-green center fading to deep wood at the edges */
        background: `
          radial-gradient(
            ellipse 70% 55% at 50% 50%,
            #0e2d1a 0%,
            #0a2014 40%,
            #060e08 65%,
            transparent 100%
          )
        `,
        padding: '0 6px',
      }}
    >
      {/* Top row of player chips */}
      <div
        className="topdown-top"
        style={{
          minHeight: '22vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: '10px 4px 4px',
        }}
      >
        {distributed.top.length > 0 ? (
          distributed.top.map(renderChip)
        ) : (
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            opacity: 0.5,
          }}>
            {otherPlayers.length === 0 ? 'Awaiting players…' : ''}
          </div>
        )}
      </div>

      {/* Middle: left chips | center panel | right chips */}
      <div
        className="topdown-middle"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 10,
          alignItems: 'center',
          minHeight: '46vh',
          padding: '4px 0',
        }}
      >
        <div
          className="topdown-side"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexWrap: 'wrap',
            gap: 8,
            maxHeight: '46vh',
            alignContent: 'flex-start',
          }}
        >
          {distributed.left.map(renderChip)}
        </div>

        <CenterTablePanel
          tableCenterRef={tableCenterRef}
          isPlaying={isPlaying}
          isSpinPending={isSpinPending}
          isRoundEnd={isRoundEnd}
          isGameOver={isGameOver}
          isLobby={isLobby}
          deckSize={deckSize}
          currentCardType={currentCardType}
          playedPileSize={playedPileSize}
          alivePlayers={alivePlayers}
          isHost={isHost}
          roomState={roomState}
          updateRoomConfig={updateRoomConfig}
          startGame={startGame}
          getGroupLeaderboard={getGroupLeaderboard}
          leaderboardUpdateNonce={leaderboardUpdateNonce}
          myPlayer={myPlayer}
          lastAction={lastAction}
          displayedLastAction={displayedLastAction}
          isMySpinTurn={isMySpinTurn}
          isEliminated={isEliminated}
          playerSpin={playerSpin}
          spinTargetPlayer={spinTargetPlayer}
          restartRoom={restartRoom}
          leaveGame={leaveGame}
          isMyTurn={isMyTurn}
          currentPlayer={currentPlayer}
        />

        <div
          className="topdown-side"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexWrap: 'wrap',
            gap: 8,
            maxHeight: '46vh',
            alignContent: 'flex-start',
          }}
        >
          {distributed.right.map(renderChip)}
        </div>
      </div>
    </div>
  );
}
