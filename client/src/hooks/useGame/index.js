// ============================================================
// useGame HOOK - Manages all socket events and game state
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../../lib/socket';
import { useGameBrowserEffects, useSocketAuthenticationEffect } from './browserEffects';
import { useGameActions } from './gameActions';
import { useGroupActions } from './groupActions';
import { usePromptEvents, usePreGameEvents } from './promptEffects';
import { useGameSocketEvents } from './socketEvents';

export function useGame(getAccessToken, getGuestAuth, authIdentityKey = null) {
  const socket = getSocket();

  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notification, setNotification] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [spinDismissed, setSpinDismissed] = useState(false);
  const [leaderboardUpdateNonce, setLeaderboardUpdateNonce] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [powerEventQueue, setPowerEventQueue] = useState([]);
  const [medicPrompt, setMedicPrompt] = useState(null);
  const [sniperPrompt, setSniperPrompt] = useState(null);
  const [pregame, setPregame] = useState(null);

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

  const failError = useCallback((res) => {
    const msg = res?.error || 'Action failed';
    setError(msg);
    notify(msg, 'error');
  }, [notify]);

  const clearSession = useCallback(() => {
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setRoomState(null);
    setChatMessages([]);
    setChatUnread(0);
    setChatOpen(false);
  }, []);

  const authenticateSocket = useCallback(() => {
    return new Promise(async (resolve) => {
      if (getAccessToken) {
        const token = await getAccessToken();
        if (token) {
          socket.emit('authenticate', { token }, (res) => {
            if (res?.success) {
              setAuthenticated(true);
              resolve(true);
            } else {
              console.warn('[socket] auth failed:', res?.error);
              resolve(false);
            }
          });
          return;
        }
      }

      if (getGuestAuth) {
        const guest = getGuestAuth();
        if (guest?.username) {
          socket.emit('authenticate', { guest }, (res) => {
            if (res?.success) {
              setAuthenticated(true);
              resolve(true);
            } else {
              console.warn('[socket] guest auth failed:', res?.error);
              resolve(false);
            }
          });
          return;
        }
      }

      resolve(false);
    });
  }, [getAccessToken, getGuestAuth, socket]);

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
  });
  usePromptEvents({
    socket,
    roomPhase: roomState?.phase,
    medicPrompt,
    sniperPrompt,
    setMedicPrompt,
    setSniperPrompt,
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
    notification,
    spinDismissed,
    leaderboardUpdateNonce,
    chatMessages,
    chatUnread,
    chatOpen,
    ...groupActions,
    ...gameActions,
    medicPrompt,
    sniperPrompt,
    pregame,
    powerEventQueue,
    consumePowerEvent,
    setError,
  };
}
