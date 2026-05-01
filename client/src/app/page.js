'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import { AuthScreen } from '../components/AuthScreen';
import { LandingScreen } from '../components/LandingScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { OnlinePlayerUI } from '../components/OnlinePlayerUI';
import { Notification } from '../components/Notification';
import { ChatPanel } from '../components/ChatPanel';

// Inner component that safely calls useSearchParams inside a Suspense boundary
function HomeContent() {
  const searchParams = useSearchParams();
  const initialJoinCode = searchParams.get('join') || null;

  const {
    user, profile, loading, authError, setAuthError,
    sendEmailOtp, signInWithGoogle, signOut,
    updateUsername,
    getAccessToken, username,
  } = useAuth();

  const game = useGame(getAccessToken);

  const {
    roomCode, isHost, playerId,
    roomState, myPlayer, isMyTurn, currentPlayer,
    gameMode, error, connected, authenticated, notification,
    createRoom, joinRoom, startGame,
    nextTurn, resolveBluff,
    playCard, endTurn, playerSpin,
    declareRoundWin, callBluff,
    playCardOnline, startNextRound, spectatePlayer,
    acknowledgeSpinResult, spinDismissed,
    chatMessages, chatUnread, chatOpen,
    sendChatMessage, openChat, closeChat,
    leaveGame, setError,
  } = game;

  // Voice — opt-in via Join Voice button. Hook tears down on roomCode change.
  const voice = useVoice({ roomCode, isAuthenticated: authenticated });

  // ─── Loading splash ────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 64, color: 'var(--accent)', lineHeight: 1,
        }}>
          BLUFF
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
          Loading...
        </div>
      </div>
    );
  }

  // ─── Auth gate ─────────────────────────────────────────────
  if (!user) {
    return (
      <AuthScreen
        onSendEmailOtp={sendEmailOtp}
        onGoogleSignIn={signInWithGoogle}
        error={authError}
        setError={setAuthError}
      />
    );
  }

  const wrap = (children) => (
    <div style={{ minHeight: '100vh', padding: '24px 16px' }}>
      <Notification notification={notification} />
      {children}
      {roomCode && (
        <ChatPanel
          messages={chatMessages}
          unread={chatUnread}
          open={chatOpen}
          onOpen={openChat}
          onClose={closeChat}
          onSend={sendChatMessage}
          myUserId={user?.id}
        />
      )}
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
        initialJoinCode={initialJoinCode}
        error={error}
        setError={setError}
        connected={connected}
      />
    );
  }

  // ─── In a room as host ─────────────────────────────────────
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
          voice={voice}
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
        voice={voice}
      />
    );
  }

  // ─── In a room as player ───────────────────────────────────
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
          voice={voice}
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
        voice={voice}
      />
    );
  }

  return wrap(
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
      Loading...
    </div>
  );
}

// Loading fallback shown while useSearchParams resolves
function PageLoading() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: 'var(--accent)', lineHeight: 1 }}>
        BLUFF
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>Loading...</div>
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
