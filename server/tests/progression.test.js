// ============================================================
// #205 — Meta-progression engine: levels, cosmetics, XP formula
// ============================================================

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  XP_RULES,
  levelForXp,
  xpForLevel,
  COSMETICS,
  DEFAULT_COSMETICS,
  isCosmeticUnlocked,
  validateEquipped,
  initGameStats,
  trackCardPlayed,
  trackSpinOutcome,
  trackBluffOutcome,
  computeStandings,
  computeXpAward,
} = require('../engine/progression.js');
const { createRoom, createPlayer, startGame, eliminateFromTurnOrder, MODES, defaultRoomConfig, serializeRoom } = require('../gameEngine.js');

function makeRoom(ids = ['p0', 'p1', 'p2']) {
  const room = createRoom('sock-host', MODES.ONLINE, defaultRoomConfig());
  for (const id of ids) room.players.push(createPlayer(id, id.toUpperCase(), `sock-${id}`));
  return room;
}

describe('level curve', () => {
  it('maps cumulative XP to levels quadratically', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(399)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    expect(levelForXp(900)).toBe(4);
  });

  it('xpForLevel is the inverse floor of levelForXp', () => {
    for (let level = 1; level <= 12; level++) {
      const floor = xpForLevel(level);
      expect(levelForXp(floor)).toBe(level);
      if (level > 1) expect(levelForXp(floor - 1)).toBe(level - 1);
    }
  });

  it('is defensive about garbage input', () => {
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(undefined)).toBe(1);
    expect(xpForLevel(0)).toBe(0);
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
    expect(isCosmeticUnlocked('felt_noir', 100)).toBe(true);  // level 2
    expect(isCosmeticUnlocked('gun_cosmos', 100)).toBe(false); // needs level 10
    expect(isCosmeticUnlocked('nope', 999999)).toBe(false);
  });

  it('validateEquipped keeps unlocked picks and resets locked/unknown/wrong-slot ids', () => {
    const out = validateEquipped(
      {
        tableFelt: 'felt_noir',     // unlocked at level 2
        cardBack: 'back_kente',     // needs level 9 — locked
        gunSkin: 'felt_kente',      // wrong slot
      },
      100, // level 2
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
    const award = computeXpAward(room, afk);
    expect(award.total).toBe(0);
    expect(award.breakdown).toBeNull();
  });

  it('winner gets participation + placement pool + win bonus', () => {
    const room = finishedRoom();
    const winner = room.players.find((p) => p.id === 'w');
    winner.gameStats.cardsPlayed = 3;
    winner.gameStats.spinsSurvived = 2;
    winner.gameStats.correctBluffCalls = 1;
    const award = computeXpAward(room, winner);
    expect(award.placement).toBe(1);
    expect(award.breakdown).toEqual({
      participation: XP_RULES.participation,
      spinsSurvived: 2 * XP_RULES.perSpinSurvived,
      correctBluffCalls: XP_RULES.perCorrectBluffCall,
      placement: XP_RULES.placementPool,
      win: XP_RULES.win,
    });
    expect(award.total).toBe(
      XP_RULES.participation
      + 2 * XP_RULES.perSpinSurvived
      + XP_RULES.perCorrectBluffCall
      + XP_RULES.placementPool
      + XP_RULES.win,
    );
  });

  it('last place gets no placement bonus; middle gets a partial one', () => {
    const room = finishedRoom();
    const mid = room.players.find((p) => p.id === 'b');
    const last = room.players.find((p) => p.id === 'a');
    mid.gameStats.cardsPlayed = 1;
    last.gameStats.cardsPlayed = 1;
    expect(computeXpAward(room, mid).breakdown.placement).toBe(XP_RULES.placementPool / 2);
    expect(computeXpAward(room, mid).breakdown.win).toBe(0);
    expect(computeXpAward(room, last).breakdown.placement).toBe(0);
  });

  it('caps the per-event bonuses so dragged-out games cannot farm', () => {
    const room = finishedRoom();
    const winner = room.players.find((p) => p.id === 'w');
    winner.gameStats.cardsPlayed = 1;
    winner.gameStats.spinsSurvived = 999;
    winner.gameStats.correctBluffCalls = 999;
    const award = computeXpAward(room, winner);
    expect(award.breakdown.spinsSurvived).toBe(XP_RULES.spinsSurvivedCap);
    expect(award.breakdown.correctBluffCalls).toBe(XP_RULES.correctBluffCallsCap);
  });
});
