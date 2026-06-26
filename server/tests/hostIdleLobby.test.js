// ============================================================
// Tests for the lobby host-idle timeout (issue #50).
//
// classifyLobbyIdle is a pure decision function — given a clock
// reading, the last-activity timestamp, whether a warning has
// already fired, and the alive player count, it returns one of:
//   'idle'       — within thresholds, do nothing
//   'warn'       — emit lobby_idle_warning and stamp warnedAt
//   'auto_start' — call engine.startGame
//   'dismiss'    — emit game_ended + tear down room
// Sweep plumbing (intervals, broadcasts) is exercised by the
// integration / staging environment; the unit tests here lock the
// decision rules so future tweaks (warn at 3 min, act at 7 min,
// etc.) can flip the constants without re-deriving the logic.
// ============================================================

import { describe, it, expect, vi } from 'vitest';

// socketHandlers calls createClient(SUPABASE_URL, ...) at module load.
// We don't exercise Supabase here — we only test pure decision logic —
// but the import must succeed. Hoist env vars + a minimal stub so
// the module loads in test isolation.
vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  }),
}));

const {
  classifyLobbyIdle,
  HOST_IDLE_WARNING_MS,
  HOST_IDLE_ACTION_MS,
} = await import('../socketHandlers.js');

const FOUR_MIN = 4 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

describe('classifyLobbyIdle — thresholds', () => {
  it('exports the documented constants', () => {
    expect(HOST_IDLE_WARNING_MS).toBe(FOUR_MIN);
    expect(HOST_IDLE_ACTION_MS).toBe(FIVE_MIN);
  });

  it("returns 'idle' inside the warning window (< 4 min)", () => {
    const now = 1_000_000;
    const last = now - (FOUR_MIN - 1000);
    expect(classifyLobbyIdle(now, last, null, 3)).toBe('idle');
  });

  it("returns 'warn' once at 4 min when no warning has fired", () => {
    const now = 1_000_000;
    const last = now - FOUR_MIN;
    expect(classifyLobbyIdle(now, last, null, 3)).toBe('warn');
  });

  it("does NOT re-emit 'warn' if warnedAt is already stamped", () => {
    const now = 1_000_000;
    const last = now - (FOUR_MIN + 30_000); // 4m30s idle
    expect(classifyLobbyIdle(now, last, last + 1000, 3)).toBe('idle');
  });
});

describe('classifyLobbyIdle — action at 5 min', () => {
  it("returns 'auto_start' when 2+ alive and idle ≥ 5 min", () => {
    const now = 1_000_000;
    const last = now - FIVE_MIN;
    expect(classifyLobbyIdle(now, last, last - FOUR_MIN, 2)).toBe('auto_start');
    expect(classifyLobbyIdle(now, last, last - FOUR_MIN, 5)).toBe('auto_start');
  });

  it("returns 'dismiss' when only 1 alive and idle ≥ 5 min", () => {
    const now = 1_000_000;
    const last = now - FIVE_MIN;
    expect(classifyLobbyIdle(now, last, last - FOUR_MIN, 1)).toBe('dismiss');
    expect(classifyLobbyIdle(now, last, last - FOUR_MIN, 0)).toBe('dismiss');
  });

  it("returns 'auto_start' even if no warning was emitted (e.g. process restart skipped warn tick)", () => {
    const now = 1_000_000;
    const last = now - FIVE_MIN;
    expect(classifyLobbyIdle(now, last, null, 4)).toBe('auto_start');
  });

  it('action threshold dominates warning threshold once both are crossed', () => {
    const now = 1_000_000;
    const last = now - (FIVE_MIN + 60_000); // 6 min idle
    expect(classifyLobbyIdle(now, last, null, 3)).toBe('auto_start');
    expect(classifyLobbyIdle(now, last, null, 1)).toBe('dismiss');
  });
});

describe('classifyLobbyIdle — overrideable thresholds', () => {
  it('respects custom warning/action durations', () => {
    const now = 1_000_000;
    const last = now - 30_000; // 30s idle
    const opts = { warningMs: 20_000, actionMs: 60_000 };
    expect(classifyLobbyIdle(now, last, null, 3, opts)).toBe('warn');

    const last2 = now - 70_000; // 70s idle, past custom action
    expect(classifyLobbyIdle(now, last2, null, 3, opts)).toBe('auto_start');
    expect(classifyLobbyIdle(now, last2, null, 1, opts)).toBe('dismiss');
  });
});
