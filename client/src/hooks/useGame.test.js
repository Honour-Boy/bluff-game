import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeMockSocket } from '../test/helpers/mockSocket';

// ─── Mock the socket singleton ─────────────────────────────────
// useGame imports getSocket() from lib/socket. We swap that out for
// our EventEmitter-backed fake so tests can drive incoming events
// directly via socket.__emit().

const socketHolder = vi.hoisted(() => ({ socket: null }));

vi.mock('../lib/socket', () => ({
  getSocket: () => socketHolder.socket,
  SERVER_URL: 'http://localhost:3001',
}));

import { useGame } from './useGame';

beforeEach(() => {
  socketHolder.socket = makeMockSocket({ connected: false });
  // Tests run in JSDOM — sessionStorage is real, but we don't want
  // state leaking between tests.
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});

describe('useGame — initial state', () => {
  it('starts with no room and no player id', () => {
    const { result } = renderHook(() => useGame(null));
    expect(result.current.roomCode).toBeNull();
    expect(result.current.playerId).toBeNull();
    expect(result.current.isHost).toBe(false);
    expect(result.current.roomState).toBeNull();
  });

  it('exposes connected = socket.connected', () => {
    socketHolder.socket = makeMockSocket({ connected: true });
    const { result } = renderHook(() => useGame(null));
    expect(result.current.connected).toBe(true);
  });
});

describe('useGame — chat', () => {
  it('appends incoming chat messages and increments unread when closed', async () => {
    const { result } = renderHook(() => useGame(null));

    act(() => {
      socketHolder.socket.__emit('chat_message', {
        id: '1', userId: 'u1', username: 'A', text: 'hi', ts: 1,
      });
    });
    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1));
    expect(result.current.chatUnread).toBe(1);
  });

  it('dedupes chat messages by id (room_state replay should not double-add)', async () => {
    const { result } = renderHook(() => useGame(null));

    act(() => {
      socketHolder.socket.__emit('chat_message', {
        id: 'dup', userId: 'u1', username: 'A', text: 'hi', ts: 1,
      });
    });
    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1));

    act(() => {
      // Simulate room_state replay containing the same message id.
      socketHolder.socket.__emit('room_state', {
        chatLog: [{ id: 'dup', userId: 'u1', username: 'A', text: 'hi', ts: 1 }],
        players: [], turnOrder: [],
      });
    });
    expect(result.current.chatMessages).toHaveLength(1);
  });

  it('does not increment unread once the chat is open', async () => {
    const { result } = renderHook(() => useGame(null));

    act(() => result.current.openChat());
    expect(result.current.chatUnread).toBe(0);

    act(() => {
      socketHolder.socket.__emit('chat_message', {
        id: 'a', userId: 'u1', username: 'A', text: 'hi', ts: 1,
      });
    });
    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1));
    expect(result.current.chatUnread).toBe(0);
  });

  it('openChat resets unread to 0', async () => {
    const { result } = renderHook(() => useGame(null));
    act(() => {
      socketHolder.socket.__emit('chat_message', {
        id: 'a', userId: 'u1', username: 'A', text: 'hi', ts: 1,
      });
    });
    await waitFor(() => expect(result.current.chatUnread).toBe(1));

    act(() => result.current.openChat());
    expect(result.current.chatUnread).toBe(0);
    expect(result.current.chatOpen).toBe(true);
  });

  it('ignores chat_message events without an id', async () => {
    const { result } = renderHook(() => useGame(null));
    act(() => {
      socketHolder.socket.__emit('chat_message', { userId: 'u1', text: 'no id' });
    });
    expect(result.current.chatMessages).toHaveLength(0);
  });

  it('sendChatMessage emits with trimmed text and roomCode', async () => {
    const { result } = renderHook(() => useGame(null));
    // Force a roomCode by simulating a successful create_room
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, roomCode: 'ABCD12', playerId: 'p1' });
    });
    act(() => result.current.createRoom('online'));
    await waitFor(() => expect(result.current.roomCode).toBe('ABCD12'));

    act(() => result.current.sendChatMessage('  hello  '));
    expect(socketHolder.socket.emit).toHaveBeenCalledWith(
      'send_chat_message',
      { roomCode: 'ABCD12', text: 'hello' },
      expect.any(Function),
    );
  });

  it('sendChatMessage no-ops when text is empty', () => {
    const { result } = renderHook(() => useGame(null));
    act(() => result.current.sendChatMessage('   '));
    // Only no emit call should be made for the chat. emit is not
    // called because we return early when text is empty.
    const calls = socketHolder.socket.emit.mock.calls.filter(
      ([event]) => event === 'send_chat_message',
    );
    expect(calls).toHaveLength(0);
  });
});

