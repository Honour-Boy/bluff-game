import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeMockSocket } from '../test/helpers/mockSocket';

// ─── Stub the env var so connect() doesn't bail with "not configured"
// useVoice reads process.env.NEXT_PUBLIC_LIVEKIT_URL at module-import
// time, so we have to set it BEFORE the `import { useVoice }` below.
// vi.hoisted makes the assignment run with the vi.mock() calls,
// before any of the static imports execute.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://livekit.example.test';
});

// ─── Mock the socket singleton ─────────────────────────────────
const socketHolder = vi.hoisted(() => ({ socket: null }));
vi.mock('../lib/socket', () => ({
  getSocket: () => socketHolder.socket,
  SERVER_URL: 'http://localhost:3001',
}));

// ─── Mock livekit-client with a fake Room class ────────────────
const livekitMock = vi.hoisted(() => {
  const handlers = new Map();
  // Tracked across instances for assertions in tests.
  const state = {
    connectArgs: null,
    micCalls: [],
    disconnected: false,
  };

  class FakeRoom {
    constructor() {
      this.localParticipant = {
        identity: 'me',
        isSpeaking: false,
        setMicrophoneEnabled: vi.fn(async (enabled) => {
          state.micCalls.push(enabled);
        }),
      };
      this.remoteParticipants = new Map();
    }
    on(event, handler) {
      handlers.set(event, handler);
      return this;
    }
    async connect(url, token) {
      state.connectArgs = { url, token };
      return Promise.resolve();
    }
    async disconnect() {
      state.disconnected = true;
      return Promise.resolve();
    }
  }

  return {
    handlers,
    state,
    Room: FakeRoom,
    RoomEvent: {
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      ParticipantConnected: 'participantConnected',
      ParticipantDisconnected: 'participantDisconnected',
      Disconnected: 'disconnected',
      TrackSubscribed: 'trackSubscribed',
      TrackUnsubscribed: 'trackUnsubscribed',
    },
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  };
});

vi.mock('livekit-client', () => ({
  Room: livekitMock.Room,
  RoomEvent: livekitMock.RoomEvent,
  Track: livekitMock.Track,
}));

import { useVoice } from './useVoice';

beforeEach(() => {
  socketHolder.socket = makeMockSocket({ connected: true });
  livekitMock.handlers.clear();
  livekitMock.state.connectArgs = null;
  livekitMock.state.micCalls = [];
  livekitMock.state.disconnected = false;
});

describe('useVoice — initial state', () => {
  it('starts idle and muted', () => {
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.muted).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.speakingIds).toBeInstanceOf(Set);
    expect(result.current.speakingIds.size).toBe(0);
  });

  it('connect bails when not authenticated', async () => {
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: false }),
    );
    let ok;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('connect bails when no roomCode', async () => {
    const { result } = renderHook(() =>
      useVoice({ roomCode: null, isAuthenticated: true }),
    );
    let ok;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
  });
});

describe('useVoice — connect flow', () => {
  it('requests a voice token from the server and joins the LiveKit room', async () => {
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      expect(event).toBe('request_voice_token');
      expect(payload).toEqual({ roomCode: 'ROOM01' });
      cb({ success: true, token: 'lk-token-xyz' });
    });

    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );

    let ok;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(true);
    expect(result.current.status).toBe('connected');
    expect(result.current.muted).toBe(true); // start muted
    expect(livekitMock.state.connectArgs).toEqual({
      url: 'wss://livekit.example.test',
      token: 'lk-token-xyz',
    });
    // Mic should have been disabled (false) on initial publish.
    expect(livekitMock.state.micCalls).toContain(false);
  });

  it('surfaces the server error when token request fails', async () => {
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: false, error: 'not in room' });
    });
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );
    let ok;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('not in room');
  });

  it('returns true immediately when called twice (idempotent)', async () => {
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, token: 'lk-token-1' });
    });
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('connected');

    // Second call should short-circuit and not request another token.
    socketHolder.socket.emit.mockImplementation(() => {
      throw new Error('should not be called');
    });
    let ok;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(true);
  });
});

describe('useVoice — disconnect + mute', () => {
  it('disconnect tears down the room and resets state', async () => {
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, token: 'lk-token-xyz' });
    });
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('connected');

    await act(async () => {
      await result.current.disconnect();
    });
    expect(livekitMock.state.disconnected).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.muted).toBe(true);
  });

  it('toggleMute flips muted and calls setMicrophoneEnabled', async () => {
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, token: 'lk-token-xyz' });
    });
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );
    await act(async () => {
      await result.current.connect();
    });
    // Drop the initial 'false' from connect()
    livekitMock.state.micCalls = [];

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.muted).toBe(false);
    expect(livekitMock.state.micCalls).toContain(true);

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.muted).toBe(true);
    expect(livekitMock.state.micCalls).toContain(false);
  });

  it('toggleMute is a no-op before connect', async () => {
    const { result } = renderHook(() =>
      useVoice({ roomCode: 'ROOM01', isAuthenticated: true }),
    );
    await act(async () => {
      await result.current.toggleMute();
    });
    expect(livekitMock.state.micCalls).toEqual([]);
  });
});
