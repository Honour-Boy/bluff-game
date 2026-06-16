// ============================================================
// #205 — Meta-progression engine: levels, cosmetics, XP formula
// ============================================================

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  XP_TABLE,
  levelForXp,
  xpForLevel,
  tierForLevel,
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
} = require('../engine/progression.js');
const { createRoom, createPlayer, startGame, eliminateFromTurnOrder, MODES, defaultRoomConfig, serializeRoom } = require('../gameEngine.js');

function makeRoom(ids = ['p0', 'p1', 'p2']) {
  const room = createRoom('sock-host', MODES.ONLINE, defaultRoomConfig());
  for (const id of ids) room.players.push(createPlayer(id, id.toUpperCase(), `sock-${id}`));
  return room;
}

describe('level curve (20-level lookup table)', () => {
  it('maps cumulative XP to levels off the threshold table', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(149)).toBe(1);
    expect(levelForXp(150)).toBe(2);
    expect(levelForXp(349)).toBe(2);
    expect(levelForXp(350)).toBe(3);
    expect(levelForXp(34000)).toBe(20);
    expect(levelForXp(99999)).toBe(20); // capped at MAX_LEVEL
  });

  it('xpForLevel returns the cumulative floor for a level (capped)', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(3)).toBe(350);
    expect(xpForLevel(14)).toBe(11500);
    expect(xpForLevel(20)).toBe(34000);
    expect(xpForLevel(21)).toBe(34000); // capped
  });

  it('xpForLevel is the inverse floor of levelForXp', () => {
    for (let level = 1; level <= 20; level++) {
      const floor = xpForLevel(level);
      expect(levelForXp(floor)).toBe(level);
      if (level > 1) expect(levelForXp(floor - 1)).toBe(level - 1);
    }
  });

  it('is defensive about garbage input', () => {
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(undefined)).toBe(1);
    expect(levelForXp(NaN)).toBe(1);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(NaN)).toBe(0);
  });
});

describe('tierForLevel', () => {
  it('groups levels into the four tiers', () => {
    expect(tierForLevel(1)).toBe('streets');
    expect(tierForLevel(2)).toBe('streets');
    expect(tierForLevel(3)).toBe('backroads');
    expect(tierForLevel(8)).toBe('backroads');
    expect(tierForLevel(9)).toBe('syndicate');
    expect(tierForLevel(13)).toBe('syndicate');
    expect(tierForLevel(14)).toBe('covenant');
    expect(tierForLevel(20)).toBe('covenant');
  });

  it('never throws for out-of-range input', () => {
    expect(tierForLevel(0)).toBe('streets');
    expect(tierForLevel(-5)).toBe('streets');
    expect(tierForLevel(999)).toBe('covenant');
    expect(tierForLevel(undefined)).toBe('streets');
  });

  it('XP_TABLE has all eight action types for every tier', () => {
    const keys = ['win', 'spinSurvived', 'correctBluffCall', 'bluffDefended',
      'playerEliminated', 'powerCardResolved', 'lastStandWin', 'participation'];
    for (const tier of ['streets', 'backroads', 'syndicate', 'covenant']) {
      expect(Object.keys(XP_TABLE[tier]).sort()).toEqual([...keys].sort());
    }
  });
});

