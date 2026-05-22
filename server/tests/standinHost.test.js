import { describe, it, expect } from 'vitest';
import { createGroupsRepo } from '../groupsRepo.js';

const GROUP_ID = '00000000-0000-0000-0000-0000000000aa';
const OWNER = '11111111-1111-1111-1111-111111111111';
const STANDIN = '22222222-2222-2222-2222-222222222222';
const THIRD = '33333333-3333-3333-3333-333333333333';

// Mock supabase query-builder that mutates an in-memory store on
// update/delete/insert so follow-up reads observe the change.
function makeSupabaseMock(seed) {
  const data = {
    groups: (seed.groups || []).map((r) => ({ ...r })),
    group_members: (seed.group_members || []).map((r) => ({ ...r })),
    group_invites: (seed.group_invites || []).map((r) => ({ ...r })),
    profiles: (seed.profiles || []).map((r) => ({ ...r })),
  };
  function from(table) {
    const state = { table, op: 'select', filters: [], payload: null, single: false };
    const matches = () =>
      (data[state.table] || []).filter((row) =>
        state.filters.every(([col, val, kind]) =>
          kind === 'in' ? val.includes(row[col]) : val === null ? row[col] == null : row[col] === val
        )
      );
    const builder = {
      select() { return builder; },
      insert(p) { state.op = 'insert'; state.payload = p; return builder; },
      update(p) { state.op = 'update'; state.payload = p; return builder; },
      delete() { state.op = 'delete'; return builder; },
      eq(c, v) { state.filters.push([c, v]); return builder; },
      is(c, v) { state.filters.push([c, v]); return builder; },
      in(c, v) { state.filters.push([c, v, 'in']); return builder; },
      ilike(c, v) { state.filters.push([c, v, 'ilike']); return builder; },
      limit() { return builder; },
      single() { state.single = true; return builder; },
      then(resolve, reject) {
        const rows = matches();
        let result = null;
        if (state.op === 'select') result = state.single ? (rows[0] || null) : rows;
        else if (state.op === 'update') rows.forEach((row) => Object.assign(row, state.payload));
        else if (state.op === 'delete') data[state.table] = (data[state.table] || []).filter((r) => !rows.includes(r));
        else if (state.op === 'insert') {
          const incoming = Array.isArray(state.payload) ? state.payload : [state.payload];
          data[state.table].push(...incoming.map((r) => ({ ...r })));
        }
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { client: { from }, data };
}

function seedGroup() {
  return {
    groups: [{ id: GROUP_ID, code: 'ABC234', name: 'G', host_user_id: OWNER, owner_user_id: OWNER, deleted_at: null }],
    group_members: [
      { group_id: GROUP_ID, user_id: OWNER, role: 'host' },
      { group_id: GROUP_ID, user_id: STANDIN, role: 'member' },
    ],
  };
}

const group = (data) => data.groups[0];
const roleOf = (data, uid) => data.group_members.find((m) => m.user_id === uid)?.role;

describe('issue #145 — temporary stand-in host', () => {
  it('transferHost appoints a stand-in without changing the permanent owner', async () => {
    const { client, data } = makeSupabaseMock(seedGroup());
    const repo = createGroupsRepo(client);

    await repo.transferHost({ groupId: GROUP_ID, hostUserId: OWNER, newHostUserId: STANDIN });

    expect(group(data).host_user_id).toBe(STANDIN);   // acting host moved
    expect(group(data).owner_user_id).toBe(OWNER);     // owner preserved
    expect(roleOf(data, STANDIN)).toBe('host');
    expect(roleOf(data, OWNER)).toBe('member');
  });

  it('owner can reclaim host back from the stand-in', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    seed.group_members = [
      { group_id: GROUP_ID, user_id: OWNER, role: 'member' },
      { group_id: GROUP_ID, user_id: STANDIN, role: 'host' },
    ];
    const { client, data } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await repo.reclaimHost({ groupId: GROUP_ID, userId: OWNER });

    expect(group(data).host_user_id).toBe(OWNER);
    expect(roleOf(data, OWNER)).toBe('host');
    expect(roleOf(data, STANDIN)).toBe('member');
  });

  it('only the owner may reclaim host', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    const { client } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await expect(repo.reclaimHost({ groupId: GROUP_ID, userId: STANDIN }))
      .rejects.toThrow(/only the group owner/i);
  });

  it('stand-in can hand host back to the owner', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    seed.group_members = [
      { group_id: GROUP_ID, user_id: OWNER, role: 'member' },
      { group_id: GROUP_ID, user_id: STANDIN, role: 'host' },
    ];
    const { client, data } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await repo.handBackHost({ groupId: GROUP_ID, userId: STANDIN });

    expect(group(data).host_user_id).toBe(OWNER);
    expect(roleOf(data, OWNER)).toBe('host');
  });

  it('only the acting host may hand back', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    const { client } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await expect(repo.handBackHost({ groupId: GROUP_ID, userId: OWNER }))
      .rejects.toThrow(/only the acting host/i);
  });

  it('when a stand-in leaves, host reverts to the owner and the stand-in is removed', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    seed.group_members = [
      { group_id: GROUP_ID, user_id: OWNER, role: 'member' },
      { group_id: GROUP_ID, user_id: STANDIN, role: 'host' },
      { group_id: GROUP_ID, user_id: THIRD, role: 'member' },
    ];
    const { client, data } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await repo.leaveGroup({ groupId: GROUP_ID, userId: STANDIN });

    expect(group(data).host_user_id).toBe(OWNER);
    expect(roleOf(data, OWNER)).toBe('host');
    expect(data.group_members.some((m) => m.user_id === STANDIN)).toBe(false);
  });

  it('a stand-in cannot remove the permanent owner', async () => {
    const seed = seedGroup();
    seed.groups[0].host_user_id = STANDIN;
    seed.group_members = [
      { group_id: GROUP_ID, user_id: OWNER, role: 'member' },
      { group_id: GROUP_ID, user_id: STANDIN, role: 'host' },
    ];
    const { client } = makeSupabaseMock(seed);
    const repo = createGroupsRepo(client);

    await expect(repo.removeMember({ groupId: GROUP_ID, hostUserId: STANDIN, userId: OWNER }))
      .rejects.toThrow(/cannot remove the group owner/i);
  });
});
