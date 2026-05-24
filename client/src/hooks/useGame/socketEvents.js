import { useEffect } from 'react';

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

      const authed = await authenticateSocket();
      if (!authed) return;

      const saved = sessionStorage.getItem('bluff_session');
      if (!saved) return;
      const { roomCode: savedCode, isHost: savedHost, playerId: savedPlayerId } = JSON.parse(saved);

      if (savedHost) {
        socket.emit('host_reconnect', { roomCode: savedCode }, (res) => {
          if (res?.success) {
            setRoomCode(savedCode);
            setIsHost(true);
            setPlayerId(savedPlayerId || null);
          } else {
            sessionStorage.removeItem('bluff_session');
          }
        });
      } else if (savedPlayerId) {
        socket.emit('player_reconnect', { roomCode: savedCode }, (res) => {
          if (res?.success) {
            setRoomCode(savedCode);
            setIsHost(false);
            setPlayerId(savedPlayerId);
          } else {
            sessionStorage.removeItem('bluff_session');
          }
        });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      setAuthenticated(false);
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
      try { socket.emit('client_keepalive'); } catch (_) { /* transport hiccup — non-fatal */ }
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
    const onGameEnded = ({ reason } = {}) => {
      sessionStorage.removeItem('bluff_session');
      clearSession();
      notify(reason || 'The game has ended.', 'error');
    };
    // #156 — host removed us from the group; drop out of any live room and
    // return to the landing screen, mirroring how game_ended is handled.
    const onRemovedFromGroup = ({ reason } = {}) => {
      sessionStorage.removeItem('bluff_session');
      clearSession();
      notify(reason || 'You were removed from the group.', 'error');
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
    socket.on('game_ended', onGameEnded);
    socket.on('removed_from_group', onRemovedFromGroup);
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
      socket.off('game_ended', onGameEnded);
      socket.off('removed_from_group', onRemovedFromGroup);
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
