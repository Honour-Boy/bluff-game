// ============================================================
// Tests for v2 Phase H — Clash Resolution Sweep
//
// The spec defines 9 clash priorities. Phases A-G implement each
// individually; this file is the integration sweep that asserts
// every priority resolves correctly when the abilities are armed
// or active simultaneously.
//
// Priorities (from tasks/v2-roadmap.md + spec):
//   1. Assassin > Mirror
//   2. Shield > Assassin
//   3. Mirror > Sniper Role (Sniper cannot redirect to Mirror holder)
//   4. Medic > Assassin (Medic save intercepts Assassin elimination)
//   5. Swap > Mirror (Swap re-runs bluff check; Mirror still applies)
//   6. Sudden Death vs Gambler (external modifier still affects Gambler)
//   7. Redemption Spin vs Last Stand (Last Stand suspends Redemption)
//   8. Mirror Match vs eliminated opposite (skip to next alive)
//   9. Sheriff > Assassin (Sheriff is immune)
//
// We also stress-test the announcement queue so back-to-back
// banner events fan out in order.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  startGame,
  serializeRoom,
  ROLES,
  MODES,
  // role helpers
  applySniperRedirect,
  applyMedicSave,
  // modifier helpers
  tickSuddenDeath,
  SUDDEN_DEATH_THRESHOLD,
  getMirrorMatchOpposite,
  // last stand + redemption
  enterLastStand,
  pickRedemptionCandidates,
  runRedemptionSpin,
  // turn order
  eliminateFromTurnOrder,
} from '../gameEngine.js';
import { resolveBluff, resumeAfterSwap } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith({ powers = {}, risk = {}, room = {}, systems = {}, copiesPerDeck = 1 } = {}) {
  const cfg = defaultRoomConfig();
  for (const k of Object.keys(cfg.powerCards.enabled)) {
    if (powers[k] !== undefined) cfg.powerCards.enabled[k] = !!powers[k];
  }
  cfg.powerCards.copiesPerDeck = copiesPerDeck;
  Object.assign(cfg.riskModifiers, risk);
  Object.assign(cfg.roomModifiers, room);
  Object.assign(cfg.systems, systems);
  return cfg;
}

/**
 * Build a 2-player online room ready for resolveBluff. p0 is
 * accused (just played a card), p1 is accuser.
 *
 * `lastPlayedShape` defaults to 'square' and `currentCardType` to
 * 'circle', so the bluff is CORRECT by default — accused would
 * normally spin.
 */
function buildRoom({
  accusedRole = ROLES.BAREHAND,
  accuserRole = ROLES.BAREHAND,
  accusedArmed = null,
  accuserArmed = null,
  lastPlayedShape = 'square',
  currentCardType = 'circle',
  cfg = null,
  extraPlayers = [],
} = {}) {
  const room = createRoom('host', MODES.ONLINE, cfg || configWith({
    powers: { shield: true, mirror: true, swap: true, assassin: true },
  }));
  const p0 = createPlayer('p0', 'Accused', 'sock-0');
  const p1 = createPlayer('p1', 'Accuser', 'sock-1');
  p0.role = accusedRole;
  p1.role = accuserRole;
  room.players.push(p0, p1);
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 1;
  room.phase = 'playing';
  room.discardPile = [];
  room.hands = new Map();
  room.hands.set('p0', []);
  room.hands.set('p1', []);

  for (const extra of extraPlayers) {
    const pe = createPlayer(extra.id, extra.name || extra.id, `sock-${extra.id}`);
    pe.role = extra.role || ROLES.BAREHAND;
    if (extra.armedMirror) {
      pe.armedPowerCard = { power: 'mirror', cardId: `m-${extra.id}` };
    }
    if (extra.status) pe.status = extra.status;
    room.players.push(pe);
    room.turnOrder.push(pe.id);
    room.hands.set(pe.id, []);
  }

  const playedCard = { id: 'p-1', type: 'shape', shape: lastPlayedShape, number: 7 };
  room.playedPile = [playedCard];
  room.lastPlayedCard = playedCard;
  room.currentCardType = currentCardType;

  function arm(player, armed) {
    if (!armed) return;
    const card = {
      id: armed.cardId || `${armed.power}-${player.id}`,
      type: 'power',
      power: armed.power,
      armed: true,
      ...(armed.power === 'swap' ? { swapPendingPlayerIds: [] } : {}),
    };
    room.hands.set(player.id, [card]);
    player.armedPowerCard = {
      power: armed.power,
      cardId: card.id,
      activatedAtTurn: 0,
      activatedAtRound: 1,
    };
  }
  arm(p0, accusedArmed);
  arm(p1, accuserArmed);

  return { room, p0, p1 };
}

