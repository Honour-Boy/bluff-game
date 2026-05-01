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
  defaultRoomConfig,
  normalizeRoomConfig,
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
