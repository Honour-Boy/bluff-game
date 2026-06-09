// ============================================================
// ENGINE — Per-game XP formula (pure, no I/O)
// ============================================================
// XP is awarded once per game at game_over. The formula rewards
// participation and performance without ever creating a gameplay
// advantage (cosmetics are purely visual).
//
// Anti-AFK: guests (userId starts with 'guest:') and bots are
// excluded. Tutorial rooms earn 0 XP. Physical-mode rooms earn
// 0 XP (no server-tracked per-player stats exist for them).

const MODES = require('./constants').MODES;

// ─── XP constants ────────────────────────────────────────────
const XP_PARTICIPATION = 10;   // just finishing a game
const XP_WIN_BONUS     = 50;   // last player standing
const XP_SPIN_SURVIVED = 15;   // per additional spin survived (riskLevel−1)

// ─── Tier thresholds ─────────────────────────────────────────
const XP_TIERS = [
  { tier: 0, minXp: 0,    label: 'Greenhorn'  },
  { tier: 1, minXp: 100,  label: 'Gunslinger' },
  { tier: 2, minXp: 300,  label: 'Outlaw'     },
  { tier: 3, minXp: 750,  label: 'Desperado'  },
  { tier: 4, minXp: 1500, label: 'Legend'     },
];

/**
 * XP earned by one player at game_over.
 * Returns 0 when the player/game is ineligible.
 */
function computePlayerXp(room, playerId) {
  if (!room || room.isTutorial) return 0;
  if (room.mode !== MODES.ONLINE) return 0;

  const player = room.players.find(p => p.id === playerId);
  if (!player || player.isBot) return 0;
  // Guests use a UUID-like id prefixed by the guest constant.
  // Exclude them — they have no persistent profile to write to.
  if (typeof player.id === 'string' && player.id.startsWith('guest:')) return 0;

  let xp = XP_PARTICIPATION;

  // Win bonus
  if (room.lastAction?.winnerId === playerId) {
    xp += XP_WIN_BONUS;
  }

  // Spins survived: each survival adds a bullet, so riskLevel − 1
  // equals the number of spins survived this game (initial = 1 bullet).
  const spinsSurvived = Math.max(0, (player.riskLevel || 1) - 1);
  xp += spinsSurvived * XP_SPIN_SURVIVED;

  return xp;
}

/**
 * XP awards for every eligible player in the room.
 * Returns [{ userId, xpEarned }, ...].
 */
function computeAllXpAwards(room) {
  if (!room || room.isTutorial) return [];
  if (room.mode !== MODES.ONLINE) return [];

  const awards = [];
  for (const player of room.players) {
    if (player.isBot) continue;
    const xp = computePlayerXp(room, player.id);
    if (xp > 0) awards.push({ userId: player.id, xpEarned: xp });
  }
  return awards;
}

/**
 * Highest tier whose minXp ≤ totalXp.
 */
function getTierForXp(totalXp) {
  for (let i = XP_TIERS.length - 1; i >= 0; i--) {
    if ((totalXp || 0) >= XP_TIERS[i].minXp) return XP_TIERS[i];
  }
  return XP_TIERS[0];
}

module.exports = { computePlayerXp, computeAllXpAwards, getTierForXp, XP_TIERS, XP_PARTICIPATION, XP_WIN_BONUS, XP_SPIN_SURVIVED };
