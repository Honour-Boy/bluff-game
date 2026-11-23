// ============================================================
// HANDLERS — Player profile data (XP + cosmetics)
// ============================================================
// Two events:
//   get_profile_data  — fetch totalXp, tier, unlocked ids, current selections.
//   set_cosmetic      — validate + persist a single slot change.

const { getTierForXp, XP_TIERS } = require('../engine/xp');
const { getUnlocked, validateSelection } = require('../cosmeticsRegistry');
const { socketRateLimit } = require('../lib/rateLimiter');

function register(io, socket, ctx) {
  const { xpRepo, cosmeticsRepo } = ctx;

  // ─── GET profile data (XP + cosmetics) ───────────────────
  // Called by the client on profile open and after a game ends.
  // Guests are allowed to call this but always receive 0 XP.
  socket.on('get_profile_data', async (_, callback) => {
    if (!socketRateLimit(socket, 'get_profile_data', 10, 10_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const isGuest = socket.isGuest || socket.userId.startsWith('guest:');

      // Guests have no persistent profile — return defaults.
      if (isGuest) {
        const tier = getTierForXp(0);
        return callback?.({
          success: true,
          totalXp: 0,
          tier,
          allTiers: XP_TIERS,
          unlocked: getUnlocked(0),
          selections: { gunSkin: 'gun_default', cardBack: 'card_default', tableFelt: 'felt_default' },
        });
      }

      const [totalXp, selections] = await Promise.all([
        xpRepo.getXp(socket.userId),
        cosmeticsRepo.getCosmetics(socket.userId),
      ]);

      const tier = getTierForXp(totalXp);
      const unlocked = getUnlocked(totalXp);

      // Refresh the socket's cosmetics cache so the next room join uses
      // the latest selections.
      socket.cosmeticsCache = selections;

      callback?.({
        success: true,
        totalXp,
        tier,
        allTiers: XP_TIERS,
        unlocked,
        selections,
      });
    } catch (err) {
      console.error('[get_profile_data]', err);
      callback?.({ success: false, error: 'Failed to load profile' });
    }
  });

  // ─── SET one cosmetic slot ────────────────────────────────
  // { slot: 'gunSkin' | 'cardBack' | 'tableFelt', id: string }
  socket.on('set_cosmetic', async ({ slot, id } = {}, callback) => {
    if (!socketRateLimit(socket, 'set_cosmetic', 10, 10_000).allowed) {
      return callback?.({ success: false, error: 'Rate limit exceeded' });
    }
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      if (socket.isGuest || socket.userId.startsWith('guest:')) {
        return callback?.({ success: false, error: 'Cosmetics require a signed-in account' });
      }
      if (!slot || !id) return callback?.({ success: false, error: 'Missing slot or id' });

      // Verify the player has enough XP to equip this item.
      const totalXp = await xpRepo.getXp(socket.userId);
      const check = validateSelection(slot, id, totalXp);
      if (!check.ok) return callback?.({ success: false, error: check.error });

      await cosmeticsRepo.setCosmetic(socket.userId, slot, id);

      // Update the socket cache so subsequent room joins use the new skin.
      if (!socket.cosmeticsCache) socket.cosmeticsCache = {};
      socket.cosmeticsCache[slot] = id;

      // Return the full updated selections.
      const selections = await cosmeticsRepo.getCosmetics(socket.userId);
      socket.cosmeticsCache = selections;

      callback?.({ success: true, selections });
    } catch (err) {
      console.error('[set_cosmetic]', err);
      callback?.({ success: false, error: 'Failed to save cosmetic' });
    }
  });
}

module.exports = { register };
