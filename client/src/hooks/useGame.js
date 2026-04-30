// ============================================================
// useGame HOOK — Manages all socket events and game state
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../lib/socket';

const LS_ROOM_CODE = 'bluff_roomCode';
const LS_PLAYER_ID = 'bluff_playerId';
const LS_IS_HOST = 'bluff_isHost';

export function useGame() {
  const socket = getSocket();

  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notification, setNotification] = useState(null);
  // Shared spin-overlay dismiss signal — set true when spin target acknowledges result
  const [spinDismissed, setSpinDismissed] = useState(false);

  // ─── Show transient notification ──────────────────────────
  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(LS_ROOM_CODE);
    localStorage.removeItem(LS_PLAYER_ID);
    localStorage.removeItem(LS_IS_HOST);
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setRoomState(null);
  }, []);

  // ─── Warn before refresh/close whenever in a room ────────
  // On beforeunload: show browser dialog AND notify server immediately so
  // the player is removed from the room without waiting for the grace period.
  // This prevents duplicate player entries when they rejoin after reloading.
  useEffect(() => {
    if (!roomCode) return;

    const handleBeforeUnload = (e) => {
      // Tell the server we're leaving intentionally so it can clean up now
      socket.emit('leave_room', { roomCode, playerId });
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomCode, playerId, socket]);

  // ─── Screen wake lock — keeps screen on while in a room ──────
  // Prevents device from sleeping mid-game, which would cause disconnections.
  useEffect(() => {
    if (!roomCode) return;
    let wakeLock = null;

    const acquire = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Silently fail — wake lock is a progressive enhancement
      }
    };

    acquire();

    // Re-acquire after the user returns to the tab (visibility change releases the lock)
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
    // Simple connect/disconnect tracking — no reconnect-on-reload logic.
    // If a player reloads they are cleared to the landing screen (see mount effect).
    const onConnect = () => { setConnected(true); setError(null); };
    const onDisconnect = () => setConnected(false);
    const onRoomState = (state) => {
      setRoomState(state);
      // If a fresh spin_result just arrived, reset spinDismissed so the
      // new overlay can be dismissed again (previous spin may have left it true).
      if (state?.lastAction?.type === 'spin_result') {
        setSpinDismissed(false);
      }
    };
    const onBluffCalled = () => notify('⚠️ Bluff called! Host: reveal the last card.', 'warning');
    const onSpinAcknowledged = () => setSpinDismissed(true);

    // Host lost connection — show countdown warning to all players
    const onHostDisconnecting = ({ countdown } = {}) => {
      notify(`Host disconnected. Game ends in ${countdown ?? 10}s if they don't return.`, 'error');
    };

    // Host never returned — end the game for all clients
    const onGameEnded = ({ reason } = {}) => {
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
  }, [socket, notify, clearSession]);

  // ─── On mount: clear any stale session from a previous page load ───
  // Reload = disconnect. No reconnect attempt. Player returns to landing screen.
  useEffect(() => {
    const savedCode = localStorage.getItem(LS_ROOM_CODE);
    if (savedCode) {
      // Stale session from a previous tab or reload — clear it immediately.
      localStorage.removeItem(LS_ROOM_CODE);
      localStorage.removeItem(LS_PLAYER_ID);
      localStorage.removeItem(LS_IS_HOST);
      // State is already null/false from initial useState — nothing to reset.
    }
  }, []); // eslint-disable-line

  // ─── Actions ──────────────────────────────────────────────

  /**
   * Create a room. In online mode, also joins as a player so the host has a playerId.
   */
  const createRoom = useCallback((mode = 'physical', username = '') => {
    socket.emit('create_room', { mode }, (res) => {
      if (res.success) {
        setRoomCode(res.roomCode);
        setIsHost(true);
        localStorage.setItem(LS_ROOM_CODE, res.roomCode);
        localStorage.setItem(LS_IS_HOST, 'true');
        localStorage.removeItem(LS_PLAYER_ID);

        // Online: also join as a player so the host participates in the game
        if (mode === 'online' && username.trim()) {
          socket.emit('join_room', { roomCode: res.roomCode, username: username.trim() }, (joinRes) => {
            if (joinRes.success) {
              setPlayerId(joinRes.playerId);
              localStorage.setItem(LS_PLAYER_ID, joinRes.playerId);
            }
          });
        }
      } else {
        setError(res.error);
      }
    });
  }, [socket]);

  const joinRoom = useCallback((code, username) => {
    const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
    socket.emit('join_room', { roomCode: code.toUpperCase(), username, playerId: savedPlayerId }, (res) => {
      if (res.success) {
        setRoomCode(res.roomCode);
        setPlayerId(res.playerId);
        setIsHost(false);
        localStorage.setItem(LS_ROOM_CODE, res.roomCode);
        localStorage.setItem(LS_PLAYER_ID, res.playerId);
        localStorage.setItem(LS_IS_HOST, 'false');
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
    setSpinDismissed(false); // reset dismiss state before a new spin
    socket.emit('player_spin', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  // Spin target calls this after clicking Continue — dismisses overlay for all clients
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
    clearSession();
  }, []);

  // Derived state
  const myPlayer = roomState?.players?.find(p => p.id === playerId) || null;
  const isMyTurn = roomState?.currentPlayerId === playerId;
  const currentPlayer = roomState?.players?.find(p => p.id === roomState?.currentPlayerId) || null;
  const gameMode = roomState?.mode || null;

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
