// ============================================================
// ENGINE - Meta-progression: per-game stats, XP, cosmetic unlocks
// ============================================================
// Issue #205. Pure helpers only - no I/O, no socket access.
//
// • Per-game stats (`player.gameStats`) are initialised by startGame and
//   bumped from the orchestration layer at the moments the outcome is
//   authoritative (interactive card play, spin resolution, bluff verdict).
// • XP is computed ONCE at game_over (`computeXpAward`) from those stats,
//   then persisted via leaderboardRepo. Anti-farming guards live here:
//   no participation XP without at least one card actively played (idle
//   auto-plays and bot plays are never tracked), per-stat caps, and the
//   caller additionally gates on online mode + !isTutorial.
// • Cosmetics are id-only here (unlock level + slot). The client owns the
//   matching render definitions (CSS values) keyed by the same ids, so the
//   server stays authoritative over WHAT is unlocked/equipped and never
//   ships style payloads.

// ─── Level curve + tiers (Progression & Covenant overhaul) ────
//
// The flat XP formula + unlimited quadratic curve are replaced by a fixed
// 20-level lookup table grouped into four tiers (Streets → Backroads →
// Syndicate → Covenant). The tier a player sits in gates which room
// mechanics they can host and which per-event XP rates they earn.
//
// LEVEL_XP_THRESHOLDS[level-1] = cumulative XP at which that level begins.
const LEVEL_XP_THRESHOLDS = [
  0, 150, 350, 650, 1050, 1550, 2150, 2900,
  3800, 4900, 6200, 7700, 9500,
  11500, 14000, 17000, 20500, 24500, 29000, 34000,
];
const MAX_LEVEL = 20;

// Cumulative XP → level (1..20, capped). Defensive: garbage → 1.
function levelForXp(xp) {
  const safe = Math.max(0, Number(xp) || 0);
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (safe >= LEVEL_XP_THRESHOLDS[l - 1]) return l;
  }
  return 1;
}

// Cumulative XP at which `level` begins (inverse of levelForXp, capped).
function xpForLevel(level) {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
  return LEVEL_XP_THRESHOLDS[l - 1];
}

// Level → tier name. Never throws for out-of-range input (guests → 'streets').
const TIER_LEVELS = { streets: [1, 2], backroads: [3, 8], syndicate: [9, 13], covenant: [14, 20] };

function tierForLevel(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  if (l <= 2) return 'streets';
  if (l <= 8) return 'backroads';
  if (l <= 13) return 'syndicate';
  return 'covenant';
}

// Per-tier XP rates, keyed by tier then by action type. Higher tiers earn
// more per event AND unlock event types that lower tiers can't (power-card
// resolution, Last Stand wins). All eight action types appear in every tier
// (some at 0) so the breakdown shape is stable across tiers.
const XP_TABLE = {
  streets:   { win: 100, spinSurvived: 30,  correctBluffCall: 40,  bluffDefended: 25, playerEliminated: 20, powerCardResolved: 0,  lastStandWin: 0,   participation: 15 },
  backroads: { win: 150, spinSurvived: 50,  correctBluffCall: 60,  bluffDefended: 40, playerEliminated: 35, powerCardResolved: 20, lastStandWin: 0,   participation: 20 },
  syndicate: { win: 200, spinSurvived: 75,  correctBluffCall: 90,  bluffDefended: 60, playerEliminated: 50, powerCardResolved: 30, lastStandWin: 150, participation: 25 },
  covenant:  { win: 250, spinSurvived: 100, correctBluffCall: 120, bluffDefended: 80, playerEliminated: 65, powerCardResolved: 40, lastStandWin: 200, participation: 30 },
};

// ─── Cosmetics catalog ────────────────────────────────────────
//
// Ids are the wire contract with the client (lib/cosmetics.js renders
// them); never rename one once shipped - players' equipped rows persist
// the id. unlockLevel gates equipping server-side (validateEquipped).
//
// Cosmetics now unlock by TIER, not arbitrary levels - each cosmetic SET maps
// to a tier and its unlockLevel is that tier's MIN level (LEVEL_XP_THRESHOLDS /
// TIER_LEVELS), so reaching a tier unlocks its whole set at once:
//   Streets   (Lv 1)  → Steel · Classic Leather · Emerald   (the base set)
//   Backroads (Lv 3)  → Noir set
//   Syndicate (Lv 9)  → Crimson set + Neon set
//   Covenant  (Lv 14) → Kente set + Cosmos set
const COSMETIC_SLOTS = ['gunSkin', 'cardBack', 'tableFelt'];

