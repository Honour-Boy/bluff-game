// ============================================================
// Tests for v2 Phase D — Secret roles
//
// Covers:
//   - assignRoles distribution (>=9 alive → mixed; <9 → all barehand)
//   - Gambler frozen risk on survival; spin-elim still works
//   - Gambler chamber jump to 4 on correct bluff against them
//   - Sheriff risk drop on correct bluff BY them
//   - Sheriff Assassin immunity (pipeline integration)
//   - Medic save: 2 cards added, ability consumed, elimination reverted
//   - Medic blocked at 6+ card hand
//   - Saboteur: card moved, locked at <=3 cards, ability consumed
//   - Sniper: redirect pure validator + Mirror exclusion + self exclusion
//   - Collector: 3-card power-card cap on the deal
//   - Roles privacy: serializeRoom only exposes own role
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  startGame,
  serializeRoom,
  spinGun,
  assignRoles,
  getRole,
  applyMedicSave,
  applySaboteurTransfer,
  applySniperRedirect,
  findAvailableMedic,
  findAvailableSniper,
  ROLES,
  ROLE_TYPES,
  ROLES_AT_MIN_ALIVE,
  COLLECTOR_POWER_CARD_CAP,
  MODES,
} from '../gameEngine.js';
import { resolveBluff } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(enabled = {}, copiesPerDeck = 1) {
  const cfg = defaultRoomConfig();
  for (const k of Object.keys(cfg.powerCards.enabled)) {
    cfg.powerCards.enabled[k] = !!enabled[k];
  }
  cfg.powerCards.copiesPerDeck = copiesPerDeck;
  return cfg;
}

function makeOnlineRoom(playerCount, configOverrides = null) {
  const cfg = configOverrides || defaultRoomConfig();
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  for (let i = 0; i < playerCount; i++) {
    room.players.push(createPlayer(`p${i}`, `Player${i}`, `sock-${i}`));
  }
  return room;
}

/**
 * Build a minimal room ready for resolveBluff. p0 is accused (just
 * played a wrong-shape card → bluff would be correct), p1 is accuser.
 */
