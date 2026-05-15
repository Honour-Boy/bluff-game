'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import { AuthScreen } from '../components/AuthScreen';
import { LandingScreen } from '../components/LandingScreen';
import { GroupsScreen } from '../components/GroupsScreen';
import { GroupDetailScreen } from '../components/GroupDetailScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { OnlinePlayerUI } from '../components/OnlinePlayerUI';
import { Notification } from '../components/Notification';
import { ChatPanel } from '../components/ChatPanel';

// Inner component that safely calls useSearchParams inside a Suspense boundary
function HomeContent() {
  const searchParams = useSearchParams();
  const initialJoinCode = searchParams.get('join') || null;
  const [homeView, setHomeView] = useState('landing');
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsList, setGroupsList] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const {
    user, profile, loading, authError, setAuthError,
    sendEmailOtp, signInWithGoogle, signInAsGuest, signOut, signOutGuest,
    updateUsername,
    getAccessToken, getGuestAuth, username, isGuest,
  } = useAuth();

  // Pass the effective auth identity so useGame re-authenticates
  // the socket when the user transitions null → guest → real user.
  // Without this third arg, the existing socket stays unauthenticated
  // after guest sign-in and online-room actions get "Not authenticated"
  // (issue #52).
  const game = useGame(getAccessToken, getGuestAuth, user?.id ?? null);

  const {
    roomCode, isHost, playerId,
    roomState, myPlayer, isMyTurn, currentPlayer,
    gameMode, error, connected, authenticated, notification,
    createRoom, joinRoom, startGame,
    createGroup, listMyGroups, getGroup,
    inviteToGroup, listMyInvites, respondToInvite,
    revokeInvite, removeMember, transferHost,
    deleteGroup, leaveGroup,
    nextTurn, resolveBluff,
    playCard, endTurn, playerSpin,
    declareRoundWin, callBluff,
    playCardOnline, spectatePlayer,
    acknowledgeSpinResult, spinDismissed,
    chatMessages, chatUnread, chatOpen,
    sendChatMessage, openChat, closeChat,
    leaveGame, restartRoom, setError,
    activatePowerCard,
    swapPick,
    updateRoomConfig,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    medicPrompt,
    sniperPrompt,
    powerEventQueue,
    consumePowerEvent,
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
  } = game;

  const refreshGroupsHome = useCallback(async () => {
    setGroupsLoading(true);
    const [groupsRes, invitesRes] = await Promise.all([
      listMyGroups(),
      listMyInvites(),
    ]);
    if (groupsRes?.success) setGroupsList(groupsRes.groups || []);
    if (invitesRes?.success) setGroupInvites(invitesRes.invites || []);
    setGroupsLoading(false);
    return { groupsRes, invitesRes };
  }, [listMyGroups, listMyInvites]);

  const openGroupsHome = useCallback(async () => {
    setError(null);
    setSelectedGroup(null);
    setHomeView('groups');
    await refreshGroupsHome();
  }, [refreshGroupsHome, setError]);

  const openGroupDetail = useCallback(async (groupId) => {
    setError(null);
    setGroupsLoading(true);
    const res = await getGroup(groupId);
    if (res?.success) {
      setSelectedGroup(res.group);
      setHomeView('group');
    }
    setGroupsLoading(false);
    return res;
  }, [getGroup, setError]);

  const handleCreateGroup = useCallback(async (name) => {
    const res = await createGroup(name);
    if (res?.success && res.group?.id) {
      await refreshGroupsHome();
      await openGroupDetail(res.group.id);
    }
    return res;
  }, [createGroup, openGroupDetail, refreshGroupsHome]);

  const handleRespondToInvite = useCallback(async (inviteId, accept) => {
    const res = await respondToInvite(inviteId, accept);
    if (res?.success) {
      await refreshGroupsHome();
    }
    return res;
  }, [refreshGroupsHome, respondToInvite]);

  const handleInviteToGroup = useCallback(async (identifier) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await inviteToGroup(selectedGroup.id, identifier);
    if (res?.success) await openGroupDetail(selectedGroup.id);
    return res;
  }, [inviteToGroup, openGroupDetail, selectedGroup?.id]);

  const handleTransferHost = useCallback(async (newHostUserId) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await transferHost(selectedGroup.id, newHostUserId);
    if (res?.success) {
      await Promise.all([
        refreshGroupsHome(),
        openGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [openGroupDetail, refreshGroupsHome, selectedGroup?.id, transferHost]);

  const handleRemoveMember = useCallback(async (userId) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await removeMember(selectedGroup.id, userId);
    if (res?.success) {
      await Promise.all([
        refreshGroupsHome(),
        openGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [openGroupDetail, refreshGroupsHome, removeMember, selectedGroup?.id]);

  const handleRevokeInvite = useCallback(async (inviteId) => {
    const res = await revokeInvite(inviteId);
    if (res?.success && selectedGroup?.id) {
      await Promise.all([
        refreshGroupsHome(),
        openGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [openGroupDetail, refreshGroupsHome, revokeInvite, selectedGroup?.id]);

  const handleDeleteGroup = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await deleteGroup(selectedGroup.id);
    if (res?.success) {
      setSelectedGroup(null);
      setHomeView('groups');
      await refreshGroupsHome();
    }
    return res;
  }, [deleteGroup, refreshGroupsHome, selectedGroup?.id]);

  const handleLeaveGroup = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await leaveGroup(selectedGroup.id);
    if (res?.success) {
      setSelectedGroup(null);
      setHomeView('groups');
      await refreshGroupsHome();
    }
    return res;
  }, [leaveGroup, refreshGroupsHome, selectedGroup?.id]);

  // Voice — auto-joins muted on room entry (issue #49). Mic stays
  // unpublished until first user-gesture toggle, so first-time visitors
  // don't get a permission prompt before they ask for one. Hook tears
  // down on roomCode change.
  const voice = useVoice({ roomCode, isAuthenticated: authenticated, autoJoin: true });

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
  // useAuth returns a unified `user` — real Supabase user wins,
  // guest fills in otherwise. AuthScreen only shows when neither
  // identity is present.
  if (!user) {
    return (
      <AuthScreen
        onSendEmailOtp={sendEmailOtp}
        onGoogleSignIn={signInWithGoogle}
        onGuestSignIn={signInAsGuest}
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
    if (homeView === 'groups' && !isGuest) {
      return wrap(
        <GroupsScreen
          username={username}
          groups={groupsList}
          invites={groupInvites}
          loading={groupsLoading}
          error={error}
          onBack={() => {
            setSelectedGroup(null);
            setError(null);
            setHomeView('landing');
          }}
          onCreateGroup={handleCreateGroup}
          onOpenGroup={openGroupDetail}
          onRespondToInvite={handleRespondToInvite}
        />
      );
    }

    if (homeView === 'group' && selectedGroup && !isGuest) {
      return wrap(
        <GroupDetailScreen
          group={selectedGroup}
          currentUserId={user?.id}
          loading={groupsLoading}
          error={error}
          onBack={async () => {
            setError(null);
            setHomeView('groups');
            await refreshGroupsHome();
          }}
          onEnterRoom={() => joinRoom(selectedGroup.code)}
          onInvite={handleInviteToGroup}
          onTransferHost={handleTransferHost}
          onRemoveMember={handleRemoveMember}
          onDeleteGroup={handleDeleteGroup}
          onLeaveGroup={handleLeaveGroup}
          onRevokeInvite={handleRevokeInvite}
        />
      );
    }

    return wrap(
      <LandingScreen
        username={username}
        isGuest={isGuest}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onOpenGroups={openGroupsHome}
        onSignOut={signOut}
        onSignOutGuest={signOutGuest}
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
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          restartRoom={restartRoom}
          acknowledgeSpinResult={acknowledgeSpinResult}
          spinDismissed={spinDismissed}
          activatePowerCard={activatePowerCard}
          swapPick={swapPick}
          updateRoomConfig={updateRoomConfig}
          medicDecide={medicDecide}
          saboteurTransfer={saboteurTransfer}
          sniperRedirect={sniperRedirect}
          medicPrompt={medicPrompt}
          sniperPrompt={sniperPrompt}
          powerEventQueue={powerEventQueue}
          consumePowerEvent={consumePowerEvent}
          placeBet={placeBet}
          ghostVote={ghostVote}
          lastStandSpin={lastStandSpin}
          lastStandEndTurn={lastStandEndTurn}
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
        restartRoom={restartRoom}
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
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          restartRoom={restartRoom}
          acknowledgeSpinResult={acknowledgeSpinResult}
          spinDismissed={spinDismissed}
          activatePowerCard={activatePowerCard}
          swapPick={swapPick}
          updateRoomConfig={updateRoomConfig}
          medicDecide={medicDecide}
          saboteurTransfer={saboteurTransfer}
          sniperRedirect={sniperRedirect}
          medicPrompt={medicPrompt}
          sniperPrompt={sniperPrompt}
          powerEventQueue={powerEventQueue}
          consumePowerEvent={consumePowerEvent}
          placeBet={placeBet}
          ghostVote={ghostVote}
          lastStandSpin={lastStandSpin}
          lastStandEndTurn={lastStandEndTurn}
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
