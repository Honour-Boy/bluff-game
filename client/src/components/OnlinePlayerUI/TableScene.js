import { CenterTablePanel } from './CenterTablePanel';

// ─── TableScene — a real oval card table, top-down ───────────────────────────
// A dark plank floor holds an elliptical table: a carved-wood rail, a ring of
// brass studs, and a recessed green felt with a stitched edge (all built in CSS,
// see .tavern-floor / .poker-table-* in helpers.js). The seats (player chips)
// and the centre play area render ON TOP of the felt in a relative grid, so the
// players read as seated around the rail with the dealer's tray sunk into the
// middle of the cloth.
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
        // Grow to fill the leftover viewport between header + bottom seat, but
        // be allowed to shrink (minHeight:0) so the shell never overflows the
        // screen. Content scrolls INSIDE here, not the page.
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        padding: '0 6px',
      }}
    >
      {/* ── The table itself (decorative): rail → studs → felt → stitching.
           Fixed behind the scrollable content so it stays put. ── */}
      <div className="poker-table-oval" aria-hidden="true">
        <div className="poker-table-studs" />
        <div className="poker-table-felt">
          <div className="poker-table-stitch" />
        </div>
      </div>

      {/* ── Seats + play area, layered on the felt. This layer scrolls on its
           own when its content is taller than the scene, so the page itself
           never needs to scroll. ── */}
      <div
        ref={sceneScrollRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
  );
}
