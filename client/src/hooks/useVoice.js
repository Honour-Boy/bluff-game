// ============================================================
// useVoice HOOK — LiveKit voice chat for the in-game room
// ============================================================
//
// Always-on voice; default-muted on join (Zoom-style). Caller decides
// when to connect (opt-in via Join Voice button — first connect
// triggers the browser mic permission prompt).
//
// Speaking detection is driven by LiveKit's `isSpeakingChanged` event;
// the hook surfaces a `speakingIds: Set<userId>` for the UI to colour
// player rows.

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../lib/socket';

// livekit-client is ~120 kB. Lazy-load it inside connect() so visitors
// who never click "Join Voice" don't pay for it on initial page load.

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

export function useVoice({ roomCode, isAuthenticated }) {
  const socket = getSocket();
  // 'idle' | 'connecting' | 'connected' | 'error'
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(true); // start muted
  const [speakingIds, setSpeakingIds] = useState(() => new Set());

  const roomRef = useRef(null);

  // ─── Tear down on unmount or roomCode change ────────────────
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        room.disconnect().catch(() => {});
        roomRef.current = null;
      }
    };
  }, [roomCode]);

  // ─── Connect (opt-in; called from a user gesture) ───────────
  const connect = useCallback(async () => {
    if (!LIVEKIT_URL) {
      setError('Voice not configured (NEXT_PUBLIC_LIVEKIT_URL missing)');
      setStatus('error');
      return false;
    }
    if (!socket || !roomCode || !isAuthenticated) {
      setError('Not ready');
      setStatus('error');
      return false;
    }
    if (roomRef.current) return true; // already connected

    setStatus('connecting');
    setError(null);

    // Mint token via the game server (proves room membership)
    const tokenResp = await new Promise((resolve) => {
      socket.emit('request_voice_token', { roomCode }, resolve);
    });
    if (!tokenResp?.success) {
      setError(tokenResp?.error || 'Failed to get voice token');
      setStatus('error');
      return false;
    }

    // Lazy-load the SDK on first connect.
    const { Room, RoomEvent, Track } = await import('livekit-client');

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Audio-only: no video tracks, no screen share.
      publishDefaults: { videoSimulcastLayers: [] },
    });

    // Track who's currently speaking — drives the "🔊" indicator.
    const updateSpeaking = () => {
      const speaking = new Set();
      // Local participant first
      if (room.localParticipant?.isSpeaking) {
        speaking.add(room.localParticipant.identity);
      }
      // Then remotes
      for (const p of room.remoteParticipants.values()) {
        if (p.isSpeaking) speaking.add(p.identity);
      }
      setSpeakingIds(speaking);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, updateSpeaking);
    room.on(RoomEvent.ParticipantConnected, updateSpeaking);
    room.on(RoomEvent.ParticipantDisconnected, updateSpeaking);
    room.on(RoomEvent.Disconnected, () => {
      setStatus('idle');
      setSpeakingIds(new Set());
      roomRef.current = null;
    });

    // Auto-play remote audio tracks. LiveKit attaches them to <audio>
    // elements managed by the SDK once we subscribe.
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.style.display = 'none';
        document.body.appendChild(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    try {
      await room.connect(LIVEKIT_URL, tokenResp.token);
      // Publish the mic — disabled (muted) until user toggles.
      await room.localParticipant.setMicrophoneEnabled(false);
      roomRef.current = room;
      setMuted(true);
      setStatus('connected');
      return true;
    } catch (err) {
      setError(err?.message || 'Voice connection failed');
      setStatus('error');
      try { await room.disconnect(); } catch {}
      return false;
    }
  }, [socket, roomCode, isAuthenticated]);

  // ─── Disconnect ─────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try { await room.disconnect(); } catch {}
    roomRef.current = null;
    setStatus('idle');
    setMuted(true);
    setSpeakingIds(new Set());
  }, []);

  // ─── Toggle mic ─────────────────────────────────────────────
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
    } catch (err) {
      setError(err?.message || 'Could not toggle microphone');
    }
  }, [muted]);

  return {
    status,             // 'idle' | 'connecting' | 'connected' | 'error'
    error,
    muted,
    speakingIds,        // Set<userId> — currently speaking participants
    isConnected: status === 'connected',
    connect,
    disconnect,
    toggleMute,
  };
}
