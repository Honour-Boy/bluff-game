// ============================================================
// ENGINE — v2 Phase E2/F — Risk + Room modifier helpers
// ============================================================
// Sudden Death (E2), Mirror Match (E2), Redemption Spin (E1/F),
// Last Stand (F), Ghost Vote / Dead Man's Hand (F).
// All pure mutations / pure helpers — callers in socketHandlers.js
// orchestrate timing.

const {
  MODES,
  SHAPES,
  SUDDEN_DEATH_THRESHOLD,
  DMH_VOTE_WINDOW_MS,
  DMH_THRESHOLD_MARGIN,
} = require('./constants');
const { addBulletToChamber, initChamber, pullTrigger } = require('./chamber');
const { drawCardForPlayer } = require('./cards');
const { _shuffle } = require('./roles');
const { getSpinModifiers, resetHandOnSurvival } = require('./spin');

// ─── Sudden Death (Phase E2) ─────────────────────────────────
//
// Spec: every 4 elimination-free turns, all alive players' risk
// levels increase by 1 simultaneously. Counter resets to 0 on any
// elimination.

function tickSuddenDeath(room) {
  if (!room?.config?.roomModifiers?.suddenDeath) return null;
  if (typeof room.suddenDeathCounter !== 'number') room.suddenDeathCounter = 0;
  room.suddenDeathCounter++;
  if (room.suddenDeathCounter < SUDDEN_DEATH_THRESHOLD) return null;

  const bumpedIds = [];
  for (const p of room.players) {
    if (p.status !== 'alive') continue;
    const before = p.chamber || [];
    const next = addBulletToChamber(before);
    if (next !== before) {
      p.chamber = next;
      p.riskLevel = next.filter(s => s === 'bullet').length;
      bumpedIds.push(p.id);
    } else {
      bumpedIds.push(p.id);
    }
  }
  room.suddenDeathCounter = 0;
  return {
    kind: 'sudden_death',
    affectedPlayerIds: bumpedIds,
  };
}

function resetSuddenDeath(room) {
  if (room) room.suddenDeathCounter = 0;
}

// ─── Mirror Match (Phase E2) ─────────────────────────────────

function getMirrorMatchOpposite(room, originalPlayerId) {
  if (!room?.mirrorMatchActive) return null;
  const order = room.turnOrder || [];
  if (order.length < 2) return null;
  const idx = order.indexOf(originalPlayerId);
  if (idx === -1) return null;

  const oppositeIdx = (idx + Math.floor(order.length / 2)) % order.length;
  const oppositeId = order[oppositeIdx];
  if (!oppositeId || oppositeId === originalPlayerId) return null;

  const opposite = room.players.find(p => p.id === oppositeId);
  if (opposite && opposite.status === 'alive') return oppositeId;

  for (let step = 1; step < order.length; step++) {
    const probeIdx = (oppositeIdx + step) % order.length;
    const probeId = order[probeIdx];
    if (probeId === originalPlayerId) continue;
    const probe = room.players.find(p => p.id === probeId);
    if (probe && probe.status === 'alive') return probeId;
  }
  return null;
}

// Mirror Match spins the seat opposite the current player, so it needs an
// EVEN table of at least 4 (with 2 the "opposite" is just the other player —
// degenerate). The lobby UI hides the toggle under the same rule.
function isMirrorMatchEligibleAtStart(room) {
  const alive = room.players.filter(p => p.status === 'alive').length;
  return alive >= 4 && alive % 2 === 0;
}

// ─── Redemption Spin (Phase E1) ──────────────────────────────

function _redemptionSubsetSize(totalPlayers) {
  if (totalPlayers <= 1) return 0;
  if (totalPlayers <= 4) return 1;
  if (totalPlayers <= 6) return 2;
  if (totalPlayers <= 9) return 3;
  if (totalPlayers <= 12) return 4;
  return 5;
}

