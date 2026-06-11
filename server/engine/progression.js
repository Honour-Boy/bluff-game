// ============================================================
// ENGINE — Meta-progression: per-game stats, XP, cosmetic unlocks
// ============================================================
// Issue #205. Pure helpers only — no I/O, no socket access.
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

// ─── XP formula ───────────────────────────────────────────────
//
// participation — flat, only when the player actively played ≥1 card.
// spins survived / correct bluff calls — small per-event bonuses, capped
//   so a deliberately dragged-out game can't farm unbounded XP.
// placement — a pool scaled by finishing position (winner full, last 0).
// win — flat on top of first placement.
const XP_RULES = {
  participation: 20,
  perSpinSurvived: 5,
  spinsSurvivedCap: 50,
  perCorrectBluffCall: 10,
  correctBluffCallsCap: 50,
  placementPool: 30,
  win: 60,
};

// Level curve: cumulative XP for level L starts at 100·(L-1)².
// level(0 xp)=1, level(100)=2, level(400)=3, level(900)=4, …
function levelForXp(xp) {
  const safe = Math.max(0, Number(xp) || 0);
  return 1 + Math.floor(Math.sqrt(safe / 100));
}

// Cumulative XP at which `level` begins (inverse of levelForXp).
function xpForLevel(level) {
  const l = Math.max(1, Math.floor(level) || 1);
  return 100 * (l - 1) * (l - 1);
}

// ─── Cosmetics catalog ────────────────────────────────────────
//
// Ids are the wire contract with the client (lib/cosmetics.js renders
// them); never rename one once shipped — players' equipped rows persist
// the id. unlockLevel gates equipping server-side (validateEquipped).
const COSMETIC_SLOTS = ['gunSkin', 'cardBack', 'tableFelt'];

