// ============================================================
// Tests for server/engine/xp.js — XP formula (pure)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  computePlayerXp,
  computeAllXpAwards,
  getTierForXp,
  XP_TIERS,
  XP_PARTICIPATION,
  XP_WIN_BONUS,
  XP_SPIN_SURVIVED,
} from '../engine/xp.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeRoom(overrides = {}) {
  return {
    mode: 'online',
    isTutorial: false,
    players: [
      { id: 'user-a', isBot: false, riskLevel: 1 },
      { id: 'user-b', isBot: false, riskLevel: 1 },
    ],
    lastAction: { winnerId: null },
    ...overrides,
  };
}

// ─── getTierForXp ────────────────────────────────────────────

describe('getTierForXp', () => {
  it('returns Greenhorn at 0 XP', () => {
    expect(getTierForXp(0).label).toBe('Greenhorn');
    expect(getTierForXp(0).tier).toBe(0);
  });

  it('returns Greenhorn just below first threshold', () => {
    expect(getTierForXp(99).label).toBe('Greenhorn');
  });

  it('returns Gunslinger at exactly 100 XP', () => {
    expect(getTierForXp(100).label).toBe('Gunslinger');
    expect(getTierForXp(100).tier).toBe(1);
  });

  it('returns Outlaw at exactly 300 XP', () => {
    expect(getTierForXp(300).label).toBe('Outlaw');
  });

  it('returns Desperado at exactly 750 XP', () => {
    expect(getTierForXp(750).label).toBe('Desperado');
  });

  it('returns Legend at exactly 1500 XP', () => {
    expect(getTierForXp(1500).label).toBe('Legend');
    expect(getTierForXp(1500).tier).toBe(4);
  });

  it('returns Legend above max threshold', () => {
    expect(getTierForXp(9999).label).toBe('Legend');
  });

  it('handles null / undefined as 0', () => {
    expect(getTierForXp(null).label).toBe('Greenhorn');
    expect(getTierForXp(undefined).label).toBe('Greenhorn');
  });

  it('XP_TIERS has 5 entries in ascending minXp order', () => {
    expect(XP_TIERS).toHaveLength(5);
    for (let i = 1; i < XP_TIERS.length; i++) {
      expect(XP_TIERS[i].minXp).toBeGreaterThan(XP_TIERS[i - 1].minXp);
    }
  });
});

// ─── computePlayerXp — eligibility guards ────────────────────

describe('computePlayerXp — eligibility guards', () => {
  it('returns 0 for a tutorial room', () => {
    const room = makeRoom({ isTutorial: true });
    expect(computePlayerXp(room, 'user-a')).toBe(0);
  });

  it('returns 0 for physical mode', () => {
    const room = makeRoom({ mode: 'physical' });
    expect(computePlayerXp(room, 'user-a')).toBe(0);
  });

  it('returns 0 for a guest player (guest: prefix)', () => {
    const room = makeRoom({
      players: [{ id: 'guest:abc123', isBot: false, riskLevel: 1 }],
    });
    expect(computePlayerXp(room, 'guest:abc123')).toBe(0);
  });

  it('returns 0 for a bot player', () => {
    const room = makeRoom({
      players: [{ id: 'bot:1', isBot: true, riskLevel: 1 }],
    });
    expect(computePlayerXp(room, 'bot:1')).toBe(0);
  });

  it('returns 0 for an unknown playerId', () => {
    const room = makeRoom();
    expect(computePlayerXp(room, 'no-such-id')).toBe(0);
  });

  it('returns 0 for a null room', () => {
    expect(computePlayerXp(null, 'user-a')).toBe(0);
  });
});

// ─── computePlayerXp — formula ───────────────────────────────

