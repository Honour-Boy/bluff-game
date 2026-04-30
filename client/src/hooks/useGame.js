// ============================================================
// useGame HOOK — Manages all socket events and game state
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function useGame(getAccessToken) {
  const socket = getSocket();

  const [roomCode, setRoomCode]       = useState(null);
  const [isHost, setIsHost]           = useState(false);
  const [playerId, setPlayerId]       = useState(null);
  const [roomState, setRoomState]     = useState(null);
  const [error, setError]             = useState(null);
  const [connected, setConnected]     = useState(socket.connected);
  const [notification, setNotification] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  // Shared spin-overlay dismiss signal
  const [spinDismissed, setSpinDismissed] = useState(false);

  // ─── Show transient notification ──────────────────────────
  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const clearSession = useCallback(() => {
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setRoomState(null);
  }, []);

  // Persist session so page refresh can reconnect
useEffect(() => {
  if (roomCode) {
    sessionStorage.setItem('bluff_session', JSON.stringify({ roomCode, isHost, playerId }));
  } else {
    sessionStorage.removeItem('bluff_session');
  }
}, [roomCode, isHost, playerId]);

  // ─── Authenticate socket with Supabase JWT ────────────────
  const authenticateSocket = useCallback(async () => {
    if (!getAccessToken) return;
    const token = await getAccessToken();
    if (!token) return;
    socket.emit('authenticate', { token }, (res) => {
      if (res?.success) setAuthenticated(true);
      else console.warn('[socket] auth failed:', res?.error);
    });
  }, [socket, getAccessToken]);

  // ─── Screen wake lock ─────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    let wakeLock = null;
    const acquire = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.wakeLock)
          wakeLock = await navigator.wakeLock.request('screen');
      } catch (_) { /* silent */ }
    };
    acquire();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLock?.release?.().catch(() => {});
    };
  }, [roomCode]);

  // ─── Socket event listeners ───────────────────────────────
  useEffect(() => {
    const onConnect = async () => {
  setConnected(true);
  setError(null);
  await authenticateSocket();

  // Try to restore session after reconnect
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
      if (state?.lastAction?.type === 'spin_result') setSpinDismissed(false);
    };
    const onBluffCalled = () => notify('⚠️ Bluff called! Host: reveal the last card.', 'warning');
    const onSpinAcknowledged = () => setSpinDismissed(true);
    const onHostDisconnecting = ({ countdown } = {}) => {
      notify(`Host disconnected. Game ends in ${countdown ?? 10}s if they don't return.`, 'error');
    };
    const onGameEnded = ({ reason } = {}) => {
  sessionStorage.removeItem('bluff_session');
  clearSession();
  notify(reason || 'The game has ended.', 'error');
};

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_state', onRoomState);
    socket.on('bluff_called', onBluffCalled);
    socket.on('spin_acknowledged', onSpinAcknowledged);
    socket.on('host_disconnecting', onHostDisconnecting);
    socket.on('game_ended', onGameEnded);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', onRoomState);
      socket.off('bluff_called', onBluffCalled);
      socket.off('spin_acknowledged', onSpinAcknowledged);
      socket.off('host_disconnecting', onHostDisconnecting);
      socket.off('game_ended', onGameEnded);
    };
  }, [socket, notify, clearSession, authenticateSocket]);

  // ─── On mount: authenticate if already connected ──────────
  useEffect(() => {
    if (socket.connected && getAccessToken) authenticateSocket();
  }, [getAccessToken]); // eslint-disable-line

  // ─── Actions ──────────────────────────────────────────────

  /**
   * Create a room. In online mode, host is also auto-joined as a player on the server.
   */
  const createRoom = useCallback((mode = 'physical') => {
    socket.emit('create_room', { mode }, (res) => {
      if (res.success) {
        setRoomCode(res.roomCode);
        setIsHost(true);
        if (res.playerId) setPlayerId(res.playerId);
      } else {
        setError(res.error);
      }
    });
  }, [socket]);

  const joinRoom = useCallback((code) => {
    socket.emit('join_room', { roomCode: code.toUpperCase() }, (res) => {
      if (res.success) {
        setRoomCode(res.roomCode);
        setPlayerId(res.playerId);
        setIsHost(false);
      } else {
        setError(res.error);
      }
    });
  }, [socket]);

  const startGame = useCallback(() => {
    socket.emit('start_game', { roomCode }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode]);

  const nextTurn = useCallback(() => {
    socket.emit('next_turn', { roomCode }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode]);

  const resolveBluff = useCallback((bluffIsCorrect) => {
    socket.emit('resolve_bluff', { roomCode, bluffIsCorrect }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode]);

  const playCard = useCallback(() => {
    socket.emit('play_card', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const endTurn = useCallback(() => {
    socket.emit('end_turn', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const playerSpin = useCallback(() => {
    setSpinDismissed(false);
    socket.emit('player_spin', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const acknowledgeSpinResult = useCallback(() => {
    socket.emit('spin_acknowledged', { roomCode });
    setSpinDismissed(true);
  }, [socket, roomCode]);

  const declareRoundWin = useCallback((winnerPlayerId) => {
    socket.emit('round_win', { roomCode, playerId: winnerPlayerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode]);

  const callBluff = useCallback(() => {
    socket.emit('call_bluff', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const playCardOnline = useCallback((cardId, nominatedShape) => {
    socket.emit('play_card_online', { roomCode, playerId, cardId, nominatedShape }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const startNextRound = useCallback(() => {
    socket.emit('start_next_round', { roomCode }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode]);

  const spectatePlayer = useCallback((targetPlayerId, callback) => {
    socket.emit('spectate_player', { roomCode, targetPlayerId }, (res) => {
      if (res.success) callback(res);
      else setError(res.error);
    });
  }, [socket, roomCode]);

  const leaveGame = useCallback(() => {
  if (roomCode) socket.emit('leave_room', { roomCode, playerId });
  sessionStorage.removeItem('bluff_session');
  clearSession();
}, [socket, roomCode, playerId, clearSession]);

  // Derived state
  const myPlayer      = roomState?.players?.find(p => p.id === playerId) || null;
  const isMyTurn      = roomState?.currentPlayerId === playerId;
  const currentPlayer = roomState?.players?.find(p => p.id === roomState?.currentPlayerId) || null;
  const gameMode      = roomState?.mode || null;

  return {
    // State
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
    // Actions
    createRoom,
    joinRoom,
    startGame,
    nextTurn,
    resolveBluff,
    playCard,
    endTurn,
    playerSpin,
    acknowledgeSpinResult,
    declareRoundWin,
    callBluff,
    playCardOnline,
    startNextRound,
    spectatePlayer,
    leaveGame,
    setError,
  };
}