const COSMETICS = [
  // Gun / cylinder skins (the spin overlay's revolver).
  { id: 'gun_steel', slot: 'gunSkin', label: 'Steel', unlockLevel: 1 },     // Streets
  { id: 'gun_noir', slot: 'gunSkin', label: 'Noir', unlockLevel: 3 },       // Backroads
  { id: 'gun_crimson', slot: 'gunSkin', label: 'Crimson', unlockLevel: 9 }, // Syndicate
  { id: 'gun_neon', slot: 'gunSkin', label: 'Neon', unlockLevel: 9 },       // Syndicate
  { id: 'gun_kente', slot: 'gunSkin', label: 'Kente', unlockLevel: 14 },    // Covenant
  { id: 'gun_cosmos', slot: 'gunSkin', label: 'Cosmos', unlockLevel: 14 },  // Covenant
  // Deck skins - theme the card BACKS (deck / played pile / reveal / flights)
  // AND the player's own hand's card faces (frame + shape/number). Rendered
  // from framed SVG art in client/public/cosmetics (built by
  // client/scripts/build-cosmetic-decks.mjs); 'back_leather' stays the
  // CSS-only original look.
  { id: 'back_leather', slot: 'cardBack', label: 'Classic Leather', unlockLevel: 1 }, // Streets
  { id: 'back_noir', slot: 'cardBack', label: 'Noir Filigree', unlockLevel: 3 },      // Backroads
  { id: 'back_crimson', slot: 'cardBack', label: 'Royal Crimson', unlockLevel: 9 },   // Syndicate
  { id: 'back_neon', slot: 'cardBack', label: 'Neon Circuit', unlockLevel: 9 },       // Syndicate
  { id: 'back_kente', slot: 'cardBack', label: 'Kente Royale', unlockLevel: 14 },     // Covenant
  { id: 'back_cosmos', slot: 'cardBack', label: 'Cosmos', unlockLevel: 14 },          // Covenant
  // Table felts (the oval's cloth): the original emerald + the five art felts.
  { id: 'felt_emerald', slot: 'tableFelt', label: 'Emerald', unlockLevel: 1 },  // Streets
  { id: 'felt_noir', slot: 'tableFelt', label: 'Noir', unlockLevel: 3 },        // Backroads
  { id: 'felt_crimson', slot: 'tableFelt', label: 'Crimson', unlockLevel: 9 },  // Syndicate
  { id: 'felt_neon', slot: 'tableFelt', label: 'Neon', unlockLevel: 9 },        // Syndicate
  { id: 'felt_kente', slot: 'tableFelt', label: 'Kente', unlockLevel: 14 },     // Covenant
  { id: 'felt_cosmos', slot: 'tableFelt', label: 'Cosmos', unlockLevel: 14 },   // Covenant
];

const DEFAULT_COSMETICS = {
  gunSkin: 'gun_steel',
  cardBack: 'back_leather',
  tableFelt: 'felt_emerald',
};

const _catalogById = new Map(COSMETICS.map(c => [c.id, c]));

function isCosmeticUnlocked(id, xp) {
  const item = _catalogById.get(id);
  if (!item) return false;
  return levelForXp(xp) >= item.unlockLevel;
}

// Sanitise an equipped-cosmetics object against the catalog + the
// player's XP. Unknown ids, wrong-slot ids, and still-locked items all
// fall back to the slot default. Always returns a complete object.
function validateEquipped(equipped, xp) {
  const out = { ...DEFAULT_COSMETICS };
  if (equipped && typeof equipped === 'object') {
    for (const slot of COSMETIC_SLOTS) {
      const id = equipped[slot];
      const item = typeof id === 'string' ? _catalogById.get(id) : null;
      if (item && item.slot === slot && isCosmeticUnlocked(id, xp)) {
        out[slot] = id;
      }
    }
  }
  return out;
}

// ─── Per-game stat tracking ───────────────────────────────────
//
// startGame calls initGameStats; the trackers below are invoked from the
// orchestration layer at each authoritative moment. All no-op gracefully
// when stats were never initialised (physical-mode rooms, old tests).

function initGameStats(room) {
  room.eliminationSeq = 0;
  room.xpAwarded = false;
  for (const p of room.players) {
    p.eliminatedSeq = null;
    p.gameStats = {
      cardsPlayed: 0,
      spinsSurvived: 0,
      bluffCallsMade: 0,
      correctBluffCalls: 0,
      bluffDefended: 0,
      playersEliminated: 0,
      powerCardsResolved: 0,
      lastStandWin: false,
    };
  }
  return room;
}

// Only the INTERACTIVE play path calls this (handlers/game.js). The idle
// auto-resolver and the practice bot deliberately don't - an AFK player
// whose turns get auto-played must not accrue participation credit.
function trackCardPlayed(room, playerId) {
  const p = room.players.find(pl => pl.id === playerId);
  if (p?.gameStats) p.gameStats.cardsPlayed++;
}

