'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import { AuthScreen } from '../components/screens/AuthScreen';
import { LandingScreen } from '../components/screens/LandingScreen';
import { GroupsScreen } from '../components/screens/GroupsScreen';
import { GroupDetailScreen } from '../components/screens/GroupDetailScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { OnlinePlayerUI } from '../components/OnlinePlayerUI';
import { Notification } from '../components/shared/Notification';
import { ChatPanel } from '../components/ChatPanel';
import { useIsMobile } from '../hooks/useIsMobile';

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
    reclaimHost, handBackHost,
    deleteGroup, leaveGroup, getGroupLeaderboard,
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
    preGameSelect,
    updateRoomConfig,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    medicPrompt,
    sniperPrompt,
    pregame,
    powerEventQueue,
    consumePowerEvent,
    leaderboardUpdateNonce,
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
  } = game;

  // ─── Groups cache (issue #106) ─────────────────────────────
  // In-memory only (sessionStorage is overkill for socket payloads
  // and they shouldn't survive tab close). Two scopes:
  //   list.loadedAt    — most recent successful list_my_groups +
  //                      list_my_invites pair; rendered state in
  //                      groupsList / groupInvites is the payload.
  //   detail (Map)     — per-groupId snapshots of get_group plus
  //                      their loadedAt; lets us re-render the
  //                      detail screen instantly when revisiting
  //                      the same group within the TTL.
  // SWR: <30s = serve cache only. 30-60s = serve cache + refresh
  // in background. >60s or invalidated = blocking refresh.
  const GROUPS_CACHE_TTL_MS = 60_000;
  const GROUPS_SWR_AFTER_MS = 30_000;
  const groupsCacheRef = useRef({
    list: { loadedAt: 0 },
    detail: new Map(), // groupId → { group, loadedAt }
  });

  const invalidateGroupsCache = useCallback((scope = 'all', groupId = null) => {
    const cache = groupsCacheRef.current;
    if (scope === 'list' || scope === 'all') cache.list.loadedAt = 0;
    if (scope === 'detail' || scope === 'all') {
      if (groupId) cache.detail.delete(groupId);
      else cache.detail.clear();
    }
  }, []);

  // Always emits and updates state on success. Returns the raw
  // server responses so callers (mutations) can react to errors.
  const fetchGroupsList = useCallback(async () => {
    const [groupsRes, invitesRes] = await Promise.all([
      listMyGroups(),
      listMyInvites(),
    ]);
    if (groupsRes?.success) setGroupsList(groupsRes.groups || []);
    if (invitesRes?.success) setGroupInvites(invitesRes.invites || []);
    if (groupsRes?.success && invitesRes?.success) {
      groupsCacheRef.current.list.loadedAt = Date.now();
    }
    return { groupsRes, invitesRes };
  }, [listMyGroups, listMyInvites]);

  const refreshGroupsHome = useCallback(async ({ force = false } = {}) => {
    setGroupsLoading(true);
    try {
      if (force) invalidateGroupsCache('list');
      return await fetchGroupsList();
    } finally {
      setGroupsLoading(false);
    }
  }, [fetchGroupsList, invalidateGroupsCache]);

  const openGroupsHome = useCallback(async () => {
    setError(null);
    setSelectedGroup(null);
    setHomeView('groups');
    const age = Date.now() - groupsCacheRef.current.list.loadedAt;
    if (groupsCacheRef.current.list.loadedAt && age < GROUPS_CACHE_TTL_MS) {
      // Cache hit: render rendered state (already in groupsList /
      // groupInvites). Kick a background refresh if we're past the
      // SWR threshold so the next visit is fresh too.
      if (age >= GROUPS_SWR_AFTER_MS) fetchGroupsList();
      return;
    }
    await refreshGroupsHome();
  }, [fetchGroupsList, refreshGroupsHome, setError]);

  // Returns the raw `get_group` response shape: { success, group, ... }
  // so callers don't have to know the cache exists.
  const fetchGroupDetail = useCallback(async (groupId) => {
    const res = await getGroup(groupId);
    if (res?.success && res.group) {
      setSelectedGroup(res.group);
      groupsCacheRef.current.detail.set(groupId, {
        group: res.group,
        loadedAt: Date.now(),
      });
    }
    return res;
  }, [getGroup]);

  const openGroupDetail = useCallback(async (groupId) => {
    setError(null);
    const cached = groupsCacheRef.current.detail.get(groupId);
    const age = cached ? Date.now() - cached.loadedAt : Infinity;
    if (cached && age < GROUPS_CACHE_TTL_MS) {
      setSelectedGroup(cached.group);
      setHomeView('group');
      if (age >= GROUPS_SWR_AFTER_MS) {
        // Background refresh — don't block the screen transition,
        // just update once the response arrives.
        fetchGroupDetail(groupId);
      }
      return { success: true, group: cached.group };
    }
    setGroupsLoading(true);
    try {
      const res = await fetchGroupDetail(groupId);
      if (res?.success) setHomeView('group');
      return res;
    } finally {
      setGroupsLoading(false);
    }
  }, [fetchGroupDetail, setError]);

  // ─── Mutations: each one invalidates the slices it touches and
  // re-fetches blockingly (the UI already shows a busy state during
  // these). The cache exists to skip *spontaneous* fetches, not
  // mutation follow-ups.

  const handleCreateGroup = useCallback(async (name) => {
    const res = await createGroup(name);
    if (res?.success && res.group?.id) {
      invalidateGroupsCache('list');
      await refreshGroupsHome();
      await openGroupDetail(res.group.id);
    }
    return res;
  }, [createGroup, invalidateGroupsCache, openGroupDetail, refreshGroupsHome]);

  const handleRespondToInvite = useCallback(async (inviteId, accept) => {
    const res = await respondToInvite(inviteId, accept);
    if (res?.success) {
      invalidateGroupsCache('all');
      await refreshGroupsHome();
    }
    return res;
  }, [invalidateGroupsCache, refreshGroupsHome, respondToInvite]);

  const handleInviteToGroup = useCallback(async (identifier) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await inviteToGroup(selectedGroup.id, identifier);
    if (res?.success) {
      invalidateGroupsCache('detail', selectedGroup.id);
      await fetchGroupDetail(selectedGroup.id);
    }
    return res;
  }, [fetchGroupDetail, inviteToGroup, invalidateGroupsCache, selectedGroup?.id]);

  const handleTransferHost = useCallback(async (newHostUserId) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await transferHost(selectedGroup.id, newHostUserId);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      await Promise.all([
        refreshGroupsHome(),
        fetchGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [fetchGroupDetail, invalidateGroupsCache, refreshGroupsHome, selectedGroup?.id, transferHost]);

  const handleReclaimHost = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await reclaimHost(selectedGroup.id);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      await Promise.all([
        refreshGroupsHome(),
        fetchGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [fetchGroupDetail, invalidateGroupsCache, refreshGroupsHome, selectedGroup?.id, reclaimHost]);

  const handleHandBackHost = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await handBackHost(selectedGroup.id);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      await Promise.all([
        refreshGroupsHome(),
        fetchGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [fetchGroupDetail, invalidateGroupsCache, refreshGroupsHome, selectedGroup?.id, handBackHost]);

  const handleRemoveMember = useCallback(async (userId) => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await removeMember(selectedGroup.id, userId);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      await Promise.all([
        refreshGroupsHome(),
        fetchGroupDetail(selectedGroup.id),
      ]);
    }
    return res;
  }, [fetchGroupDetail, invalidateGroupsCache, refreshGroupsHome, removeMember, selectedGroup?.id]);

  const handleRevokeInvite = useCallback(async (inviteId) => {
    const res = await revokeInvite(inviteId);
    if (res?.success && selectedGroup?.id) {
      invalidateGroupsCache('detail', selectedGroup.id);
      await fetchGroupDetail(selectedGroup.id);
    }
    return res;
  }, [fetchGroupDetail, invalidateGroupsCache, revokeInvite, selectedGroup?.id]);

  const handleDeleteGroup = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await deleteGroup(selectedGroup.id);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      setSelectedGroup(null);
      setHomeView('groups');
      await refreshGroupsHome();
    }
    return res;
  }, [deleteGroup, invalidateGroupsCache, refreshGroupsHome, selectedGroup?.id]);

  const handleLeaveGroup = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    const res = await leaveGroup(selectedGroup.id);
    if (res?.success) {
      invalidateGroupsCache('all', selectedGroup.id);
      setSelectedGroup(null);
      setHomeView('groups');
      await refreshGroupsHome();
    }
    return res;
  }, [invalidateGroupsCache, leaveGroup, refreshGroupsHome, selectedGroup?.id]);

  // Voice — auto-joins muted on room entry (issue #49). Mic stays
  // unpublished until first user-gesture toggle, so first-time visitors
  // don't get a permission prompt before they ask for one. Hook tears
  // down on roomCode change.
  const voice = useVoice({ roomCode, isAuthenticated: authenticated, autoJoin: true });

  // Issue #102 — drives mobile-only consolidation: hide the
  // ChatPanel floating trigger so the new MobileFabMenu owns the
  // single entry point on small screens.
  const isMobile = useIsMobile();

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
          hideTrigger={isMobile}
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
          onReclaimHost={handleReclaimHost}
          onHandBackHost={handleHandBackHost}
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
          preGameSelect={preGameSelect}
          updateRoomConfig={updateRoomConfig}
          getGroupLeaderboard={getGroupLeaderboard}
          leaderboardUpdateNonce={leaderboardUpdateNonce}
          medicDecide={medicDecide}
          saboteurTransfer={saboteurTransfer}
          sniperRedirect={sniperRedirect}
          medicPrompt={medicPrompt}
          sniperPrompt={sniperPrompt}
          pregame={pregame}
          powerEventQueue={powerEventQueue}
          consumePowerEvent={consumePowerEvent}
          placeBet={placeBet}
          ghostVote={ghostVote}
          lastStandSpin={lastStandSpin}
          lastStandEndTurn={lastStandEndTurn}
          voice={voice}
          openChat={openChat}
          chatUnread={chatUnread}
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
          preGameSelect={preGameSelect}
          updateRoomConfig={updateRoomConfig}
          getGroupLeaderboard={getGroupLeaderboard}
          leaderboardUpdateNonce={leaderboardUpdateNonce}
          medicDecide={medicDecide}
          saboteurTransfer={saboteurTransfer}
          sniperRedirect={sniperRedirect}
          medicPrompt={medicPrompt}
          sniperPrompt={sniperPrompt}
          pregame={pregame}
          powerEventQueue={powerEventQueue}
          consumePowerEvent={consumePowerEvent}
          placeBet={placeBet}
          ghostVote={ghostVote}
          lastStandSpin={lastStandSpin}
          lastStandEndTurn={lastStandEndTurn}
          voice={voice}
          openChat={openChat}
          chatUnread={chatUnread}
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
