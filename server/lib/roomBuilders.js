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
  room.powerActivatedThisTurn = false;
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

// #205 — award end-of-game XP to every human player and emit a private
// `xp_awarded` summary to each. Online, non-tutorial games only (bot/practice
// rooms and host-judged physical games are excluded as anti-farming), and only
// once per game (`room.xpAwarded`, reset by startGame). Guests get the summary
// (with a sign-in nudge) but nothing is persisted for them. Tolerates a repo
// without the progression methods so older test stubs keep working.
async function maybeAwardGameXp(io, room, leaderboardRepo) {
  if (!room || room.phase !== 'game_over') return null;
  if (room.mode !== engine.MODES.ONLINE) return null;
  if (room.isTutorial) return null;
  if (room.xpAwarded) return null;
  if (typeof leaderboardRepo?.addXp !== 'function') return null;

  const humans = room.players.filter(p => !p.isBot);
  if (humans.length < 2) return null;
  // Stamp BEFORE the awaits below so a concurrent game-over path can't
  // double-award while this one is in flight.
  room.xpAwarded = true;

  const standings = engine.computeStandings(room);
  const awards = [];
  for (const player of humans) {
    const award = engine.computeXpAward(room, player, standings);
    if (!award.breakdown || award.total <= 0) continue;

    const isGuest = !isPersistentUserId(player.id);
    let persisted = null;
    if (!isGuest) {
      try {
        persisted = await leaderboardRepo.addXp(player.id, award.total);
      } catch (err) {
        console.error('[progression] failed to persist xp for', player.id, err);
        continue;
      }
    }

    const totalXp = persisted ? (persisted.xp || 0) : award.total;
    const levelBefore = engine.levelForXp(totalXp - award.total);
    const level = engine.levelForXp(totalXp);
    const payload = {
      gained: award.total,
      breakdown: award.breakdown,
      placement: award.placement,
      playerCount: standings.length,
      guest: isGuest,
      totalXp: isGuest ? null : totalXp,
      level: isGuest ? null : level,
      leveledUp: !isGuest && level > levelBefore,
      // Items that just crossed their unlock threshold this game.
      unlocked: !isGuest && level > levelBefore
        ? engine.COSMETICS.filter(c => c.unlockLevel > levelBefore && c.unlockLevel <= level)
        : [],
      levelFloorXp: isGuest ? null : engine.xpForLevel(level),
      nextLevelXp: isGuest ? null : engine.xpForLevel(level + 1),
    };
    if (player.socketId) io.to(player.socketId).emit('xp_awarded', payload);
    awards.push({ playerId: player.id, ...payload });
  }
  return awards;
}

// #205 — look up a (signed-in) player's validated equipped cosmetics so the
// join/create handlers can stamp them onto the seated player object.
// Best-effort: any failure just means default cosmetics.
async function fetchEquippedCosmetics(leaderboardRepo, userId) {
  if (!isPersistentUserId(userId)) return null;
  if (typeof leaderboardRepo?.getProgression !== 'function') return null;
  try {
    const row = await leaderboardRepo.getProgression(userId);
    return engine.validateEquipped(row.equipped, row.xp);
  } catch (err) {
    console.error('[progression] failed to fetch cosmetics for', userId, err);
    return null;
  }
}

// Fire-and-forget cosmetics stamp for a freshly-seated player. A join/create
// must never block on (or fail because of) the progression lookup — the look
// simply "pops in" on the broadcast that follows the fetch. Re-resolves the
// room before saving so a room torn down mid-fetch is never resurrected.
// Deferred requires: roomBuilders is loaded by orchestration, which broadcast
// also feeds — same cycle-avoidance trick as lib/bots.js.
function stampCosmeticsInBackground(io, leaderboardRepo, roomCode, player) {
  fetchEquippedCosmetics(leaderboardRepo, player.id)
    .then(async (cosmetics) => {
      if (!cosmetics) return;
      const { getRoom, saveRoom } = require('./state');
      const { broadcastRoomState } = require('./broadcast');
      const room = await getRoom(roomCode);
      if (!room) return;
      const seated = room.players.find(p => p.id === player.id);
      if (!seated) return;
      seated.cosmetics = cosmetics;
      await saveRoom(room);
      await broadcastRoomState(io, roomCode);
    })
    .catch(() => { /* cosmetic only — defaults render fine */ });
}

// The shared game-outcome funnel. Every game_over path already calls this to
// record a group win (it no-ops for ad-hoc rooms), so the #205 XP award rides
// the same call — any future game-over site gets both for free.
async function maybeRecordGroupWinner(io, room, leaderboardRepo) {
  await maybeAwardGameXp(io, room, leaderboardRepo);

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
  maybeAwardGameXp,
  fetchEquippedCosmetics,
  stampCosmeticsInBackground,
  maybeRecordGroupWinner,
};