describe('cosmetics catalog + equip validation', () => {
  it('every slot has a level-1 default present in the catalog', () => {
    for (const [slot, id] of Object.entries(DEFAULT_COSMETICS)) {
      const item = COSMETICS.find((c) => c.id === id);
      expect(item, `default for ${slot}`).toBeTruthy();
      expect(item.slot).toBe(slot);
      expect(item.unlockLevel).toBe(1);
    }
  });

  it('unlock gating follows the level curve', () => {
    expect(isCosmeticUnlocked('felt_noir', 0)).toBe(false);   // needs level 2
    expect(isCosmeticUnlocked('felt_noir', 150)).toBe(true);  // level 2 (150 xp)
    expect(isCosmeticUnlocked('gun_cosmos', 150)).toBe(false); // needs level 10
    expect(isCosmeticUnlocked('gun_cosmos', 4900)).toBe(true); // level 10
    expect(isCosmeticUnlocked('nope', 999999)).toBe(false);
  });

  it('validateEquipped keeps unlocked picks and resets locked/unknown/wrong-slot ids', () => {
    const out = validateEquipped(
      {
        tableFelt: 'felt_noir',     // unlocked at level 2
        cardBack: 'back_kente',     // needs level 9 — locked
        gunSkin: 'felt_kente',      // wrong slot
      },
      150, // level 2
    );
    expect(out.tableFelt).toBe('felt_noir');
    expect(out.cardBack).toBe(DEFAULT_COSMETICS.cardBack);
    expect(out.gunSkin).toBe(DEFAULT_COSMETICS.gunSkin);
  });

  it('serializeRoom broadcasts every player\'s full cosmetics to every viewer', () => {
    const room = makeRoom(['viewer', 'owner']);
    const owner = room.players.find(p => p.id === 'owner');
    owner.cosmetics = { gunSkin: 'gun_cosmos', cardBack: 'back_noir', tableFelt: 'felt_kente' };

    // Cosmetics are public — the whole point is the table seeing your look.
    const forViewer = serializeRoom(room, 'viewer');
    expect(forViewer.players.find(p => p.id === 'owner').cosmetics).toEqual(owner.cosmetics);
    const forOwner = serializeRoom(room, 'owner');
    expect(forOwner.players.find(p => p.id === 'owner').cosmetics).toEqual(owner.cosmetics);
    // Even a spectator/guest viewer sees the real equips.
    const forGuest = serializeRoom(room, 'nobody');
    expect(forGuest.players.find(p => p.id === 'owner').cosmetics).toEqual(owner.cosmetics);
    // Unstamped players serialize as null (client renders defaults).
    expect(forViewer.players.find(p => p.id === 'viewer').cosmetics).toBeNull();
  });

  it('validateEquipped always returns a complete object', () => {
    expect(validateEquipped(null, 0)).toEqual(DEFAULT_COSMETICS);
    expect(validateEquipped('garbage', 0)).toEqual(DEFAULT_COSMETICS);
  });
});

describe('per-game stat tracking', () => {
  it('startGame initialises fresh stats for every player', () => {
    const room = makeRoom();
    startGame(room);
    for (const p of room.players) {
      expect(p.gameStats).toEqual({
        cardsPlayed: 0,
        spinsSurvived: 0,
        bluffCallsMade: 0,
        correctBluffCalls: 0,
        bluffDefended: 0,
        playersEliminated: 0,
        powerCardsResolved: 0,
        lastStandWin: false,
      });
      expect(p.eliminatedSeq).toBeNull();
    }
    expect(room.xpAwarded).toBe(false);
    expect(room.eliminationSeq).toBe(0);
  });

  it('trackers bump the right counters and no-op without stats', () => {
    const room = makeRoom();
    initGameStats(room);
    trackCardPlayed(room, 'p0');
    trackCardPlayed(room, 'p0');
    trackSpinOutcome(room, 'p0', false);
    trackSpinOutcome(room, 'p0', true); // eliminated → no survival credit
    trackBluffOutcome(room, 'p0', true);
    trackBluffOutcome(room, 'p0', false);
    const stats = room.players[0].gameStats;
    expect(stats.cardsPlayed).toBe(2);
    expect(stats.spinsSurvived).toBe(1);
    expect(stats.bluffCallsMade).toBe(2);
    expect(stats.correctBluffCalls).toBe(1);
    // Unknown player / room without stats: must not throw.
    trackCardPlayed(room, 'ghost');
    trackBluffOutcome({ players: [] }, 'p0', true);
  });

  it('new trackers bump their counters and no-op without stats', () => {
    const room = makeRoom();
    initGameStats(room);
    trackBluffDefended(room, 'p0');
    trackBluffDefended(room, 'p0');
    trackPlayerEliminated(room, 'p0');
    trackPlayerEliminated(room, null); // null killer → no-op
    trackPowerCardResolved(room, 'p0');
    trackLastStandWin(room, 'p0');
    const stats = room.players[0].gameStats;
    expect(stats.bluffDefended).toBe(2);
    expect(stats.playersEliminated).toBe(1);
    expect(stats.powerCardsResolved).toBe(1);
    expect(stats.lastStandWin).toBe(true);
    // Unknown player / room without stats: must not throw.
    trackBluffDefended(room, 'ghost');
    trackPlayerEliminated({ players: [] }, 'p0');
    trackPowerCardResolved({ players: [] }, 'p0');
    trackLastStandWin({ players: [] }, 'p0');
  });

  it('eliminateFromTurnOrder stamps elimination order once', () => {
    const room = makeRoom();
    startGame(room);
    eliminateFromTurnOrder(room, 'p1');
    eliminateFromTurnOrder(room, 'p2');
    eliminateFromTurnOrder(room, 'p1'); // repeat must not re-stamp
    expect(room.players.find((p) => p.id === 'p1').eliminatedSeq).toBe(1);
    expect(room.players.find((p) => p.id === 'p2').eliminatedSeq).toBe(2);
  });
});

