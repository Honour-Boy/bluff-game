import { useCallback } from 'react';

function emitPromiseAction(socket, eventName, payload, onSuccess, onFailure) {
  return new Promise((resolve) => {
    socket.emit(eventName, payload, (res) => {
      if (!res?.success) onFailure(res);
      else onSuccess?.(res);
      resolve(res);
    });
  });
}

export function useGroupActions({
  socket,
  failError,
  setError,
  leaderboardCacheRef,
  leaderboardTtlMs,
}) {
  const createGroup = useCallback((name) => {
    return emitPromiseAction(socket, 'create_group', { name }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const listMyGroups = useCallback(() => {
    return emitPromiseAction(socket, 'list_my_groups', {}, () => setError(null), failError);
  }, [failError, setError, socket]);

  const getGroup = useCallback((groupId) => {
    return emitPromiseAction(socket, 'get_group', { groupId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const inviteToGroup = useCallback((groupId, identifier) => {
    return emitPromiseAction(socket, 'invite_to_group', { groupId, identifier }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const listMyInvites = useCallback(() => {
    return emitPromiseAction(socket, 'list_my_invites', {}, () => setError(null), failError);
  }, [failError, setError, socket]);

  const respondToInvite = useCallback((inviteId, accept) => {
    return emitPromiseAction(socket, 'respond_to_invite', { inviteId, accept: !!accept }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const revokeInvite = useCallback((inviteId) => {
    return emitPromiseAction(socket, 'revoke_invite', { inviteId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const removeMember = useCallback((groupId, userId) => {
    return emitPromiseAction(socket, 'remove_member', { groupId, userId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const transferHost = useCallback((groupId, newHostUserId) => {
    return emitPromiseAction(socket, 'transfer_host', { groupId, newHostUserId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const deleteGroup = useCallback((groupId) => {
    return emitPromiseAction(socket, 'delete_group', { groupId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const leaveGroup = useCallback((groupId) => {
    return emitPromiseAction(socket, 'leave_group', { groupId }, () => setError(null), failError);
  }, [failError, setError, socket]);

  const getGroupLeaderboard = useCallback((groupId) => {
    return new Promise((resolve) => {
      if (groupId) {
        const cached = leaderboardCacheRef.current.get(groupId);
        if (cached && Date.now() - cached.loadedAt < leaderboardTtlMs) {
          setError(null);
          resolve(cached.data);
          return;
        }
      }

      socket.emit('get_group_leaderboard', { groupId }, (res) => {
        if (!res?.success) failError(res);
        else {
          setError(null);
          if (groupId) {
            leaderboardCacheRef.current.set(groupId, { data: res, loadedAt: Date.now() });
          }
        }
        resolve(res);
      });
    });
  }, [failError, leaderboardCacheRef, leaderboardTtlMs, setError, socket]);

  return {
    createGroup,
    listMyGroups,
    getGroup,
    inviteToGroup,
    listMyInvites,
    respondToInvite,
    revokeInvite,
    removeMember,
    transferHost,
    deleteGroup,
    leaveGroup,
    getGroupLeaderboard,
  };
}
