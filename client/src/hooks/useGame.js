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

  // Track if we've attempted reconnect this session
  const reconnectAttempted = useRef(false);

  // ─── Show transient notification ──────────────────────────
  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // ─── Socket event listeners ───────────────────────────────
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError(null);

      // Attempt reconnect on re-connect events
      if (!reconnectAttempted.current) {
        reconnectAttempted.current = true;
        return; // first connect — skip reconnect logic
      }

      // Re-connection after drop: restore state
      const savedCode = localStorage.getItem(LS_ROOM_CODE);
      const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
      const savedIsHost = localStorage.getItem(LS_IS_HOST) === 'true';

      if (savedCode && savedIsHost) {
        socket.emit('host_reconnect', { roomCode: savedCode }, (res) => {
          if (!res.success) notify('Could not reconnect as host: ' + res.error, 'error');
        });
      } else if (savedCode && savedPlayerId) {
        socket.emit('player_reconnect', { roomCode: savedCode, playerId: savedPlayerId }, (res) => {
          if (!res.success) notify('Could not reconnect: ' + res.error, 'error');
        });
      }
    };

    const onDisconnect = () => setConnected(false);

    const onRoomState = (state) => setRoomState(state);

    const onHostDisconnected = () => {
      notify('Host disconnected. Game paused.', 'error');
    };

    const onBluffCalled = ({ callerId }) => {
      // Only relevant for host — but broadcast so everyone sees
      notify('⚠️ Bluff called! Host: reveal the last 3 cards.', 'warning');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_state', onRoomState);
    socket.on('host_disconnected', onHostDisconnected);
    socket.on('bluff_called', onBluffCalled);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', onRoomState);
      socket.off('host_disconnected', onHostDisconnected);
      socket.off('bluff_called', onBluffCalled);
    };
  }, [socket, notify]);

  // ─── On mount: try restoring session from localStorage ───
  useEffect(() => {
    const savedCode = localStorage.getItem(LS_ROOM_CODE);
    const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
    const savedIsHost = localStorage.getItem(LS_IS_HOST) === 'true';

    if (savedCode) {
      setRoomCode(savedCode);
      setIsHost(savedIsHost);
      if (savedPlayerId) setPlayerId(savedPlayerId);

      if (socket.connected) {
        if (savedIsHost) {
          socket.emit('host_reconnect', { roomCode: savedCode }, (res) => {
            if (!res.success) {
              // Room expired, clear storage
              clearSession();
            }
          });
        } else if (savedPlayerId) {
          socket.emit('player_reconnect', { roomCode: savedCode, playerId: savedPlayerId }, (res) => {
            if (!res.success) clearSession();
          });
        }
      }
    }
  }, []); // eslint-disable-line

  const clearSession = () => {
    localStorage.removeItem(LS_ROOM_CODE);
    localStorage.removeItem(LS_PLAYER_ID);
    localStorage.removeItem(LS_IS_HOST);
    setRoomCode(null);
    setPlayerId(null);
    setIsHost(false);
    setRoomState(null);
  };

  // ─── Actions ──────────────────────────────────────────────

  const createRoom = useCallback(() => {
    socket.emit('create_room', {}, (res) => {
      if (res.success) {
        setRoomCode(res.roomCode);
        setIsHost(true);
        localStorage.setItem(LS_ROOM_CODE, res.roomCode);
        localStorage.setItem(LS_IS_HOST, 'true');
        localStorage.removeItem(LS_PLAYER_ID);
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

  const triggerSpin = useCallback((targetPlayerId) => {
    socket.emit('trigger_spin', { roomCode, playerId: targetPlayerId }, (res) => {
      if (!res.success) setError(res.error);
    });
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

  const playerContinue = useCallback(() => {
    socket.emit('player_continue', { roomCode, playerId }, (res) => {
      if (!res.success) setError(res.error);
    });
  }, [socket, roomCode, playerId]);

  const leaveGame = useCallback(() => {
    clearSession();
  }, []);

  // Derived: my player object
  const myPlayer = roomState?.players?.find(p => p.id === playerId) || null;
  const isMyTurn = roomState?.currentPlayerId === playerId;
  const currentPlayer = roomState?.players?.find(p => p.id === roomState?.currentPlayerId) || null;

  return {
    // State
    roomCode,
    isHost,
    playerId,
    roomState,
    myPlayer,
    isMyTurn,
    currentPlayer,
    error,
    connected,
    notification,
    // Actions
    createRoom,
    joinRoom,
    startGame,
    nextTurn,
    resolveBluff,
    triggerSpin,
    declareRoundWin,
    callBluff,
    playerContinue,
    leaveGame,
    setError,
  };
}