describe('standings + XP award', () => {
  function finishedRoom() {
    const room = makeRoom(['w', 'a', 'b']);
    startGame(room);
    // a dies first, b second, w survives → standings w, b, a.
    room.players.find((p) => p.id === 'a').status = 'eliminated';
    eliminateFromTurnOrder(room, 'a');
    room.players.find((p) => p.id === 'b').status = 'eliminated';
    eliminateFromTurnOrder(room, 'b');
    room.phase = 'game_over';
    return room;
  }

  it('computeStandings orders survivors first, then later deaths', () => {
    const room = finishedRoom();
    expect(computeStandings(room)).toEqual(['w', 'b', 'a']);
  });

  it('awards nothing to a player who never actively played a card (anti-AFK)', () => {
    const room = finishedRoom();
    const afk = room.players.find((p) => p.id === 'a');
    const award = computeXpAward(room, afk, 'streets');
    expect(award.total).toBe(0);
    expect(award.breakdown).toBeNull();
  });

  it('sums tier-keyed rates for a Backroads winner (spec worked example)', () => {
    // Level-5 (Backroads) winner: won, survived 2 spins, 1 correct bluff call,
    // 1 bluff defended, 1 player eliminated, ≥1 card played.
    // 150 + (50×2) + 60 + 40 + 35 + 0 + 0 + 20 = 405.
    const room = finishedRoom();
    const winner = room.players.find((p) => p.id === 'w');
    winner.gameStats.cardsPlayed = 3;
    winner.gameStats.spinsSurvived = 2;
    winner.gameStats.correctBluffCalls = 1;
    winner.gameStats.bluffDefended = 1;
    winner.gameStats.playersEliminated = 1;
    const award = computeXpAward(room, winner, 'backroads');
    expect(award.placement).toBe(1);
    const r = XP_TABLE.backroads;
    expect(award.breakdown).toEqual({
      win: r.win,
      spinsSurvived: 2 * r.spinSurvived,
      correctBluffCalls: r.correctBluffCall,
      bluffDefended: r.bluffDefended,
      playersEliminated: r.playerEliminated,
      powerCardsResolved: 0,
      lastStandWin: 0,
      participation: r.participation,
    });
    expect(award.total).toBe(405);
  });

  it('Streets tier zeroes power-card and last-stand XP even when earned', () => {
    const room = finishedRoom();
    const winner = room.players.find((p) => p.id === 'w');
    winner.gameStats.cardsPlayed = 1;
    winner.gameStats.powerCardsResolved = 3;
    winner.gameStats.lastStandWin = true;
    const award = computeXpAward(room, winner, 'streets');
    expect(award.breakdown.powerCardsResolved).toBe(0);
    expect(award.breakdown.lastStandWin).toBe(0);
  });

  it('non-winner gets no win XP but keeps participation', () => {
    const room = finishedRoom();
    const last = room.players.find((p) => p.id === 'a');
    last.gameStats.cardsPlayed = 1;
    const award = computeXpAward(room, last, 'syndicate');
    expect(award.breakdown.win).toBe(0);
    expect(award.breakdown.participation).toBe(XP_TABLE.syndicate.participation);
  });

  it('defaults to streets rates when tier is omitted', () => {
    const room = finishedRoom();
    const winner = room.players.find((p) => p.id === 'w');
    winner.gameStats.cardsPlayed = 1;
    const award = computeXpAward(room, winner);
    expect(award.breakdown.win).toBe(XP_TABLE.streets.win);
  });
});
