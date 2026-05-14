// ============================================================
// useGame HOOK — Manages all socket events and game state
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function useGame(getAccessToken, getGuestAuth, authIdentityKey = null) {
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

  // Stash the userId of the last connected socket so the chat
  // notification sound can suppress beeps for messages the user
  // sent themselves. Without this, every send would self-ding.
  // Server stamps `userId` after authenticate, but we don't have a
  // direct accessor — use playerId (Supabase user.id / guest:<uuid>),
  // which is the same string. This is a ref because the chat handler
  // is re-bound on every socket dep change and capturing playerId in
  // closure would lag a render.
  const myUserIdRef = useRef(null);
  useEffect(() => { myUserIdRef.current = playerId; }, [playerId]);

  // Lazily-constructed AudioContext for the chat notification ping.
  // Browsers gate AudioContext creation on a user gesture in some
  // configurations; we create it on first beep instead of mount, so
  // it inherits whatever gesture the user just made (typing,
  // clicking, etc.). One context lives for the page's lifetime.
  const chatPingCtxRef = useRef(null);
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
      // A brief sine ping: 880Hz, 70ms. Soft envelope so it doesn't
      // clip and doesn't startle anyone wearing headphones in a quiet
      // room. Two stacked oscillators (880Hz + 660Hz) give a more
      // notification-shaped chime than a single tone.
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
      // Silently swallow — audio is a nice-to-have, not load-bearing.
    }
  }, []);

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

  // Action-failure helper. Routes the server error into BOTH the
  // setError state (for landing-screen banner) and the notification
  // toast (for in-room screens that don't render the error state).
  // Without this, errors like Mirror-Match-requires-even-count
  // surface nowhere — host clicks Start Game and nothing visibly
  // happens. https://github.com/Honour-Boy/bluff-game/issues/<n>
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

  // ─── Authenticate socket with Supabase JWT or guest ───────
  // Returns Promise<boolean> that resolves once the server has
  // accepted (or rejected) the credentials. Reconnect must await
  // this so host_reconnect / player_reconnect don't race the
  // server's socket.userId stamping.
  //
  // Two payloads:
  //   - { token } — Supabase JWT (preferred when one exists).
  //   - { guest: { username, guestId } } — anonymous play. The
  //     guestId comes from sessionStorage so a refresh keeps the
  //     same identity and the server's room.players entry still
  //     matches on player_reconnect.
  const authenticateSocket = useCallback(() => {
    return new Promise(async (resolve) => {
      // Prefer real auth when both are present — a Supabase user
      // shadows any stale guest entry. useAuth clears guest storage
      // on sign-in but a race during the swap is still possible.
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
  }, [socket, getAccessToken, getGuestAuth]);

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

  // ─── Reload / close confirmation ──────────────────────────
  // While the user is in a room, intercept tab close / refresh
  // with the browser's stock "Are you sure?" prompt. Without this,
  // a stray Cmd+R drops them into the disconnect grace period and
  // their teammates see a "player disconnecting" toast for 30s.
  //
  // The browser ignores the actual returnValue text in modern
  // versions — calling preventDefault + setting the property is
  // the entire spec. Active in lobby too: a host hitting refresh
  // before starting still kills the room for everyone (10s host
  // grace runs from disconnect, not from start).
  useEffect(() => {
    if (!roomCode) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // legacy Chrome/Safari requirement
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
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
      if (!chatOpenRef.current) {
        setChatUnread((n) => n + 1);
        // Ping only for OTHER people's messages and only when the
        // panel is closed (open panel already shows the message
        // visually + autoscrolls — no ear-tap needed).
        if (msg.userId !== myUserIdRef.current) playChatPing();
      }
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
    // Issue #50 — lobby host-idle timeout. Three events:
    //   lobby_idle_warning           — 4 min idle, action in N seconds
    //   lobby_idle_warning_cancelled — host came back, warning rescinded
    //   lobby_auto_started           — game auto-started after 5 min idle
    const onLobbyIdleWarning = ({ secondsUntilAction, willAutoStart } = {}) => {
      const secs = secondsUntilAction ?? 60;
      notify(
        willAutoStart
          ? `Host idle. Auto-starting in ${secs}s — host: tap anything to cancel.`
          : `Host idle. Lobby will close in ${secs}s — host: tap anything to cancel.`,
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
    socket.on('room_state', onRoomState);
    socket.on('chat_message', onChatMessage);
    socket.on('bluff_called', onBluffCalled);
    socket.on('spin_acknowledged', onSpinAcknowledged);
    socket.on('host_disconnecting', onHostDisconnecting);
    socket.on('game_ended', onGameEnded);
    socket.on('power_card_triggered', onPowerCardTriggered);
    socket.on('lobby_idle_warning', onLobbyIdleWarning);
    socket.on('lobby_idle_warning_cancelled', onLobbyIdleWarningCancelled);
    socket.on('lobby_auto_started', onLobbyAutoStarted);

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
      socket.off('lobby_idle_warning', onLobbyIdleWarning);
      socket.off('lobby_idle_warning_cancelled', onLobbyIdleWarningCancelled);
      socket.off('lobby_auto_started', onLobbyAutoStarted);
    };
  }, [socket, notify, clearSession, authenticateSocket, playChatPing]);

  // ─── On mount + on auth-identity change: authenticate if connected ──
  // Triggers when the effective auth identity changes — e.g. a guest
  // signing in mid-session needs to (re)authenticate the existing
  // socket without waiting for a transport reconnect. The two
  // callback refs are useCallback-stable, so they alone wouldn't re-
  // fire this effect on guest sign-in (issue #52). authIdentityKey
  // (user?.id from useAuth — covers both Supabase ids and guest:<uuid>)
  // is the actual signal we react to.
  useEffect(() => {
    if (socket.connected && (getAccessToken || getGuestAuth)) authenticateSocket();
  }, [authIdentityKey, getAccessToken, getGuestAuth]); // eslint-disable-line

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
      if (!res.success) failError(res);
    });
  }, [socket, roomCode]);

  const nextTurn = useCallback(() => {
    socket.emit('next_turn', { roomCode }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode]);

  const resolveBluff = useCallback((bluffIsCorrect) => {
    socket.emit('resolve_bluff', { roomCode, bluffIsCorrect }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode]);

  const playCard = useCallback(() => {
    socket.emit('play_card', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode, playerId]);

  const endTurn = useCallback(() => {
    socket.emit('end_turn', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode, playerId]);

  const playerSpin = useCallback(() => {
    setSpinDismissed(false);
    socket.emit('player_spin', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode, playerId]);

  const acknowledgeSpinResult = useCallback(() => {
    socket.emit('spin_acknowledged', { roomCode });
    setSpinDismissed(true);
  }, [socket, roomCode]);

  const declareRoundWin = useCallback((winnerPlayerId) => {
    socket.emit('round_win', { roomCode, playerId: winnerPlayerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode]);

  const callBluff = useCallback(() => {
    socket.emit('call_bluff', { roomCode, playerId }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode, playerId]);

  const playCardOnline = useCallback((cardId, nominatedShape) => {
    socket.emit('play_card_online', { roomCode, playerId, cardId, nominatedShape }, (res) => {
      if (!res.success) failError(res);
    });
  }, [socket, roomCode, playerId]);

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
        if (!res?.success) failError(res);
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
        if (!res?.success) failError(res);
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
        if (!res?.success) failError(res);
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase D — Saboteur transfer ───────────────────────
  // Once per game; silent. Random card from holder hand → target.
  const saboteurTransfer = useCallback((targetPlayerId) => {
    return new Promise((resolve) => {
      socket.emit('saboteur_transfer', { roomCode, targetPlayerId }, (res) => {
        if (!res?.success) failError(res);
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
        if (!res?.success) failError(res);
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

  // ─── v2 Phase F — Betting ─────────────────────────────────
  const placeBet = useCallback((prediction) => {
    return new Promise((resolve) => {
      socket.emit('place_bet', { roomCode, prediction }, (res) => {
        if (!res?.success) failError(res);
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase F — Dead Man's Hand ghost vote ──────────────
  const ghostVote = useCallback((option) => {
    return new Promise((resolve) => {
      socket.emit('ghost_vote', { roomCode, option }, (res) => {
        if (!res?.success) failError(res);
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  // ─── v2 Phase F — Last Stand actions ──────────────────────
  const lastStandSpin = useCallback(() => {
    return new Promise((resolve) => {
      socket.emit('last_stand_spin', { roomCode }, (res) => {
        if (!res?.success) failError(res);
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  const lastStandEndTurn = useCallback(() => {
    return new Promise((resolve) => {
      socket.emit('last_stand_end_turn', { roomCode }, (res) => {
        if (!res?.success) failError(res);
        resolve(res);
      });
    });
  }, [socket, roomCode]);

  const sendChatMessage = useCallback((text) => {
    if (!roomCode || !text?.trim()) return;
    socket.emit('send_chat_message', { roomCode, text: text.trim() }, (res) => {
      if (!res?.success) failError(res);
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

  // Issue #54 — host-only restart of a finished room. Server enforces
  // the host check; the client doesn't need to gate it because
  // non-host callers will just see the error returned.
  const restartRoom = useCallback(() => {
    if (!roomCode) return;
    socket.emit('restart_room', { roomCode }, (res) => {
      if (!res?.success) failError(res);
    });
  }, [socket, roomCode, failError]);

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
    spectatePlayer,
    sendChatMessage,
    openChat,
    closeChat,
    leaveGame,
    restartRoom,
    activatePowerCard,
    swapPick,
    medicDecide,
    saboteurTransfer,
    sniperRedirect,
    medicPrompt,
    sniperPrompt,
    powerEventQueue,
    consumePowerEvent,
    // v2 Phase F — Systems
    placeBet,
    ghostVote,
    lastStandSpin,
    lastStandEndTurn,
    setError,
  };
}
