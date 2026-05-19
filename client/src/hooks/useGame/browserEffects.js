import { useEffect } from 'react';

export function useGameBrowserEffects({ roomCode, isHost, playerId }) {
  useEffect(() => {
    if (roomCode) {
      sessionStorage.setItem('bluff_session', JSON.stringify({ roomCode, isHost, playerId }));
    }
  }, [roomCode, isHost, playerId]);

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
