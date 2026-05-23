// ============================================================
// HANDLERS — Persistent groups (FR1-P1)
// ============================================================

const engine = require('../gameEngine');
const { rooms, saveRoom } = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const { getGroupAuthError, maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { socketRateLimit } = require('../lib/rateLimiter');

function register(io, socket, deps) {
  const { groupsRepo, leaderboardRepo } = deps;

  socket.on('create_group', async ({ name } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const group = await groupsRepo.createGroup({
        hostUserId: socket.userId,
        name,
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
      callback?.({ success: true, groups });
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
      callback?.({ success: true, group });
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
  async function syncLiveRoomHosts(groupId, newHostUserId) {
    for (const room of rooms.values()) {
      if (room.groupId !== groupId) continue;
      room.hostUserId = newHostUserId;
      const nextHostPlayer = room.players.find((player) => player.id === newHostUserId);
      room.hostSocketId = nextHostPlayer?.socketId || null;
      await saveRoom(room);
      await broadcastRoomState(io, room.code);
    }
  }

  // #156 — When a member is removed from a group, evict them from any live
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
      // host left to run it — end the room for everyone.
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
          room.lastAction = { type: 'game_over', winnerId: winner.id, winnerName: winner.username };
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
      await syncLiveRoomHosts(groupId, result.hostUserId);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // #145 — original owner reclaims acting host from a stand-in.
  socket.on('reclaim_host', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const result = await groupsRepo.reclaimHost({ groupId, userId: socket.userId });
      await syncLiveRoomHosts(groupId, result.hostUserId);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // #145 — acting stand-in hands host back to the owner.
  socket.on('hand_back_host', async ({ groupId } = {}, callback) => {
    try {
      const authError = getGroupAuthError(socket);
      if (authError) return callback?.({ success: false, error: authError });
      const result = await groupsRepo.handBackHost({ groupId, userId: socket.userId });
      await syncLiveRoomHosts(groupId, result.hostUserId);
      callback?.({ success: true });
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
      const result = await groupsRepo.respondToInvite({
        inviteId,
        inviteeUserId: socket.userId,
        accept: !!accept,
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
