const GROUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP_CODE_LENGTH = 6;
const MAX_GROUP_CODE_ATTEMPTS = 5;
const GROUP_NAME_MAX = 64;
const GROUP_MEMBER_LIMIT = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeGroupName(raw) {
  const name = String(raw || '').trim();
  if (!name || name.length > GROUP_NAME_MAX) return null;
  return name;
}

function isPersistentUserId(userId) {
  return typeof userId === 'string' && UUID_RE.test(userId);
}

function generateGroupCodeCandidate(random = Math.random) {
  let out = '';
  for (let i = 0; i < GROUP_CODE_LENGTH; i++) {
    out += GROUP_CODE_CHARS[Math.floor(random() * GROUP_CODE_CHARS.length)];
  }
  return out;
}

async function pickUniqueGroupCode(codeExists, opts = {}) {
  const random = opts.random || Math.random;
  const maxAttempts = opts.maxAttempts || MAX_GROUP_CODE_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateGroupCodeCandidate(random);
    if (!await codeExists(code)) return code;
  }
  throw new Error('Failed to generate a unique group code');
}

function applyHostTransferRoles(members, newHostUserId) {
  let found = false;
  const next = members.map((member) => {
    const isNewHost = member.user_id === newHostUserId || member.userId === newHostUserId;
    if (isNewHost) found = true;
    return {
      ...member,
      role: isNewHost ? 'host' : 'member',
    };
  });
  if (!found) throw new Error('New host must already be a group member');
  return next;
}

function evaluateLeaveGroup({ isHost, otherMemberCount }) {
  if (!isHost) return { ok: true, action: 'leave' };
  if (otherMemberCount > 0) {
    return {
      ok: false,
      error: 'Host cannot leave while other members remain',
    };
  }
  return { ok: true, action: 'delete_group' };
}

function normalizeIdentifier(raw) {
  return String(raw || '').trim();
}

function identifierLooksLikeEmail(identifier) {
  return identifier.includes('@');
}

function mapById(rows, idKey = 'id') {
  return new Map((rows || []).map((row) => [row[idKey], row]));
}

