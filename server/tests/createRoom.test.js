// ============================================================
// Tests for createRoom + v2 config plumbing.
//
// Phase A2 only stores host-selected v2 toggles on `room.config`
// — nothing reads them yet. These tests lock the *shape* and
// the normalisation behaviour so later phases have a stable
// contract to build on.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  normalizeRoomConfig,
  resetRoomForReplay,
  serializeRoom,
  MODES,
} from '../gameEngine.js';

describe('defaultRoomConfig', () => {
  it('returns a fully-OFF config with copiesPerDeck = 1', () => {
    const cfg = defaultRoomConfig();
    expect(cfg.powerCards.copiesPerDeck).toBe(1);
    expect(Object.values(cfg.powerCards.enabled).every((v) => v === false)).toBe(true);
    expect(Object.values(cfg.riskModifiers).every((v) => v === false)).toBe(true);
    expect(Object.values(cfg.roomModifiers).every((v) => v === false)).toBe(true);
    expect(Object.values(cfg.systems).every((v) => v === false)).toBe(true);
  });

  it('exposes the documented power-card keys', () => {
    const cfg = defaultRoomConfig();
    const expected = ['shield', 'mirror', 'swap', 'peek', 'freeze', 'assassin'];
    expect(Object.keys(cfg.powerCards.enabled).sort()).toEqual(expected.sort());
  });

  it('does NOT include secretRoles — that auto-activates at 9+ players', () => {
    const cfg = defaultRoomConfig();
    expect(cfg.systems.secretRoles).toBeUndefined();
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = defaultRoomConfig();
    const b = defaultRoomConfig();
    a.powerCards.enabled.shield = true;
    expect(b.powerCards.enabled.shield).toBe(false);
  });
});

describe('normalizeRoomConfig', () => {
  it('falls back to defaults for null / undefined / non-object input', () => {
    expect(normalizeRoomConfig(null)).toEqual(defaultRoomConfig());
    expect(normalizeRoomConfig(undefined)).toEqual(defaultRoomConfig());
    expect(normalizeRoomConfig('nope')).toEqual(defaultRoomConfig());
    expect(normalizeRoomConfig(42)).toEqual(defaultRoomConfig());
  });

  it('respects valid host toggles', () => {
    const cfg = normalizeRoomConfig({
      powerCards: { enabled: { shield: true, peek: true }, copiesPerDeck: 2 },
      riskModifiers: { hotPotato: true },
      roomModifiers: { speedMode: true },
      systems: { bounty: true },
    });
    expect(cfg.powerCards.enabled.shield).toBe(true);
    expect(cfg.powerCards.enabled.peek).toBe(true);
    expect(cfg.powerCards.enabled.mirror).toBe(false); // untouched stays default
    expect(cfg.powerCards.copiesPerDeck).toBe(2);
    expect(cfg.riskModifiers.hotPotato).toBe(true);
    expect(cfg.roomModifiers.speedMode).toBe(true);
    expect(cfg.systems.bounty).toBe(true);
  });

  it('clamps copiesPerDeck to [1, 2]', () => {
    expect(normalizeRoomConfig({ powerCards: { copiesPerDeck: 0 } }).powerCards.copiesPerDeck).toBe(1);
    expect(normalizeRoomConfig({ powerCards: { copiesPerDeck: 5 } }).powerCards.copiesPerDeck).toBe(2);
    expect(normalizeRoomConfig({ powerCards: { copiesPerDeck: 1.7 } }).powerCards.copiesPerDeck).toBe(1);
    expect(normalizeRoomConfig({ powerCards: { copiesPerDeck: 'bad' } }).powerCards.copiesPerDeck).toBe(1);
  });

  it('drops unknown keys silently', () => {
    const cfg = normalizeRoomConfig({
      powerCards: { enabled: { shield: true, hackerCard: true } },
      riskModifiers: { fakeMod: true },
      bogusSection: { stuff: true },
    });
    expect(cfg.powerCards.enabled.hackerCard).toBeUndefined();
    expect(cfg.riskModifiers.fakeMod).toBeUndefined();
    expect(cfg.bogusSection).toBeUndefined();
  });

  it('coerces non-boolean toggle values to defaults', () => {
    const cfg = normalizeRoomConfig({
      powerCards: { enabled: { shield: 'yes', peek: 1 } },
    });
    // Non-boolean values aren't trusted as truthy — default (false) is kept.
    expect(cfg.powerCards.enabled.shield).toBe(false);
    expect(cfg.powerCards.enabled.peek).toBe(false);
  });
});

