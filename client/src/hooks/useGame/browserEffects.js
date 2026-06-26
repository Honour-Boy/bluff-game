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

  // §M4 - client-initiated keepalive while in a room. A steady trickle of
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
  authenticated,
}) {
  // Establish / recover socket auth whenever we're connected but NOT yet
  // authenticated and we have credentials. Covers the first connect, identity
  // changes, AND returning to the game after navigating away to another route
  // (e.g. the /feedback dashboard): the singleton socket can come back
  // connected-but-unauthenticated - its `onConnect` re-auth never fires because
  // it never re-`connect`ed - and a game action would then fail "Not
  // authenticated" while Supabase still shows us signed in. A short bounded
  // retry rides out a transient failure without tripping the server's
  // authenticate rate limit (5 / 10s).
  useEffect(() => {
    if (authenticated) return undefined;
    if (!(getAccessToken || getGuestAuth)) return undefined;
    let cancelled = false;
    let tries = 0;
    let timer = null;
    const attempt = async () => {
      if (cancelled || authenticated) return;
      if (!socket.connected) return; // the 'connect' handler will drive it
      const ok = await authenticateSocket();
      if (ok || cancelled) return;
      if (tries++ < 2) timer = setTimeout(attempt, 2000);
    };
    attempt();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [authIdentityKey, authenticated, authenticateSocket, getAccessToken, getGuestAuth, socket, socket.connected]);

  // Re-check on tab focus / visibility regain: coming back to the game tab
  // after it lost its socket auth (another tab took over, the transport slept,
  // or we were off on the dashboard) should silently recover, not strand us.
  useEffect(() => {
    const recover = () => {
      if (!authenticated && socket.connected && (getAccessToken || getGuestAuth)) {
        authenticateSocket();
      }
    };
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [authenticated, authenticateSocket, getAccessToken, getGuestAuth, socket]);
}
