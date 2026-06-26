import { describe, it, expect, vi } from 'vitest';
import {
  normalizeTier,
  tierRank,
  tierLabel,
  tierMismatchMessage,
  createGroupsRepo,
  VALID_TIERS,
} from '../groupsRepo.js';
import { buildPersistentGroupRoom } from '../lib/roomBuilders.js';
import { defaultRoomConfig } from '../gameEngine.js';

// ─── G4 — group room caps ─────────────────────────────────────────────────────

describe('buildPersistentGroupRoom (G4 tier caps)', () => {
  function powersOnSettings() {
    const cfg = defaultRoomConfig();
    cfg.powerCards.enabled.shield = true;
    cfg.systems.betting = true;
    return { payload: cfg, updatedAt: null, updatedByUserId: null, updatedByUsername: null };
  }

  it('stamps room.tier from the group and caps Streets settings off', () => {
    const room = buildPersistentGroupRoom(
      { id: 'g1', code: 'GRP111', host_user_id: OWNER, required_tier: 'streets' },
      { settingsRecord: powersOnSettings() },
    );
    expect(room.tier).toBe('streets');
    expect(room.bloodDebtActive).toBe(false);
    expect(room.config.powerCards.enabled.shield).toBe(false);
    expect(room.config.systems.betting).toBe(false);
  });

  it('preserves powers + forces secret roles on + Blood Debt for Covenant', () => {
    const room = buildPersistentGroupRoom(
      { id: 'g2', code: 'GRP222', host_user_id: OWNER, required_tier: 'covenant' },
      { settingsRecord: powersOnSettings() },
    );
    expect(room.tier).toBe('covenant');
    expect(room.config.powerCards.enabled.shield).toBe(true);
    expect(room.config.systems.betting).toBe(true);
    expect(room.config.secretRoles).toBe(true);
    expect(room.bloodDebtActive).toBe(true);
  });

  it('defaults an absent required_tier to Streets', () => {
    const room = buildPersistentGroupRoom(
      { id: 'g3', code: 'GRP333', host_user_id: OWNER },
      { settingsRecord: powersOnSettings() },
    );
    expect(room.tier).toBe('streets');
    expect(room.config.powerCards.enabled.shield).toBe(false);
  });
});

// ─── Pure tier helpers (Phase 6) ──────────────────────────────────────────────

describe('normalizeTier', () => {
  it('passes through valid tiers and clamps anything else to streets', () => {
    for (const t of VALID_TIERS) expect(normalizeTier(t)).toBe(t);
    expect(normalizeTier('bogus')).toBe('streets');
    expect(normalizeTier(undefined)).toBe('streets');
    expect(normalizeTier(null)).toBe('streets');
  });
});

describe('tierRank', () => {
  it('orders streets < backroads < syndicate < covenant', () => {
    expect(tierRank('streets')).toBe(0);
    expect(tierRank('backroads')).toBe(1);
    expect(tierRank('syndicate')).toBe(2);
    expect(tierRank('covenant')).toBe(3);
    expect(tierRank('bogus')).toBe(0);
  });
});

describe('tierMismatchMessage', () => {
  it('names both tiers', () => {
    expect(tierMismatchMessage('backroads', 'streets'))
      .toBe("This crew runs Backroads stakes — you're Streets.");
    expect(tierLabel('covenant')).toBe('Covenant');
  });
});

// ─── Repo behaviour with a minimal fake supabase ──────────────────────────────
// A tiny query-builder stub that records inserts/updates and returns canned
// rows. Each `.from(table)` call returns a thenable builder; the test wires the
// resolved value per table.

function makeFakeSupabase(handlers = {}) {
  function builder(table) {
    const state = { table, op: 'select', filters: {}, payload: null };
    const api = {
      select() { return api; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
      update(payload) { state.op = 'update'; state.payload = payload; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      is(col, val) { state.filters[`${col}__is`] = val; return api; },
      ilike() { return api; },
      in() { return api; },
      limit() { return api; },
      maybeSingle() { return api; },
      single() { return api; },
      then(resolve, reject) {
        const h = handlers[table];
        const result = typeof h === 'function' ? h(state) : (h || { data: null, error: null });
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return api;
  }
  return { from: builder };
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';

describe('groupsRepo.setGroupTier (G5 re-tier)', () => {
  it('rejects a non-upward re-tier', async () => {
    const supabase = makeFakeSupabase({
      groups: () => ({ data: [{ id: 'g1', owner_user_id: OWNER, required_tier: 'syndicate', deleted_at: null }], error: null }),
    });
    const repo = createGroupsRepo(supabase);
    await expect(repo.setGroupTier({ groupId: 'g1', ownerUserId: OWNER, newTier: 'backroads' }))
      .rejects.toThrow(/upward/i);
  });

  it('rejects when the requester is not the owner', async () => {
    const supabase = makeFakeSupabase({
      groups: () => ({ data: [{ id: 'g1', owner_user_id: OWNER, required_tier: 'streets', deleted_at: null }], error: null }),
    });
    const repo = createGroupsRepo(supabase);
    await expect(repo.setGroupTier({ groupId: 'g1', ownerUserId: MEMBER, newTier: 'backroads' }))
      .rejects.toThrow(/owner/i);
  });

  it('re-tiers upward and evicts the listed members (never the owner)', async () => {
    const deletes = [];
    const supabase = makeFakeSupabase({
      groups: (s) => {
        if (s.op === 'update') return { data: [{}], error: null };
        return { data: [{ id: 'g1', owner_user_id: OWNER, required_tier: 'streets', deleted_at: null }], error: null };
      },
      group_members: (s) => { if (s.op === 'delete') deletes.push(s.filters.user_id); return { data: [], error: null }; },
      group_invites: () => ({ data: [], error: null }),
    });
    const repo = createGroupsRepo(supabase);
    const res = await repo.setGroupTier({
      groupId: 'g1', ownerUserId: OWNER, newTier: 'backroads',
      evictUserIds: [MEMBER, OWNER],
    });
    expect(res.requiredTier).toBe('backroads');
    expect(res.evicted).toEqual([MEMBER]); // owner filtered out
    expect(deletes).toEqual([MEMBER]);
  });
});

describe('groupsRepo.respondToInvite (G3 join gate)', () => {
  it('blocks accepting an invite when the joiner tier mismatches', async () => {
    const supabase = makeFakeSupabase({
      group_invites: () => ({ data: [{ id: 'inv1', group_id: 'g1', invitee_user_id: MEMBER, status: 'pending' }], error: null }),
      groups: () => ({ data: [{ id: 'g1', owner_user_id: OWNER, required_tier: 'syndicate', deleted_at: null }], error: null }),
    });
    const repo = createGroupsRepo(supabase);
    await expect(repo.respondToInvite({ inviteId: 'inv1', inviteeUserId: MEMBER, accept: true, joinerTier: 'streets' }))
      .rejects.toThrow(/Syndicate stakes/);
  });

  it('allows declining regardless of tier', async () => {
    const supabase = makeFakeSupabase({
      group_invites: () => ({ data: [{ id: 'inv1', group_id: 'g1', invitee_user_id: MEMBER, status: 'pending' }], error: null }),
    });
    const repo = createGroupsRepo(supabase);
    const res = await repo.respondToInvite({ inviteId: 'inv1', inviteeUserId: MEMBER, accept: false, joinerTier: 'streets' });
    expect(res.success).toBe(true);
  });
});
