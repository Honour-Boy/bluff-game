import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeMockSocket } from '../../../test-utils';
import { useGameActions } from '../gameActions';

function setup(overrides = {}) {
  const socket = makeMockSocket({ autoCallback: false });
  const deps = {
    socket,
    roomCode: 'ABCD',
    playerId: 'player-1',
    failError: vi.fn(),
    setError: vi.fn(),
    setRoomCode: vi.fn(),
    setIsHost: vi.fn(),
    setPlayerId: vi.fn(),
    setSpinDismissed: vi.fn(),
    setChatOpen: vi.fn(),
    setChatUnread: vi.fn(),
    clearSession: vi.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => useGameActions(deps));
  return { socket, deps, result };
}

describe('useGameActions', () => {
  it('createRoom emits create_room with the given mode', () => {
    const { socket, result } = setup();
    act(() => { result.current.createRoom('online'); });
    expect(socket.emit).toHaveBeenCalledWith(
      'create_room',
      { mode: 'online' },
      expect.any(Function),
    );
  });

  it('createRoom includes config when provided', () => {
    const { socket, result } = setup();
    const config = { powerCards: { enabled: true } };
    act(() => { result.current.createRoom('online', config); });
    expect(socket.emit).toHaveBeenCalledWith(
      'create_room',
      { mode: 'online', config },
      expect.any(Function),
    );
  });

  it('joinRoom uppercases the room code before emitting', () => {
    const { socket, result } = setup();
    act(() => { result.current.joinRoom('abcd'); });
    expect(socket.emit).toHaveBeenCalledWith(
      'join_room',
      { roomCode: 'ABCD' },
      expect.any(Function),
    );
  });

  it('joinRoom sets state on success', () => {
    const { socket, deps, result } = setup();
    act(() => { result.current.joinRoom('ABCD'); });
    // Simulate server success callback
    const cb = socket.emit.mock.calls[0][2];
    act(() => { cb({ success: true, roomCode: 'ABCD', playerId: 'p1', isHost: false }); });
    expect(deps.setError).toHaveBeenCalledWith(null);
    expect(deps.setRoomCode).toHaveBeenCalledWith('ABCD');
    expect(deps.setPlayerId).toHaveBeenCalledWith('p1');
    expect(deps.setIsHost).toHaveBeenCalledWith(false);
  });

  it('joinRoom sets error on failure', () => {
    const { socket, deps, result } = setup();
    act(() => { result.current.joinRoom('ABCD'); });
    const cb = socket.emit.mock.calls[0][2];
    act(() => { cb({ success: false, error: 'Room not found' }); });
    expect(deps.setError).toHaveBeenCalledWith('Room not found');
  });
});
