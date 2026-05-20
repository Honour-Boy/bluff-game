// ============================================================
// ENGINE — Secret roles + role-specific abilities (v2 Phase D)
// ============================================================
// Roles activate ONLY when alive count >= 9. Each "unique" special
// role appears at most once per game; Gambler may appear 1-2 times.
// Remaining players are Barehand.

const { ROLES, ROLES_AT_MIN_ALIVE, MODES } = require('./constants');
const { addBulletToChamber } = require('./chamber');
const { drawCardForPlayer } = require('./cards');
const { _countPowerCardsInHand, _powerCardCapForPlayer } = require('./handHelpers');

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _roleAssignmentFor(aliveCount) {
  if (aliveCount < ROLES_AT_MIN_ALIVE) {
    return Array.from({ length: aliveCount }).map(() => ROLES.BAREHAND);
  }
  const specials = [
    ROLES.SHERIFF,
    ROLES.MEDIC,
    ROLES.SABOTEUR,
    ROLES.SNIPER,
    ROLES.COLLECTOR,
    ROLES.GAMBLER,
  ];
  let extraGambler = aliveCount >= 11 ? 1 : 0;
  const slots = [...specials, ...Array.from({ length: extraGambler }).map(() => ROLES.GAMBLER)];
  while (slots.length < aliveCount) slots.push(ROLES.BAREHAND);
  return _shuffle(slots);
}

function assignRoles(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  const assignment = _roleAssignmentFor(alivePlayers.length);
  const shuffledPlayers = _shuffle(alivePlayers);
  for (let i = 0; i < shuffledPlayers.length; i++) {
    shuffledPlayers[i].role = assignment[i] || ROLES.BAREHAND;
  }
  for (const p of room.players) {
    if (p.status !== 'alive') p.role = ROLES.BAREHAND;
  }
  return room;
}

function getRole(room, playerId) {
  const p = room.players.find(pp => pp.id === playerId);
  return p?.role || ROLES.BAREHAND;
}

/**
 * Pre-game role reveal visibility (#116). Special roles are only
 * assigned when alive count >= ROLES_AT_MIN_ALIVE, but the reveal
 * overlay must additionally hide the *Barehand* label below the
 * threshold — small tables show a neutral "Standard" indicator
 * instead so the reveal doesn't telegraph that no roles are in play.
 * Assignment vs. visibility are deliberately decoupled.
 */
function isBarehandVisible(playerCount) {
  return playerCount > ROLES_AT_MIN_ALIVE;
}

// ─── Role helpers ────────────────────────────────────────────

/**
 * Return the alive Medic player who can still use their save ability
 * AND has hand-room (< 6 cards), or null.
 */
function findAvailableMedic(room) {
  const medic = room.players.find(p =>
    p.role === ROLES.MEDIC
    && p.status === 'alive'
    && p.medicAbilityAvailable
  );
  if (!medic) return null;
  if (room.mode === MODES.ONLINE) {
    const hand = room.hands?.get(medic.id) || [];
    if (hand.length >= 6) return null;
  }
  return medic;
}

/**
 * Return the alive Sniper who can still redirect, or null.
 */
function findAvailableSniper(room) {
  return room.players.find(p =>
    p.role === ROLES.SNIPER
    && p.status === 'alive'
    && p.sniperAbilityAvailable
  ) || null;
}

/**
 * Apply a Medic save against an already-eliminated player. The
 * elimination is reverted: status returns to 'alive', isSpectator
 * cleared, and the player is restored to the turn order.
 *
 * Cost: +2 shape cards to Medic. Returns
 *   { ok, dealt, revivedPlayerId, medicId } | { ok:false, error }.
 */
