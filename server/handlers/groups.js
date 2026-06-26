// ============================================================
// HANDLERS - Persistent groups (FR1-P1)
// ============================================================

const engine = require('../gameEngine');
const { rooms, saveRoom } = require('../lib/state');
const { broadcastRoomState, emitHostChanged } = require('../lib/broadcast');
const { getGroupAuthError, maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { tierRank } = require('../groupsRepo');
const { socketRateLimit } = require('../lib/rateLimiter');

// §3.3 - live pre-room occupancy for the groups directory. Reads the in-memory
// room (if any) backing a group so the directory can show who is already
// waiting BEFORE an outside member commits to entering. Returns null when no
// live room exists yet for the group.
function buildLiveRoom(groupId) {
  if (!groupId) return null;
  for (const room of rooms.values()) {
    if (room.groupId !== groupId) continue;
    const players = Array.isArray(room.players) ? room.players : [];
    return {
      playerCount: players.length,
      phase: room.phase,
      inLobby: room.phase === 'lobby',
      players: players.map(p => ({ id: p.id, username: p.username, status: p.status })),
    };
  }
  return null;
}

function register(io, socket, deps) {
  const { groupsRepo, leaderboardRepo } = deps;

  // Phase 6 - a user's current progression tier (from their stored XP). Defaults
  // to Streets on any lookup failure (the safest, lowest tier).
  async function deriveTier(userId) {
    try {
      return engine.tierForLevel(await leaderboardRepo.getLevel(userId));
    } catch {
      return 'streets';
    }
  }

  socket.on('create_group', async ({ name } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      // G2 - a group is bound to the creator's current tier; the client can't
      // pick a different one.
      const requiredTier = await deriveTier(socket.userId);
      const group = await groupsRepo.createGroup({
        hostUserId: socket.userId,
        name,
        requiredTier,
      });
      callback?.({ success: true, group });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('list_my_groups', async (_payload = {}, callback) => {
    if (!socketRateLimit(socket, 'list_my_groups', 10, 30_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const groups = await groupsRepo.listMyGroups({ userId: socket.userId });
      // §3.3 - attach live pre-room occupancy + subscribe this socket to each
      // group channel so the directory receives push `group_room_status` updates
      // while it's open (no need to re-poll to see players gathering).
      const withLive = (groups || []).map((g) => {
        socket.join(`group:${g.id}`);
        return { ...g, liveRoom: buildLiveRoom(g.id) };
      });
      callback?.({ success: true, groups: withLive });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('get_group', async ({ groupId } = {}, callback) => {
    if (!socketRateLimit(socket, 'get_group', 20, 30_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const group = await groupsRepo.getGroup({
        groupId,
        userId: socket.userId,
      });
      socket.join(`group:${group.id}`);

      // Phase 6 (G5) - surface owner tier-mismatch so the client can show the
      // resolution panel and block new games. Member tiers (for the handover
      // candidates + eviction preview) are only resolved when there IS a
      // mismatch, to avoid an N-read fan-out on every group open.
      const requiredTier = group.requiredTier || 'streets';
      const ownerTier = await deriveTier(group.ownerUserId);
      const ownerTierMismatch = ownerTier !== requiredTier;
      let members = group.members;
      if (ownerTierMismatch) {
        members = await Promise.all((group.members || []).map(async (m) => {
          const tier = await deriveTier(m.userId);
          return { ...m, tier, tierMatches: tier === requiredTier };
        }));
      }

      callback?.({
        success: true,
        group: {
          ...group,
          members,
          ownerTier,
          ownerTierMismatch,
          liveRoom: buildLiveRoom(group.id),
        },
      });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('get_group_leaderboard', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });

      const group = await groupsRepo.getActiveGroupById(groupId);
      if (!group) {
        return callback?.({ success: false, error: 'not_a_group_member' });
      }

      const isMember = await groupsRepo.isGroupMember(groupId, socket.userId);
      if (!isMember) {
        return callback?.({ success: false, error: 'not_a_group_member' });
      }

      const leaderboard = await leaderboardRepo.getLeaderboard(groupId);
      callback?.({ success: true, leaderboard });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('delete_group', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      await groupsRepo.deleteGroup({
        groupId,
        hostUserId: socket.userId,
      });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Point any live rooms for this group at the new acting host so in-game
  // host controls follow the stand-in / reclaim / hand-back. #145
  // `reason` ('standin' | 'reclaimed') drives the #183 host_changed toast.
  async function syncLiveRoomHosts(groupId, newHostUserId, reason) {
    for (const room of rooms.values()) {
      if (room.groupId !== groupId) continue;
      const nextHostPlayer = room.players.find((player) => player.id === newHostUserId);
      // #159 - appointing a stand-in ('standin') who is NOT seated in this room
      // must not force them in as its host: that would null hostSocketId and
      // leave a hostless room nobody present can run. Leave it on its existing
      // host until the stand-in actually joins (join_room then reconciles).
      //
      // A reclaim / hand-back ('reclaimed'), by contrast, returns the seat to
      // the PERMANENT owner, who is authoritative even while away - apply it
      // immediately so the old stand-in stops holding controls the instant the
      // owner takes them back. hostSocketId drops to null until the owner
      // (re)joins; join_room / host_reconnect reattaches their socket then.
      if (reason === 'standin' && !nextHostPlayer) continue;
      room.hostUserId = newHostUserId;
      engine.reconcileHostSocket(room); // hostSocketId follows hostUserId (null if away)
      await saveRoom(room);
      await broadcastRoomState(io, room.code);
      // #183 - room_state already moves the host controls; this dedicated event
      // is what every client toasts so the table knows who now holds them.
      // emitHostChanged no-ops without a hostName, so an absent reclaiming owner
      // simply doesn't toast (the room_state push already moved amHost).
      emitHostChanged(io, room.code, {
        hostId: newHostUserId,
        hostName: nextHostPlayer?.username || null,
        reason,
      });
    }
  }

  // #156 - When a member is removed from a group, evict them from any live
  // room for that group immediately rather than leaving them seated until a
  // manual refresh. Mirrors syncLiveRoomHosts (iterate rooms by groupId,
  // mutate, saveRoom + broadcastRoomState) and the 30s disconnect
  // auto-eliminate behaviour: lobby → free the seat; mid-game → eliminate +
  // resolve any game-over the empty seat triggers. The removed player is
  // socket-pushed `removed_from_group` so their client toasts and exits to
  // the landing screen.
  async function bootRemovedMemberFromRooms(groupId, userId) {
    for (const room of rooms.values()) {
      if (room.groupId !== groupId) continue;
      const player = room.players.find((p) => p.id === userId);
      if (!player) continue;

      // Push the removed player's own client out of the room.
      if (player.socketId) {
        io.to(player.socketId).emit('removed_from_group', {
          groupId,
          reason: 'You were removed from the group.',
        });
      }

      // Defensive: removeMember already blocks evicting the acting host, but
      // if the removed player is somehow this room's host there's no valid
      // host left to run it - end the room for everyone.
      if (room.hostUserId === userId) {
        io.to(room.code).emit('game_ended', { reason: 'The host left the game.' });
        rooms.delete(room.code);
        continue;
      }

      if (room.phase === 'lobby') {
        const idx = room.players.findIndex((p) => p.id === userId);
        if (idx !== -1) room.players.splice(idx, 1);
      } else if (player.status === 'alive') {
        engine.eliminatePlayer(room, userId);
        room.lastAction = {
          type: 'removed_from_group',
          playerId: userId,
          playerName: player.username,
        };
        const winner = engine.checkGameOver(room);
        if (winner) {
          room.phase = 'game_over';
          room.lastAction = engine.buildGameOverLastAction(winner);
          engine.markDualWinners(room, winner);
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
        }
      }

      await saveRoom(room);
      await broadcastRoomState(io, room.code);
    }
  }

  socket.on('transfer_host', async ({ groupId, newHostUserId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const result = await groupsRepo.transferHost({
        groupId,
        hostUserId: socket.userId,
        newHostUserId,
      });
      await syncLiveRoomHosts(groupId, result.hostUserId, 'standin');
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // #145 - original owner reclaims acting host from a stand-in.
  socket.on('reclaim_host', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const result = await groupsRepo.reclaimHost({ groupId, userId: socket.userId });
      await syncLiveRoomHosts(groupId, result.hostUserId, 'reclaimed');
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // #145 - acting stand-in hands host back to the owner.
  socket.on('hand_back_host', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const result = await groupsRepo.handBackHost({ groupId, userId: socket.userId });
      await syncLiveRoomHosts(groupId, result.hostUserId, 'reclaimed');
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Phase 6 (G5) - owner tier-mismatch resolution ──────────────────────────

  // (a) Hand permanent ownership to a member who currently matches the group's
  // tier. The handler verifies the candidate's live tier before the repo moves
  // owner_user_id.
  socket.on('transfer_ownership', async ({ groupId, newOwnerUserId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });

      const group = await groupsRepo.getActiveGroupById(groupId);
      if (!group) return callback?.({ success: false, error: 'Group not found' });
      if (group.owner_user_id !== socket.userId) {
        return callback?.({ success: false, error: 'Only the group owner can hand over ownership' });
      }
      const requiredTier = group.required_tier || 'streets';
      const candidateTier = await deriveTier(newOwnerUserId);
      if (candidateTier !== requiredTier) {
        return callback?.({
          success: false,
          error: `New owner must be a ${requiredTier} player to run this crew.`,
        });
      }

      const result = await groupsRepo.transferOwnership({
        groupId,
        ownerUserId: socket.userId,
        newOwnerUserId,
      });
      await syncLiveRoomHosts(groupId, result.hostUserId, 'reclaimed');
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // (b) Re-tier the group up to the owner's new tier. Evicts members below the
  // new tier (the handler resolves each member's live tier) and boots them from
  // any live room.
  socket.on('regroup_retier', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });

      const group = await groupsRepo.getActiveGroupById(groupId);
      if (!group) return callback?.({ success: false, error: 'Group not found' });
      if (group.owner_user_id !== socket.userId) {
        return callback?.({ success: false, error: 'Only the group owner can re-tier this group' });
      }
      const newTier = await deriveTier(socket.userId);

      // Resolve which members fall below the new tier so the repo can evict them.
      const members = await groupsRepo.getGroup({ groupId, userId: socket.userId });
      const evictUserIds = [];
      for (const m of members.members || []) {
        if (m.userId === socket.userId) continue;
        const memberTier = await deriveTier(m.userId);
        if (tierRank(memberTier) < tierRank(newTier)) {
          evictUserIds.push(m.userId);
        }
      }

      const result = await groupsRepo.setGroupTier({
        groupId,
        ownerUserId: socket.userId,
        newTier,
        evictUserIds,
      });
      for (const userId of result.evicted) {
        await bootRemovedMemberFromRooms(groupId, userId);
      }
      callback?.({ success: true, requiredTier: result.requiredTier, evicted: result.evicted });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('invite_to_group', async ({ groupId, identifier } = {}, callback) => {
    if (!socketRateLimit(socket, 'invite_to_group', 5, 60_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const invite = await groupsRepo.inviteToGroup({
        groupId,
        hostUserId: socket.userId,
        identifier,
      });
      callback?.({ success: true, invite });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('list_my_invites', async (_payload = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const invites = await groupsRepo.listMyInvites({ userId: socket.userId });
      callback?.({ success: true, invites });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('respond_to_invite', async ({ inviteId, accept } = {}, callback) => {
    if (!socketRateLimit(socket, 'respond_to_invite', 10, 60_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      // G3 - accepting an invite is tier-gated; the joiner must match the
      // group's bound tier. Declining never needs the tier.
      const joinerTier = accept ? await deriveTier(socket.userId) : null;
      const result = await groupsRepo.respondToInvite({
        inviteId,
        inviteeUserId: socket.userId,
        accept: !!accept,
        joinerTier,
      });
      callback?.(result);
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('revoke_invite', async ({ inviteId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      await groupsRepo.revokeInvite({
        inviteId,
        hostUserId: socket.userId,
      });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('remove_member', async ({ groupId, userId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      await groupsRepo.removeMember({
        groupId,
        hostUserId: socket.userId,
        userId,
      });
      await bootRemovedMemberFromRooms(groupId, userId);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('leave_group', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      await groupsRepo.leaveGroup({
        groupId,
        userId: socket.userId,
      });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