describe('computePlayerXp — formula', () => {
  it('awards participation XP for a loser with no spins survived', () => {
    const room = makeRoom({ lastAction: { winnerId: 'user-b' } });
    expect(computePlayerXp(room, 'user-a')).toBe(XP_PARTICIPATION);
  });

  it('awards participation + win bonus for the winner', () => {
    const room = makeRoom({ lastAction: { winnerId: 'user-a' } });
    expect(computePlayerXp(room, 'user-a')).toBe(XP_PARTICIPATION + XP_WIN_BONUS);
  });

  it('awards participation + spin bonus for 1 spin survived (riskLevel 2)', () => {
    const room = makeRoom({
      players: [
        { id: 'user-a', isBot: false, riskLevel: 2 },
        { id: 'user-b', isBot: false, riskLevel: 1 },
      ],
      lastAction: { winnerId: 'user-b' },
    });
    expect(computePlayerXp(room, 'user-a')).toBe(XP_PARTICIPATION + XP_SPIN_SURVIVED);
  });

  it('awards 3 spins survived (riskLevel 4)', () => {
    const room = makeRoom({
      players: [{ id: 'user-a', isBot: false, riskLevel: 4 }],
      lastAction: { winnerId: null },
    });
    expect(computePlayerXp(room, 'user-a')).toBe(XP_PARTICIPATION + 3 * XP_SPIN_SURVIVED);
  });

  it('stacks win bonus and spin bonus for a surviving winner', () => {
    const room = makeRoom({
      players: [{ id: 'user-a', isBot: false, riskLevel: 3 }],
      lastAction: { winnerId: 'user-a' },
    });
    const expected = XP_PARTICIPATION + XP_WIN_BONUS + 2 * XP_SPIN_SURVIVED;
    expect(computePlayerXp(room, 'user-a')).toBe(expected);
  });

  it('treats missing riskLevel as 1 (0 spins survived)', () => {
    const room = makeRoom({
      players: [{ id: 'user-a', isBot: false }], // no riskLevel
      lastAction: { winnerId: null },
    });
    expect(computePlayerXp(room, 'user-a')).toBe(XP_PARTICIPATION);
  });
});

// ─── computeAllXpAwards ──────────────────────────────────────

describe('computeAllXpAwards', () => {
  it('returns empty array for tutorial room', () => {
    expect(computeAllXpAwards(makeRoom({ isTutorial: true }))).toEqual([]);
  });

  it('returns empty array for physical room', () => {
    expect(computeAllXpAwards(makeRoom({ mode: 'physical' }))).toEqual([]);
  });

  it('returns empty array for null room', () => {
    expect(computeAllXpAwards(null)).toEqual([]);
  });

  it('returns one entry per eligible player', () => {
    const room = makeRoom({ lastAction: { winnerId: 'user-a' } });
    const awards = computeAllXpAwards(room);
    expect(awards).toHaveLength(2);
    const awardA = awards.find(a => a.userId === 'user-a');
    const awardB = awards.find(a => a.userId === 'user-b');
    expect(awardA.xpEarned).toBe(XP_PARTICIPATION + XP_WIN_BONUS);
    expect(awardB.xpEarned).toBe(XP_PARTICIPATION);
  });

  it('excludes bots from awards', () => {
    const room = makeRoom({
      players: [
        { id: 'user-a', isBot: false, riskLevel: 1 },
        { id: 'bot:1',  isBot: true,  riskLevel: 1 },
      ],
      lastAction: { winnerId: null },
    });
    const awards = computeAllXpAwards(room);
    expect(awards).toHaveLength(1);
    expect(awards[0].userId).toBe('user-a');
  });

  it('excludes guests from awards', () => {
    const room = makeRoom({
      players: [
        { id: 'user-a',      isBot: false, riskLevel: 1 },
        { id: 'guest:xyz',   isBot: false, riskLevel: 1 },
      ],
      lastAction: { winnerId: null },
    });
    const awards = computeAllXpAwards(room);
    expect(awards).toHaveLength(1);
    expect(awards[0].userId).toBe('user-a');
  });

  it('returns empty when all players are bots/guests', () => {
    const room = makeRoom({
      players: [
        { id: 'bot:1',     isBot: true,  riskLevel: 1 },
        { id: 'guest:abc', isBot: false, riskLevel: 1 },
      ],
      lastAction: { winnerId: null },
    });
    expect(computeAllXpAwards(room)).toEqual([]);
  });

  it('each award has a positive xpEarned', () => {
    const room = makeRoom();
    const awards = computeAllXpAwards(room);
    for (const { xpEarned } of awards) {
      expect(xpEarned).toBeGreaterThan(0);
    }
  });
});
