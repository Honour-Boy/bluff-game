'use client';

import { useGame } from '../hooks/useGame';
import { LandingScreen } from '../components/LandingScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { Notification } from '../components/Notification';

export default function Home() {
  const game = useGame();

  const {
    roomCode, isHost, playerId,
    roomState, myPlayer, isMyTurn, currentPlayer,
    error, connected, notification,
    createRoom, joinRoom, startGame,
    nextTurn, resolveBluff,
    playCard, endTurn, playerSpin,
    declareRoundWin, callBluff,
    leaveGame, setError,
  } = game;

  // Wrapper for layout
  const wrap = (children) => (
    <div style={{ minHeight: '100vh', padding: '24px 16px' }}>
      <Notification notification={notification} />
      {children}
    </div>
  );

  // Not in a room yet → landing
  if (!roomCode) {
    return wrap(
      <LandingScreen
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        error={error}
        setError={setError}
        connected={connected}
      />
    );
  }

  // In a room as host
  if (isHost) {
    return wrap(
      <HostUI
        roomCode={roomCode}
        roomState={roomState}
        startGame={startGame}
        nextTurn={nextTurn}
        resolveBluff={resolveBluff}
        declareRoundWin={declareRoundWin}
        leaveGame={leaveGame}
      />
    );
  }

  // In a room as player
  if (playerId) {
    return wrap(
      <PlayerUI
        roomCode={roomCode}
        roomState={roomState}
        myPlayer={myPlayer}
        isMyTurn={isMyTurn}
        callBluff={callBluff}
        playCard={playCard}
        endTurn={endTurn}
        playerSpin={playerSpin}
        leaveGame={leaveGame}
      />
    );
  }

  // Fallback: loading state
  return wrap(
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
      Loading...
    </div>
  );
}