const COSMETICS = [
  // Gun / cylinder skins (the spin overlay's revolver): the original steel
  // + the five owner-art identities, which share an unlock level with their
  // deck + felt counterparts — levelling unlocks the matching SET in one go.
  // (The interim brass/obsidian/gilded recolors were cut before ever
  // shipping — no equipped rows can reference them.)
  { id: 'gun_steel', slot: 'gunSkin', label: 'Steel', unlockLevel: 1 },
  { id: 'gun_noir', slot: 'gunSkin', label: 'Noir', unlockLevel: 2 },
  { id: 'gun_crimson', slot: 'gunSkin', label: 'Crimson', unlockLevel: 3 },
  { id: 'gun_neon', slot: 'gunSkin', label: 'Neon', unlockLevel: 6 },
  { id: 'gun_kente', slot: 'gunSkin', label: 'Kente', unlockLevel: 9 },
  { id: 'gun_cosmos', slot: 'gunSkin', label: 'Cosmos', unlockLevel: 10 },
  // Deck skins — theme the card BACKS (deck / played pile / reveal / flights)
  // AND the player's own hand's card faces (frame + shape/number). Rendered
  // from framed SVG art in client/public/cosmetics (built by
  // client/scripts/build-cosmetic-decks.mjs); 'back_leather' stays the
  // CSS-only original look.
  { id: 'back_leather', slot: 'cardBack', label: 'Classic Leather', unlockLevel: 1 },
  { id: 'back_noir', slot: 'cardBack', label: 'Noir Filigree', unlockLevel: 2 },
  { id: 'back_crimson', slot: 'cardBack', label: 'Royal Crimson', unlockLevel: 3 },
  { id: 'back_neon', slot: 'cardBack', label: 'Neon Circuit', unlockLevel: 6 },
  { id: 'back_kente', slot: 'cardBack', label: 'Kente Royale', unlockLevel: 9 },
  { id: 'back_cosmos', slot: 'cardBack', label: 'Cosmos', unlockLevel: 10 },
  // Table felts (the oval's cloth). The art felts (frame SVG underlays,
  // same build pipeline as the deck skins) match the deck unlock levels.
  { id: 'felt_emerald', slot: 'tableFelt', label: 'Emerald', unlockLevel: 1 },
  { id: 'felt_wine', slot: 'tableFelt', label: 'Wine', unlockLevel: 2 },
  { id: 'felt_noir', slot: 'tableFelt', label: 'Noir', unlockLevel: 2 },
  { id: 'felt_crimson', slot: 'tableFelt', label: 'Crimson', unlockLevel: 3 },
  { id: 'felt_midnight', slot: 'tableFelt', label: 'Midnight', unlockLevel: 5 },
  { id: 'felt_neon', slot: 'tableFelt', label: 'Neon', unlockLevel: 6 },
  { id: 'felt_ocean', slot: 'tableFelt', label: 'Ocean', unlockLevel: 8 },
  { id: 'felt_kente', slot: 'tableFelt', label: 'Kente', unlockLevel: 9 },
  { id: 'felt_cosmos', slot: 'tableFelt', label: 'Cosmos', unlockLevel: 10 },
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

// What a VIEWER gets to see of another player's equipped cosmetics: a
// cosmetic is only visible to viewers who have reached its unlock level
// themselves — below that they see the slot default. (The owner always
// sees their own equips in full; serializeRoom skips this for self.)
// Guests / unseated viewers pass level 1 and see defaults only.
function filterVisibleCosmetics(equipped, viewerLevel) {
  if (!equipped || typeof equipped !== 'object') return equipped || null;
  const level = Math.max(1, Math.floor(viewerLevel) || 1);
  const out = { ...DEFAULT_COSMETICS };
  for (const slot of COSMETIC_SLOTS) {
    const item = typeof equipped[slot] === 'string' ? _catalogById.get(equipped[slot]) : null;
    if (item && item.slot === slot && item.unlockLevel <= level) {
      out[slot] = item.id;
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
    };
  }
  return room;
}

// Only the INTERACTIVE play path calls this (handlers/game.js). The idle
// auto-resolver and the practice bot deliberately don't — an AFK player
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
 * Compute one player's XP for the finished game. Returns
 * { total, placement, breakdown } — total is 0 (with an empty breakdown)
 * when the player never actively played a card (anti-AFK) or has no stats.
 */
function computeXpAward(room, player, standings = computeStandings(room)) {
  const stats = player?.gameStats;
  const placement = standings.indexOf(player?.id) + 1 || standings.length;
  if (!stats || stats.cardsPlayed < 1) {
    return { total: 0, placement, breakdown: null };
  }

  const playerCount = standings.length;
  const spinXp = Math.min(
    stats.spinsSurvived * XP_RULES.perSpinSurvived,
    XP_RULES.spinsSurvivedCap,
  );
  const bluffXp = Math.min(
    stats.correctBluffCalls * XP_RULES.perCorrectBluffCall,
    XP_RULES.correctBluffCallsCap,
  );
  // Winner gets the full pool, last place 0, linear in between. A 2-player
  // game is all-or-nothing.
  const placementXp = playerCount > 1
    ? Math.round(XP_RULES.placementPool * (playerCount - placement) / (playerCount - 1))
    : 0;
  const isWinner = placement === 1 && player.status === 'alive';
  const winXp = isWinner ? XP_RULES.win : 0;

  const breakdown = {
    participation: XP_RULES.participation,
    spinsSurvived: spinXp,
    correctBluffCalls: bluffXp,
    placement: placementXp,
    win: winXp,
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total, placement, breakdown };
}

module.exports = {
  XP_RULES,
  levelForXp,
  xpForLevel,
  COSMETIC_SLOTS,
  COSMETICS,
  DEFAULT_COSMETICS,
  isCosmeticUnlocked,
  validateEquipped,
  filterVisibleCosmetics,
  initGameStats,
  trackCardPlayed,
  trackSpinOutcome,
  trackBluffOutcome,
  computeStandings,
  computeXpAward,
};
