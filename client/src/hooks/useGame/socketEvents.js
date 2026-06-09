import { useEffect } from 'react';
import { readRoomSession, clearRoomSession } from '../../lib/sessionStore';

export function useGameSocketEvents({
  socket,
  authenticateSocket,
  notify,
  clearSession,
  playChatPing,
  chatOpenRef,
  myUserIdRef,
  leaderboardCacheRef,
  setConnected,
  setAuthenticated,
  setError,
  setRoomCode,
  setIsHost,
  setPlayerId,
  setRoomState,
  setSpinDismissed,
  setChatMessages,
  setChatUnread,
  setPowerEventQueue,
  setLeaderboardUpdateNonce,
}) {
  useEffect(() => {
    const onConnect = async () => {
      setConnected(true);
      setError(null);
      // Authenticate only. There is NO auto-rejoin: a disconnect (refresh, tab
      // close, sign-out, or a network drop) removes the participant server-side
      // immediately, so a reconnected socket starts fresh on the landing screen.
      await authenticateSocket();
    };

    const onDisconnect = () => {
      setConnected(false);
      setAuthenticated(false);
      // Any disconnect drops us out of the game (matches the server's immediate
      // removal). If we were in a room, tear the local session down so the UI
      // returns to the landing screen instead of showing a stale table.
      if (readRoomSession()?.roomCode) {
        clearRoomSession();
        clearSession();
        notify('You were disconnected from the game.', 'error');
      }
    };

    const onRoomState = (state) => {
      setRoomState(state);
      // Live host changes (stand-in reclaim / hand-back / migration) reach us
      // ONLY through room_state, so re-derive isHost on every push. Prefer the
      // per-recipient amHost flag (per-socket online broadcast); else compare
      // the room host id to our own id; if neither is determinable, leave
      // isHost untouched so an ad-hoc host (whose playerId we may not hold) is
      // never wrongly demoted.
      if (state) {
        if (typeof state.amHost === 'boolean') {
          setIsHost(state.amHost);
        } else if (state.hostUserId != null && myUserIdRef.current != null) {
          setIsHost(state.hostUserId === myUserIdRef.current);
        }
      }
      if (state?.lastAction?.type === 'spin_result') setSpinDismissed(false);
      if (Array.isArray(state?.chatLog)) {
        setChatMessages((prev) => {
          const seen = new Set(prev.map((message) => message.id));
          const additions = state.chatLog.filter((message) => !seen.has(message.id));
          return additions.length ? [...prev, ...additions] : prev;
        });
      }
    };

    const onChatMessage = (msg) => {
      if (!msg?.id) return;
      setChatMessages((prev) => {
        if (prev.some((message) => message.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (!chatOpenRef.current) {
        setChatUnread((count) => count + 1);
        if (msg.userId !== myUserIdRef.current) playChatPing();
      }
    };

    // §2.1 — answer the server's keepalive heartbeat so there's a steady trickle
    // of INBOUND traffic (on top of the engine-level pong), helping free-tier
    // hosts keep the instance awake during a live game. Pure liveness; no state.
    const onServerKeepalive = () => {
      try { socket.emit('client_keepalive'); } catch (_) { /* transport hiccup - non-fatal */ }
    };

    const onBluffCalled = () => notify('Bluff called! Host: reveal the last card.', 'warning');
    const onSpinAcknowledged = () => setSpinDismissed(true);
    const onPowerCardTriggered = (event) => {
      if (!event || !event.kind) return;
      const id = `${event.kind}:${event.holderId || '?'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      setPowerEventQueue((queue) => [...queue, { id, ...event }]);
    };
    const onGroupLeaderboardUpdated = (payload = {}) => {
      const groupId = payload?.groupId;
      if (groupId) leaderboardCacheRef.current.delete(groupId);
      else leaderboardCacheRef.current.clear();
      setLeaderboardUpdateNonce((nonce) => nonce + 1);
    };
    const onHostDisconnecting = ({ countdown } = {}) => {
      notify(`Host disconnected. Game ends in ${countdown ?? 30}s if they don't return.`, 'error');
    };
    // #183 — a group stand-in was appointed, or the owner reclaimed / was
    // handed host back. Host controls already followed via room_state; this
    // toast just tells the table who now holds them.
    const onHostChanged = ({ hostName, reason } = {}) => {
      if (!hostName) return;
      notify(
        reason === 'reclaimed'
          ? `${hostName} has reclaimed host controls.`
          : `${hostName} is now the host.`,
        'info',
      );
    };
    // #183 — the acting host left mid-game and the seat migrated to a remaining
    // player (handlers/room.js leave_room). Same user-facing notice.
    const onHostMigrated = ({ newHostName } = {}) => {
      if (!newHostName) return;
      notify(`${newHostName} is now the host.`, 'info');
    };
    const onGameEnded = ({ reason } = {}) => {
      clearRoomSession();
      clearSession();
      notify(reason || 'The game has ended.', 'error');
    };
    // #156 — host removed us from the group; drop out of any live room and
    // return to the landing screen, mirroring how game_ended is handled.
    const onRemovedFromGroup = ({ reason } = {}) => {
      clearRoomSession();
      clearSession();
      notify(reason || 'You were removed from the group.', 'error');
    };
    // #244 — the host kicked us from the room; drop out and return to landing,
    // mirroring game_ended / removed_from_group.
    const onKicked = ({ reason } = {}) => {
      clearRoomSession();
      clearSession();
      notify(reason || 'The host removed you from the room.', 'error');
    };
    const onLobbyIdleWarning = ({ secondsUntilAction, willAutoStart } = {}) => {
      const secs = secondsUntilAction ?? 60;
      notify(
        willAutoStart
          ? `Host idle. Auto-starting in ${secs}s - host: tap anything to cancel.`
          : `Host idle. Lobby will close in ${secs}s - host: tap anything to cancel.`,
        'warning',
      );
    };
    const onLobbyIdleWarningCancelled = () => {
      notify('Host is back. Lobby is safe.', 'info');
    };
    const onLobbyAutoStarted = ({ reason } = {}) => {
      notify(reason || 'Game auto-started.', 'info');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('server_keepalive', onServerKeepalive);
    socket.on('room_state', onRoomState);
    socket.on('chat_message', onChatMessage);
    socket.on('bluff_called', onBluffCalled);
    socket.on('spin_acknowledged', onSpinAcknowledged);
    socket.on('host_disconnecting', onHostDisconnecting);
    socket.on('host_changed', onHostChanged);
    socket.on('host_migrated', onHostMigrated);
    socket.on('game_ended', onGameEnded);
    socket.on('removed_from_group', onRemovedFromGroup);
    socket.on('kicked', onKicked);
    socket.on('power_card_triggered', onPowerCardTriggered);
    socket.on('group_leaderboard_updated', onGroupLeaderboardUpdated);
    socket.on('lobby_idle_warning', onLobbyIdleWarning);
    socket.on('lobby_idle_warning_cancelled', onLobbyIdleWarningCancelled);
    socket.on('lobby_auto_started', onLobbyAutoStarted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('server_keepalive', onServerKeepalive);
      socket.off('room_state', onRoomState);
      socket.off('chat_message', onChatMessage);
      socket.off('bluff_called', onBluffCalled);
      socket.off('spin_acknowledged', onSpinAcknowledged);
      socket.off('host_disconnecting', onHostDisconnecting);
      socket.off('host_changed', onHostChanged);
      socket.off('host_migrated', onHostMigrated);
      socket.off('game_ended', onGameEnded);
      socket.off('removed_from_group', onRemovedFromGroup);
      socket.off('kicked', onKicked);
      socket.off('power_card_triggered', onPowerCardTriggered);
      socket.off('group_leaderboard_updated', onGroupLeaderboardUpdated);
      socket.off('lobby_idle_warning', onLobbyIdleWarning);
      socket.off('lobby_idle_warning_cancelled', onLobbyIdleWarningCancelled);
      socket.off('lobby_auto_started', onLobbyAutoStarted);
    };
  }, [
    authenticateSocket,
    chatOpenRef,
    clearSession,
    leaderboardCacheRef,
    myUserIdRef,
    notify,
    playChatPing,
    setAuthenticated,
    setChatMessages,
    setChatUnread,
    setConnected,
    setError,
    setIsHost,
    setLeaderboardUpdateNonce,
    setPlayerId,
    setPowerEventQueue,
    setRoomCode,
    setRoomState,
    setSpinDismissed,
    socket,
  ]);
}
