"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { useGame } from "../hooks/useGame";
import { AuthScreen } from "../components/AuthScreen";
import { LandingScreen } from "../components/LandingScreen";
import { HostUI } from "../components/HostUI";
import { PlayerUI } from "../components/PlayerUI";
import { OnlinePlayerUI } from "../components/OnlinePlayerUI";
import { Notification } from "../components/Notification";

// Inner component that safely calls useSearchParams inside a Suspense boundary
function HomeContent() {
  const searchParams = useSearchParams();
  const initialJoinCode = searchParams.get("join") || null;

  const {
    user,
    profile,
    loading,
    authError,
    setAuthError,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    updateUsername,
    updatePassword,
    getAccessToken,
    username,
  } = useAuth();

  const game = useGame(getAccessToken);

  const {
    roomCode,
    isHost,
    playerId,
    roomState,
    myPlayer,
    isMyTurn,
    currentPlayer,
    gameMode,
    error,
    connected,
    notification,
    createRoom,
    joinRoom,
    startGame,
    nextTurn,
    resolveBluff,
    playCard,
    endTurn,
    playerSpin,
    declareRoundWin,
    callBluff,
    playCardOnline,
    startNextRound,
    spectatePlayer,
    acknowledgeSpinResult,
    spinDismissed,
    leaveGame,
    setError,
  } = game;

  // ─── Loading splash ────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 64,
            color: "var(--accent)",
            lineHeight: 1,
          }}
        >
          BLUFF
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.15em",
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  // ─── Auth gate ─────────────────────────────────────────────
  if (!user) {
    return (
      <AuthScreen
        onSignIn={signIn}
        onSignUp={signUp}
        onGoogleSignIn={signInWithGoogle}
        error={authError}
        setError={setAuthError}
      />
    );
  }

  const wrap = (children) => (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <Notification notification={notification} />
      {children}
    </div>
  );

  // ─── Landing ────────────────────────────────────────────────
  if (!roomCode) {
    return wrap(
      <LandingScreen
        username={username}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onSignOut={signOut}
        onUpdateUsername={updateUsername}
        onUpdatePassword={updatePassword}
        initialJoinCode={initialJoinCode}
        error={error}
        setError={setError}
        connected={connected}
      />,
    );
  }

  // ─── In a room as host ─────────────────────────────────────
  if (isHost) {
    if (gameMode === "online") {
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
        />,
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
      />,
    );
  }

  // ─── In a room as player ───────────────────────────────────
  if (playerId) {
    if (gameMode === "online") {
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
        />,
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
      />,
    );
  }

  return wrap(
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
      Loading...
    </div>,
  );
}

// Loading fallback shown while useSearchParams resolves
function PageLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 64,
          color: "var(--accent)",
          lineHeight: 1,
        }}
      >
        BLUFF
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-dim)",
          letterSpacing: "0.15em",
        }}
      >
        Loading...
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomeContent />
    </Suspense>
  );
}
