import { CenterTablePanel } from './CenterTablePanel';

// ─── TableScene — a real oval card table, top-down ───────────────────────────
// The whole board (oval felt + the dealer's cards + the seated players) is ONE
// unit inside a horizontally-scrollable layer. The oval lives in the same layer
// as the cards, so the cards are fixed ON the table and the table moves with
// them when you pan. When more players than fit are seated, the board grows
// wider than the screen and you scroll LEFT/RIGHT to see everyone; it never
// scrolls vertically (it's sized to the available height).
export function TableScene({
  tableCenterRef,
  sceneScrollRef,
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
      className="topdown-table-scene tavern-floor"
      style={{
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Horizontal pan layer — the board scrolls left/right within it. */}
      <div
        ref={sceneScrollRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* The board: oval felt + cards + seats, all move together. Fills the
            layer when it fits; grows wider (→ scroll) when more seats are in. */}
        <div
          className="poker-board"
          style={{
            position: 'relative',
            flex: '1 0 auto',
            minWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '0 6px',
          }}
        >
          {/* The table itself (decorative): rail → studs → felt → stitching */}
          <div className="poker-table-oval" aria-hidden="true">
            <div className="poker-table-studs" />
            <div className="poker-table-felt">
              <div className="poker-table-stitch" />
            </div>
          </div>

          {/* Seats + play area on the felt */}
          <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Top row of player chips — seated along the far rail */}
            <div
              className="topdown-top"
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 8,
                padding: '12px 4px 6px',
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

            {/* Middle: left chips | centre tray | right chips */}
            <div
              className="topdown-middle"
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 10,
                alignItems: 'center',
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
                  maxHeight: '42vh',
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
                  maxHeight: '42vh',
                  alignContent: 'flex-start',
                }}
              >
                {distributed.right.map(renderChip)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
