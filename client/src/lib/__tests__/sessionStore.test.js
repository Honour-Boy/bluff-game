import { describe, it, expect, beforeEach } from 'vitest';
import { saveRoomSession, readRoomSession, clearRoomSession } from '../sessionStore';

const SESSION_KEY = 'bluff_session';
const RECOVERY_KEY = 'bluff_session_recovery';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('sessionStore - primary + recovery layering (#M4)', () => {
  it('saveRoomSession writes both the primary and recovery stores', () => {
    saveRoomSession({ roomCode: 'ABC123', isHost: true, playerId: 'p1' });

    const primary = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    expect(primary).toEqual({ roomCode: 'ABC123', isHost: true, playerId: 'p1' });

    const recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY));
    expect(recovery.roomCode).toBe('ABC123');
    expect(recovery.isHost).toBe(true);
    expect(recovery.playerId).toBe('p1');
    expect(typeof recovery.ts).toBe('number');
  });

  it('ignores a save with no roomCode', () => {
    saveRoomSession({ isHost: true });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  });

  it('readRoomSession prefers the primary (sessionStorage) entry', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: 'PRIM01', isHost: false, playerId: 'pp' }));
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ roomCode: 'RECOV1', isHost: true, playerId: 'xx', ts: Date.now() }));

    expect(readRoomSession()).toEqual({ roomCode: 'PRIM01', isHost: false, playerId: 'pp' });
  });

  it('falls back to a FRESH recovery snapshot when the primary is missing', () => {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ roomCode: 'RECOV1', isHost: true, playerId: 'xx', ts: Date.now() }));

    expect(readRoomSession()).toEqual({ roomCode: 'RECOV1', isHost: true, playerId: 'xx' });
  });

  it('ignores AND purges a STALE recovery snapshot (past the TTL)', () => {
    const stale = Date.now() - (10 * 60 * 1000); // 10 min ago, well past the 2-min TTL
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ roomCode: 'OLD001', isHost: false, playerId: 'q', ts: stale }));

    expect(readRoomSession()).toBeNull();
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull(); // purged
  });

  it('clearRoomSession removes both stores', () => {
    saveRoomSession({ roomCode: 'ABC123', isHost: true, playerId: 'p1' });
    clearRoomSession();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
    expect(readRoomSession()).toBeNull();
  });
});
