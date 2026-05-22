import { CenterTablePanel } from './CenterTablePanel';

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
    <>
      <div
        className="topdown-top"
        style={{
          minHeight: '22vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 4px',
        }}
      >
        {distributed.top.length > 0 ? (
          distributed.top.map(renderChip)
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            {otherPlayers.length === 0 ? '(waiting for players…)' : ''}
          </div>
        )}
      </div>

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
    </>
  );
}
