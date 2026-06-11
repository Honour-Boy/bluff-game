// ============================================================
// HANDLERS — Meta-progression: XP + cosmetics (#205)
// ============================================================
// get_progression — the caller's XP / level / unlock catalog / equipped set.
// set_cosmetics   — equip cosmetics; the server validates ownership against
//                   the unlock catalog before persisting, so the client can
//                   only ever render what it actually owns.

const engine = require('../gameEngine');
const { rooms, saveRoom } = require('../lib/state');
const { socketRateLimit } = require('../lib/rateLimiter');
const { broadcastRoomState } = require('../lib/broadcast');
const { isPersistentUserId } = require('../groupsRepo');

// Shape the client-facing progression payload from a repo row.
function _progressionPayload(xp, gamesPlayed, equipped) {
  const level = engine.levelForXp(xp);
  return {
    xp,
    gamesPlayed,
    level,
    levelFloorXp: engine.xpForLevel(level),
    nextLevelXp: engine.xpForLevel(level + 1),
    equipped,
    catalog: engine.COSMETICS,
  };
}

function register(io, socket, deps = {}) {
  const { leaderboardRepo } = deps;

  // ─── Fetch my XP / level / unlocks / equipped cosmetics ──
  socket.on('get_progression', async (_payload, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      if (!socketRateLimit(socket, 'get_progression', 10, 10_000).allowed) {
        return callback?.({ success: false, error: 'Rate limit exceeded' });
      }

      // Guests have no persistent row — everything reads as level 1 defaults.
      if (socket.isGuest || !isPersistentUserId(socket.userId)) {
        return callback?.({
          success: true,
          guest: true,
          progression: _progressionPayload(0, 0, { ...engine.DEFAULT_COSMETICS }),
        });
      }

      const row = await leaderboardRepo.getProgression(socket.userId);
      const equipped = engine.validateEquipped(row.equipped, row.xp);
      callback?.({
        success: true,
        guest: false,
        progression: _progressionPayload(row.xp, row.gamesPlayed, equipped),
      });
    } catch (err) {
      console.error('[get_progression]', err);
      callback?.({ success: false, error: 'Could not load progression' });
    }
  });

  // ─── Equip cosmetics (server-validated against unlock level) ──
  socket.on('set_cosmetics', async ({ equipped } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      if (!socketRateLimit(socket, 'set_cosmetics', 10, 10_000).allowed) {
        return callback?.({ success: false, error: 'Rate limit exceeded' });
      }
      if (socket.isGuest || !isPersistentUserId(socket.userId)) {
        return callback?.({ success: false, error: 'Sign in to unlock and keep cosmetics' });
      }

      // Validate against the caller's REAL xp — a locked or unknown id
      // silently falls back to the slot default, so nothing unowned can
      // ever be equipped no matter what the client sends.
      const row = await leaderboardRepo.getProgression(socket.userId);
      const valid = engine.validateEquipped(equipped, row.xp);
      await leaderboardRepo.setEquippedCosmetics(socket.userId, valid);

      // Live-update any table this player is seated at so the room sees the
      // new look on the next state push (each viewer still only sees what
      // their own level has unlocked — serializeRoom gates on cosmeticsLevel).
      for (const [code, room] of rooms) {
        const seated = room.players?.find(p => p.id === socket.userId);
        if (!seated) continue;
        seated.cosmetics = valid;
        seated.cosmeticsLevel = engine.levelForXp(row.xp);
        await saveRoom(room);
        await broadcastRoomState(io, code);
      }

      callback?.({ success: true, equipped: valid });
    } catch (err) {
      console.error('[set_cosmetics]', err);
      callback?.({ success: false, error: 'Could not save cosmetics' });
    }
  });
}

module.exports = { register };
