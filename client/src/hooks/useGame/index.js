// ============================================================
// useGame HOOK - Manages all socket events and game state
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../../lib/socket';
import { clearRoomSession } from '../../lib/sessionStore';
import { getDeviceId, getDeviceName } from '../../lib/device';
import { useGameBrowserEffects, useSocketAuthenticationEffect } from './browserEffects';
import { useGameActions } from './gameActions';
import { useGroupActions } from './groupActions';
import { usePromptEvents, usePreGameEvents } from './promptEffects';
import { useGameSocketEvents } from './socketEvents';

export function useGame(getAccessToken, getGuestAuth, authIdentityKey = null, onForceSignOut = null) {
  const socket = getSocket();

  // Single-device eviction/refusal callback (wired to useAuth.forceSignOut).
  // Held in a ref so the socket-event subscription doesn't re-bind when the
  // caller passes a fresh closure.
  const onForceSignOutRef = useRef(onForceSignOut);
  useEffect(() => { onForceSignOutRef.current = onForceSignOut; }, [onForceSignOut]);

  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notification, setNotification] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  // Single-active-session: when a login is contested by another live device,
  // the server refuses with the active device's info instead of silently
  // kicking either side. We surface it here so page.js can show a takeover
  // screen ({ name, since } | null).
  const [sessionConflict, setSessionConflict] = useState(null);
  const [spinDismissed, setSpinDismissed] = useState(false);
  const [leaderboardUpdateNonce, setLeaderboardUpdateNonce] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [powerEventQueue, setPowerEventQueue] = useState([]);
  const [medicPrompt, setMedicPrompt] = useState(null);
  const [sniperPrompt, setSniperPrompt] = useState(null);
  const [bloodDebtPrompt, setBloodDebtPrompt] = useState(null);
  const [pregame, setPregame] = useState(null);
  // #205 — this client's private end-of-game XP payload. Set by `xp_awarded`,
  // cleared whenever the room moves off game_over (next deal / reset).
  const [xpAward, setXpAward] = useState(null);

  const chatOpenRef = useRef(false);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  const myUserIdRef = useRef(null);
  useEffect(() => {
    myUserIdRef.current = playerId;
  }, [playerId]);

  const chatPingCtxRef = useRef(null);
  const notifyTimerRef = useRef(null);
  const leaderboardCacheRef = useRef(new Map());
  const leaderboardTtlMs = 30_000;

  const playChatPing = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      let ctx = chatPingCtxRef.current;
      if (!ctx) {
        ctx = new Ctor();
        chatPingCtxRef.current = ctx;
      }

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      gain.connect(ctx.destination);

      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 880;
      o1.connect(gain);
      o1.start(now);
      o1.stop(now + 0.2);

      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 660;
      o2.connect(gain);
      o2.start(now + 0.04);
      o2.stop(now + 0.2);
    } catch (_) {
      // Audio is non-critical.
    }
  }, []);

  const consumePowerEvent = useCallback(() => {
    setPowerEventQueue((queue) => queue.slice(1));
  }, []);

  const notify = useCallback((msg, type = 'info') => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    setNotification({ msg, type, id: Date.now() });
    notifyTimerRef.current = setTimeout(() => {
      setNotification(null);
      notifyTimerRef.current = null;
    }, 3500);
  }, []);

  const clearSession = useCallback(() => {
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setRoomState(null);
    setChatMessages([]);
    setChatUnread(0);
    setChatOpen(false);
    setXpAward(null);
  }, []);

  const failError = useCallback((res) => {
    const msg = res?.error || 'Action failed';
    setError(msg);
    notify(msg, 'error');
    // §2.3 — if the server says the room is gone, never leave the player stuck
    // in a frozen in-room view. Force the same local teardown + redirect to the
    // dashboard that an explicit leave does (the room vanished — e.g. host left,
    // inactivity sweep, server restart).
    // §M4 — but ONLY while the socket is actually connected. During a transient
    // network drop a stale/queued ack can arrive as "room not found" before the
    // reconnect flow finishes rejoining; tearing down then would wrongly bounce
    // the player to the landing screen. While disconnected we keep the session
    // and let onConnect's resilient rejoin recover us instead.
    if (/room not found/i.test(msg) && socket.connected) {
      clearRoomSession();
      clearSession();
    }
  }, [notify, clearSession, socket]);

  // `takeover` is passed when the user confirms ending another device's
  // session from the conflict screen.
  const authenticateSocket = useCallback(({ takeover = false } = {}) => {
    return new Promise(async (resolve) => {
      const deviceId = getDeviceId();
      const deviceName = getDeviceName();
      const onResult = (res, label) => {
        if (res?.success) {
          setSessionConflict(null);
          setAuthenticated(true);
          resolve(true);
          return;
        }
        // Single-active-session: another live device holds the account. Surface
        // it so the UI can show a takeover screen naming that device — DON'T
        // sign out or loop-retry; the user decides.
        if (res?.code === 'session_active_elsewhere') {
          setSessionConflict(res.activeDevice || { name: 'Another device' });
        }
        console.warn(`[socket] ${label} failed:`, res?.error || res?.code);
        resolve(false);
      };

      if (getAccessToken) {
        const token = await getAccessToken();
        if (token) {
          socket.emit('authenticate', { token, deviceId, deviceName, takeover }, (res) => onResult(res, 'auth'));
          return;
        }
      }

      if (getGuestAuth) {
        const guest = getGuestAuth();
        if (guest?.username) {
          socket.emit('authenticate', { guest, deviceId, deviceName, takeover }, (res) => onResult(res, 'guest auth'));
          return;
        }
      }

      resolve(false);
    });
  }, [getAccessToken, getGuestAuth, socket]);

  // User confirmed the takeover on the conflict screen: re-authenticate with
  // the takeover flag so the server evicts the other device and lets us in.
  const takeOverSession = useCallback(() => authenticateSocket({ takeover: true }), [authenticateSocket]);

  // Tell the server to release this device's single-active-session entry on
  // sign-out (the socket stays connected, so without this the account would
  // look signed-in here forever).
  const signOutSocket = useCallback(() => {
    try {
      if (socket?.connected) socket.emit('sign_out', {}, () => {});
    } catch (_) { /* transport hiccup — disconnect will clear it anyway */ }
    setSessionConflict(null);
    setAuthenticated(false);
  }, [socket]);

  useGameBrowserEffects({ roomCode, isHost, playerId });
  useSocketAuthenticationEffect({
    socket,
    getAccessToken,
    getGuestAuth,
    authenticateSocket,
    authIdentityKey,
  });
  useGameSocketEvents({
    socket,
    authenticateSocket,
    notify,
    clearSession,
    onForceSignOutRef,
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
    setXpAward,
  });
  usePromptEvents({
    socket,
    roomPhase: roomState?.phase,
    medicPrompt,
    sniperPrompt,
    setMedicPrompt,
    setSniperPrompt,
    setBloodDebtPrompt,
  });
  usePreGameEvents({
    socket,
    roomPhase: roomState?.phase,
    serializedPregame: roomState?.pregame,
    setPregame,
  });

  const groupActions = useGroupActions({
    socket,
    failError,
    setError,
    leaderboardCacheRef,
    leaderboardTtlMs,
  });
  const gameActions = useGameActions({
    socket,
    roomCode,
    playerId,
    failError,
    setError,
    setRoomCode,
    setIsHost,
    setPlayerId,
    setSpinDismissed,
    setChatOpen,
    setChatUnread,
    clearSession,
  });

  // §3.4 — empty-hand recovery. If we're alive and playing in an online room but
  // our hand arrived empty (a dropped initial deal / state packet), re-pull our
  // authoritative state once. Guarded by a ref keyed on the room so it fires at
  // most once per empty episode and never loops. A successful re-pull lands a
  // populated room_state and the guard clears when the hand is non-empty again.
  const emptyHandRetryRef = useRef(null);
  useEffect(() => {
    if (!roomState || roomState.mode !== 'online' || roomState.phase !== 'playing') return undefined;
    const me = roomState.players?.find((p) => p.id === playerId);
    const handEmpty = (roomState.myHand?.length ?? 0) === 0;
    if (!me || me.status !== 'alive') return undefined;
    if (!handEmpty) {
      emptyHandRetryRef.current = null;
      return undefined;
    }
    const key = `${roomState.code}:${roomState.roundNumber}`;
    if (emptyHandRetryRef.current === key) return undefined;
    emptyHandRetryRef.current = key;
    const t = setTimeout(() => gameActions.refreshRoomState(), 1500);
    return () => clearTimeout(t);
  }, [roomState, playerId, gameActions]);

  const myPlayer = roomState?.players?.find((player) => player.id === playerId) || null;
  const isMyTurn = roomState?.currentPlayerId === playerId;
  const currentPlayer = roomState?.players?.find((player) => player.id === roomState?.currentPlayerId) || null;
  const gameMode = roomState?.mode || null;

  return {
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
    authenticated,
    sessionConflict,
    takeOverSession,
    signOutSocket,
    notification,
    spinDismissed,
    leaderboardUpdateNonce,
    chatMessages,
    chatUnread,
    chatOpen,
    xpAward,
    ...groupActions,
    ...gameActions,
    medicPrompt,
    sniperPrompt,
    bloodDebtPrompt,
    setBloodDebtPrompt,
    pregame,
    powerEventQueue,
    consumePowerEvent,
    setError,
  };
}
