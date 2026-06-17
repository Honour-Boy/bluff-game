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

  // Tutorial / Practice — spin up a solo online room seeded with a bot. Mirrors
  // createRoom's local state plumbing (the server seats the human host + bot and
  // returns the same { roomCode, isHost, playerId } shape); gameMode then derives
  // from the room_state broadcast like any online room, so the player lands in
  // the lobby with the bot already seated.
  const startTutorial = useCallback((lesson = 'basics', opts = {}) => {
    // (Module 5) `sandbox:true` → the unguided "Just Practice with Bot" room: an
    // uncoached game vs the bot where the human is the LOCAL HOST (so isHost is
    // true and they get the host controls + config). Coached basics/powers keep
    // the human as a non-host player (the bot hosts the guided table).
    socket.emit('create_tutorial_room', { lesson, sandbox: !!opts.sandbox }, (res) => {
      if (res?.success) {
        setError(null);
        setRoomCode(res.roomCode);
        setIsHost(!!res.isHost);
        if (res.playerId) setPlayerId(res.playerId);
      } else {
        setError(res?.error || 'Could not start the tutorial');
      }
    });
  }, [setError, setIsHost, setPlayerId, setRoomCode, socket]);

  // (Module 5) Convenience wrapper for the landing "Just Practice with Bot" entry.
  const startSandbox = useCallback(() => startTutorial('basics', { sandbox: true }), [startTutorial]);

  // Tutorial — in-room "Skip to Power Cards": server jumps straight to the clinic.
  const skipToPowers = useCallback(() => {
    socket.emit('tutorial_skip_to_powers', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  // Tutorial — clinic "I Understand": advance past the resolved drill.
  const advanceTutorial = useCallback(() => {
    socket.emit('tutorial_advance', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  // Tutorial — intro "Show me around": deal (if needed) + enter the spotlight tour.
  const startTour = useCallback(() => {
    socket.emit('tutorial_start_tour', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

  // Tutorial — congrats "Begin Practice" / Skip tour: reset to a fresh Basics game.
  const finishTour = useCallback(() => {
    socket.emit('tutorial_finish_tour', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [failError, roomCode, socket]);

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

  // Covenant — the just-eliminated player names who carries their blood debt.
  const bloodDebtTarget = useCallback((targetUserId) => {
    return emitPromiseAction(socket, 'blood_debt_target', { roomCode, targetUserId }, failError);
  }, [failError, roomCode, socket]);

  // Covenant — The Pact. Selector picks their secret partner during pre_game.
  const pactChoose = useCallback((targetUserId) => {
    return emitPromiseAction(socket, 'pact_choose', { roomCode, targetUserId }, failError);
  }, [failError, roomCode, socket]);

  // Covenant — The Pact. Target accepts or denies the offered bond.
  const pactRespond = useCallback((accepted) => {
    return emitPromiseAction(socket, 'pact_respond', { roomCode, accepted: !!accepted }, failError);
  }, [failError, roomCode, socket]);

  // Covenant — The Pact. A partner volunteers to take the other's spin.
  const volunteerForPact = useCallback(() => {
    return emitPromiseAction(socket, 'pact_volunteer', { roomCode }, failError);
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

  // #205 — meta-progression. Both resolve with the raw ack ({ success,
  // progression } / { success, equipped }) so the cosmetics panel can render
  // errors inline; neither needs a room.
  const getProgression = useCallback(() => {
    return new Promise((resolve) => {
      socket.emit('get_progression', {}, (res) => resolve(res || { success: false }));
    });
  }, [socket]);

  const setCosmetics = useCallback((equipped) => {
    return new Promise((resolve) => {
      socket.emit('set_cosmetics', { equipped }, (res) => resolve(res || { success: false }));
    });
  }, [socket]);

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

  // `coached` only matters for practice (tutorial) rooms: false replays as a
  // plain game vs the bot with no guide. Defaults true; note existing callers
  // wire this straight to onClick, so a MouseEvent arg (truthy, !== false) is
  // correctly treated as a coached replay — only an explicit `false` opts out.
  const restartRoom = useCallback((coached = true) => {
    if (!roomCode) return;
    socket.emit('restart_room', { roomCode, coached: coached !== false }, (res) => {
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
    startTutorial,
    startSandbox,
    skipToPowers,
    advanceTutorial,
    startTour,
    finishTour,
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
    bloodDebtTarget,
    pactChoose,
    pactRespond,
    volunteerForPact,
    bluffIntercept,
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
    getProgression,
    setCosmetics,
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