function pickRedemptionCandidates(room) {
  if (!room?.config?.riskModifiers?.redemptionSpin) return [];
  if (room.lastStandActive) return [];
  const total = room.players.length;
  const eliminated = room.players.filter(p => p.status === 'eliminated' && !p._redemptionConsumed);
  if (eliminated.length === 0) return [];
  const alive = room.players.filter(p => p.status === 'alive').length;
  if (alive <= 1) return [];

  const k = Math.min(_redemptionSubsetSize(total), eliminated.length);
  if (k === 0) return [];
  const shuffled = _shuffle(eliminated);
  return shuffled.slice(0, k).map(p => p.id);
}

function runRedemptionSpin(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  if (player.status !== 'eliminated') return null;
  player._redemptionConsumed = true;

  const chamberBefore = [...player.chamber];
  const modifiers = getSpinModifiers(room);
  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber, modifiers);

  if (eliminated) {
    player.chamber = chamber;
    player.riskLevel = bulletCount;
    return {
      playerId,
      eliminated: true,
      spinIndex,
      chamber: chamberBefore,
      chamberAfter: chamber,
      riskLevel: bulletCount,
      freshCards: [],
    };
  }

  player.status = 'alive';
  player.isSpectator = false;
  player.chamber = initChamber(1);
  player.riskLevel = 1;
  // #205 — back in the game, so the elimination-order stamp no longer applies
  // (a later death re-stamps via eliminateFromTurnOrder).
  player.eliminatedSeq = null;
  if (!room.turnOrder.includes(playerId)) {
    room.turnOrder.push(playerId);
  }

  let freshCards = [];
  if (room.mode === MODES.ONLINE) {
    freshCards = resetHandOnSurvival(room, playerId, 3);
  }

  return {
    playerId,
    eliminated: false,
    spinIndex,
    chamber: chamberBefore,
    chamberAfter: player.chamber,
    riskLevel: player.riskLevel,
    freshCards,
  };
}

function resetRedemptionFlags(room) {
  for (const p of room.players) {
    delete p._redemptionConsumed;
  }
}

// ─── Last Stand (Phase F) ─────────────────────────────────────

function _allPendingPhasesClear(room) {
  return ![
    'spin_pending',
    'swap_pending',
    'medic_pending',
    'sniper_pending',
    'bluff_resolution',
    'betting_pending',
    'ghost_vote_pending',
    'last_stand',
  ].includes(room.phase);
}

function shouldEnterLastStand(room) {
  if (!room?.config?.systems?.lastStand) return false;
  if (room.phase === 'last_stand') return false;
  // #243 — only a game that STARTED with more than 3 players narrows into a Last
  // Stand. `startingAliveCount` is stamped by startGame; fall back to the roster
  // size (eliminated players remain as ghosts mid-game, so it equals the starting
  // count) for callers/tests that build a room without going through startGame.
  const startedCount = room.startingAliveCount ?? room.players.length;
  if (startedCount <= 3) return false;
  const alive = room.players.filter(p => p.status === 'alive');
  if (alive.length !== 2) return false;
  return _allPendingPhasesClear(room);
}

// #243 — current bullet count of the one shared Last Stand gun.
function _lastStandBulletCount(room) {
  const ch = room?.lastStand?.chamber || [];
  return ch.filter(s => s === 'bullet').length;
}

// #243 — keep both finalists' display chambers in lock-step with the single
// shared gun so each seat / cinematic card renders the same escalating cylinder.
function _syncLastStandChamberToFinalists(room) {
  const chamber = room.lastStand?.chamber || [];
  const count = chamber.filter(s => s === 'bullet').length;
  for (const id of room.lastStand?.finalistIds || []) {
    const f = room.players.find(p => p.id === id);
    if (f) { f.chamber = [...chamber]; f.riskLevel = count; }
  }
}

