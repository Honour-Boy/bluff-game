// ============================================================
// Tests for v2 Phase F — Systems
//
// Covers:
//   - Bounty: counter increments on survival, resets on placement,
//     reset on collection (via correct bluff), reset on elimination,
//     reward drops accuser risk by 1.
//   - Betting: window state shape, place + evaluate; streak counter
//     and risk drop at 3.
//   - Dead Man's Hand: vote opens at threshold, ties produce no-op,
//     option visibility (option 3 only when risk modifiers enabled),
//     each option's effect (shape change, extra cards).
//   - Last Stand: triggers at alive=2, clears hands + chambers,
//     consumes armed power cards, suspends roles, no powers/bluff
//     allowed (game state shape), winner declared on fatal spin.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  serializeRoom,
  ROLES,
  MODES,
  // bounty
  BOUNTY_THRESHOLD,
  onSurvivalForBounty,
  onEliminationForBounty,
  collectBounty,
  // betting
  BETTING_STREAK_REWARD,
  BETTING_WINDOW_MS,
  startBettingWindow,
  placeBet,
  closeBettingWindow,
  evaluateBets,
  // DMH
  DMH_VOTE_WINDOW_MS,
  shouldOpenGhostVote,
  startGhostVote,
  castGhostVote,
  resolveGhostVote,
  // Last Stand
  shouldEnterLastStand,
  enterLastStand,
  lastStandSpin,
  lastStandEndTurn,
} from '../gameEngine.js';
import { resolveBluff } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(systems = {}, riskModifiers = {}) {
  const cfg = defaultRoomConfig();
  Object.assign(cfg.systems, systems);
  Object.assign(cfg.riskModifiers, riskModifiers);
  return cfg;
}

function makeRoom(playerCount, configOverrides = null) {
  const cfg = configOverrides || configWith({
    bounty: true, betting: true, deadMansHand: true, lastStand: true,
  });
  const room = createRoom('host', MODES.ONLINE, cfg);
  for (let i = 0; i < playerCount; i++) {
    const p = createPlayer(`p${i}`, `Player${i}`, `sock-${i}`);
    room.players.push(p);
    room.turnOrder.push(p.id);
  }
  room.phase = 'playing';
  room.discardPile = [];
  room.hands = new Map();
  room.deck = Array.from({ length: 60 }).map((_, i) => ({
    id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
  }));
  room.playedPile = [];
  for (const p of room.players) room.hands.set(p.id, []);
  return room;
}

// ─── Bounty ──────────────────────────────────────────────────

describe('Bounty — counter increments on survival', () => {
  it('counter starts at 0, increments to 1 on first survival', () => {
    const room = makeRoom(3);
    const player = room.players[0];
    expect(player.consecutiveSurvivedSpins).toBe(0);
    expect(player.hasBounty).toBe(false);

    onSurvivalForBounty(room, player.id);
    expect(player.consecutiveSurvivedSpins).toBe(1);
    expect(player.hasBounty).toBe(false);
  });

  it('places bounty at threshold (3), resets counter', () => {
    const room = makeRoom(3);
    const player = room.players[0];
    onSurvivalForBounty(room, player.id);
    onSurvivalForBounty(room, player.id);
    const placed = onSurvivalForBounty(room, player.id);
    expect(placed).toBeTruthy();
    expect(placed.kind).toBe('bounty_placed');
    expect(placed.holderId).toBe(player.id);
    expect(player.hasBounty).toBe(true);
    // Counter "collected into" the bounty → resets to 0.
    expect(player.consecutiveSurvivedSpins).toBe(0);
  });

  it('subsequent survivals while holding bounty do not re-place it', () => {
    const room = makeRoom(3);
    const player = room.players[0];
    for (let i = 0; i < BOUNTY_THRESHOLD; i++) onSurvivalForBounty(room, player.id);
    expect(player.hasBounty).toBe(true);
    const second = onSurvivalForBounty(room, player.id);
    expect(second).toBeNull();
  });

  it('counter resets on elimination, bounty cleared', () => {
    const room = makeRoom(3);
    const player = room.players[0];
    for (let i = 0; i < BOUNTY_THRESHOLD; i++) onSurvivalForBounty(room, player.id);
    expect(player.hasBounty).toBe(true);

    onEliminationForBounty(room, player.id);
    expect(player.consecutiveSurvivedSpins).toBe(0);
    expect(player.hasBounty).toBe(false);
  });

  it('noop when system disabled in config', () => {
    const room = makeRoom(3, configWith({ bounty: false }));
    const player = room.players[0];
    const placed = onSurvivalForBounty(room, player.id);
    expect(placed).toBeNull();
    expect(player.consecutiveSurvivedSpins).toBe(0);
  });
});