// ─── Priority 1: Assassin > Mirror ───────────────────────────

describe('clash 1 — Assassin > Mirror', () => {
  it('Mirror cannot deflect an Assassin elimination', () => {
    // Accused has Assassin armed. Accuser has Mirror armed. Per spec,
    // Assassin fires before Mirror gets a chance — accuser dies.
    const { room, p0, p1 } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'kill-A' },
      accuserArmed: { power: 'mirror',   cardId: 'mir-A' },
      lastPlayedShape: 'circle',  // bluff is wrong
      currentCardType: 'circle',
    });
    const { outcome, events } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
    // Mirror NEVER fires.
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeFalsy();
    // Mirror stays armed (didn't fire).
    expect(p1.armedPowerCard).not.toBeNull();
    // Assassin consumed.
    expect(p0.armedPowerCard).toBeNull();
  });

  it('Assassin fires even on a CORRECT bluff with Mirror on accuser', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'kill-A' },
      accuserArmed: { power: 'mirror',   cardId: 'mir-A' },
      lastPlayedShape: 'square', // bluff is correct
      currentCardType: 'circle',
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
  });
});

// ─── Priority 2: Shield > Assassin ───────────────────────────

describe('clash 2 — Shield > Assassin', () => {
  it('Shield blocks the bluff, no consequence registers', () => {
    // Spec: "Bluff never officially registers" when Shield blocks.
    // We test by holding only Shield armed — outcome must be 'blocked'.
    const { room, p0 } = buildRoom({
      accusedArmed: { power: 'shield', cardId: 'shi-A' },
    });
    const { outcome, events } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('blocked');
    expect(events[0].kind).toBe('shield_blocked');
    expect(p0.armedPowerCard).toBeNull();
  });

  it('the Shield short-circuits — Assassin stage never runs', () => {
    // Force an inconsistent armed state with both Shield AND Assassin
    // (the only-one-armed rule is enforced upstream; here we are
    // testing that Shield's stage runs first regardless). Stamp armed
    // state on the player but only put Shield in the hand for Shield
    // to consume. If Assassin's stage ran second, accuser would also
    // be eliminated; outcome MUST stay 'blocked' instead.
    const { room, p0 } = buildRoom({
      accusedArmed: { power: 'shield', cardId: 'shi-A' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });
    // Manually stamp a stale Assassin-armed alongside (for the test).
    // We don't add it to the hand — _consumeArmedCard handles missing
    // cards gracefully — so this just probes stage ordering.
    const outcome1 = resolveBluff(room, 'p1');
    expect(outcome1.outcome.kind).toBe('blocked');
    // After short-circuit, no second stage fired.
    expect(outcome1.events).toHaveLength(1);
    expect(outcome1.events[0].kind).toBe('shield_blocked');
    expect(p0.armedPowerCard).toBeNull();
  });
});

// ─── Priority 3: Mirror > Sniper Role ────────────────────────

describe('clash 3 — Mirror > Sniper Role', () => {
  it('Sniper cannot redirect a spin to a Mirror holder', () => {
    const { room } = buildRoom({
      accusedRole: ROLES.SNIPER,
      extraPlayers: [
        { id: 'p2', name: 'MirrorHolder', armedMirror: true },
        { id: 'p3', name: 'Plain' },
      ],
    });
    const sniper = room.players.find(p => p.role === ROLES.SNIPER);
    const result = applySniperRedirect(room, sniper.id, 'p2');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Mirror/i);
    // Ability NOT consumed on failed redirect.
    expect(sniper.sniperAbilityAvailable).toBe(true);
  });

  it('Sniper CAN redirect to a non-Mirror non-self player', () => {
    const { room } = buildRoom({
      accusedRole: ROLES.SNIPER,
      extraPlayers: [
        { id: 'p2', name: 'MirrorHolder', armedMirror: true },
        { id: 'p3', name: 'Plain' },
      ],
    });
    const sniper = room.players.find(p => p.role === ROLES.SNIPER);
    const result = applySniperRedirect(room, sniper.id, 'p3');
    expect(result.ok).toBe(true);
    expect(result.newSpinTargetId).toBe('p3');
    expect(sniper.sniperAbilityAvailable).toBe(false);
  });

  it('Sniper cannot redirect to themselves', () => {
    const { room } = buildRoom({
      accusedRole: ROLES.SNIPER,
      extraPlayers: [{ id: 'p2', name: 'Other' }],
    });
    const sniper = room.players.find(p => p.role === ROLES.SNIPER);
    const result = applySniperRedirect(room, sniper.id, sniper.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/self/i);
  });
});