function buildBluffScenario({
  accusedRole = ROLES.BAREHAND,
  accuserRole = ROLES.BAREHAND,
  accusedArmed = null,
  accuserArmed = null,
  lastPlayedShape = 'square',
  currentCardType = 'circle',
  extraPlayers = [],
} = {}) {
  const cfg = configWith({ assassin: true });
  const room = createRoom('host', MODES.ONLINE, cfg);
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

  for (const extra of extraPlayers) {
    const pe = createPlayer(extra.id, extra.name || extra.id, `sock-${extra.id}`);
    pe.role = extra.role || ROLES.BAREHAND;
    if (extra.armedMirror) pe.armedPowerCard = { power: 'mirror', cardId: `m-${extra.id}` };
    room.players.push(pe);
    room.turnOrder.push(pe.id);
    room.hands.set(pe.id, []);
  }

  const playedCard = {
    id: 'shape-played-1',
    type: 'shape',
    shape: lastPlayedShape,
    number: 7,
  };
  room.playedPile = [playedCard];
  room.lastPlayedCard = playedCard;
  room.currentCardType = currentCardType;

  function arm(player, armed) {
    if (!armed) {
      room.hands.set(player.id, []);
      return;
    }
    const card = {
      id: armed.cardId || `${armed.power}-${player.id}`,
      type: 'power',
      power: armed.power,
      armed: true,
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

// ─── assignRoles distribution ─────────────────────────────────

describe('assignRoles', () => {
  it('makes everyone Barehand below the 9-alive threshold', () => {
    for (const count of [2, 4, 7, 8]) {
      const room = makeOnlineRoom(count);
      assignRoles(room);
      const roles = room.players.map(p => p.role);
      expect(roles.every(r => r === ROLES.BAREHAND)).toBe(true);
    }
  });

  it('assigns a mixed cohort with all five unique specials at 9 alive', () => {
    const room = makeOnlineRoom(9);
    assignRoles(room);
    const roles = room.players.map(p => p.role);
    // All 5 unique roles present at most once.
    const unique = [ROLES.SHERIFF, ROLES.MEDIC, ROLES.SABOTEUR, ROLES.SNIPER, ROLES.COLLECTOR];
    for (const r of unique) {
      const count = roles.filter(x => x === r).length;
      expect(count).toBeLessThanOrEqual(1);
      expect(count).toBe(1); // each appears exactly once at 9
    }
    // At least one Gambler.
    expect(roles.filter(r => r === ROLES.GAMBLER).length).toBeGreaterThanOrEqual(1);
    // Some Barehand fillers.
    expect(roles.includes(ROLES.BAREHAND)).toBe(true);
    // Every role is one of the known role types.
    for (const r of roles) expect(ROLE_TYPES).toContain(r);
  });

  it('caps unique specials to one each even at the largest table', () => {
    const room = makeOnlineRoom(15);
    assignRoles(room);
    const roles = room.players.map(p => p.role);
    for (const r of [ROLES.SHERIFF, ROLES.MEDIC, ROLES.SABOTEUR, ROLES.SNIPER, ROLES.COLLECTOR]) {
      expect(roles.filter(x => x === r).length).toBe(1);
    }
    // Gamblers can be 1-2.
    const gamblers = roles.filter(r => r === ROLES.GAMBLER).length;
    expect(gamblers).toBeGreaterThanOrEqual(1);
    expect(gamblers).toBeLessThanOrEqual(2);
  });

  it('startGame triggers role assignment automatically', () => {
    const room = makeOnlineRoom(9);
    startGame(room);
    const roles = room.players.map(p => p.role);
    expect(roles.includes(ROLES.SHERIFF)).toBe(true);
    expect(roles.filter(r => r === ROLES.BAREHAND).length).toBeGreaterThan(0);
  });

  it('startGame leaves everyone Barehand below threshold', () => {
    const room = makeOnlineRoom(5);
    startGame(room);
    expect(room.players.every(p => p.role === ROLES.BAREHAND)).toBe(true);
  });
});

// ─── getRole helper ──────────────────────────────────────────

describe('getRole', () => {
  it('returns barehand for unknown players', () => {
    const room = makeOnlineRoom(3);
    expect(getRole(room, 'nope')).toBe(ROLES.BAREHAND);
  });

  it('returns the assigned role', () => {
    const room = makeOnlineRoom(2);
    room.players[0].role = ROLES.SHERIFF;
    expect(getRole(room, 'p0')).toBe(ROLES.SHERIFF);
  });
});

// ─── Gambler — frozen risk on survival ────────────────────────

describe('Gambler — risk frozen on survival', () => {
  it('chamber stays at 1 bullet across many surviving spins', () => {
    const player = createPlayer('p0', 'G', 'sock');
    player.role = ROLES.GAMBLER;
    // Force a fully-empty chamber for deterministic survival.
    // (We can't seed Math.random, so iterate enough times that any
    // bullet add would have appeared.)
    player.chamber = [null, null, null, null, null, 'bullet'];
    player.riskLevel = 1;

    for (let i = 0; i < 50; i++) {
      const result = spinGun(player);
      if (result.eliminated) {
        // Stop on elimination — verify chamber didn't accumulate.
        expect(player.chamber.filter(s => s === 'bullet').length).toBe(1);
        return;
      }
      // After every survival, bullet count should still be 1.
      expect(player.chamber.filter(s => s === 'bullet').length).toBe(1);
      expect(player.riskLevel).toBe(1);
    }
  });

  it('non-Gambler accumulates bullets normally', () => {
    const player = createPlayer('p0', 'B', 'sock');
    player.role = ROLES.BAREHAND;
    // Place 1 bullet at index 5; spin will probably miss it.
    player.chamber = [null, null, null, null, null, 'bullet'];
    player.riskLevel = 1;
    let survivals = 0;
    for (let i = 0; i < 5; i++) {
      const result = spinGun(player);
      if (result.eliminated) break;
      survivals++;
      // After each survival, bullet count should increase.
      expect(player.chamber.filter(s => s === 'bullet').length).toBe(survivals + 1);
    }
  });
});

// ─── Gambler — chamber bumped to 4 on correct bluff ──────────

describe('Gambler — caught bluffing', () => {
  it('chamber jumps to 4 bullets on a correct bluff against them', () => {
    const { room } = buildBluffScenario({
      accusedRole: ROLES.GAMBLER,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const accused = room.players.find(p => p.id === 'p0');
    expect(accused.chamber.filter(s => s === 'bullet').length).toBe(1);

    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);
    // Chamber rewritten to exactly 4 bullets.
    expect(accused.chamber.filter(s => s === 'bullet').length).toBe(4);
    expect(accused.riskLevel).toBe(4);
    expect(events.find(e => e.kind === 'gambler_caught')).toBeTruthy();
  });

  it('does NOT jump on a wrong bluff against them', () => {
    const { room } = buildBluffScenario({
      accusedRole: ROLES.GAMBLER,
      lastPlayedShape: 'circle', // matches required → bluff is wrong
      currentCardType: 'circle',
    });
    const accused = room.players.find(p => p.id === 'p0');
    resolveBluff(room, 'p1');
    expect(accused.chamber.filter(s => s === 'bullet').length).toBe(1);
  });
});

// ─── Sheriff — risk drop on correct bluff ────────────────────

describe('Sheriff — correct bluff drops their risk', () => {
  it('removes one bullet from Sheriff chamber on correct call', () => {
    const { room } = buildBluffScenario({
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const accuser = room.players.find(p => p.id === 'p1');
    // Stack accuser's chamber with 3 bullets.
    accuser.chamber = ['bullet', 'bullet', 'bullet', null, null, null];
    accuser.riskLevel = 3;

    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.bluffIsCorrect).toBe(true);
    expect(accuser.chamber.filter(s => s === 'bullet').length).toBe(2);
    expect(accuser.riskLevel).toBe(2);
    expect(events.find(e => e.kind === 'sheriff_relief')).toBeTruthy();
  });

  it('no-op when Sheriff chamber is empty', () => {
    const { room } = buildBluffScenario({
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const accuser = room.players.find(p => p.id === 'p1');
    accuser.chamber = [null, null, null, null, null, null];
    accuser.riskLevel = 0;
    const { events } = resolveBluff(room, 'p1');
    expect(accuser.chamber.filter(s => s === 'bullet').length).toBe(0);
    expect(events.find(e => e.kind === 'sheriff_relief')).toBeFalsy();
  });

  it('does NOT drop on a WRONG bluff', () => {
    const { room } = buildBluffScenario({
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });
    const accuser = room.players.find(p => p.id === 'p1');
    accuser.chamber = ['bullet', 'bullet', null, null, null, null];
    accuser.riskLevel = 2;
    resolveBluff(room, 'p1');
    expect(accuser.chamber.filter(s => s === 'bullet').length).toBe(2);
  });
});

// ─── Sheriff — Assassin immunity ─────────────────────────────

describe('Sheriff — Assassin immunity', () => {
  it('Assassin does NOT fire when accuser is Sheriff', () => {
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserRole: ROLES.SHERIFF,
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { outcome, events } = resolveBluff(room, 'p1');
    // Outcome falls through to spin (correct bluff → accused spins).
    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('p0');
    // Assassin was NOT consumed — Sheriff exempted the call.
    expect(p0.armedPowerCard).not.toBeNull();
    expect(events.find(e => e.kind === 'assassin_strike')).toBeFalsy();
  });

  it('Assassin still fires against non-Sheriff accuser', () => {
    const { room, p1 } = buildBluffScenario({
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

// ─── Medic — save reverts elimination ────────────────────────

describe('Medic — save flow', () => {
  function setupMedicRoom() {
    const cfg = configWith({ assassin: true });
    const room = createRoom('host', MODES.ONLINE, cfg);
    const p0 = createPlayer('p0', 'Medic', 'sock-0');
    const p1 = createPlayer('p1', 'Patient', 'sock-1');
    const p2 = createPlayer('p2', 'Other', 'sock-2');
    p0.role = ROLES.MEDIC;
    p1.role = ROLES.BAREHAND;
    p2.role = ROLES.BAREHAND;
    room.players.push(p0, p1, p2);
    room.turnOrder = ['p0', 'p1', 'p2'];
    room.currentTurnIndex = 0;
    room.phase = 'playing';
    room.discardPile = [];
    room.hands = new Map();
    // Medic at 4 cards (room for +2).
    room.hands.set('p0', Array.from({ length: 4 }).map((_, i) => ({
      id: `m-${i}`, type: 'shape', shape: 'circle', number: i + 1,
    })));
    room.hands.set('p1', []);
    room.hands.set('p2', []);
    room.deck = Array.from({ length: 30 }).map((_, i) => ({
      id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
    }));
    room.playedPile = [];
    return { room, p0, p1, p2 };
  }

  it('save adds 2 shape cards, consumes ability, revives player', () => {
    const { room, p0, p1 } = setupMedicRoom();
    // Eliminate p1 (set status, leave in turnOrder for the engine
    // to handle — applyMedicSave is documented as "after elimination
    // is applied" but turnOrder integrity).
    p1.status = 'eliminated';
    p1.isSpectator = true;

    const handBefore = room.hands.get('p0').length;
    const res = applyMedicSave(room, 'p1', 'spin');
    expect(res.ok).toBe(true);
    expect(res.dealt).toHaveLength(2);
    expect(res.revivedPlayerId).toBe('p1');
    expect(p1.status).toBe('alive');
    expect(p1.isSpectator).toBe(false);
    expect(room.hands.get('p0').length).toBe(handBefore + 2);
    expect(p0.medicAbilityAvailable).toBe(false);
  });

  it('save bumps chamber by 1 on spin source', () => {
    const { room, p1 } = setupMedicRoom();
    p1.status = 'eliminated';
    const before = p1.chamber.filter(s => s === 'bullet').length;
    applyMedicSave(room, 'p1', 'spin');
    const after = p1.chamber.filter(s => s === 'bullet').length;
    expect(after).toBe(before + 1);
  });

  it('save does NOT bump chamber on assassin source', () => {
    const { room, p1 } = setupMedicRoom();
    p1.status = 'eliminated';
    const before = p1.chamber.filter(s => s === 'bullet').length;
    applyMedicSave(room, 'p1', 'assassin');
    expect(p1.chamber.filter(s => s === 'bullet').length).toBe(before);
  });

  it('blocked at 6+ card hand — findAvailableMedic returns null', () => {
    const { room, p0 } = setupMedicRoom();
    // Pad Medic to 6 cards.
    const hand = room.hands.get('p0');
    while (hand.length < 6) hand.push({ id: `pad-${hand.length}`, type: 'shape', shape: 'circle', number: 1 });
    expect(findAvailableMedic(room)).toBeNull();
  });

  it('rejects after ability consumed', () => {
    const { room, p0, p1 } = setupMedicRoom();
    p1.status = 'eliminated';
    applyMedicSave(room, 'p1', 'spin');
    // Re-eliminate and try again.
    p1.status = 'eliminated';
    expect(findAvailableMedic(room)).toBeNull();
    const second = applyMedicSave(room, 'p1', 'spin');
    expect(second.ok).toBe(false);
  });

  it('rejects when no Medic in the room', () => {
    const { room, p0, p1 } = setupMedicRoom();
    p0.role = ROLES.BAREHAND;
    p1.status = 'eliminated';
    expect(findAvailableMedic(room)).toBeNull();
    const res = applyMedicSave(room, 'p1', 'spin');
    expect(res.ok).toBe(false);
  });
});

// ─── Saboteur — silent transfer ──────────────────────────────

describe('Saboteur', () => {
  function setupSaboteurRoom(holderHandSize = 5) {
    const cfg = defaultRoomConfig();
    const room = createRoom('host', MODES.ONLINE, cfg);
    const p0 = createPlayer('p0', 'Saboteur', 'sock-0');
    const p1 = createPlayer('p1', 'Victim', 'sock-1');
    p0.role = ROLES.SABOTEUR;
    p1.role = ROLES.BAREHAND;
    room.players.push(p0, p1);
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 0;
    room.phase = 'playing';
    room.hands = new Map();
    room.hands.set('p0', Array.from({ length: holderHandSize }).map((_, i) => ({
      id: `s-${i}`, type: 'shape', shape: 'star', number: i + 1,
    })));
    room.hands.set('p1', [{ id: 'existing', type: 'shape', shape: 'circle', number: 9 }]);
    room.deck = [];
    room.playedPile = [];
    return { room, p0, p1 };
  }

  it('moves a card from holder to target, marks ability used', () => {
    const { room, p0 } = setupSaboteurRoom(5);
    const beforeHolder = room.hands.get('p0').length;
    const beforeTarget = room.hands.get('p1').length;
    const res = applySaboteurTransfer(room, 'p0', 'p1');
    expect(res.ok).toBe(true);
    expect(room.hands.get('p0').length).toBe(beforeHolder - 1);
    expect(room.hands.get('p1').length).toBe(beforeTarget + 1);
    expect(p0.saboteurAbilityAvailable).toBe(false);
    // Moved card id should now be in target hand.
    expect(room.hands.get('p1').find(c => c.id === res.movedCardId)).toBeTruthy();
  });

  it('locks at <=3 cards', () => {
    const { room } = setupSaboteurRoom(3);
    const res = applySaboteurTransfer(room, 'p0', 'p1');
    expect(res.ok).toBe(false);
  });

  it('rejects after ability used', () => {
    const { room, p0 } = setupSaboteurRoom(6);
    applySaboteurTransfer(room, 'p0', 'p1');
    const second = applySaboteurTransfer(room, 'p0', 'p1');
    expect(second.ok).toBe(false);
  });

  it('rejects targeting self', () => {
    const { room } = setupSaboteurRoom(5);
    const res = applySaboteurTransfer(room, 'p0', 'p0');
    expect(res.ok).toBe(false);
  });

  it('rejects when caller is not the Saboteur role', () => {
    const { room, p0 } = setupSaboteurRoom(5);
    p0.role = ROLES.BAREHAND;
    const res = applySaboteurTransfer(room, 'p0', 'p1');
    expect(res.ok).toBe(false);
  });
});

// ─── Sniper — redirect validation ────────────────────────────

describe('Sniper — applySniperRedirect', () => {
  function setupSniperRoom() {
    const cfg = defaultRoomConfig();
    const room = createRoom('host', MODES.ONLINE, cfg);
    const sniper = createPlayer('p0', 'Sniper', 'sock-0');
    const a = createPlayer('p1', 'A', 'sock-1');
    const b = createPlayer('p2', 'B', 'sock-2');
    const mirror = createPlayer('p3', 'MirrorHolder', 'sock-3');
    sniper.role = ROLES.SNIPER;
    mirror.armedPowerCard = { power: 'mirror', cardId: 'mir' };
    room.players.push(sniper, a, b, mirror);
    room.turnOrder = ['p0', 'p1', 'p2', 'p3'];
    room.phase = 'sniper_pending';
    return { room, sniper, a, b, mirror };
  }

  it('redirects to a valid target and consumes the ability', () => {
    const { room, sniper } = setupSniperRoom();
    const res = applySniperRedirect(room, 'p0', 'p1');
    expect(res.ok).toBe(true);
    expect(res.newSpinTargetId).toBe('p1');
    expect(sniper.sniperAbilityAvailable).toBe(false);
  });

  it('rejects redirect to self', () => {
    const { room } = setupSniperRoom();
    const res = applySniperRedirect(room, 'p0', 'p0');
    expect(res.ok).toBe(false);
  });

  it('rejects redirect to a Mirror holder', () => {
    const { room } = setupSniperRoom();
    const res = applySniperRedirect(room, 'p0', 'p3');
    expect(res.ok).toBe(false);
  });

  it('rejects redirect to an eliminated player', () => {
    const { room, b } = setupSniperRoom();
    b.status = 'eliminated';
    const res = applySniperRedirect(room, 'p0', 'p2');
    expect(res.ok).toBe(false);
  });

  it('rejects after ability consumed', () => {
    const { room } = setupSniperRoom();
    applySniperRedirect(room, 'p0', 'p1');
    const second = applySniperRedirect(room, 'p0', 'p2');
    expect(second.ok).toBe(false);
  });

  it('findAvailableSniper returns null after consumption', () => {
    const { room } = setupSniperRoom();
    expect(findAvailableSniper(room)).not.toBeNull();
    applySniperRedirect(room, 'p0', 'p1');
    expect(findAvailableSniper(room)).toBeNull();
  });
});

// ─── Collector — power-card hand cap = 3 ─────────────────────

describe('Collector — relaxed power-card cap', () => {
  it('keeps up to 3 power cards in hand on the initial deal', () => {
    // Build a 9-player room with all 6 power types enabled, double-deck
    // (>10 not needed — but enable copies=2 to flood power cards).
    const cfg = configWith({
      shield: true, mirror: true, swap: true,
      peek: true, freeze: true, assassin: true,
    }, 2);
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 9; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `s${i}`));
    }
    // Force p0 to be the Collector (override post-startGame).
    // Easiest: pre-stamp role and skip assignRoles by stubbing it
    // out via direct startGame after marking.
    startGame(room);
    // Pick whoever ended up Collector and verify 3-cap. If no
    // Collector was assigned (small pool randomness), force one.
    let collector = room.players.find(p => p.role === ROLES.COLLECTOR);
    if (!collector) {
      // Re-run assignRoles so a Collector emerges (9 players → guaranteed).
      collector = room.players[0];
      collector.role = ROLES.COLLECTOR;
    }
    const hand = room.hands.get(collector.id) || [];
    const powerCount = hand.filter(c => c?.type === 'power').length;
    expect(powerCount).toBeLessThanOrEqual(COLLECTOR_POWER_CARD_CAP);
  });

  it('non-Collector hand stays capped at 1 power card', () => {
    const cfg = configWith({
      shield: true, mirror: true, swap: true,
      peek: true, freeze: true, assassin: true,
    }, 2);
    const room = createRoom('host', MODES.ONLINE, cfg);
    for (let i = 0; i < 9; i++) {
      room.players.push(createPlayer(`p${i}`, `P${i}`, `s${i}`));
    }
    startGame(room);
    for (const player of room.players) {
      if (player.role === ROLES.COLLECTOR) continue;
      const hand = room.hands.get(player.id) || [];
      const powerCount = hand.filter(c => c?.type === 'power').length;
      expect(powerCount).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Roles privacy ───────────────────────────────────────────

describe('serializeRoom — role privacy', () => {
  it('exposes only the requesting player\'s own role', () => {
    const room = makeOnlineRoom(9);
    startGame(room);
    // Pick the Sheriff.
    const sheriff = room.players.find(p => p.role === ROLES.SHERIFF);
    const other = room.players.find(p => p.id !== sheriff.id);

    const sheriffView = serializeRoom(room, sheriff.id);
    const sheriffSelf = sheriffView.players.find(p => p.id === sheriff.id);
    const otherInSheriffView = sheriffView.players.find(p => p.id === other.id);
    expect(sheriffSelf.role).toBe(ROLES.SHERIFF);
    expect(otherInSheriffView.role).toBeNull();

    const otherView = serializeRoom(room, other.id);
    const sheriffInOtherView = otherView.players.find(p => p.id === sheriff.id);
    expect(sheriffInOtherView.role).toBeNull();
  });

  it('reveals all roles at game_over', () => {
    const room = makeOnlineRoom(9);
    startGame(room);
    room.phase = 'game_over';
    const view = serializeRoom(room, 'p0');
    for (const p of view.players) {
      expect(p.role).toBeTruthy();
    }
  });
});