describe('Bounty — collection drops accuser risk by 1', () => {
  it('collectBounty mutates accuser chamber + clears bounty', () => {
    const room = makeRoom(3);
    const accused = room.players[0];
    const accuser = room.players[1];
    accused.hasBounty = true;
    accuser.chamber = ['bullet', 'bullet', 'bullet', null, null, null];
    accuser.riskLevel = 3;

    const banner = collectBounty(room, accused.id, accuser.id);
    expect(banner).toBeTruthy();
    expect(banner.kind).toBe('bounty_collected');
    expect(accused.hasBounty).toBe(false);
    expect(accuser.chamber.filter(s => s === 'bullet').length).toBe(2);
    expect(accuser.riskLevel).toBe(2);
  });

  it('pipeline integration — correct bluff against bounty holder fires bounty_collected', () => {
    const cfg = configWith({ bounty: true });
    const room = createRoom('host', MODES.ONLINE, cfg);
    const accused = createPlayer('p0', 'Marked', 'sock-0');
    const accuser = createPlayer('p1', 'Hunter', 'sock-1');
    accused.hasBounty = true;
    accuser.chamber = ['bullet', 'bullet', null, null, null, null];
    accuser.riskLevel = 2;
    room.players.push(accused, accuser);
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 1;
    room.phase = 'playing';
    room.discardPile = [];
    room.hands = new Map([['p0', []], ['p1', []]]);
    room.lastPlayedCard = { id: 'c1', type: 'shape', shape: 'square', number: 7 };
    room.playedPile = [room.lastPlayedCard];
    room.currentCardType = 'circle'; // mismatch → bluff is correct

    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);
    const banner = events.find(e => e.kind === 'bounty_collected');
    expect(banner).toBeTruthy();
    expect(accused.hasBounty).toBe(false);
    expect(accuser.chamber.filter(s => s === 'bullet').length).toBe(1);
  });

  it('does NOT fire on wrong bluff against bounty holder', () => {
    const cfg = configWith({ bounty: true });
    const room = createRoom('host', MODES.ONLINE, cfg);
    const accused = createPlayer('p0', 'Marked', 'sock-0');
    const accuser = createPlayer('p1', 'Hunter', 'sock-1');
    accused.hasBounty = true;
    room.players.push(accused, accuser);
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 1;
    room.phase = 'playing';
    room.discardPile = [];
    room.hands = new Map([['p0', []], ['p1', []]]);
    room.lastPlayedCard = { id: 'c1', type: 'shape', shape: 'circle', number: 7 };
    room.playedPile = [room.lastPlayedCard];
    room.currentCardType = 'circle'; // match → bluff wrong

    const { events } = resolveBluff(room, 'p1');
    expect(events.find(e => e.kind === 'bounty_collected')).toBeFalsy();
    expect(accused.hasBounty).toBe(true);
  });
});

// ─── Betting ─────────────────────────────────────────────────

describe('Betting — window opens for non-target players', () => {
  it('eligibleIds excludes the spin target', () => {
    const room = makeRoom(4);
    room.spinTargetId = 'p0';
    const eligible = startBettingWindow(room);
    expect(eligible.includes('p0')).toBe(false);
    expect(eligible.length).toBe(3);
    expect(room.betting.closesAt).toBeGreaterThan(Date.now());
  });

  it('placeBet rejects target', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    const res = placeBet(room, 'p0', 'survive');
    expect(res.ok).toBe(false);
  });

  it('placeBet accepts eligible player; can be overwritten', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    expect(placeBet(room, 'p1', 'survive').ok).toBe(true);
    expect(room.betting.bets.p1).toBe('survive');
    expect(placeBet(room, 'p1', 'eliminated').ok).toBe(true);
    expect(room.betting.bets.p1).toBe('eliminated');
  });

  it('placeBet rejects invalid prediction', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    expect(placeBet(room, 'p1', 'maybe').ok).toBe(false);
  });

  it('closeBettingWindow makes further bets fail', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    closeBettingWindow(room);
    expect(placeBet(room, 'p1', 'survive').ok).toBe(false);
  });

  it('does nothing when betting system disabled', () => {
    const room = makeRoom(3, configWith({ betting: false }));
    room.spinTargetId = 'p0';
    const eligible = startBettingWindow(room);
    expect(eligible).toEqual([]);
    expect(room.betting).toBeUndefined();
  });
});