describe('createRoom + config storage', () => {
  it('stores default config when none is provided', () => {
    const room = createRoom('socket-1', MODES.ONLINE);
    expect(room.config).toEqual(defaultRoomConfig());
  });

  it('stores normalised config when one is provided', () => {
    const room = createRoom('socket-1', MODES.ONLINE, {
      powerCards: { enabled: { shield: true }, copiesPerDeck: 2 },
      systems: { bounty: true },
    });
    expect(room.config.powerCards.enabled.shield).toBe(true);
    expect(room.config.powerCards.enabled.mirror).toBe(false);
    expect(room.config.powerCards.copiesPerDeck).toBe(2);
    expect(room.config.systems.bounty).toBe(true);
    expect(room.config.systems.lastStand).toBe(false);
  });

  it('does NOT trust raw client input — unknown keys are stripped', () => {
    const malicious = {
      powerCards: { enabled: { __proto__: { shield: true }, evil: true } },
      systems: { secretRoles: true }, // not a host toggle
    };
    const room = createRoom('socket-1', MODES.ONLINE, malicious);
    expect(room.config.powerCards.enabled.evil).toBeUndefined();
    expect(room.config.systems.secretRoles).toBeUndefined();
  });

  it('physical mode rooms still get a config so future code can rely on it', () => {
    const room = createRoom('socket-1', MODES.PHYSICAL);
    expect(room.config).toBeTruthy();
    expect(room.config.powerCards.copiesPerDeck).toBe(1);
  });
});

describe('serializeRoom exposes config', () => {
  it('includes config in the serialised payload', () => {
    const room = createRoom('socket-1', MODES.ONLINE, {
      powerCards: { enabled: { peek: true } },
    });
    const serialised = serializeRoom(room);
    expect(serialised.config).toBeTruthy();
    expect(serialised.config.powerCards.enabled.peek).toBe(true);
  });
});

// Issue #54 — replaying in the same room.
describe('resetRoomForReplay', () => {
  function buildFinishedRoom() {
    const room = createRoom('host-sock', MODES.ONLINE, {
      powerCards: { enabled: { shield: true } },
    });
    room.code = 'TESTAB';
    room.hostUserId = 'host:abc';
    room.groupId = 'group-123';
    room.groupSettingsMeta = {
      updatedAt: '2026-05-15T18:00:00.000Z',
      updatedByUserId: 'host:abc',
      updatedByUsername: 'HostUser',
    };
    room.players.push(createPlayer('p1', 'Alice', 'sock-1'));
    room.players.push(createPlayer('p2', 'Bob',   'sock-2'));
    // Pollute with end-of-game state.
    room.phase = 'game_over';
    room.pendingGameOver = { id: 'p1', name: 'Alice' };
    room.mirrorMatchActive = true;
    room.suddenDeathCounter = 5;
    room.swapHolderId = 'p2';
    room.deck = ['x', 'y'];
    room.hands = new Map([['p1', ['c1']], ['p2', ['c2']]]);
    room.players[0].status = 'eliminated';
    room.players[0].riskLevel = 4;
    room.players[0].hasBounty = true;
    room.players[0].consecutiveCorrectBets = 2;
    room.players[0].armedPowerCard = { power: 'shield', cardId: 'sc1', activatedAtTurn: 0 };
    room.chatLog = [{ id: 'm1', userId: 'p1', username: 'Alice', text: 'gg', ts: 0 }];
    return room;
  }

  it('returns the room to lobby state', () => {
    const room = buildFinishedRoom();
    resetRoomForReplay(room);
    expect(room.phase).toBe('lobby');
    expect(room.roundNumber).toBe(1);
    expect(room.lastAction).toBeNull();
    expect(room.deck).toBeNull();
    expect(room.hands).toBeNull();
  });

  it('preserves room identity (code, host, mode, group, config) and chat log', () => {
    const room = buildFinishedRoom();
    resetRoomForReplay(room);
    expect(room.code).toBe('TESTAB');
    expect(room.hostUserId).toBe('host:abc');
    expect(room.groupId).toBe('group-123');
    expect(room.mode).toBe(MODES.ONLINE);
    expect(room.config.powerCards.enabled.shield).toBe(true);
    expect(room.groupSettingsMeta?.updatedByUsername).toBe('HostUser');
    expect(room.chatLog).toHaveLength(1);
  });

  it('re-creates each player at default state — alive, ability flags reset', () => {
    const room = buildFinishedRoom();
    resetRoomForReplay(room);
    expect(room.players).toHaveLength(2);
    const alice = room.players.find(p => p.id === 'p1');
    expect(alice.username).toBe('Alice');
    expect(alice.status).toBe('alive');
    expect(alice.riskLevel).toBe(1);
    expect(alice.hasBounty).toBe(false);
    expect(alice.consecutiveCorrectBets).toBe(0);
    expect(alice.armedPowerCard).toBeNull();
    expect(Array.isArray(alice.chamber)).toBe(true);
    expect(alice.chamber).toHaveLength(6);
  });

  it('wipes dynamic v2 keys from the previous game', () => {
    const room = buildFinishedRoom();
    resetRoomForReplay(room);
    expect('pendingGameOver' in room).toBe(false);
    expect('mirrorMatchActive' in room).toBe(false);
    expect('suddenDeathCounter' in room).toBe(false);
    expect('swapHolderId' in room).toBe(false);
  });
});
