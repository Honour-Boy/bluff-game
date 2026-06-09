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
        {/* Top band of seats - a single centred row above the table. On mobile
            this is the whole "horseshoe"; on desktop it's the far-rail row. */}
        <div
          className="topdown-top"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: hasTop ? undefined : 0,
            // Keep seated players painted ABOVE the absolutely-positioned felt so
            // they are never hidden behind the table (lobby + in-game, all sizes).
            position: 'relative',
            zIndex: 5,
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
                position: 'relative',
                zIndex: 5,
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
              // Reserve a box at least as large as the absolutely-positioned felt
              // (same clamp as the oval below) so the felt is fully CONTAINED and
              // never bleeds sideways/up into the seat columns or top band. The
              // seats then sit clearly OUTSIDE the rail on desktop — no longer
              // tucked under the table (lobby + in-game, all large screens).
              boxSizing: 'border-box',
              minWidth: 'clamp(360px, 70vmin, 600px)',
              minHeight: 'clamp(280px, 52vmin, 460px)',
            }}
          >
            <div
              className="poker-table-oval"
              aria-hidden="true"
              style={{
                // Sized to comfortably hold the dealer's tray / reveal cards
                // (the content panel below is narrower) WITHOUT growing so large
                // that the felt overflows its anchor and swallows the seated
                // players on the sides/top. The seats are also lifted above the
                // felt via z-index (below) as a guarantee on big screens.
                // Generous size (the canvas is pannable) so the dealer's tray,
                // reveal cards, the bluff-outcome line, and lobby copy all sit
                // comfortably WITHIN the felt instead of spilling over its rim.
                width: 'clamp(360px, 70vmin, 600px)',
                height: 'clamp(280px, 52vmin, 460px)',
              }}
            >
              <div className="poker-table-studs" />
              <div className="poker-table-felt">
                <div className="poker-table-stitch" />
              </div>
            </div>

            {/* (Module 1) Kept narrower than the oval so the deck / required /
                played slots have spatial breathing room inside the felt. Widened
                to match the larger felt so lobby copy / the start button fit on
                one line without clipping. */}
            <div style={{ position: 'relative', zIndex: 1, width: 'min(340px, 82vw)' }}>
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
                isMobile={isMobile}
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
                position: 'relative',
                zIndex: 5,
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