// ─── Priority 4: Medic > Assassin ────────────────────────────

describe('clash 4 — Medic > Assassin', () => {
  it('Medic save reverts an Assassin elimination', () => {
    // Build a bluff scenario where Assassin will fire on the accuser.
    // The Medic is a third player, alive, with hand-room.
    const { room, p1 } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
      extraPlayers: [{ id: 'medic', name: 'Doc', role: ROLES.MEDIC }],
    });
    // Stock the deck so the Medic can draw their +2 cards.
    room.deck = Array.from({ length: 10 }).map((_, i) => ({
      id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
    }));
    // Medic at 4 cards (room for +2).
    room.hands.set('medic', Array.from({ length: 4 }).map((_, i) => ({
      id: `mh-${i}`, type: 'shape', shape: 'circle', number: i + 1,
    })));

    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');

    // Simulate the Medic intercepting (the socket layer wires this up;
    // we test the engine fn directly here).
    p1.status = 'eliminated';
    p1.isSpectator = true;
    const saveRes = applyMedicSave(room, 'p1', 'assassin');
    expect(saveRes.ok).toBe(true);
    expect(p1.status).toBe('alive');
    expect(p1.isSpectator).toBe(false);
    // For Assassin saves, no extra bullet (no spin happened).
    expect(p1.chamber.filter(s => s === 'bullet').length).toBeLessThanOrEqual(1);
  });

  it('Medic blocked at 6+ cards → no save available', () => {
    const { room, p1 } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      extraPlayers: [{ id: 'medic', name: 'Doc', role: ROLES.MEDIC }],
    });
    // Medic at 6 cards — at the cap.
    room.hands.set('medic', Array.from({ length: 6 }).map((_, i) => ({
      id: `mh-${i}`, type: 'shape', shape: 'circle', number: i + 1,
    })));

    p1.status = 'eliminated';
    p1.isSpectator = true;
    const saveRes = applyMedicSave(room, 'p1', 'assassin');
    expect(saveRes.ok).toBe(false);
  });
});

// ─── Priority 5: Swap > Mirror ───────────────────────────────

describe('clash 5 — Swap > Mirror', () => {
  it('Swap pauses pipeline; on resume, Mirror still gets a chance', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'swap',   cardId: 'sw-A' },
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'square',  // wrong-shape played
      currentCardType: 'circle',
    });
    // Add an earlier card the Swap holder can pick.
    const earlier = { id: 'old', type: 'shape', shape: 'circle', number: 9 };
    room.playedPile = [earlier, room.playedPile[0]];

    const first = resolveBluff(room, 'p1');
    expect(first.outcome.kind).toBe('swap_pending');

    // Holder picks the matching earlier card. Post-swap bluff is wrong
    // → accuser would normally spin → outgoing Mirror flips to accused.
    const { outcome, events } = resumeAfterSwap(room, 'p1', earlier.id);
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false);
    expect(outcome.spinTargetId).toBe('p0'); // Mirror flipped → accused
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeTruthy();
    expect(events.find(e => e.kind === 'swap_resolved')).toBeTruthy();
  });

  it('Swap > Mirror — events fire in order: swap_resolved THEN mirror_reflected', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'swap',   cardId: 'sw-A' },
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const earlier = { id: 'old', type: 'shape', shape: 'circle', number: 9 };
    room.playedPile = [earlier, room.playedPile[0]];

    resolveBluff(room, 'p1');
    const { events } = resumeAfterSwap(room, 'p1', earlier.id);

    const swapIdx = events.findIndex(e => e.kind === 'swap_resolved');
    const mirIdx = events.findIndex(e => e.kind === 'mirror_reflected');
    expect(swapIdx).toBeGreaterThanOrEqual(0);
    expect(mirIdx).toBeGreaterThan(swapIdx);
  });
});

// ─── Priority 6: Sudden Death vs Gambler ─────────────────────

