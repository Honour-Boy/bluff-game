import { describe, it, expect, vi } from 'vitest';
import {
  generateGroupCodeCandidate,
  pickUniqueGroupCode,
  applyHostTransferRoles,
  evaluateLeaveGroup,
  GROUP_CODE_LENGTH,
  GROUP_MEMBER_LIMIT,
} from '../groupsRepo.js';

describe('generateGroupCodeCandidate', () => {
  it('creates a 6-character code without ambiguous characters', () => {
    const code = generateGroupCodeCandidate(() => 0);
    expect(code).toHaveLength(GROUP_CODE_LENGTH);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    expect(code.includes('0')).toBe(false);
    expect(code.includes('O')).toBe(false);
    expect(code.includes('I')).toBe(false);
    expect(code.includes('1')).toBe(false);
  });
});

describe('pickUniqueGroupCode', () => {
  it('retries collisions until it finds a free code', async () => {
    const seen = [];
    const randomValues = [
      0, 0, 0, 0, 0, 0,
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ];
    let idx = 0;
    const code = await pickUniqueGroupCode(async (candidate) => {
      seen.push(candidate);
      return seen.length === 1;
    }, {
      random: () => randomValues[idx++],
      maxAttempts: 5,
    });

    expect(seen).toHaveLength(2);
    expect(code).toBe(seen[1]);
  });

  it('throws after max attempts are exhausted', async () => {
    await expect(
      pickUniqueGroupCode(async () => true, { maxAttempts: 2, random: () => 0 }),
    ).rejects.toThrow(/unique group code/i);
  });
});

describe('applyHostTransferRoles', () => {
  it('promotes the target member to host and demotes the previous host', () => {
    const next = applyHostTransferRoles([
      { user_id: 'host-1', role: 'host' },
      { user_id: 'member-2', role: 'member' },
    ], 'member-2');

    expect(next).toEqual([
      { user_id: 'host-1', role: 'member' },
      { user_id: 'member-2', role: 'host' },
    ]);
  });

  it('rejects transfers to non-members', () => {
    expect(() => applyHostTransferRoles([
      { user_id: 'host-1', role: 'host' },
    ], 'missing')).toThrow(/already be a group member/i);
  });
});

describe('evaluateLeaveGroup', () => {
  it('allows a normal member to leave', () => {
    expect(evaluateLeaveGroup({ isHost: false, otherMemberCount: 99 })).toEqual({
      ok: true,
      action: 'leave',
    });
  });

  it('refuses a host leaving while members remain', () => {
    expect(evaluateLeaveGroup({ isHost: true, otherMemberCount: 1 })).toEqual({
      ok: false,
      error: 'Host cannot leave while other members remain',
    });
  });

  it('allows a lone host to leave by deleting the group', () => {
    expect(evaluateLeaveGroup({ isHost: true, otherMemberCount: 0 })).toEqual({
      ok: true,
      action: 'delete_group',
    });
  });
});

describe('GROUP_MEMBER_LIMIT', () => {
  it('locks the chosen hard cap for P1', () => {
    expect(GROUP_MEMBER_LIMIT).toBe(100);
  });
});