describe('Betting — streak reward', () => {
  it('correct prediction increments counter; reset to 0 at 3 with risk drop', () => {
    const room = makeRoom(3);
    const better = room.players[1];
    better.chamber = ['bullet', 'bullet', null, null, null, null];
    better.riskLevel = 2;
    better.consecutiveCorrectBets = BETTING_STREAK_REWARD - 1; // already at 2

    room.spinTargetId = 'p0';
    startBettingWindow(room);
    placeBet(room, 'p1', 'survive');
    const events = evaluateBets(room, /* eliminated */ false);
    expect(better.consecutiveCorrectBets).toBe(0); // reset after reward
    expect(better.chamber.filter(s => s === 'bullet').length).toBe(1);
    expect(events.find(e => e.kind === 'betting_streak_reward')).toBeTruthy();
  });

  it('wrong prediction resets counter to 0', () => {
    const room = makeRoom(3);
    const better = room.players[1];
    better.consecutiveCorrectBets = 2;
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    placeBet(room, 'p1', 'survive'); // bet survive
    evaluateBets(room, /* eliminated */ true); // actually eliminated → wrong
    expect(better.consecutiveCorrectBets).toBe(0);
  });

  it('skipped players (no bet) do NOT change their counter', () => {
    const room = makeRoom(3);
    const skipper = room.players[1];
    skipper.consecutiveCorrectBets = 2;
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    // No bet placed.
    evaluateBets(room, false);
    expect(skipper.consecutiveCorrectBets).toBe(2);
  });

  it('clears room.betting after evaluation', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    placeBet(room, 'p1', 'survive');
    evaluateBets(room, false);
    expect(room.betting).toBeNull();
  });
});

// ─── Dead Man's Hand ─────────────────────────────────────────

describe('Dead Man\'s Hand — vote threshold', () => {
  it('threshold check: alive count must drop more than 2', () => {
    const room = makeRoom(6);
    expect(shouldOpenGhostVote(room)).toBe(false);
    room.players[0].status = 'eliminated';
    room.players[1].status = 'eliminated';
    expect(shouldOpenGhostVote(room)).toBe(false);
    room.players[2].status = 'eliminated';
    expect(shouldOpenGhostVote(room)).toBe(true);
  });

  it('disabled in config → false even past threshold', () => {
    const room = makeRoom(6, configWith({ deadMansHand: false }));
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    expect(shouldOpenGhostVote(room)).toBe(false);
  });
});

describe('Dead Man\'s Hand — vote options', () => {
  it('option 3 hidden when no risk modifier enabled', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    const v = startGhostVote(room);
    expect(v.optionIds).toEqual([1, 2]);
  });

  it('option 3 visible when at least one risk modifier enabled', () => {
    const room = makeRoom(6, configWith(
      { bounty: true, betting: true, deadMansHand: true, lastStand: true },
      { doubleBarrel: true }
    ));
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    const v = startGhostVote(room);
    expect(v.optionIds).toEqual([1, 2, 3]);
  });

  it('only eligible (eliminated) voters can cast votes', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    expect(castGhostVote(room, 'p4', 1).ok).toBe(false); // alive
    expect(castGhostVote(room, 'p0', 1).ok).toBe(true);  // eliminated
  });

  it('rejects invalid option ids', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    expect(castGhostVote(room, 'p0', 99).ok).toBe(false);
  });
});