function enterLastStand(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  if (alive.length !== 2) return null;

  if (!room.discardPile) room.discardPile = [];

  // No cards, no bluffs in the duel — surrender hands and disarm everyone.
  for (const p of alive) {
    if (room.hands && room.hands.has(p.id)) {
      const hand = room.hands.get(p.id) || [];
      for (const card of hand) room.discardPile.push(card);
      room.hands.set(p.id, []);
    }
    p.armedPowerCard = null;
  }

  room.phase = 'last_stand';
  room.lastStandActive = true;
  room.spinTargetId = null;
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room.powerActivatedThisTurn = false;
  const orderedFinalists = room.turnOrder.filter(id => alive.some(p => p.id === id));
  const finalistIds = orderedFinalists.length === 2 ? orderedFinalists : alive.map(p => p.id);

  // #243 — ONE shared gun. It starts with a single bullet and escalates on the
  // normal survival curve (pullTrigger adds a bullet every time SOMEONE survives),
  // so the alternating duel is guaranteed to terminate. The two finalists pass
  // this same chamber back and forth; their per-seat chambers mirror it.
  room.lastStand = {
    finalistIds,
    activeFinalistId: finalistIds[0],
    chamber: initChamber(1),
    bulletCount: 1,
    startedAt: Date.now(),
  };
  _syncLastStandChamberToFinalists(room);

  room.turnOrder = [...finalistIds];
  room.currentTurnIndex = 0;
  room.lastAction = {
    type: 'last_stand_started',
    finalistIds,
  };
  return room.lastStand;
}

function lastStandSpin(room, playerId) {
  if (room.phase !== 'last_stand') return { ok: false, error: 'Not in Last Stand' };
  if (!room.lastStand) return { ok: false, error: 'Last Stand state missing' };
  if (room.lastStand.activeFinalistId !== playerId) {
    return { ok: false, error: 'Not your turn' };
  }
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };

  // Spin the ONE shared gun — NOT the player's own chamber. On survival the
  // pull adds a bullet to the shared chamber (normal curve), which the next
  // finalist then inherits. The turn pass is handled by lastStandEndTurn (the
  // handler calls it on survive), so this stays pass-free.
  const chamberBefore = [...room.lastStand.chamber];
  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(room.lastStand.chamber);
  room.lastStand.chamber = chamber;
  room.lastStand.bulletCount = bulletCount;
  _syncLastStandChamberToFinalists(room);

  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  }
  return {
    ok: true,
    spinIndex,
    eliminated,
    chamberBefore,
    chamberAfter: chamber,
    riskLevel: bulletCount,
  };
}

function lastStandEndTurn(room, playerId) {
  if (room.phase !== 'last_stand') return { ok: false, error: 'Not in Last Stand' };
  if (!room.lastStand) return { ok: false, error: 'Last Stand state missing' };
  if (room.lastStand.activeFinalistId !== playerId) {
    return { ok: false, error: 'Not your turn' };
  }
  const [a, b] = room.lastStand.finalistIds;
  const next = playerId === a ? b : a;
  room.lastStand.activeFinalistId = next;
  room.currentTurnIndex = room.turnOrder.indexOf(next);
  if (room.currentTurnIndex < 0) room.currentTurnIndex = 0;
  return { ok: true, nextActiveId: next };
}

// ─── Dead Man's Hand / Ghost vote (Phase F) ──────────────────

function _hasAnyRiskModifierEnabled(room) {
  const rm = room?.config?.riskModifiers;
  if (!rm) return false;
  return Object.values(rm).some(Boolean);
}

function shouldOpenGhostVote(room) {
  if (!room?.config?.systems?.deadMansHand) return false;
  const total = room.players.length;
  const alive = room.players.filter(p => p.status === 'alive').length;
  return (total - alive) > DMH_THRESHOLD_MARGIN;
}

function startGhostVote(room) {
  const optionIds = [1, 2];
  if (_hasAnyRiskModifierEnabled(room)) optionIds.push(3);
  room.ghostVote = {
    optionIds,
    votes: {},
    startedAt: Date.now(),
    closesAt: Date.now() + DMH_VOTE_WINDOW_MS,
    eligibleVoterIds: room.players
      .filter(p => p.status === 'eliminated')
      .map(p => p.id),
    closed: false,
  };
  return room.ghostVote;
}