describe('useGame — room state + actions', () => {
  it('createRoom on success sets roomCode + isHost', async () => {
    const { result } = renderHook(() => useGame(null));
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, roomCode: 'ROOM01', playerId: 'p1' });
    });
    act(() => result.current.createRoom('physical'));
    await waitFor(() => expect(result.current.roomCode).toBe('ROOM01'));
    expect(result.current.isHost).toBe(true);
  });

  it('createRoom on failure surfaces error and leaves state', async () => {
    const { result } = renderHook(() => useGame(null));
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: false, error: 'boom' });
    });
    act(() => result.current.createRoom('online'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.roomCode).toBeNull();
  });

  it('joinRoom uppercases the room code', () => {
    const { result } = renderHook(() => useGame(null));
    act(() => result.current.joinRoom('abc123'));
    expect(socketHolder.socket.emit).toHaveBeenCalledWith(
      'join_room',
      { roomCode: 'ABC123' },
      expect.any(Function),
    );
  });

  it('room_state updates roomState and clears spinDismissed on spin_result', async () => {
    const { result } = renderHook(() => useGame(null));
    act(() => {
      socketHolder.socket.__emit('room_state', {
        players: [{ id: 'p1', username: 'A' }],
        turnOrder: ['p1'],
        currentPlayerId: 'p1',
        lastAction: { type: 'spin_result' },
        chatLog: [],
      });
    });
    await waitFor(() => expect(result.current.roomState).toBeTruthy());
    expect(result.current.spinDismissed).toBe(false);
  });

  it('persists session to sessionStorage when in a room', async () => {
    const { result } = renderHook(() => useGame(null));
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, roomCode: 'XYZ999', playerId: 'p1' });
    });
    act(() => result.current.createRoom('online'));
    await waitFor(() => expect(result.current.roomCode).toBe('XYZ999'));

    const saved = JSON.parse(sessionStorage.getItem('bluff_session'));
    expect(saved).toEqual({ roomCode: 'XYZ999', isHost: true, playerId: 'p1' });
  });

  it('leaveGame clears state and removes sessionStorage', async () => {
    const { result } = renderHook(() => useGame(null));
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, roomCode: 'LEAVE1', playerId: 'p1' });
    });
    act(() => result.current.createRoom('physical'));
    await waitFor(() => expect(result.current.roomCode).toBe('LEAVE1'));

    act(() => result.current.leaveGame());
    expect(result.current.roomCode).toBeNull();
    expect(sessionStorage.getItem('bluff_session')).toBeNull();
  });
});

describe('useGame — connection lifecycle', () => {
  it('flips connected to false on disconnect', async () => {
    socketHolder.socket = makeMockSocket({ connected: true });
    const { result } = renderHook(() => useGame(null));
    expect(result.current.connected).toBe(true);

    act(() => socketHolder.socket.__emit('disconnect'));
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(result.current.authenticated).toBe(false);
  });

  it('game_ended notification + clears the room/session', async () => {
    const { result } = renderHook(() => useGame(null));
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true, roomCode: 'END001', playerId: 'p1' });
    });
    act(() => result.current.createRoom('online'));
    await waitFor(() => expect(result.current.roomCode).toBe('END001'));

    act(() => socketHolder.socket.__emit('game_ended', { reason: 'host left' }));
    await waitFor(() => expect(result.current.roomCode).toBeNull());
    expect(sessionStorage.getItem('bluff_session')).toBeNull();
    expect(result.current.notification?.msg).toBe('host left');
  });
});

describe('useGame — authentication', () => {
  it('emits authenticate with the token when connect fires', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('jwt-abc');
    renderHook(() => useGame(getAccessToken));

    // Capture the auth callback so we can fire success.
    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      expect(event).toBe('authenticate');
      expect(payload).toEqual({ token: 'jwt-abc' });
      cb({ success: true });
    });

    act(() => socketHolder.socket.__emit('connect'));
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled();
    });
  });

  it('skips reconnect when there is no saved session', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('jwt-abc');
    renderHook(() => useGame(getAccessToken));

    socketHolder.socket.emit.mockImplementationOnce((event, payload, cb) => {
      cb({ success: true });
    });
    act(() => socketHolder.socket.__emit('connect'));
    await waitFor(() => expect(getAccessToken).toHaveBeenCalled());

    // Only the authenticate emit should have run.
    const authCalls = socketHolder.socket.emit.mock.calls.filter(
      ([e]) => e === 'host_reconnect' || e === 'player_reconnect',
    );
    expect(authCalls).toHaveLength(0);
  });
});