function trackSpinOutcome(room, playerId, eliminated) {
  if (eliminated) return;
  const p = room.players.find(pl => pl.id === playerId);
  if (p?.gameStats) p.gameStats.spinsSurvived++;
}

function trackBluffOutcome(room, accuserId, bluffCorrect) {
  const p = room.players.find(pl => pl.id === accuserId);
  if (!p?.gameStats) return;
  p.gameStats.bluffCallsMade++;
  if (bluffCorrect) p.gameStats.correctBluffCalls++;
}

// The accused survived a wrong bluff call - they "defended" the bluff.
function trackBluffDefended(room, accusedId) {
  const p = room.players.find(pl => pl.id === accusedId);
  if (p?.gameStats) p.gameStats.bluffDefended++;
}

// `killerPlayerId` caused another player's elimination (correct-bluff spin
// death, assassin strike, etc.). No-op when the killer is unknown/null.
function trackPlayerEliminated(room, killerPlayerId) {
  if (!killerPlayerId) return;
  const p = room.players.find(pl => pl.id === killerPlayerId);
  if (p?.gameStats) p.gameStats.playersEliminated++;
}

// One of this player's power cards had an effect (resolved a tier).
function trackPowerCardResolved(room, playerId) {
  const p = room.players.find(pl => pl.id === playerId);
  if (p?.gameStats) p.gameStats.powerCardsResolved++;
}

// This player won a Last Stand duel.
function trackLastStandWin(room, playerId) {
  const p = room.players.find(pl => pl.id === playerId);
  if (p?.gameStats) p.gameStats.lastStandWin = true;
}

// ─── Placement + award computation ────────────────────────────

// Finishing order at game_over, best → worst. Survivors first (the winner),
// then the fallen by elimination order reversed (later death = better
// placement). Players never stamped with an eliminatedSeq (edge teardown
// paths) sort last among the eliminated.
function computeStandings(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  const out = room.players
    .filter(p => p.status !== 'alive')
    .sort((a, b) => (b.eliminatedSeq ?? -1) - (a.eliminatedSeq ?? -1));
  return [...alive, ...out].map(p => p.id);
}

/**
 * Compute one player's XP for the finished game using the tier-keyed
 * XP_TABLE. `tier` selects the rate column (defaults to 'streets' for old
 * rooms without `room.tier`). Returns { total, placement, breakdown } -
 * total is 0 (null breakdown) when the player never actively played a card
 * (anti-AFK) or has no stats. `placement` is the standings index (1-based),
 * kept for display only - it is no longer an XP component.
 */
function computeXpAward(room, player, tier = 'streets', standings = computeStandings(room)) {
  const stats = player?.gameStats;
  const placement = standings.indexOf(player?.id) + 1 || standings.length;
  if (!stats || stats.cardsPlayed < 1) {
    return { total: 0, placement, breakdown: null };
  }

  const rates = XP_TABLE[tier] || XP_TABLE.streets;
  // Covenant - a Pact dual win credits BOTH surviving partners with the win XP,
  // even though only the placement-1 partner is the nominal "winner".
  const dualWinnerIds = Array.isArray(room?.dualWinnerIds) ? room.dualWinnerIds : [];
  const isWinner = player.status === 'alive'
    && (placement === 1 || dualWinnerIds.includes(player.id));

  const breakdown = {
    win: isWinner ? rates.win : 0,
    spinsSurvived: (stats.spinsSurvived || 0) * rates.spinSurvived,
    correctBluffCalls: (stats.correctBluffCalls || 0) * rates.correctBluffCall,
    bluffDefended: (stats.bluffDefended || 0) * rates.bluffDefended,
    playersEliminated: (stats.playersEliminated || 0) * rates.playerEliminated,
    powerCardsResolved: (stats.powerCardsResolved || 0) * rates.powerCardResolved,
    lastStandWin: stats.lastStandWin ? rates.lastStandWin : 0,
    participation: rates.participation,
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total, placement, breakdown };
}

module.exports = {
  LEVEL_XP_THRESHOLDS,
  MAX_LEVEL,
  TIER_LEVELS,
  XP_TABLE,
  levelForXp,
  xpForLevel,
  tierForLevel,
  COSMETIC_SLOTS,
  COSMETICS,
  DEFAULT_COSMETICS,
  isCosmeticUnlocked,
  validateEquipped,
  initGameStats,
  trackCardPlayed,
  trackSpinOutcome,
  trackBluffOutcome,
  trackBluffDefended,
  trackPlayerEliminated,
  trackPowerCardResolved,
  trackLastStandWin,
  computeStandings,
  computeXpAward,
};
