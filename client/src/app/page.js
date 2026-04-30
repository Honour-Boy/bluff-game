'use client';

import { useGame } from '../hooks/useGame';
import { LandingScreen } from '../components/LandingScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { OnlinePlayerUI } from '../components/OnlinePlayerUI';
import { Notification } from '../components/Notification';

export default function Home() {
  const game = useGame();

  const {
    roomCode, isHost, playerId,
    roomState, myPlayer, isMyTurn, currentPlayer,
    gameMode, error, connected, notification,
    createRoom, joinRoom, startGame,
    nextTurn, resolveBluff,
    playCard, endTurn, playerSpin,
    declareRoundWin, callBluff,
    playCardOnline, startNextRound, spectatePlayer,
    acknowledgeSpinResult, spinDismissed,
    leaveGame, setError,
  } = game;

  const wrap = (children) => (
    <div style={{ minHeight: '100vh', padding: '24px 16px' }}>
      <Notification notification={notification} />
      {children}
    </div>
  );

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
    if (gameMode === 'online') {
      return wrap(
        <OnlinePlayerUI
          roomCode={roomCode}
          roomState={roomState}
          myPlayer={myPlayer}
          isMyTurn={isMyTurn}
          isHost={true}
          startGame={startGame}
          playCardOnline={playCardOnline}
          callBluff={callBluff}
          endTurn={endTurn}
          playerSpin={playerSpin}
          startNextRound={startNextRound}
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          acknowledgeSpinResult={acknowledgeSpinResult}
          spinDismissed={spinDismissed}
        />
      );
    }
    return wrap(
      <HostUI
        roomCode={roomCode}
        roomState={roomState}
        startGame={startGame}
        nextTurn={nextTurn}
        resolveBluff={resolveBluff}
        declareRoundWin={declareRoundWin}
        leaveGame={leaveGame}
        acknowledgeSpinResult={acknowledgeSpinResult}
        spinDismissed={spinDismissed}
      />
    );
  }

  // In a room as player
  if (playerId) {
    if (gameMode === 'online') {
      return wrap(
        <OnlinePlayerUI
          roomCode={roomCode}
          roomState={roomState}
          myPlayer={myPlayer}
          isMyTurn={isMyTurn}
          playCardOnline={playCardOnline}
          callBluff={callBluff}
          endTurn={endTurn}
          playerSpin={playerSpin}
          startNextRound={startNextRound}
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          acknowledgeSpinResult={acknowledgeSpinResult}
          spinDismissed={spinDismissed}
        />
      );
    }
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
        acknowledgeSpinResult={acknowledgeSpinResult}
        spinDismissed={spinDismissed}
      />
    );
  }

  return wrap(
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
      Loading...
    </div>
  );
}
