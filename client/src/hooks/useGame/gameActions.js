import { useCallback } from 'react';

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

  const activatePowerCard = useCallback(() => {
    return emitPromiseAction(socket, 'activate_power_card', { roomCode }, failError);
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

  const leaveGame = useCallback(() => {
    if (roomCode) socket.emit('leave_room', { roomCode, playerId });
    sessionStorage.removeItem('bluff_session');
    clearSession();
  }, [clearSession, playerId, roomCode, socket]);

  const restartRoom = useCallback(() => {
    if (!roomCode) return;
    socket.emit('restart_room', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

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
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
    sendChatMessage,
    openChat,
    closeChat,
    leaveGame,
    restartRoom,
  };
}