function applyMedicSave(room, eliminatedPlayerId, source = 'spin') {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const medic = findAvailableMedic(room);
  if (!medic) return { ok: false, error: 'No Medic available' };
  const target = room.players.find(p => p.id === eliminatedPlayerId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.status !== 'eliminated') {
    return { ok: false, error: 'Target is not eliminated' };
  }

  target.status = 'alive';
  target.isSpectator = false;
  if (!room.turnOrder.includes(target.id)) {
    room.turnOrder.push(target.id);
  }

  if (source === 'spin') {
    target.chamber = addBulletToChamber(target.chamber);
    target.riskLevel = target.chamber.filter(s => s === 'bullet').length;
  }

  const dealt = [];
  for (let i = 0; i < 2; i++) {
    const card = drawCardForPlayer(room, medic.id);
    if (card) dealt.push(card);
    else break;
  }
  medic.medicAbilityAvailable = false;

  return { ok: true, dealt, revivedPlayerId: target.id, medicId: medic.id };
}

/**
 * Saboteur: silently move ONE random card from holder's hand into
 * a target player's hand.
 */
function applySaboteurTransfer(room, holderId, targetPlayerId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const holder = room.players.find(p => p.id === holderId);
  if (!holder) return { ok: false, error: 'Holder not found' };
  if (holder.role !== ROLES.SABOTEUR) return { ok: false, error: 'Not the Saboteur' };
  if (holder.status !== 'alive') return { ok: false, error: 'Saboteur not alive' };
  if (!holder.saboteurAbilityAvailable) return { ok: false, error: 'Ability already used' };

  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.id === holder.id) return { ok: false, error: 'Cannot target self' };
  if (target.status !== 'alive') return { ok: false, error: 'Target not alive' };

  const holderHand = room.hands?.get(holder.id) || [];
  if (holderHand.length <= 3) return { ok: false, error: 'Need more than 3 cards to use ability' };

  const targetHand = room.hands?.get(target.id);
  if (!targetHand) return { ok: false, error: 'Target has no hand' };

  function pickRandomIndex(hand) {
    return Math.floor(Math.random() * hand.length);
  }
  let pickIdx = pickRandomIndex(holderHand);
  let pickedCard = holderHand[pickIdx];

  const targetCap = _powerCardCapForPlayer(target);
  if (
    pickedCard?.type === 'power'
    && _countPowerCardsInHand(targetHand) >= targetCap
  ) {
    const shapeIdx = holderHand.findIndex(c => c?.type === 'shape');
    if (shapeIdx !== -1) {
      pickIdx = shapeIdx;
      pickedCard = holderHand[shapeIdx];
    } else {
      return { ok: false, error: 'Cannot transfer — recipient power-card cap reached' };
    }
  }

  holderHand.splice(pickIdx, 1);
  targetHand.push(pickedCard);
  holder.saboteurAbilityAvailable = false;

  return { ok: true, movedCardId: pickedCard.id, targetPlayerId: target.id };
}

/**
 * Sniper: redirect a pending spin to a different alive player.
 */
function applySniperRedirect(room, sniperId, newSpinTargetId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const sniper = room.players.find(p => p.id === sniperId);
  if (!sniper) return { ok: false, error: 'Sniper not found' };
  if (sniper.role !== ROLES.SNIPER) return { ok: false, error: 'Not the Sniper' };
  if (!sniper.sniperAbilityAvailable) return { ok: false, error: 'Ability already used' };

  const target = room.players.find(p => p.id === newSpinTargetId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.id === sniper.id) return { ok: false, error: 'Cannot redirect to self' };
  if (target.status !== 'alive') return { ok: false, error: 'Target not alive' };
  if (target.armedPowerCard?.power === 'mirror') {
    return { ok: false, error: 'Cannot redirect to Mirror holder' };
  }

  sniper.sniperAbilityAvailable = false;
  return { ok: true, newSpinTargetId: target.id };
}

module.exports = {
  _shuffle,
  assignRoles,
  getRole,
  isBarehandVisible,
  findAvailableMedic,
  findAvailableSniper,
  applyMedicSave,
  applySaboteurTransfer,
  applySniperRedirect,
};