describe('Dead Man\'s Hand — tally + effects', () => {
  it('tie produces no-op banner', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    castGhostVote(room, 'p0', 1);
    castGhostVote(room, 'p1', 2);
    const banner = resolveGhostVote(room);
    expect(banner.applied).toBe('noop');
    expect(banner.winningOption).toBeNull();
  });

  it('no votes at all → noop', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    const banner = resolveGhostVote(room);
    expect(banner.applied).toBe('noop');
  });

  it('option 1: changes required shape to a different shape', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    room.currentCardType = 'circle';
    startGhostVote(room);
    castGhostVote(room, 'p0', 1);
    castGhostVote(room, 'p1', 1);
    castGhostVote(room, 'p2', 1);
    const banner = resolveGhostVote(room);
    expect(banner.winningOption).toBe(1);
    expect(banner.applied).toMatch(/^shape:/);
    expect(room.currentCardType).not.toBe('circle');
  });

  it('option 2: deals one extra card to every alive player', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    const aliveBefore = room.players.filter(p => p.status === 'alive');
    const handSizes = new Map(aliveBefore.map(p => [p.id, room.hands.get(p.id).length]));
    startGhostVote(room);
    castGhostVote(room, 'p0', 2);
    castGhostVote(room, 'p1', 2);
    castGhostVote(room, 'p2', 2);
    const banner = resolveGhostVote(room);
    expect(banner.winningOption).toBe(2);
    expect(banner.applied).toBe('extra_cards');
    for (const p of aliveBefore) {
      expect(room.hands.get(p.id).length).toBe(handSizes.get(p.id) + 1);
    }
  });

  it('option 3: stamps a random risk modifier when one is enabled', () => {
    const room = makeRoom(6, configWith(
      { deadMansHand: true },
      { doubleBarrel: true }
    ));
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    castGhostVote(room, 'p0', 3);
    castGhostVote(room, 'p1', 3);
    const banner = resolveGhostVote(room);
    expect(banner.winningOption).toBe(3);
    expect(banner.applied).toBe('risk_mod:doubleBarrel');
    expect(room.activeGhostRiskMod).toBeTruthy();
    expect(room.activeGhostRiskMod.name).toBe('doubleBarrel');
  });

  it('clears room.ghostVote after resolution', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    castGhostVote(room, 'p0', 1);
    resolveGhostVote(room);
    expect(room.ghostVote).toBeNull();
  });
});

// ─── Last Stand ──────────────────────────────────────────────

describe('Last Stand — entry conditions', () => {
  it('triggers exactly when alive count = 2 and no pending phases', () => {
    const room = makeRoom(4);
    expect(shouldEnterLastStand(room)).toBe(false);
    room.players[0].status = 'eliminated';
    expect(shouldEnterLastStand(room)).toBe(false);
    room.players[1].status = 'eliminated';
    expect(shouldEnterLastStand(room)).toBe(true);
  });

  it('does NOT trigger if disabled in config', () => {
    const room = makeRoom(4, configWith({ lastStand: false }));
    room.players[0].status = 'eliminated';
    room.players[1].status = 'eliminated';
    expect(shouldEnterLastStand(room)).toBe(false);
  });

  it('does NOT re-trigger when already in last_stand phase', () => {
    const room = makeRoom(4);
    room.players[0].status = 'eliminated';
    room.players[1].status = 'eliminated';
    room.phase = 'last_stand';
    expect(shouldEnterLastStand(room)).toBe(false);
  });

  it('does NOT trigger during pending pause phases', () => {
    const room = makeRoom(4);
    room.players[0].status = 'eliminated';
    room.players[1].status = 'eliminated';
    room.phase = 'spin_pending';
    expect(shouldEnterLastStand(room)).toBe(false);
  });
});

describe('Last Stand — entry consumes armed cards + clears hands', () => {
  function setupFinalists() {
    const room = makeRoom(4);
    // Eliminate p2, p3 to leave p0, p1 alive.
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    // Stack hands and arm cards on the finalists.
    room.hands.set('p0', [
      { id: 'c1', type: 'shape', shape: 'circle', number: 1 },
      { id: 'c2', type: 'power', power: 'shield', armed: true },
    ]);
    room.hands.set('p1', [
      { id: 'c3', type: 'shape', shape: 'square', number: 2 },
    ]);
    room.players[0].armedPowerCard = { power: 'shield', cardId: 'c2', activatedAtTurn: 0, activatedAtRound: 1 };
    // Pre-stack chambers with extra bullets.
    room.players[0].chamber = ['bullet', 'bullet', 'bullet', null, null, null];
    room.players[0].riskLevel = 3;
    room.players[1].chamber = ['bullet', 'bullet', null, null, null, null];
    room.players[1].riskLevel = 2;
    return room;
  }

  it('clears hands, resets chambers, consumes armed cards, sets phase', () => {
    const room = setupFinalists();
    enterLastStand(room);

    expect(room.phase).toBe('last_stand');
    expect(room.lastStand).toBeTruthy();
    expect(room.lastStand.finalistIds).toHaveLength(2);

    expect(room.hands.get('p0')).toEqual([]);
    expect(room.hands.get('p1')).toEqual([]);

    // Chambers reset to exactly 1 bullet each.
    expect(room.players[0].chamber.filter(s => s === 'bullet').length).toBe(1);
    expect(room.players[1].chamber.filter(s => s === 'bullet').length).toBe(1);
    expect(room.players[0].riskLevel).toBe(1);
    expect(room.players[1].riskLevel).toBe(1);

    // Armed power cards consumed.
    expect(room.players[0].armedPowerCard).toBeNull();
    // Discard pile received the cleared hand contents.
    expect(room.discardPile.length).toBeGreaterThanOrEqual(3);
  });

  it('synthesises turnOrder to just the two finalists', () => {
    const room = setupFinalists();
    enterLastStand(room);
    expect(room.turnOrder).toHaveLength(2);
    expect(room.turnOrder).toContain('p0');
    expect(room.turnOrder).toContain('p1');
  });
});