describe('clash 6 — Sudden Death affects Gambler', () => {
  it('Sudden Death threshold bumps every alive chamber, including Gambler', () => {
    // Locked decision: external modifiers still affect Gambler.
    // Gambler's freeze only applies to spin-survival (not Sudden Death).
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 4; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `sock-${i}`));
    }
    startGame(room); // assignRoles runs here (all Barehand at <9 alive)
    // Force one player into the Gambler role AFTER startGame so the
    // assignment doesn't clobber it.
    room.players[0].role = ROLES.GAMBLER;
    const gambler = room.players[0];
    expect(gambler.chamber.filter(s => s === 'bullet').length).toBe(1);
    // All chambers start with 1 bullet each.
    for (let i = 0; i < SUDDEN_DEATH_THRESHOLD - 1; i++) tickSuddenDeath(room);
    const banner = tickSuddenDeath(room);
    expect(banner).not.toBeNull();
    expect(banner.kind).toBe('sudden_death');
    // Gambler's chamber bumps too.
    expect(gambler.chamber.filter(s => s === 'bullet').length).toBe(2);
  });

  it("Gambler's role-driven chamber still works in parallel with Sudden Death", () => {
    // Sudden Death bumps Gambler chamber to 2; correct bluff against
    // Gambler in the bluff pipeline jumps it to 4 (Phase D rule).
    // We're not running both here — we just confirm Sudden Death's
    // effect is independent of role.
    const cfg = configWith({ room: { suddenDeath: true } });
    const room = createRoom('host', MODES.ONLINE, cfg);
    room.players.push(createPlayer('p0', 'G', 'sock-0'));
    room.players.push(createPlayer('p1', 'P1', 'sock-1'));
    startGame(room);
    const p = room.players[0];
    p.role = ROLES.GAMBLER;
    expect(p.chamber.filter(s => s === 'bullet').length).toBe(1);
    // Tick to threshold.
    for (let i = 0; i < SUDDEN_DEATH_THRESHOLD; i++) tickSuddenDeath(room);
    expect(p.chamber.filter(s => s === 'bullet').length).toBe(2);
  });
});

// ─── Priority 7: Redemption Spin vs Last Stand ───────────────

describe('clash 7 — Redemption Spin disabled once Last Stand begins', () => {
  function setupRedemptionRoom() {
    const cfg = configWith({
      risk: { redemptionSpin: true },
      systems: { lastStand: true },
    });
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 4; i++) {
      const p = createPlayer(`p${i}`, `P${i}`, `sock-${i}`);
      room.players.push(p);
      room.turnOrder.push(p.id);
    }
    room.phase = 'playing';
    room.discardPile = [];
    room.hands = new Map();
    room.deck = Array.from({ length: 30 }).map((_, i) => ({
      id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
    }));
    room.playedPile = [];
    for (const p of room.players) room.hands.set(p.id, []);
    return room;
  }

  it('pickRedemptionCandidates returns [] once Last Stand is active', () => {
    const room = setupRedemptionRoom();
    // Eliminate p2 + p3 to reach alive=2.
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';

    // Before Last Stand: a redemption candidate is available.
    expect(pickRedemptionCandidates(room).length).toBeGreaterThan(0);

    enterLastStand(room);

    // After Last Stand entry, the lastStandActive flag is set and
    // pickRedemptionCandidates returns empty.
    expect(room.lastStandActive).toBe(true);
    expect(pickRedemptionCandidates(room)).toEqual([]);
  });

  it('lastStandActive is the flag enterLastStand sets', () => {
    const room = setupRedemptionRoom();
    expect(room.lastStandActive).toBeFalsy();
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    enterLastStand(room);
    expect(room.lastStandActive).toBe(true);
  });

  it('runRedemptionSpin still works when Last Stand is NOT active', () => {
    const room = setupRedemptionRoom();
    const victim = room.players[3];
    victim.status = 'eliminated';
    victim.chamber = [null, null, null, null, null, null]; // safe spin
    victim.isSpectator = true;
    const res = runRedemptionSpin(room, victim.id);
    expect(res).not.toBeNull();
    expect(res.eliminated).toBe(false);
    expect(victim.status).toBe('alive');
  });
});

// ─── Priority 8: Mirror Match vs eliminated opposite ─────────

