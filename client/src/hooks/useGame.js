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

  // Chat — local mirror of room.chatLog plus live-arrival messages.
  // We dedupe by id so room_state replays (on reconnect) don't double-add.
  const [chatMessages, setChatMessages] = useState([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);

  // ─── v2 Phase C — power-card announcement queue ──────────
  // The server emits `power_card_triggered` events when any power
  // card fires (Shield blocking, Mirror reflecting, Freeze landing,
  // etc.). We queue them so back-to-back banners (e.g. Swap → Mirror
  // after the swapped check) play sequentially instead of stomping
  // each other.
  const [powerEventQueue, setPowerEventQueue] = useState([]);
  const consumePowerEvent = useCallback(() => {
    setPowerEventQueue((q) => q.slice(1));
  }, []);

  // ─── Show transient notification ──────────────────────────
  // Use a ref-tracked timer so back-to-back notifications don't
  // wipe each other (older setTimeout firing on the newer message).
  const notifyTimerRef = useRef(null);
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
  }, []);

  // Persist session so page refresh can reconnect.
  //
  // CRITICAL: only WRITE here. Don't clear on mount — roomCode starts
  // null on a refresh, and an else-branch removeItem would wipe the
  // saved session before onConnect's reconnect logic can read it,
  // which is exactly the bug "refresh throws me out of the room"
  // came from. Every legitimate exit path (leaveGame, onGameEnded,
  // reconnect-failure callbacks) clears sessionStorage explicitly.
  useEffect(() => {
    if (roomCode) {
      sessionStorage.setItem('bluff_session', JSON.stringify({ roomCode, isHost, playerId }));
    }
  }, [roomCode, isHost, playerId]);

  // ─── Authenticate socket with Supabase JWT ────────────────
  // Returns Promise<boolean> that resolves once the server has
  // accepted (or rejected) the token. Reconnect must await this so
  // host_reconnect / player_reconnect don't race the server's
  // socket.userId stamping.
  const authenticateSocket = useCallback(() => {
    return new Promise(async (resolve) => {
      if (!getAccessToken) return resolve(false);
      const token = await getAccessToken();
      if (!token) return resolve(false);
      socket.emit('authenticate', { token }, (res) => {
        if (res?.success) {
          setAuthenticated(true);
          resolve(true);
        } else {
          console.warn('[socket] auth failed:', res?.error);
          resolve(false);
        }
      });
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

      const authed = await authenticateSocket();
      if (!authed) return; // transient auth failure — keep the session, retry on next connect

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
            // Room genuinely gone (server restart, expired) — clear stale session
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
      // Sync chat history on (re)connect — dedupe by id so the live
      // chat_message handler and the room_state replay don't fight.
      if (Array.isArray(state?.chatLog)) {
        setChatMessages((prev) => {
          const seen = new Set(prev.map(m => m.id));
          const additions = state.chatLog.filter(m => !seen.has(m.id));
          return additions.length ? [...prev, ...additions] : prev;
        });
      }
    };
    const onChatMessage = (msg) => {
      if (!msg?.id) return;
      setChatMessages((prev) => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (!chatOpenRef.current) setChatUnread((n) => n + 1);
    };
    const onBluffCalled = () => notify('⚠️ Bluff called! Host: reveal the last card.', 'warning');
    const onSpinAcknowledged = () => setSpinDismissed(true);
    const onPowerCardTriggered = (evt) => {
      if (!evt || !evt.kind) return;
      // Stamp a queue id so React can key on it without us mutating
      // the event itself (server may resend the same kind+holder).
      const id = `${evt.kind}:${evt.holderId || '?'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      setPowerEventQueue((q) => [...q, { id, ...evt }]);
    };
    const onHostDisconnecting = ({ countdown } = {}) => {
      notify(`Host disconnected. Game ends in ${countdown ?? 30}s if they don't return.`, 'error');
    };
    const onGameEnded = ({ reason } = {}) => {
  sessionStorage.removeItem('bluff_session');
  clearSession();
  notify(reason || 'The game has ended.', 'error');
};
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_state', onRoomState);
    socket.on('chat_message', onChatMessage);
    socket.on('bluff_called', onBluffCalled);
    socket.on('spin_acknowledged', onSpinAcknowledged);
    socket.on('host_disconnecting', onHostDisconnecting);
    socket.on('game_ended', onGameEnded);
    socket.on('power_card_triggered', onPowerCardTriggered);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', onRoomState);
      socket.off('chat_message', onChatMessage);
      socket.off('bluff_called', onBluffCalled);
      socket.off('spin_acknowledged', onSpinAcknowledged);
      socket.off('host_disconnecting', onHostDisconnecting);
      socket.off('game_ended', onGameEnded);
      socket.off('power_card_triggered', onPowerCardTriggered);
    };
  }, [socket, notify, clearSession, authenticateSocket]);

  // ─── On mount: authenticate if already connected ──────────
  useEffect(() => {
    if (socket.connected && getAccessToken) authenticateSocket();
  }, [getAccessToken]); // eslint-disable-line

  // ─── Actions ──────────────────────────────────────────────

  /**
   * Create a room. In online mode, host is also auto-joined as a player on the server.
   * `config` is the v2 settings object (host-only toggles); when omitted the
   * server falls back to its safe defaults. Pure plumbing for now — nothing
   * reads it yet.
   */
  const createRoom = useCallback((mode = 'physical', config) => {
    const payload = config ? { mode, config } : { mode };
    socket.emit('create_room', payload, (res) => {
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

  // ─── v2 Phase B — power-card activation ──────────────────
  // Emits the activate_power_card event with the active room code.
  // Returns a Promise<{ success, power, consumed, peekedCard?, ...
  // error? }> so the caller (UI) can decide what to render — Peek
  // returns a privately-known peekedCard, every other power just
  // arms the player and the UI flips on the next room_state.
  const activatePowerCard = useCallback(() => {
    return new Promise((resolve) => {
      socket.emit('activate_power_card', { roomCode }, (res) => {
        if (!res?.success) setError(res?.error || 'Could not activate');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase C — Swap pick ───────────────────────────────
  // After a Swap is triggered by an incoming bluff, the server pauses
  // the bluff resolution and sets phase = 'swap_pending'. The Swap
  // holder picks a card id from the anonymised playedPile preview;
  // server resolves the rest of the pipeline.
  const swapPick = useCallback((cardId) => {
    return new Promise((resolve) => {
      socket.emit('swap_pick', { roomCode, cardId }, (res) => {
        if (!res?.success) setError(res?.error || 'Swap failed');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase C — Assassin re-arm decision ────────────────
  // Spec: if no bluff was called on the Assassin holder before their
  // next activation prompt, they choose to re-arm or take +4 cards.
  const assassinDecision = useCallback((rearm) => {
    return new Promise((resolve) => {
      socket.emit('assassin_decision', { roomCode, rearm: !!rearm }, (res) => {
        if (!res?.success) setError(res?.error || 'Assassin decision failed');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase D — Medic save / decline ────────────────────
  // Server pauses an elimination flow (spin or Assassin) when an
  // alive Medic with hand-room exists. The Medic resolves via this
  // event with `save: true | false`.
  const medicDecide = useCallback((save) => {
    return new Promise((resolve) => {
      socket.emit('medic_decide', { roomCode, save: !!save }, (res) => {
        if (!res?.success) setError(res?.error || 'Medic decision failed');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase D — Saboteur transfer ───────────────────────
  // Once per game; silent. Random card from holder hand → target.
  const saboteurTransfer = useCallback((targetPlayerId) => {
    return new Promise((resolve) => {
      socket.emit('saboteur_transfer', { roomCode, targetPlayerId }, (res) => {
        if (!res?.success) setError(res?.error || 'Saboteur transfer failed');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase D — Sniper redirect ─────────────────────────
  // After bluff resolution picks a spin target, Sniper can redirect
  // to any other alive non-Mirror player. Pass null to decline.
  const sniperRedirect = useCallback((newTargetId) => {
    return new Promise((resolve) => {
      socket.emit('sniper_redirect', { roomCode, newTargetId: newTargetId || null }, (res) => {
        if (!res?.success) setError(res?.error || 'Sniper redirect failed');
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase D — server-pushed prompts ──────────────────
  // Track inbound `medic_save_pending` / `sniper_redirect_pending`
  // privately-targeted events so the local UI can render the role
  // prompt only on the right player. Cleared automatically when the
  // pause resolves (room.phase moves off `medic_pending` /
  // `sniper_pending` in the next room_state).
  const [medicPrompt, setMedicPrompt] = useState(null);
  const [sniperPrompt, setSniperPrompt] = useState(null);

  useEffect(() => {
    const onMedicSavePending = (payload) => {
      setMedicPrompt(payload || null);
    };
    const onSniperRedirectPending = (payload) => {
      setSniperPrompt(payload || null);
    };
    socket.on('medic_save_pending', onMedicSavePending);
    socket.on('sniper_redirect_pending', onSniperRedirectPending);
    return () => {
      socket.off('medic_save_pending', onMedicSavePending);
      socket.off('sniper_redirect_pending', onSniperRedirectPending);
    };
  }, [socket]);

  // Auto-clear prompts when the server moves off the pending phase.
  useEffect(() => {
    if (roomState?.phase !== 'medic_pending' && medicPrompt) setMedicPrompt(null);
    if (roomState?.phase !== 'sniper_pending' && sniperPrompt) setSniperPrompt(null);
  }, [roomState?.phase]); // eslint-disable-line

  const sendChatMessage = useCallback((text) => {
    if (!roomCode || !text?.trim()) return;
    socket.emit('send_chat_message', { roomCode, text: text.trim() }, (res) => {
      if (!res?.success) setError(res?.error || 'Failed to send');
    });
  }, [socket, roomCode]);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setChatUnread(0);
  }, []);
  const closeChat = useCallback(() => setChatOpen(false), []);

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
    chatMessages,
    chatUnread,
    chatOpen,
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
    sendChatMessage,
    openChat,
    closeChat,
    leaveGame,
    activatePowerCard,
    swapPick,
    assassinDecision,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    medicPrompt,
    sniperPrompt,
    powerEventQueue,
    consumePowerEvent,
    setError,
  };
}
