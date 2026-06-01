import { motion } from 'framer-motion';
import { CenterTablePanel } from './CenterTablePanel';

// ─── TableScene — a medium, fixed-size card table on a pannable canvas ────────
// (Module 1) The whole board — the fixed oval felt, the dealer's tray, and the
// seated players — is ONE unit inside a Framer Motion <motion.div drag> plane.
// The plane is flex-centred in the viewport, so when the board fits it sits
// dead-centre and can't drift; when more players are seated than fit, the board
// grows past the viewport and you drag it in ANY direction to bring far seats
// into view (elastic + dampened so it can't be flung off-screen). The oval
// itself stays a fixed "medium" size — only the ring of seats around it grows.
//
// Seat placement is responsive (chosen in index.js): desktop spreads seats
// top / left / right around the table (distributePlayers); mobile fans them all
// into the top band above the table (arcPlayers).
export function TableScene({
  viewportRef,
  boardRef,
  panControls,
  panConstraints,
  tableCenterRef,
  distributed,
  otherPlayers,
  renderChip,
  isMobile,
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
  revealFlipped,
}) {
  const hasTop = distributed.top.length > 0;
  const hasLeft = distributed.left.length > 0;
  const hasRight = distributed.right.length > 0;

  return (
    <div
      ref={viewportRef}
      className="topdown-table-scene tavern-floor"
      style={{
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        // Flex-centre the draggable plane so the board sits centred by default
        // and is held there whenever it fits the viewport.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none', // let the drag handler own touch gestures (no native scroll fight)
      }}
    >
      {/* The pannable plane. dragConstraints are recomputed (index.js) from the
          board-vs-viewport overflow so the table can never be thrown fully off
          screen; dragElastic gives a little dampened overscroll. */}
      <motion.div
        ref={boardRef}
        drag
        dragConstraints={panConstraints}
        dragElastic={0.15}
        dragMomentum
        animate={panControls}
        style={{
          width: 'max-content',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          cursor: 'grab',
          // Extra top room so a top-row chip's contextual popup (Module 2) has
          // headroom and isn't clipped by the viewport's overflow:hidden.
          padding: '34px 16px 16px',
        }}
        whileTap={{ cursor: 'grabbing' }}
      >
        {/* Top band of seats — a single centred row above the table. On mobile
            this is the whole "horseshoe"; on desktop it's the far-rail row. */}
        <div
          className="topdown-top"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: hasTop ? undefined : 0,
          }}
        >
          {hasTop ? (
            distributed.top.map(renderChip)
          ) : (
            otherPlayers.length === 0 && (
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                opacity: 0.5,
              }}>
                Awaiting players…
              </div>
            )
          )}
        </div>

        {/* Middle band: left seats | the fixed table | right seats */}
        <div
          className="topdown-middle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 8 : 14,
          }}
        >
          {!isMobile && (
            <div
              className="topdown-side"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                visibility: hasLeft ? 'visible' : 'hidden',
              }}
            >
              {distributed.left.map(renderChip)}
            </div>
          )}

          {/* The fixed-size oval table with the dealer's tray on the felt. */}
          <div
            className="table-felt-anchor"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 16px',
            }}
          >
            <div
              className="poker-table-oval"
              aria-hidden="true"
              style={{
                // (Module 1) Grown so the dealer's tray / reveal cards sit
                // comfortably WITHIN the felt interior. The content panel below
                // is deliberately narrower than this so nothing kisses the rail.
                width: 'clamp(300px, 52vmin, 560px)',
                height: 'clamp(200px, 36vmin, 360px)',
              }}
            >
              <div className="poker-table-studs" />
              <div className="poker-table-felt">
                <div className="poker-table-stitch" />
              </div>
            </div>

            {/* (Module 1) Kept narrower than the oval so the deck / required /
                played slots have spatial breathing room inside the felt. */}
            <div style={{ position: 'relative', zIndex: 1, width: 'min(288px, 64vw)' }}>
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
                revealFlipped={revealFlipped}
              />
            </div>
          </div>

          {!isMobile && (
            <div
              className="topdown-side"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                visibility: hasRight ? 'visible' : 'hidden',
              }}
            >
              {distributed.right.map(renderChip)}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