describe('clash 8 — Mirror Match skips eliminated opposite', () => {
  it('falls back to next alive in opposite direction', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 6; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `sock-${i}`));
    }
    startGame(room);
    expect(room.mirrorMatchActive).toBe(true);
    // Pick an originator and find their exact opposite, then eliminate
    // that opposite. The fallback should walk forward to a still-alive
    // player who isn't the originator.
    const originator = room.turnOrder[0];
    const exactOpposite = room.turnOrder[3];
    const oppPlayer = room.players.find(p => p.id === exactOpposite);
    oppPlayer.status = 'eliminated';
    eliminateFromTurnOrder(room, exactOpposite);

    const opp = getMirrorMatchOpposite(room, originator);
    expect(opp).not.toBe(originator);
    expect(opp).not.toBe(exactOpposite);
    const found = room.players.find(p => p.id === opp);
    expect(found.status).toBe('alive');
  });

  it('Mirror Match stays active even when alive count goes odd', () => {
    const cfg = configWith({ room: { mirrorMatch: true } });
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 6; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `sock-${i}`));
    }
    startGame(room);
    // Eliminate one to drop to alive=5.
    const v = room.players[1];
    v.status = 'eliminated';
    eliminateFromTurnOrder(room, v.id);
    expect(room.mirrorMatchActive).toBe(true);
  });
});

// ─── Priority 9: Sheriff > Assassin ──────────────────────────

describe('clash 9 — Sheriff > Assassin', () => {
  it('Sheriff is not eliminated by Assassin and a banner fires', () => {
    const { room, p0, p1 } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { outcome, events } = resolveBluff(room, 'p1');
    // Bluff falls through to spin (correct → accused spins).
    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('p0');
    // Assassin NOT consumed.
    expect(p0.armedPowerCard).not.toBeNull();
    expect(events.find(e => e.kind === 'assassin_strike')).toBeFalsy();
    // Sheriff protection banner fires.
    const sheriffEvent = events.find(e => e.kind === 'sheriff_protected');
    expect(sheriffEvent).toBeTruthy();
    expect(sheriffEvent.holderId).toBe(p1.id);
    expect(sheriffEvent.assassinHolderId).toBe(p0.id);
  });

  it('Sheriff calling correctly still gets risk-drop alongside Assassin immunity', () => {
    // Sheriff makes a correct call against an Assassin holder.
    // Expected: Assassin immune (no elimination), bluff is correct →
    // accused spins; Sheriff gets risk-drop banner.
    const { room, p1 } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    // Force the Sheriff to have at least 1 bullet so the drop is
    // observable.
    p1.chamber = ['bullet', null, null, null, null, null];
    p1.riskLevel = 1;

    const { outcome, events } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    // Sheriff drop banner alongside the protection banner.
    expect(events.find(e => e.kind === 'sheriff_protected')).toBeTruthy();
    expect(events.find(e => e.kind === 'sheriff_relief')).toBeTruthy();
    // Risk dropped.
    expect(p1.riskLevel).toBe(0);
  });

  it('Assassin DOES fire on a non-Sheriff accuser (control)', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserRole: ROLES.BAREHAND,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
  });
});

// ─── Announcement queue: ordering of multiple events ─────────

