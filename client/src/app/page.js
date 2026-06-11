'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../hooks/useGame';
import { useMusic, gameMusicStage } from '../hooks/useAtmosphere';
import { useVoice } from '../hooks/useVoice';
import { AuthScreen } from '../components/screens/AuthScreen';
import { LandingScreen } from '../components/screens/LandingScreen';
import { GroupsScreen } from '../components/screens/GroupsScreen';
import { GroupDetailScreen } from '../components/screens/GroupDetailScreen';
import { HostUI } from '../components/HostUI';
import { PlayerUI } from '../components/PlayerUI';
import { OnlinePlayerUI } from '../components/OnlinePlayerUI';
import { Notification } from '../components/shared/Notification';
import { SettingsGear } from '../components/shared/SettingsGear';
import { ChatPanel } from '../components/ChatPanel';
import { ControlsModal } from '../components/shared/ControlsModal';
import { KickPlayerPanel } from '../components/shared/KickPlayerPanel';
import { PreGameSettingsPanel } from '../components/screens/PreGameSettingsPanel';
import { LobbyConfigSummary } from '../components/LobbyConfigSummary';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { useIsMobile } from '../hooks/useIsMobile';

// §M4 — non-blocking "reconnecting" pill shown while the socket is down but the
// player is still in a room. Sits top-centre, above the table; the resilient
// rejoin in useGame restores state automatically once the transport recovers.
function ReconnectingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        borderRadius: 999,
        background: 'rgba(16,12,8,0.95)',
        border: '1px solid var(--warning)',
        color: 'var(--warning)',
        fontSize: 11,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: '0.08em',
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--warning)',
          animation: 'pulse 1.2s ease-in-out infinite',
        }}
      />
      Reconnecting…
    </div>
  );
}

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
    createRoom, startTutorial, startSandbox, skipToPowers, advanceTutorial, joinRoom, startGame,
    createGroup, listMyGroups, getGroup,
    inviteToGroup, listMyInvites, respondToInvite,
    revokeInvite, removeMember, transferHost,
    reclaimHost, handBackHost,
    deleteGroup, leaveGroup, getGroupLeaderboard,
    nextTurn, resolveBluff,
    playCard, endTurn, playerSpin,
    declareRoundWin, callBluff,
    playCardOnline, spectatePlayer,
    acknowledgeSpinResult, redemptionSpin, spinDismissed,
    chatMessages, chatUnread, chatOpen,
    sendChatMessage, openChat, closeChat,
    leaveGame, restartRoom, resetRoom, kickPlayer, setError,
    activatePowerCard,
    swapPick,
    preGameSelect,
    updateRoomConfig,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    bluffIntercept,
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
    // #205 — meta-progression: XP summary + cosmetics locker actions.
    xpAward,
    getProgression,
    setCosmetics,
  } = game;

  // ─── Section-based background music (#A) ──────────────────────────
  // Each area of the app has its own track; the section is derived from the
  // current screen + room phase and switched as the player moves around.
  // _setSection arms the mobile autoplay unlock, so no explicit gesture
  // listener is needed here. Muteable from the settings gear.
  const { musicEnabled, musicVolume, toggleMusic, setMusicVolume, setSection, setGameStage, nextTrack, prevTrack } = useMusic();
  // A group room's lobby belongs to the Groups area — keep it on the GROUPS
  // track instead of switching to the normal online-lobby sound. It only moves
  // to 'game' once the match actually starts (phase leaves lobby), and to
  // 'gameover' at the end.
  const inGroupRoom = !!roomState?.groupId;
  const musicSection = roomCode
    ? (roomState?.phase === 'game_over'
        ? 'gameover'
        : (roomState?.phase && roomState.phase !== 'lobby')
            ? 'game'
            : (inGroupRoom ? 'groups' : 'lobby'))
    : (homeView === 'groups' || homeView === 'group') ? 'groups' : 'lobby';
  useEffect(() => {
    setSection(musicSection);
  }, [setSection, musicSection]);

  // Game-state progressive music: feed the in-game intensity stage (player
  // attrition) so the 'game' section crossfades from quiet tension up to the
  // anthems as the field thins. No-op outside the 'game' section.
  const gameStage = gameMusicStage(roomState);
  useEffect(() => {
    setGameStage(gameStage);
  }, [setGameStage, gameStage]);

  // (Module 1) Lock page scrolling while inside the online game shell so the
  // pannable table owns the whole viewport with no native page scroll on any
  // device. Mirrors the `fullBleed` condition below; cleaned up on exit.
  const inOnlineGame = !!roomCode && gameMode === 'online';
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('game-noscroll', inOnlineGame);
    return () => document.body.classList.remove('game-noscroll');
  }, [inOnlineGame]);

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

  // #160 — manual in-place reload of the open group detail (members +
  // pending invites). Forces past the cache so the user sees changes other
  // members made without leaving the view.
  const refreshGroupDetail = useCallback(async () => {
    if (!selectedGroup?.id) return { success: false, error: 'Group not found' };
    setGroupsLoading(true);
    try {
      invalidateGroupsCache('detail', selectedGroup.id);
      return await fetchGroupDetail(selectedGroup.id);
    } finally {
      setGroupsLoading(false);
    }
  }, [fetchGroupDetail, invalidateGroupsCache, selectedGroup?.id]);

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

  const handleResetRoom = useCallback(async () => {
    if (!selectedGroup?.code) return { success: false, error: 'Group not found' };
    const res = await resetRoom(selectedGroup.code);
    if (res?.success && selectedGroup?.id) {
      // Refresh so the occupancy badge reflects the now-empty room.
      await fetchGroupDetail(selectedGroup.id);
    }
    return res;
  }, [resetRoom, fetchGroupDetail, selectedGroup?.code, selectedGroup?.id]);

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

  // Signing out must also drop us out of any live game first — leaveGame emits
  // leave_room (host-leave/elimination handled server-side) and clears the
  // local session so we can't linger as a ghost player after sign-out.
  const handleSignOut = useCallback(async () => {
    leaveGame();
    await signOut();
  }, [leaveGame, signOut]);

  const handleSignOutGuest = useCallback(async () => {
    leaveGame();
    await signOutGuest();
  }, [leaveGame, signOutGuest]);

  // Voice — auto-joins muted on room entry (issue #49). Mic stays
  // unpublished until first user-gesture toggle, so first-time visitors
  // don't get a permission prompt before they ask for one. Hook tears
  // down on roomCode change.
  const voice = useVoice({ roomCode, isAuthenticated: authenticated, autoJoin: true });

  // Issue #102 — drives mobile-only consolidation: hide the
  // ChatPanel floating trigger so the new MobileFabMenu owns the
  // single entry point on small screens.
  const isMobile = useIsMobile();

  // ─── In-room controls hoisted into the global settings gear (Module 2) ──────
  // The old bottom-right FAB is gone; the online table's controls (chat, game
  // settings, leaderboard, leave, voice) now live in the top-right SettingsGear.
  // The "game settings" / "leaderboard" dialogs render here (page level) so the
  // gear can open them; everything is gated to online rooms so other screens are
  // untouched.
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false); // #244 - host Kick Player modal
  const inRoomOnline = !!roomCode && gameMode === 'online';
  // The practice Power-Clinic progress bar is an in-flow 22px band at the very top
  // of the online table (OnlinePlayerUI). When it's up, nudge the fixed settings
  // gear down so it clears the bar's right edge instead of covering it.
  const clinicBarVisible = inRoomOnline
    && (!!roomState?.tutorialScenario || !!roomState?.tutorialClinicComplete);
  const phase = roomState?.phase;
  const isLobby = phase === 'lobby';
  const isGameOver = phase === 'game_over';
  const aliveCount = (roomState?.players || []).filter((p) => p?.status === 'alive').length;
  const leaveDisabled = !!isMyTurn && phase === 'playing' && myPlayer?.status !== 'eliminated';
  const handleLeaveTable = useCallback(() => {
    if (!!isMyTurn && roomState?.phase === 'playing' && myPlayer?.status !== 'eliminated') return;
    const ph = roomState?.phase;
    const isMidGame = !!ph && !['lobby', 'game_over'].includes(ph);
    if (isMidGame && typeof window !== 'undefined'
      && !window.confirm('Leave the table? You will forfeit and cannot rejoin this round.')) return;
    leaveGame();
  }, [isMyTurn, roomState?.phase, myPlayer?.status, leaveGame]);
  // Close the in-room dialogs whenever we leave the room so they can't linger.
  useEffect(() => {
    if (!inRoomOnline) { setGameSettingsOpen(false); setLeaderboardOpen(false); }
  }, [inRoomOnline]);

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

  // The online table runs as a full-bleed, viewport-height shell (no page
  // scroll) so it stays compact; every other screen keeps normal padded flow.
  const fullBleed = inOnlineGame;
  const wrap = (children) => (
    <div style={fullBleed
      ? { height: '100dvh', overflow: 'hidden', position: 'relative' }
      : { minHeight: '100vh', padding: '24px 16px' }}>
      <Notification notification={notification} />
      {/* §M4 - in-room reconnect indicator. While the socket is down but we're
          still in a room, show a non-blocking banner instead of freezing or
          bouncing to the landing screen; useGame's resilient rejoin recovers us. */}
      {roomCode && !connected && <ReconnectingBanner />}
      {children}
      {/* Global identity / settings gear - present on every signed-in screen
          (landing, groups, in-game). Holds username, music toggle, profile,
          and sign-out so the "main settings" are reachable everywhere. */}
      <SettingsGear
        username={username}
        isGuest={isGuest}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
        musicVolume={musicVolume}
        onSetMusicVolume={setMusicVolume}
        onPrevTrack={prevTrack}
        onNextTrack={nextTrack}
        onSignOut={handleSignOut}
        onSignOutGuest={handleSignOutGuest}
        onUpdateUsername={updateUsername}
        // #205 — XP + cosmetic locker (hidden for guests inside the gear).
        getProgression={getProgression}
        setCosmetics={setCosmetics}
        // ── In-room controls (Module 2) — only inside an online room ──
        inRoom={inRoomOnline}
        chatUnread={chatUnread}
        onOpenChat={inRoomOnline ? openChat : undefined}
        onOpenGameSettings={inRoomOnline ? () => setGameSettingsOpen(true) : undefined}
        onOpenLeaderboard={inRoomOnline && roomState?.groupId ? () => setLeaderboardOpen(true) : undefined}
        // #244 — host-only: opens the Kick Player roster (presence of the
        // callback is what gates the menu item, like the other in-room controls).
        onOpenKickPlayer={inRoomOnline && isHost ? () => setKickOpen(true) : undefined}
        onLeaveTable={inRoomOnline ? handleLeaveTable : undefined}
        leaveDisabled={leaveDisabled}
        voice={inRoomOnline ? voice : undefined}
        topOffset={clinicBarVisible ? 22 : 0}
      />
      {/* Game settings - host edits in the lobby, everyone else sees a summary */}
      {inRoomOnline && gameSettingsOpen && (
        <ControlsModal title="Game Settings" onClose={() => setGameSettingsOpen(false)}>
          {isHost && isLobby && roomState?.config ? (
            <PreGameSettingsPanel
              config={roomState.config}
              onChange={updateRoomConfig}
              isGroupRoom={!!roomState?.groupId}
              savedMeta={roomState?.groupSettingsMeta}
              playerCount={aliveCount}
              // (Module 5) Sandbox: only power cards are configurable today; the
              // rest render with a "Coming Soon" tag.
              sandbox={!!roomState?.sandbox}
            />
          ) : roomState?.config ? (
            <LobbyConfigSummary config={roomState.config} />
          ) : (
            <div style={{ color: 'var(--text-dim)', fontFamily: "'Crimson Text', serif", fontStyle: 'italic' }}>
              No house rules configured yet.
            </div>
          )}
        </ControlsModal>
      )}
      {inRoomOnline && leaderboardOpen && roomState?.groupId && (
        <ControlsModal title="Leaderboard" onClose={() => setLeaderboardOpen(false)}>
          <LeaderboardPanel
            groupId={roomState.groupId}
            currentUserId={myPlayer?.id || null}
            highlightUserId={isGameOver ? (roomState?.lastAction?.winnerId || null) : null}
            getGroupLeaderboard={getGroupLeaderboard}
            leaderboardUpdateNonce={leaderboardUpdateNonce}
          />
        </ControlsModal>
      )}
      {/* #244 - host-only Kick Player roster */}
      {inRoomOnline && isHost && kickOpen && (
        <ControlsModal title="Kick Player" onClose={() => setKickOpen(false)}>
          <KickPlayerPanel
            players={roomState?.players || []}
            hostId={roomState?.hostUserId || null}
            onKick={kickPlayer}
          />
        </ControlsModal>
      )}
      {roomCode && (
        <ChatPanel
          messages={chatMessages}
          unread={chatUnread}
          open={chatOpen}
          onOpen={openChat}
          onClose={closeChat}
          onSend={sendChatMessage}
          myUserId={user?.id}
          // #146 — the consolidated in-game menu (online mode, any screen size)
          // owns the chat entry point, so suppress ChatPanel's own trigger
          // there. Physical-mode desktop still uses the standalone trigger.
          hideTrigger={isMobile || gameMode === 'online'}
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
          onRefresh={() => refreshGroupsHome({ force: true })}
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
          onResetRoom={handleResetRoom}
          onRefresh={refreshGroupDetail}
        />
      );
    }

    return wrap(
      <LandingScreen
        username={username}
        isGuest={isGuest}
        onCreateRoom={createRoom}
        onStartTutorial={startTutorial}
        onStartSandbox={startSandbox}
        onJoinRoom={joinRoom}
        onOpenGroups={openGroupsHome}
        onSignOut={handleSignOut}
        onSignOutGuest={handleSignOutGuest}
        onUpdateUsername={updateUsername}
        initialJoinCode={initialJoinCode}
        error={error}
        setError={setError}
        connected={connected}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
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
          skipToPowers={skipToPowers}
          advanceTutorial={advanceTutorial}
          playCardOnline={playCardOnline}
          callBluff={callBluff}
          endTurn={endTurn}
          playerSpin={playerSpin}
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          restartRoom={restartRoom}
          acknowledgeSpinResult={acknowledgeSpinResult}
          redemptionSpin={redemptionSpin}
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
          bluffIntercept={bluffIntercept}
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
          xpAward={xpAward}
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
          startGame={startGame}
          skipToPowers={skipToPowers}
          advanceTutorial={advanceTutorial}
          playCardOnline={playCardOnline}
          callBluff={callBluff}
          endTurn={endTurn}
          playerSpin={playerSpin}
          spectatePlayer={spectatePlayer}
          leaveGame={leaveGame}
          restartRoom={restartRoom}
          acknowledgeSpinResult={acknowledgeSpinResult}
          redemptionSpin={redemptionSpin}
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
          bluffIntercept={bluffIntercept}
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
          xpAward={xpAward}
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
