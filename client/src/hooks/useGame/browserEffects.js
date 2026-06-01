import { useEffect } from 'react';
import { getSocket } from '../../lib/socket';
import { saveRoomSession } from '../../lib/sessionStore';

export function useGameBrowserEffects({ roomCode, isHost, playerId }) {
  useEffect(() => {
    if (roomCode) {
      // Persist to the primary (sessionStorage) + short-TTL recovery
      // (localStorage) stores so a transient drop / refresh can silently rejoin.
      saveRoomSession({ roomCode, isHost, playerId });
    }
  }, [roomCode, isHost, playerId]);

  // §M4 — client-initiated keepalive while in a room. A steady trickle of
  // INBOUND traffic (on top of the server-driven server_keepalive→client_keepalive
  // loop) helps free-tier hosts keep the instance awake during a live game, so
  // the socket doesn't silently die between turns. Pure liveness; no state.
  useEffect(() => {
    if (!roomCode) return undefined;
    const socket = getSocket();
    const id = setInterval(() => {
      try { if (socket.connected) socket.emit('client_keepalive'); } catch (_) { /* transport hiccup */ }
    }, 25_000);
    return () => clearInterval(id);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return undefined;

    let wakeLock = null;
    const acquire = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (_) {
        // Best effort only.
      }
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

  useEffect(() => {
    if (!roomCode) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [roomCode]);
}

export function useSocketAuthenticationEffect({
  socket,
  getAccessToken,
  getGuestAuth,
  authenticateSocket,
  authIdentityKey,
}) {
  useEffect(() => {
    if (socket.connected && (getAccessToken || getGuestAuth)) authenticateSocket();
  }, [authIdentityKey, authenticateSocket, getAccessToken, getGuestAuth, socket.connected]);
}