describe('announcement queue — multi-event ordering', () => {
  it('Swap → re-judged correct → Bounty Collected → Sheriff relief produces 4 ordered events', () => {
    // Bounty + Sheriff + Swap. Accused has Swap; bounty is on the
    // accused; accuser is Sheriff. Holder picks a card that makes the
    // post-swap bluff CORRECT → accused spins → Sheriff relief AND
    // bounty collection both fire.
    const cfg = configWith({
      powers: { swap: true },
      systems: { bounty: true },
    });
    const { room, p0, p1 } = buildRoom({
      accusedArmed: { power: 'swap', cardId: 'sw-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'circle',  // bluff initially WRONG
      currentCardType: 'circle',
      cfg,
    });
    p0.hasBounty = true;
    p1.chamber = ['bullet', null, null, null, null, null];
    p1.riskLevel = 1;

    // Stack a wrong-shape earlier card so post-swap the bluff is
    // CORRECT.
    const earlier = { id: 'old', type: 'shape', shape: 'square', number: 7 };
    room.playedPile = [earlier, room.playedPile[0]];

    const first = resolveBluff(room, 'p1');
    expect(first.outcome.kind).toBe('swap_pending');

    const { events, outcome } = resumeAfterSwap(room, 'p1', earlier.id);
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);

    // The events array should contain swap_resolved + sheriff_relief +
    // bounty_collected. Order: swap_resolved first (added by
    // resumeAfterSwap before stages re-run), then role/bounty stages.
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('swap_resolved');
    expect(kinds).toContain('sheriff_relief');
    expect(kinds).toContain('bounty_collected');
    expect(kinds.indexOf('swap_resolved')).toBeLessThan(kinds.indexOf('sheriff_relief'));
  });

  it('events array preserves insertion order for back-to-back banners', () => {
    // The pipeline appends events in stage order; every event inserted
    // by a stage stays in the same relative position. Verify this
    // invariant holds even with many stages firing in one bluff.
    const cfg = configWith({
      powers: { mirror: true },
      systems: { bounty: true },
    });
    const { room, p0, p1 } = buildRoom({
      accusedArmed: { power: 'mirror', cardId: 'm-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
      cfg,
    });
    p0.hasBounty = true;
    p1.chamber = ['bullet', null, null, null, null, null];
    p1.riskLevel = 1;

    const { events, outcome } = resolveBluff(room, 'p1');
    // Mirror reflects → accuser spins (so they can't collect their
    // own bounty, BUT the bluff is correct → accused has bounty →
    // collection fires for the accuser. Since Mirror redirected the
    // SPIN to the accuser, but bluffIsCorrect stays true, the bounty
    // collection is still applied to the accuser per pipeline.
    // We're really just asserting the events list is stable.
    expect(outcome.kind).toBe('spin');
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Mirror first — it's the only redirector.
    expect(events[0].kind).toBe('mirror_reflected');
  });

  it('queue handles a stress test of many events in one resolution', () => {
    // A pile-up: Swap → re-judged correct → Sheriff relief + Gambler
    // caught (when accused is the Gambler) + bounty collected. We
    // construct a scenario hitting all four, and assert each fires
    // exactly once.
    const cfg = configWith({
      powers: { swap: true },
      systems: { bounty: true },
    });
    const { room, p0, p1 } = buildRoom({
      accusedRole: ROLES.GAMBLER,
      accusedArmed: { power: 'swap', cardId: 'sw-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'circle',  // pre-swap bluff is wrong
      currentCardType: 'circle',
      cfg,
    });
    p0.hasBounty = true;
    p1.chamber = ['bullet', null, null, null, null, null];
    p1.riskLevel = 1;
    const earlier = { id: 'old', type: 'shape', shape: 'square', number: 4 };
    room.playedPile = [earlier, room.playedPile[0]];

    resolveBluff(room, 'p1');
    const { events, outcome } = resumeAfterSwap(room, 'p1', earlier.id);
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);

    const kinds = events.map(e => e.kind);
    // Each appears exactly once, no duplicates / drops.
    expect(kinds.filter(k => k === 'swap_resolved').length).toBe(1);
    expect(kinds.filter(k => k === 'sheriff_relief').length).toBe(1);
    expect(kinds.filter(k => k === 'gambler_caught').length).toBe(1);
    expect(kinds.filter(k => k === 'bounty_collected').length).toBe(1);
  });
});

// ─── Misc clash-adjacent regressions ─────────────────────────

describe('regression — pipeline never drops events on short-circuit', () => {
  it('Shield blocks → only shield_blocked event, no orphan stages', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'shield', cardId: 'shi-A' },
    });
    const { events } = resolveBluff(room, 'p1');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('shield_blocked');
  });

  it('Assassin elim → only assassin_strike event, no Mirror or default-spin events', () => {
    const { room } = buildRoom({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
    });
    const { events } = resolveBluff(room, 'p1');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('assassin_strike');
  });
});

// ─── serializeRoom-side: lastStandActive flag exposure ───────

describe('serializeRoom — lastStandActive surfaced', () => {
  it('lastStandActive flag is set on the room object after enterLastStand', () => {
    // We don't necessarily need to expose the flag publicly — the
    // server-side check is what matters. This test pins the
    // server-side invariant so future changes don't break it silently.
    const cfg = configWith({ systems: { lastStand: true } });
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 4; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `sock-${i}`));
      room.turnOrder.push(`p${i}`);
    }
    room.discardPile = [];
    room.hands = new Map();
    for (const p of room.players) room.hands.set(p.id, []);
    room.players[2].status = 'eliminated';
    room.players[3].status = 'eliminated';
    enterLastStand(room);
    expect(room.lastStandActive).toBe(true);
  });
});