function maybeSingle(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

function requireData(result, fallbackMessage) {
  if (result.error) throw result.error;
  return result.data ?? fallbackMessage ?? null;
}

function createGroupsRepo(supabase) {
  async function getActiveGroupByCode(code) {
    const result = await supabase
      .from('groups')
      .select('id, code, name, host_user_id, created_at, deleted_at')
      .eq('code', code)
      .is('deleted_at', null)
      .limit(1);
    return maybeSingle(requireData(result));
  }

  async function getActiveGroupById(groupId) {
    const result = await supabase
      .from('groups')
      .select('id, code, name, host_user_id, created_at, deleted_at')
      .eq('id', groupId)
      .is('deleted_at', null)
      .limit(1);
    return maybeSingle(requireData(result));
  }

  async function listGroupMembers(groupId) {
    const membersResult = await supabase
      .from('group_members')
      .select('group_id, user_id, role, joined_at')
      .eq('group_id', groupId);
    const members = requireData(membersResult) || [];
    const userIds = members.map((member) => member.user_id);
    const profilesResult = userIds.length
      ? await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds)
      : { data: [], error: null };
    const profiles = requireData(profilesResult) || [];
    const profilesById = mapById(profiles);
    return members.map((member) => ({
      userId: member.user_id,
      username: profilesById.get(member.user_id)?.username || 'Player',
      role: member.role,
      joinedAt: member.joined_at,
    }));
  }

  async function listPendingInvitesForGroup(groupId) {
    const invitesResult = await supabase
      .from('group_invites')
      .select('id, invitee_user_id, invited_by, status, created_at')
      .eq('group_id', groupId)
      .eq('status', 'pending');
    const invites = requireData(invitesResult) || [];
    const userIds = [...new Set(invites.flatMap((invite) => [invite.invitee_user_id, invite.invited_by]))];
    const profilesResult = userIds.length
      ? await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds)
      : { data: [], error: null };
    const profiles = requireData(profilesResult) || [];
    const profilesById = mapById(profiles);
    return invites.map((invite) => ({
      id: invite.id,
      inviteeUserId: invite.invitee_user_id,
      inviteeUsername: profilesById.get(invite.invitee_user_id)?.username || 'Player',
      invitedByUserId: invite.invited_by,
      invitedByUsername: profilesById.get(invite.invited_by)?.username || 'Player',
      status: invite.status,
      createdAt: invite.created_at,
    }));
  }

  async function getMembership(groupId, userId) {
    const result = await supabase
      .from('group_members')
      .select('group_id, user_id, role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .limit(1);
    return maybeSingle(requireData(result));
  }

  async function assertActiveMembership(groupId, userId) {
    const group = await getActiveGroupById(groupId);
    if (!group) throw new Error('Group not found');
    const membership = await getMembership(groupId, userId);
    if (!membership) throw new Error('Not a member of this group');
    return { group, membership };
  }

  async function assertActiveHost(groupId, userId) {
    const group = await getActiveGroupById(groupId);
    if (!group) throw new Error('Group not found');
    if (group.host_user_id !== userId) throw new Error('Not the host of this group');
    return group;
  }

  async function countMembers(groupId) {
    const result = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    return (requireData(result) || []).length;
  }

  async function findUserByUsername(identifier) {
    const result = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', identifier)
      .limit(2);
    const matches = requireData(result) || [];
    if (matches.length === 0) return null;
    if (matches.length > 1) throw new Error('Username is ambiguous');
    return {
      userId: matches[0].id,
      username: matches[0].username,
    };
  }

  async function findUserByEmail(identifier) {
    let page = 1;
    const perPage = 200;
    while (page <= 50) {
      const result = await supabase.auth.admin.listUsers({ page, perPage });
      if (result.error) throw result.error;
      const users = result.data?.users || [];
      const match = users.find((user) =>
        typeof user.email === 'string' && user.email.toLowerCase() === identifier.toLowerCase()
      );
      if (match) {
        const profileResult = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', match.id)
          .limit(1);
        const profile = maybeSingle(requireData(profileResult));
        return {
          userId: match.id,
          username:
            profile?.username
            || match.user_metadata?.username
            || match.user_metadata?.full_name
            || match.email?.split('@')[0]
            || 'Player',
        };
      }
      if (users.length < perPage) break;
      page += 1;
    }
    return null;
  }

  async function resolveIdentifierToUser(identifierRaw) {
    const identifier = normalizeIdentifier(identifierRaw);
    if (!identifier) throw new Error('Invite identifier is required');
    if (identifierLooksLikeEmail(identifier)) {
      return findUserByEmail(identifier);
    }
    return findUserByUsername(identifier);
  }

  async function createGroup({ hostUserId, name }) {
    if (!isPersistentUserId(hostUserId)) throw new Error('Groups require an authenticated account');
    const normalizedName = normalizeGroupName(name);
    if (!normalizedName) throw new Error('Group name must be between 1 and 64 characters');

    const code = await pickUniqueGroupCode(async (candidate) => {
      const existing = await getActiveGroupByCode(candidate);
      return !!existing;
    });

    const insertGroupResult = await supabase
      .from('groups')
      .insert({
        code,
        name: normalizedName,
        host_user_id: hostUserId,
      })
      .select('id, code, name, host_user_id')
      .single();
    const group = requireData(insertGroupResult);

    const memberResult = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: hostUserId,
        role: 'host',
      });
    requireData(memberResult);

    return {
      id: group.id,
      code: group.code,
      name: group.name,
      role: 'host',
    };
  }

  async function listMyGroups({ userId }) {
    if (!isPersistentUserId(userId)) throw new Error('Groups require an authenticated account');
    const membershipsResult = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', userId);
    const memberships = requireData(membershipsResult) || [];
    if (memberships.length === 0) return [];

    const groupIds = memberships.map((membership) => membership.group_id);
    const groupsResult = await supabase
      .from('groups')
      .select('id, code, name, host_user_id, created_at, deleted_at')
      .in('id', groupIds)
      .is('deleted_at', null);
    const groups = requireData(groupsResult) || [];
    const activeGroupsById = mapById(groups);

    const membersResult = await supabase
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds);
    const allMembers = requireData(membersResult) || [];
    const counts = allMembers.reduce((acc, member) => {
      acc.set(member.group_id, (acc.get(member.group_id) || 0) + 1);
      return acc;
    }, new Map());

    return memberships
      .filter((membership) => activeGroupsById.has(membership.group_id))
      .map((membership) => {
        const group = activeGroupsById.get(membership.group_id);
        return {
          id: group.id,
          code: group.code,
          name: group.name,
          role: membership.role,
          memberCount: counts.get(group.id) || 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getGroup({ groupId, userId }) {
    const { group, membership } = await assertActiveMembership(groupId, userId);
    const members = await listGroupMembers(groupId);
    const pendingInvites = await listPendingInvitesForGroup(groupId);
    return {
      id: group.id,
      code: group.code,
      name: group.name,
      role: membership.role,
      hostUserId: group.host_user_id,
      members,
      pendingInvites,
    };
  }

  async function deleteGroup({ groupId, hostUserId }) {
    await assertActiveHost(groupId, hostUserId);
    const updateResult = await supabase
      .from('groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', groupId)
      .is('deleted_at', null);
    requireData(updateResult);
    return { success: true };
  }

  async function transferHost({ groupId, hostUserId, newHostUserId }) {
    if (hostUserId === newHostUserId) return { success: true };
    await assertActiveHost(groupId, hostUserId);

    const membersResult = await supabase
      .from('group_members')
      .select('group_id, user_id, role')
      .eq('group_id', groupId);
    const members = requireData(membersResult) || [];
    const nextMembers = applyHostTransferRoles(members, newHostUserId);
    const previousHost = nextMembers.find((member) => member.user_id === hostUserId);
    const newHost = nextMembers.find((member) => member.user_id === newHostUserId);

    const updateGroupResult = await supabase
      .from('groups')
      .update({ host_user_id: newHostUserId })
      .eq('id', groupId)
      .is('deleted_at', null);
    requireData(updateGroupResult);

    const updateOldResult = await supabase
      .from('group_members')
      .update({ role: previousHost.role })
      .eq('group_id', groupId)
      .eq('user_id', hostUserId);
    requireData(updateOldResult);

    const updateNewResult = await supabase
      .from('group_members')
      .update({ role: newHost.role })
      .eq('group_id', groupId)
      .eq('user_id', newHostUserId);
    requireData(updateNewResult);

    return { success: true };
  }

  async function inviteToGroup({ groupId, hostUserId, identifier }) {
    await assertActiveHost(groupId, hostUserId);
    const invitee = await resolveIdentifierToUser(identifier);
    if (!invitee) throw new Error('User not found');
    if (invitee.userId === hostUserId) throw new Error('Host is already a member');

    const membership = await getMembership(groupId, invitee.userId);
    if (membership) throw new Error('User is already a member of this group');

    const pendingInviteResult = await supabase
      .from('group_invites')
      .select('id')
      .eq('group_id', groupId)
      .eq('invitee_user_id', invitee.userId)
      .eq('status', 'pending')
      .limit(1);
    const pendingInvite = maybeSingle(requireData(pendingInviteResult));
    if (pendingInvite) throw new Error('User already has a pending invite');

    const memberCount = await countMembers(groupId);
    if (memberCount >= GROUP_MEMBER_LIMIT) {
      throw new Error(`Group member limit reached (${GROUP_MEMBER_LIMIT})`);
    }

    const insertResult = await supabase
      .from('group_invites')
      .insert({
        group_id: groupId,
        invitee_user_id: invitee.userId,
        invited_by: hostUserId,
        status: 'pending',
      })
      .select('id')
      .single();
    const invite = requireData(insertResult);

    return {
      id: invite.id,
      inviteeUsername: invitee.username,
    };
  }

  async function listMyInvites({ userId }) {
    if (!isPersistentUserId(userId)) throw new Error('Groups require an authenticated account');
    const invitesResult = await supabase
      .from('group_invites')
      .select('id, group_id, invited_by, created_at')
      .eq('invitee_user_id', userId)
      .eq('status', 'pending');
    const invites = requireData(invitesResult) || [];
    if (invites.length === 0) return [];

    const groupIds = [...new Set(invites.map((invite) => invite.group_id))];
    const inviterIds = [...new Set(invites.map((invite) => invite.invited_by))];
    const groupsResult = await supabase
      .from('groups')
      .select('id, name, code, deleted_at')
      .in('id', groupIds);
    const groups = (requireData(groupsResult) || []).filter((group) => group.deleted_at == null);
    const groupsById = mapById(groups);
    const profilesResult = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', inviterIds);
    const invitersById = mapById(requireData(profilesResult) || []);

    return invites
      .filter((invite) => groupsById.has(invite.group_id))
      .map((invite) => ({
        id: invite.id,
        group: {
          id: groupsById.get(invite.group_id).id,
          name: groupsById.get(invite.group_id).name,
          code: groupsById.get(invite.group_id).code,
        },
        invitedByUsername: invitersById.get(invite.invited_by)?.username || 'Player',
        createdAt: invite.created_at,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function respondToInvite({ inviteId, inviteeUserId, accept }) {
    if (!isPersistentUserId(inviteeUserId)) throw new Error('Groups require an authenticated account');
    const inviteResult = await supabase
      .from('group_invites')
      .select('id, group_id, invitee_user_id, status')
      .eq('id', inviteId)
      .limit(1);
    const invite = maybeSingle(requireData(inviteResult));
    if (!invite || invite.invitee_user_id !== inviteeUserId) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('Invite is no longer pending');

    if (!accept) {
      const declineResult = await supabase
        .from('group_invites')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', inviteId)
        .eq('status', 'pending');
      requireData(declineResult);
      return { success: true };
    }

    const group = await getActiveGroupById(invite.group_id);
    if (!group) throw new Error('Group not found');

    const existingMembership = await getMembership(invite.group_id, inviteeUserId);
    if (!existingMembership) {
      const memberCount = await countMembers(invite.group_id);
      if (memberCount >= GROUP_MEMBER_LIMIT) {
        throw new Error(`Group member limit reached (${GROUP_MEMBER_LIMIT})`);
      }
      const insertMemberResult = await supabase
        .from('group_members')
        .insert({
          group_id: invite.group_id,
          user_id: inviteeUserId,
          role: 'member',
        });
      requireData(insertMemberResult);
    }

    const acceptResult = await supabase
      .from('group_invites')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', inviteId)
      .eq('status', 'pending');
    requireData(acceptResult);

    return {
      success: true,
      member: {
        groupId: invite.group_id,
        role: 'member',
      },
    };
  }

  async function revokeInvite({ inviteId, hostUserId }) {
    const inviteResult = await supabase
      .from('group_invites')
      .select('id, group_id, status')
      .eq('id', inviteId)
      .limit(1);
    const invite = maybeSingle(requireData(inviteResult));
    if (!invite) throw new Error('Invite not found');
    await assertActiveHost(invite.group_id, hostUserId);
    if (invite.status !== 'pending') throw new Error('Only pending invites can be revoked');

    const updateResult = await supabase
      .from('group_invites')
      .update({
        status: 'revoked',
        responded_at: new Date().toISOString(),
      })
      .eq('id', inviteId)
      .eq('status', 'pending');
    requireData(updateResult);
    return { success: true };
  }

  // When a membership ends (removed or voluntarily left) we also clear
  // that user's invite rows for the group. Otherwise the previously
  // 'accepted' invite lingers and a future re-invite + accept collides
  // with the (group_id, invitee_user_id, status) unique constraint,
  // surfacing as a "duplicate" error on rejoin. Issue #144.
  async function clearInviteHistory(groupId, userId) {
    const result = await supabase
      .from('group_invites')
      .delete()
      .eq('group_id', groupId)
      .eq('invitee_user_id', userId);
    requireData(result);
  }

  async function removeMember({ groupId, hostUserId, userId }) {
    await assertActiveHost(groupId, hostUserId);
    if (hostUserId === userId) throw new Error('Host cannot remove themselves');

    const membership = await getMembership(groupId, userId);
    if (!membership) throw new Error('Member not found');

    const deleteResult = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    requireData(deleteResult);

    await clearInviteHistory(groupId, userId);
    return { success: true };
  }

  async function leaveGroup({ groupId, userId }) {
    const { group, membership } = await assertActiveMembership(groupId, userId);
    const memberCount = await countMembers(groupId);
    const decision = evaluateLeaveGroup({
      isHost: membership.role === 'host' || group.host_user_id === userId,
      otherMemberCount: Math.max(0, memberCount - 1),
    });
    if (!decision.ok) throw new Error(decision.error);

    if (decision.action === 'delete_group') {
      await deleteGroup({ groupId, hostUserId: userId });
      return { success: true };
    }

    const deleteResult = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    requireData(deleteResult);

    await clearInviteHistory(groupId, userId);
    return { success: true };
  }

  async function isGroupMember(groupId, userId) {
    if (!isPersistentUserId(userId)) return false;
    const membership = await getMembership(groupId, userId);
    return !!membership;
  }

  return {
    GROUP_MEMBER_LIMIT,
    createGroup,
    listMyGroups,
    getGroup,
    deleteGroup,
    transferHost,
    inviteToGroup,
    listMyInvites,
    respondToInvite,
    revokeInvite,
    removeMember,
    leaveGroup,
    getActiveGroupByCode,
    getActiveGroupById,
    isGroupMember,
  };
}

module.exports = {
  GROUP_CODE_CHARS,
  GROUP_CODE_LENGTH,
  MAX_GROUP_CODE_ATTEMPTS,
  GROUP_MEMBER_LIMIT,
  normalizeGroupName,
  isPersistentUserId,
  generateGroupCodeCandidate,
  pickUniqueGroupCode,
  applyHostTransferRoles,
  evaluateLeaveGroup,
  createGroupsRepo,
};