function castGhostVote(room, voterId, optionId) {
  if (!room?.ghostVote || room.ghostVote.closed) {
    return { ok: false, error: 'No ghost vote open' };
  }
  if (!room.ghostVote.optionIds.includes(optionId)) {
    return { ok: false, error: 'Invalid option' };
  }
  if (!room.ghostVote.eligibleVoterIds.includes(voterId)) {
    return { ok: false, error: 'Only eliminated players can vote' };
  }
  room.ghostVote.votes[voterId] = optionId;
  return { ok: true };
}

function resolveGhostVote(room) {
  if (!room?.ghostVote) return null;
  room.ghostVote.closed = true;
  const counts = {};
  for (const opt of room.ghostVote.optionIds) counts[opt] = 0;
  for (const v of Object.values(room.ghostVote.votes)) {
    if (counts[v] !== undefined) counts[v]++;
  }
  let max = -1;
  let winner = null;
  let tie = false;
  for (const [opt, n] of Object.entries(counts)) {
    if (n > max) { max = n; winner = Number(opt); tie = false; }
    else if (n === max) { tie = true; }
  }
  if (max <= 0 || tie || winner == null) {
    const banner = {
      kind: 'ghost_vote_result',
      winningOption: null,
      applied: 'noop',
      counts,
    };
    room.ghostVote = null;
    return banner;
  }

  let applied = 'noop';
  if (winner === 1) {
    const candidates = SHAPES.filter(s => s !== room.currentCardType);
    const next = candidates[Math.floor(Math.random() * candidates.length)] || SHAPES[0];
    room.currentCardType = next;
    applied = `shape:${next}`;
  } else if (winner === 2) {
    if (room.mode === MODES.ONLINE) {
      for (const p of room.players) {
        if (p.status !== 'alive') continue;
        drawCardForPlayer(room, p.id);
      }
    }
    applied = 'extra_cards';
  } else if (winner === 3) {
    const enabledMods = Object.entries(room.config?.riskModifiers || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (enabledMods.length > 0) {
      const pick = enabledMods[Math.floor(Math.random() * enabledMods.length)];
      room.activeGhostRiskMod = { name: pick, expiresAtRound: room.roundNumber + 1 };
      applied = `risk_mod:${pick}`;
    } else {
      applied = 'noop';
    }
  }

  const banner = {
    kind: 'ghost_vote_result',
    winningOption: winner,
    applied,
    counts,
  };
  room.ghostVote = null;
  return banner;
}

// ─── Russian Roulette (Phase E1) ─────────────────────────────
//
// Russian Roulette: a FAILED bluff forces an IMMEDIATE spin — no manual
// "pull the trigger" pause and no betting window. Returns true only when the
// room has just entered `spin_pending` off a resolved bluff, the modifier is
// enabled, and the spin target is still alive. The bluff handlers consult this
// to run the spin pipeline straight away instead of parking on spin_pending.
function shouldImmediateSpin(room) {
  if (!room || room.phase !== 'spin_pending') return false;
  if (!room.config?.riskModifiers?.russianRoulette) return false;
  const target = room.players?.find(p => p.id === room.spinTargetId);
  return !!(target && target.status === 'alive');
}

module.exports = {
  tickSuddenDeath,
  resetSuddenDeath,
  shouldImmediateSpin,
  getMirrorMatchOpposite,
  isMirrorMatchEligibleAtStart,
  pickRedemptionCandidates,
  runRedemptionSpin,
  resetRedemptionFlags,
  shouldEnterLastStand,
  enterLastStand,
  lastStandSpin,
  lastStandEndTurn,
  shouldOpenGhostVote,
  startGhostVote,
  castGhostVote,
  resolveGhostVote,
};