describe('Last Stand — spin + winner declaration', () => {
  function setupLastStand() {
    const room = makeRoom(4);
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    enterLastStand(room);
    return room;
  }

  it('only the active finalist can spin', () => {
    const room = setupLastStand();
    const active = room.lastStand.activeFinalistId;
    const other = room.lastStand.finalistIds.find(id => id !== active);
    const res = lastStandSpin(room, other);
    expect(res.ok).toBe(false);
  });

  it('end_turn passes the gun to the other finalist', () => {
    const room = setupLastStand();
    const active = room.lastStand.activeFinalistId;
    const other = room.lastStand.finalistIds.find(id => id !== active);
    const res = lastStandEndTurn(room, active);
    expect(res.ok).toBe(true);
    expect(room.lastStand.activeFinalistId).toBe(other);
  });

  it('survival mutates chamber, no game over', () => {
    const room = setupLastStand();
    const active = room.lastStand.activeFinalistId;
    // Force a chamber with no bullets so the spin always survives.
    const player = room.players.find(p => p.id === active);
    player.chamber = [null, null, null, null, null, null];
    const res = lastStandSpin(room, active);
    expect(res.ok).toBe(true);
    expect(res.eliminated).toBe(false);
  });

  it('elimination ends Last Stand and game_over is winnable', () => {
    const room = setupLastStand();
    const active = room.lastStand.activeFinalistId;
    const player = room.players.find(p => p.id === active);
    // Force a chamber that will definitely hit a bullet.
    player.chamber = ['bullet', 'bullet', 'bullet', 'bullet', 'bullet', 'bullet'];
    const res = lastStandSpin(room, active);
    expect(res.ok).toBe(true);
    expect(res.eliminated).toBe(true);
    expect(player.status).toBe('eliminated');
  });

  it('rejects last_stand_spin outside last_stand phase', () => {
    const room = makeRoom(2);
    const res = lastStandSpin(room, 'p0');
    expect(res.ok).toBe(false);
  });
});

// ─── Serialization ───────────────────────────────────────────

describe('serializeRoom — Phase F fields', () => {
  it('exposes hasBounty + counters publicly', () => {
    const room = makeRoom(3);
    room.players[0].hasBounty = true;
    room.players[0].consecutiveSurvivedSpins = 0;
    room.players[1].consecutiveCorrectBets = 2;
    const view = serializeRoom(room, 'p2');
    const p0 = view.players.find(p => p.id === 'p0');
    const p1 = view.players.find(p => p.id === 'p1');
    expect(p0.hasBounty).toBe(true);
    expect(p1.consecutiveCorrectBets).toBe(2);
  });

  it('includes betting state when window is open', () => {
    const room = makeRoom(3);
    room.spinTargetId = 'p0';
    startBettingWindow(room);
    placeBet(room, 'p1', 'survive');
    const view = serializeRoom(room, 'p1');
    expect(view.betting).toBeTruthy();
    expect(view.betting.spinTargetId).toBe('p0');
    expect(view.betting.myBet).toBe('survive');
  });

  it('hides ghostVote options from non-eligible (alive) viewers', () => {
    const room = makeRoom(6);
    for (let i = 0; i < 4; i++) room.players[i].status = 'eliminated';
    startGhostVote(room);
    const ghostView = serializeRoom(room, 'p0'); // eliminated
    const liveView = serializeRoom(room, 'p4');  // alive
    expect(ghostView.ghostVote.optionIds).toBeTruthy();
    expect(liveView.ghostVote.optionIds).toBeNull();
  });

  it('includes lastStand state when in last_stand phase', () => {
    const room = makeRoom(4);
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    enterLastStand(room);
    const view = serializeRoom(room, 'p0');
    expect(view.lastStand).toBeTruthy();
    expect(view.lastStand.finalistIds).toHaveLength(2);
  });
});
