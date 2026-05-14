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

export function useVoice({ roomCode, isAuthenticated, autoJoin = false }) {
  const socket = getSocket();
  // 'idle' | 'connecting' | 'connected' | 'error'
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(true); // start muted
  const [speakingIds, setSpeakingIds] = useState(() => new Set());

  const roomRef = useRef(null);

  // Tracks whether the user has explicitly clicked Leave Voice this
  // room session. When true, auto-join must NOT re-engage on status
  // returning to 'idle' — otherwise the user is silently reconnected
  // and the Join Voice button never reappears (issue #78). Cleared on
  // an explicit connect() (re-opt-in) and on roomCode change (fresh
  // session). A ref, not state, so flipping it doesn't re-render.
  const manualLeaveRef = useRef(false);

  // ─── Tear down on unmount or roomCode change ────────────────
  useEffect(() => {
    // Entering a new room is a fresh opt-in for auto-join.
    manualLeaveRef.current = false;
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

    // Explicit connect (manual Join Voice click or initial auto-join)
    // re-opts the user in. Clearing here makes the Join Voice button
    // resume auto-join semantics on subsequent room sessions too.
    manualLeaveRef.current = false;

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

    // Keep the local muted state in sync with whatever the SDK
    // actually reports. LiveKit can mute/unmute the local mic on
    // its own (auto-reconnect, server-initiated mute, the user's
    // OS-level mic switch toggling). Without these listeners the
    // UI's `muted` flag drifts: button says "Mic ON" while the SDK
    // has the track muted, or vice versa, and pressing it produces
    // a confusing no-op. The getter `isMicrophoneEnabled` is the
    // source of truth — `muted = !enabled`.
    const syncMutedFromTrack = () => {
      const lp = room.localParticipant;
      if (!lp) return;
      try {
        setMuted(!lp.isMicrophoneEnabled);
      } catch (_) { /* getter throws while mid-publish — ignore */ }
    };
    room.on(RoomEvent.TrackMuted, (_pub, participant) => {
      if (participant?.identity === room.localParticipant?.identity) {
        syncMutedFromTrack();
      }
    });
    room.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
      if (participant?.identity === room.localParticipant?.identity) {
        syncMutedFromTrack();
      }
    });
    room.on(RoomEvent.LocalTrackPublished, syncMutedFromTrack);
    room.on(RoomEvent.LocalTrackUnpublished, syncMutedFromTrack);

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
      roomRef.current = room;
      // Try to publish the mic muted. setMicrophoneEnabled(false) on
      // a not-yet-published mic still calls getUserMedia, which the
      // browser may reject without a user gesture (auto-join path,
      // issue #49). Don't fail the whole connect on that — the user
      // can stay in the LiveKit room as a listener and the publish
      // retries on first toggleMute, which IS user-gesture-driven.
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMuted(!room.localParticipant.isMicrophoneEnabled);
      } catch (publishErr) {
        // Most likely: NotAllowedError (no permission yet) or
        // SecurityError (no gesture). Stay connected as listener-only;
        // toggleMute publishes lazily later.
        setMuted(true);
      }
      setStatus('connected');
      return true;
    } catch (err) {
      setError(err?.message || 'Voice connection failed');
      setStatus('error');
      try { await room.disconnect(); } catch {}
      return false;
    }
  }, [socket, roomCode, isAuthenticated]);

  // ─── Auto-join on room entry (issue #49) ────────────────────
  // Honour wants players to land in the room voice channel without
  // an extra click. Default-muted, listener-only on first connect
  // (mic publish is gesture-deferred via the catch above and the
  // toggleMute path). Opt-in via autoJoin so existing manual-control
  // tests stay valid. Skips if voice isn't configured, or if the
  // user has manually clicked Leave Voice this session (issue #78 —
  // otherwise status returning to 'idle' on disconnect would re-fire
  // this effect and silently reconnect them). If connect() fails,
  // status='error' surfaces the manual retry button rather than
  // silently retrying forever.
  useEffect(() => {
    if (!autoJoin) return;
    if (!LIVEKIT_URL) return;
    if (!roomCode || !isAuthenticated) return;
    if (status !== 'idle') return;
    if (manualLeaveRef.current) return;
    connect();
  }, [autoJoin, roomCode, isAuthenticated, status, connect]);

  // ─── Disconnect ─────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    // Mark intent first so the LiveKit Disconnected event handler
    // (which flips status to 'idle') can't race the auto-join effect
    // and silently reconnect us before we've recorded the opt-out.
    manualLeaveRef.current = true;
    if (!room) return;
    try { await room.disconnect(); } catch {}
    roomRef.current = null;
    setStatus('idle');
    setMuted(true);
    setSpeakingIds(new Set());
  }, []);

  // ─── Toggle mic ─────────────────────────────────────────────
  // Asks the SDK to flip the local mic, then reads back the actual
  // track state instead of trusting the requested flip. If the user
  // denies the permission prompt on first unmute, setMicrophoneEnabled
  // rejects → catch path. If LiveKit silently rejects (rare but
  // possible mid-reconnect), the read-back keeps the UI honest. The
  // TrackMuted/TrackUnmuted listeners installed in connect() also
  // resync if the SDK changes mute state on its own afterwards.
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const desiredEnabled = muted; // muted=true → want enabled
    try {
      await room.localParticipant.setMicrophoneEnabled(desiredEnabled);
    } catch (err) {
      setError(err?.message || 'Could not toggle microphone');
      // Mic permission denial leaves the track disabled; re-read so
      // the UI reflects what actually happened, not what we asked for.
      try {
        setMuted(!room.localParticipant.isMicrophoneEnabled);
      } catch (_) { /* keep prior state */ }
      return;
    }
    try {
      setMuted(!room.localParticipant.isMicrophoneEnabled);
    } catch (_) {
      // Getter unavailable for a beat — fall back to the requested state.
      setMuted(!desiredEnabled);
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
