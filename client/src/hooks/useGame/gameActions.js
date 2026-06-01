import { useCallback } from 'react';
import { clearRoomSession } from '../../lib/sessionStore';

function emitPromiseAction(socket, eventName, payload, failError) {
  return new Promise((resolve) => {
    socket.emit(eventName, payload, (res) => {
      if (!res?.success) failError(res);
      resolve(res);
    });
  });
}

export function useGameActions({
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
}) {
  const createRoom = useCallback((mode = 'physical', config) => {
    const payload = config ? { mode, config } : { mode };
    socket.emit('create_room', payload, (res) => {
      if (res.success) {
        setError(null);
        setRoomCode(res.roomCode);
        setIsHost(true);
        if (res.playerId) setPlayerId(res.playerId);
      } else {
        setError(res.error);
      }
    });
  }, [setError, setIsHost, setPlayerId, setRoomCode, socket]);

  const joinRoom = useCallback((code) => {
    socket.emit('join_room', { roomCode: code.toUpperCase() }, (res) => {
      if (res.success) {
        setError(null);
        setRoomCode(res.roomCode);
        setPlayerId(res.playerId);
        setIsHost(!!res.isHost);
      } else {
        setError(res.error);
      }
    });
  }, [setError, setIsHost, setPlayerId, setRoomCode, socket]);

  const startGame = useCallback(() => {
    socket.emit('start_game', { roomCode }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  const nextTurn = useCallback(() => {
    socket.emit('next_turn', { roomCode }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  const resolveBluff = useCallback((bluffIsCorrect) => {
    socket.emit('resolve_bluff', { roomCode, bluffIsCorrect }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  const playCard = useCallback(() => {
    socket.emit('play_card', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, playerId, roomCode, socket]);

  const endTurn = useCallback(() => {
    socket.emit('end_turn', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, playerId, roomCode, socket]);

  const playerSpin = useCallback(() => {
    setSpinDismissed(false);
    socket.emit('player_spin', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, playerId, roomCode, setSpinDismissed, socket]);

  const acknowledgeSpinResult = useCallback(() => {
    socket.emit('spin_acknowledged', { roomCode });
    setSpinDismissed(true);
  }, [roomCode, setSpinDismissed, socket]);

  // Redemption Spin (Phase E1) — the eliminated player takes their one offered
  // spin. The result comes back as a normal spin_result, so reset the dismiss
  // flag the same way playerSpin does so its overlay shows.
  const redemptionSpin = useCallback(() => {
    setSpinDismissed(false);
    socket.emit('redemption_spin', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, setSpinDismissed, socket]);

  const declareRoundWin = useCallback((winnerPlayerId) => {
    socket.emit('round_win', { roomCode, playerId: winnerPlayerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  const callBluff = useCallback(() => {
    socket.emit('call_bluff', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, playerId, roomCode, socket]);

  const playCardOnline = useCallback((cardId, nominatedShape) => {
    socket.emit('play_card_online', { roomCode, playerId, cardId, nominatedShape }, (res) => {
      if (!res.success) failError(res);
    });
  }, [failError, playerId, roomCode, socket]);

  const spectatePlayer = useCallback((targetPlayerId, callback) => {
    socket.emit('spectate_player', { roomCode, targetPlayerId }, (res) => {
      if (res.success) callback(res);
      else setError(res.error);
    });
  }, [roomCode, setError, socket]);

  const activatePowerCard = useCallback((cardId = null) => {
    return emitPromiseAction(socket, 'activate_power_card', { roomCode, cardId }, failError);
  }, [failError, roomCode, socket]);

  const swapPick = useCallback((cardId) => {
    return emitPromiseAction(socket, 'swap_pick', { roomCode, cardId }, failError);
  }, [failError, roomCode, socket]);

  const preGameSelect = useCallback((optionId) => {
    return emitPromiseAction(socket, 'pre_game_select', { roomCode, optionId }, failError);
  }, [failError, roomCode, socket]);

  const updateRoomConfig = useCallback((nextConfig) => {
    return emitPromiseAction(socket, 'update_room_config', { roomCode, config: nextConfig }, failError);
  }, [failError, roomCode, socket]);

  const medicDecide = useCallback((save) => {
    return emitPromiseAction(socket, 'medic_decide', { roomCode, save: !!save }, failError);
  }, [failError, roomCode, socket]);

  const saboteurTransfer = useCallback((targetPlayerId) => {
    return emitPromiseAction(socket, 'saboteur_transfer', { roomCode, targetPlayerId }, failError);
  }, [failError, roomCode, socket]);

  const sniperRedirect = useCallback((newTargetId) => {
    return emitPromiseAction(socket, 'sniper_redirect', { roomCode, newTargetId: newTargetId || null }, failError);
  }, [failError, roomCode, socket]);

  // §1.1 — accused responds to a bluff during the interception window: arm a
  // defensive card (cardId set) or pass (cardId null). Either closes the window.
  const bluffIntercept = useCallback((cardId = null) => {
    return emitPromiseAction(socket, 'bluff_intercept', { roomCode, cardId: cardId || null }, failError);
  }, [failError, roomCode, socket]);

  const placeBet = useCallback((prediction) => {
    return emitPromiseAction(socket, 'place_bet', { roomCode, prediction }, failError);
  }, [failError, roomCode, socket]);

  const ghostVote = useCallback((option) => {
    return emitPromiseAction(socket, 'ghost_vote', { roomCode, option }, failError);
  }, [failError, roomCode, socket]);

  const lastStandSpin = useCallback(() => {
    return emitPromiseAction(socket, 'last_stand_spin', { roomCode }, failError);
  }, [failError, roomCode, socket]);

  const lastStandEndTurn = useCallback(() => {
    return emitPromiseAction(socket, 'last_stand_end_turn', { roomCode }, failError);
  }, [failError, roomCode, socket]);

  const sendChatMessage = useCallback((text) => {
    if (!roomCode || !text?.trim()) return;
    socket.emit('send_chat_message', { roomCode, text: text.trim() }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setChatUnread(0);
  }, [setChatOpen, setChatUnread]);

  const closeChat = useCallback(() => setChatOpen(false), [setChatOpen]);

  // §2.2 / §2.3 — single fail-safe leave path shared by every "Leave Room" /
  // "Leave Game" button. Local cleanup + redirect (clearSession) ALWAYS run,
  // even if the socket is disconnected, the room is already gone, or the server
  // never answers — so a broken socket / "Room not found" can never trap the
  // player in a dead view. The server notify is best-effort (try/catch) and the
  // client never blocks on its ack.
  const leaveGame = useCallback(() => {
    try {
      if (roomCode && socket?.connected) {
        socket.emit('leave_room', { roomCode, playerId }, () => {});
      } else if (roomCode) {
        // Socket down: fire anyway in case it flushes on reconnect, but don't rely on it.
        try { socket?.emit('leave_room', { roomCode, playerId }); } catch (_) { /* ignore */ }
      }
    } catch (_) {
      // Never let a transport error block the local exit below.
    }
    // Clears the primary session + recovery snapshot together so an explicit
    // leave can never be "recovered" into the room on the next reconnect.
    clearRoomSession();
    clearSession();
  }, [clearSession, playerId, roomCode, socket]);

  const restartRoom = useCallback(() => {
    if (!roomCode) return;
    socket.emit('restart_room', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  // #244 — host kicks a player. Resolves with the ack so the caller can surface
  // success/failure inline in the settings roster.
  const kickPlayer = useCallback((targetPlayerId) => {
    if (!roomCode || !targetPlayerId) return Promise.resolve({ success: false, error: 'No player' });
    return emitPromiseAction(socket, 'kick_player', { roomCode, playerId: targetPlayerId }, failError);
  }, [failError, roomCode, socket]);

  // Group host: reset a (possibly remote) room by its cipher — boots everyone
  // and tears the live room down so the next join rebuilds a fresh lobby with
  // the same code. Called from the group detail screen, so it takes an explicit
  // code rather than relying on the active roomCode. Resolves with the ack.
  const resetRoom = useCallback((code) => {
    const target = (code || roomCode || '').toUpperCase();
    if (!target) return Promise.resolve({ success: false, error: 'No room code' });
    return emitPromiseAction(socket, 'reset_room', { roomCode: target }, failError);
  }, [failError, roomCode, socket]);

  // §3.4 — empty-hand recovery. Re-pull authoritative state (with myHand) when a
  // deal/state packet was dropped. Fire-and-forget and idempotent: the server
  // just re-emits room_state to this socket; never blocks or mutates anything.
  const refreshRoomState = useCallback(() => {
    if (!roomCode) return;
    try {
      socket.emit('request_room_state', { roomCode }, () => {});
    } catch (_) {
      // Transport hiccup — the next room_state push will recover us anyway.
    }
  }, [roomCode, socket]);

  return {
    createRoom,
    joinRoom,
    startGame,
    nextTurn,
    resolveBluff,
    playCard,
    endTurn,
    playerSpin,
    acknowledgeSpinResult,
    redemptionSpin,
    declareRoundWin,
    callBluff,
    playCardOnline,
    spectatePlayer,
    activatePowerCard,
    swapPick,
    preGameSelect,
    updateRoomConfig,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    bluffIntercept,
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
    sendChatMessage,
    openChat,
    closeChat,
    leaveGame,
    restartRoom,
    resetRoom,
    kickPlayer,
    refreshRoomState,
  };
}
