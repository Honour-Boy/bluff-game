// ============================================================
// SOCKET LIB — Room builders, group-auth gate, winner recording
// ============================================================

const engine = require('../gameEngine');
const { isPersistentUserId } = require('../groupsRepo');

function getGroupAuthError(socket) {
  if (!socket.userId) return 'Not authenticated';
  if (socket.isGuest || !isPersistentUserId(socket.userId)) {
    return 'Groups require a signed-in account';
  }
  return null;
}

async function buildAdHocRoom(socket, mode, config, groupsRepo) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = engine.createRoom(socket.id, mode, config || null);
    const collision = await groupsRepo.getActiveGroupByCode(room.code);
    if (!collision) return room;
  }
  throw new Error('Failed to create a unique room code');
}

function buildPersistentGroupRoom(group, opts = {}) {
  const {
    hostSocketId = null,
    settingsRecord = null,
    defaultSettings,
  } = opts;
  const room = engine.createRoom(
    hostSocketId,
    engine.MODES.ONLINE,
    settingsRecord?.payload || defaultSettings,
  );
  room.code = group.code;
  room.groupId = group.id;
  room.hostUserId = group.host_user_id;
  room.hostSocketId = hostSocketId;
  room.groupSettingsMeta = settingsRecord
    ? {
        updatedAt: settingsRecord.updatedAt,
        updatedByUserId: settingsRecord.updatedByUserId,
        updatedByUsername: settingsRecord.updatedByUsername,
      }
    : null;
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  return room;
}

function getWinnerFromRoom(room) {
  const winnerId = room?.lastAction?.winnerId;
  if (!winnerId) return null;
  const winner = room.players.find((player) => player.id === winnerId);
  return {
    id: winnerId,
    username: winner?.username || room.lastAction?.winnerName || null,
  };
}

async function maybeRecordGroupWinner(io, room, leaderboardRepo) {
  if (!room?.groupId) return null;
  if (room.phase !== 'game_over') return null;
  if (room.groupLeaderboardWinnerRecorded) return null;

  const winner = getWinnerFromRoom(room);
  if (!winner?.id) return null;

  try {
    const persisted = await leaderboardRepo.recordWinner(
      room.groupId,
      winner.id,
      new Date().toISOString(),
    );
    room.groupLeaderboardWinnerRecorded = true;
    io.to(`group:${room.groupId}`).emit('group_leaderboard_updated', {
      groupId: room.groupId,
      winnerUserId: winner.id,
      newWins: persisted.wins,
    });
    return persisted;
  } catch (err) {
    console.error('[leaderboard] failed to record winner', err);
    return null;
  }
}

module.exports = {
  getGroupAuthError,
  buildAdHocRoom,
  buildPersistentGroupRoom,
  getWinnerFromRoom,
  maybeRecordGroupWinner,
};
