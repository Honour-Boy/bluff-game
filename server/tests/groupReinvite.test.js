import { describe, it, expect } from 'vitest';
import { createGroupsRepo } from '../groupsRepo.js';

const GROUP_ID = '00000000-0000-0000-0000-0000000000aa';
const HOST_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

// Minimal thenable query-builder mock that records every terminal call so we
// can assert which tables were written to. Filters are applied to seeded rows
// for the read paths the repo relies on (groups, group_members, profiles).
function makeSupabaseMock(seed) {
  const calls = [];
  const data = {
    groups: seed.groups || [],
    group_members: seed.group_members || [],
    group_invites: seed.group_invites || [],
    profiles: seed.profiles || [],
  };

  function from(table) {
    const state = { table, op: 'select', filters: [] };
    const builder = {
      select() { state.op = 'select'; return builder; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      delete() { state.op = 'delete'; return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      is(col, val) { state.filters.push([col, val]); return builder; },
      in(col, vals) { state.filters.push([col, vals, 'in']); return builder; },
      ilike(col, val) { state.filters.push([col, val, 'ilike']); return builder; },
      limit() { return builder; },
      single() { state.single = true; return builder; },
      then(resolve, reject) {
        calls.push({ table: state.table, op: state.op, filters: state.filters });
        const matches = (data[state.table] || []).filter((row) =>
          state.filters.every(([col, val, kind]) => {
            if (kind === 'in') return val.includes(row[col]);
            if (val === null) return row[col] == null;
            return row[col] === val;
          })
        );
        let result;
        if (state.op === 'select') {
          result = state.single ? (matches[0] || null) : matches;
        } else {
          // mutate the in-memory store so follow-up reads see the change
          if (state.op === 'delete') {
            data[state.table] = (data[state.table] || []).filter((row) => !matches.includes(row));
          }
          result = null;
        }
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return { client: { from }, calls, data };
}

function deleteCallsOn(calls, table) {
  return calls.filter((c) => c.table === table && c.op === 'delete');
}

describe('issue #144 — rejoin after removal clears stale invites', () => {
  it('removeMember deletes the member row AND their group_invites history', async () => {
    const { client, calls, data } = makeSupabaseMock({
      groups: [{ id: GROUP_ID, host_user_id: HOST_ID, deleted_at: null, code: 'ABC234', name: 'G' }],
      group_members: [
        { group_id: GROUP_ID, user_id: HOST_ID, role: 'host' },
        { group_id: GROUP_ID, user_id: MEMBER_ID, role: 'member' },
      ],
      // a previously-accepted invite is the row that would otherwise collide
      group_invites: [{ id: 'inv-1', group_id: GROUP_ID, invitee_user_id: MEMBER_ID, status: 'accepted' }],
    });
    const repo = createGroupsRepo(client);

    await repo.removeMember({ groupId: GROUP_ID, hostUserId: HOST_ID, userId: MEMBER_ID });

    expect(deleteCallsOn(calls, 'group_members').length).toBe(1);
    const inviteDeletes = deleteCallsOn(calls, 'group_invites');
    expect(inviteDeletes.length).toBe(1);
    expect(inviteDeletes[0].filters).toContainEqual(['group_id', GROUP_ID]);
    expect(inviteDeletes[0].filters).toContainEqual(['invitee_user_id', MEMBER_ID]);
    // the stale accepted invite is gone, so a future re-invite + accept won't collide
    expect(data.group_invites).toHaveLength(0);
  });

  it('leaveGroup (non-host) also clears the leaver\'s invite history', async () => {
    const { client, calls, data } = makeSupabaseMock({
      groups: [{ id: GROUP_ID, host_user_id: HOST_ID, deleted_at: null, code: 'ABC234', name: 'G' }],
      group_members: [
        { group_id: GROUP_ID, user_id: HOST_ID, role: 'host' },
        { group_id: GROUP_ID, user_id: MEMBER_ID, role: 'member' },
      ],
      group_invites: [{ id: 'inv-1', group_id: GROUP_ID, invitee_user_id: MEMBER_ID, status: 'accepted' }],
    });
    const repo = createGroupsRepo(client);

    await repo.leaveGroup({ groupId: GROUP_ID, userId: MEMBER_ID });

    expect(deleteCallsOn(calls, 'group_invites').length).toBe(1);
    expect(data.group_invites).toHaveLength(0);
  });
});
