// ============================================================
// ENGINE - The Pact (Covenant-exclusive mechanic)
// ============================================================
// Pure helpers only - no I/O, no socket access. Orchestration (the pre-game
// selector prompt, the in-game offer/confirm, the volunteer-pull pause) lives in
// the handler/lib layer; this module owns the deterministic state transitions.
//
// The Pact is a single secret two-player bond formed at the start of a Covenant
// game. One random alive player is the Pact SELECTOR; during pre_game they
// secretly choose a TARGET (a sensible random default is pre-picked so a silent
// selector still forms a pact). In-game the target privately accepts or denies.
// While the pact is active the two partners:
//   • cannot call each other's bluffs (isPactBluffBlocked),
//   • may volunteer to take each other's spin (checkPactVolunteerEligible),
//   • on a partner's death, the survivor loses one chamber bullet and the bond
//     breaks (applyPactPartnerDeath),
//   • share victory if they are the last two standing (checkDualWin).
//
// Room fields owned here:
//   room.pactSelectorId / room.pactTargetId - unconfirmed pre-game designation.
//   room.pactSelectorReservedCard           - power card reserved for the selector.
//   room.pact = { a, b, active }            - the confirmed bond.
//   room.pactOfferPending / pactOfferSent / pactOfferDeferred - offer bookkeeping.

const { POWER_TYPES } = require('./constants');

function _alive(room) {
  return (room?.players || []).filter(p => p.status === 'alive');
}

function _enabledPowers(room) {
  const map = room?.config?.powerCards?.enabled || {};
  return POWER_TYPES.filter(power => map[power]);
}

let _reservedIdCounter = 0;

/**
 * Designate the Pact Selector + a default Target. Called after startGame (deal +
 * roles done) for Covenant rooms only, BEFORE beginPreGame builds the pools.
 * Picks one random alive selector and one random other alive player as the
 * default target (the selector may override the target via pact_choose during
 * pre_game). Returns { selectorId, targetId } or { ok: false } when there aren't
 * two alive players to bond.
 */
function assignPactRoles(room) {
  const alive = _alive(room);
  room.pact = null;
  room.pactSelectorReservedCard = null;
  room.pactOfferPending = false;
  room.pactOfferSent = false;
  room.pactOfferDeferred = false;
  if (alive.length < 2) {
    room.pactSelectorId = null;
    room.pactTargetId = null;
    return { ok: false };
  }
  const selector = alive[Math.floor(Math.random() * alive.length)];
  const others = alive.filter(p => p.id !== selector.id);
  const target = others[Math.floor(Math.random() * others.length)];
  room.pactSelectorId = selector.id;
  room.pactTargetId = target.id;
  return { ok: true, selectorId: selector.id, targetId: target.id };
}

/**
 * The Pact Selector forgoes the normal pre-game pick: their selection pool is
 * emptied (no picker UI) and a random power card is RESERVED for them, granted
 * at finalize time via grantPactSelectorCard. Robust whether or not a pool was
 * built (the ≤1-power skip path leaves pools empty) - falls back to synthesising
 * a power from the host-enabled set. No-op when no powers are enabled at all.
 */
function pactSelectorAutoAssignPower(room) {
  const sid = room.pactSelectorId;
  if (!sid) return { ok: false };

  const pool = room.pregamePools?.[sid] || [];
  const powerOpts = pool.filter(c => c.type === 'power');
  let reserved = null;
  if (powerOpts.length) {
    reserved = powerOpts[Math.floor(Math.random() * powerOpts.length)];
  } else {
    const enabled = _enabledPowers(room);
    if (enabled.length) {
      const power = enabled[Math.floor(Math.random() * enabled.length)];
      reserved = { id: `pact-${sid}-${power}-${(_reservedIdCounter++).toString(36)}`, type: 'power', power };
    }
  }

  // Empty the selector's pool so no selection modal is shown for them.
  if (room.pregamePools) room.pregamePools[sid] = [];

  if (!reserved) {
    room.pactSelectorReservedCard = null;
    return { ok: false };
  }
  room.pactSelectorReservedCard = { ...reserved, armed: false };
  return { ok: true, card: room.pactSelectorReservedCard };
}

/**
 * Grant the selector's reserved power card into their slot. Called once, AFTER
 * finalizePreGame applies everyone else's picks (which would otherwise leave the
 * selector with the deal-time grant). No-op when there's nothing reserved.
 */
function grantPactSelectorCard(room) {
  const sid = room.pactSelectorId;
  const card = room.pactSelectorReservedCard;
  if (!sid || !card) return { ok: false };
  if (!room.powerCardSlot) room.powerCardSlot = {};
  const slotCard = { ...card, armed: false };
  if (slotCard.power === 'swap') {
    const aliveIds = _alive(room).map(p => p.id);
    slotCard.swapPendingPlayerIds = aliveIds.filter(id => id !== sid);
  }
  room.powerCardSlot[sid] = [slotCard];
  return { ok: true };
}

/**
 * Resolve the target's response to the pact offer. On accept: activate the bond
 * (room.pact). On deny: strip the selector's reserved power card (the cost of a
 * rejected offer) and leave no pact. Clears the unconfirmed designation either
 * way. Returns { ok, action } (action: 'confirmed' | 'denied').
 */
function applyPactResponse(room, accepted) {
  const a = room.pactSelectorId;
  const b = room.pactTargetId;
  room.pactOfferPending = false;
  room.pactOfferDeferred = false;
  if (!a || !b) return { ok: false };

  if (accepted) {
    room.pact = { a, b, active: true };
    room.pactSelectorId = null;
    room.pactTargetId = null;
    return { ok: true, action: 'confirmed', a, b };
  }

  // Denied - the selector's reserved bet is forfeit.
  if (room.powerCardSlot?.[a]) room.powerCardSlot[a] = [];
  room.pact = null;
  room.pactSelectorId = null;
  room.pactTargetId = null;
  return { ok: true, action: 'denied', a };
}

/**
 * True iff `callerId` and `accusedId` are the two partners of an active pact
 * (in either direction). Pact partners can never call each other's bluffs.
 */
function isPactBluffBlocked(room, callerId, accusedId) {
  const pact = room?.pact;
  if (!pact?.active) return false;
  return (
    (callerId === pact.a && accusedId === pact.b)
    || (callerId === pact.b && accusedId === pact.a)
  );
}

/**
 * If `spinTargetId` is one half of an active pact and BOTH partners are alive,
 * return the OTHER partner's id (the one who may volunteer to take the bullet).
 * Returns null otherwise.
 */
function checkPactVolunteerEligible(room, spinTargetId) {
  const pact = room?.pact;
  if (!pact?.active) return null;
  let partnerId = null;
  if (spinTargetId === pact.a) partnerId = pact.b;
  else if (spinTargetId === pact.b) partnerId = pact.a;
  if (!partnerId) return null;

  const target = room.players.find(p => p.id === spinTargetId);
  const partner = room.players.find(p => p.id === partnerId);
  if (!target || target.status !== 'alive') return null;
  if (!partner || partner.status !== 'alive') return null;
  return partnerId;
}

/**
 * A pact partner has died. Deactivate the bond and dock one bullet from the
 * surviving partner's chamber (the price of the broken pact, floored at 0). No-op
 * when there's no active pact or the dead player isn't a partner. Returns
 * { ok, survivorId } on a real partner death.
 */
function applyPactPartnerDeath(room, eliminatedId) {
  const pact = room?.pact;
  if (!pact?.active) return { ok: false };
  if (eliminatedId !== pact.a && eliminatedId !== pact.b) return { ok: false };

  const survivorId = eliminatedId === pact.a ? pact.b : pact.a;
  pact.active = false;

  const survivor = room.players.find(p => p.id === survivorId);
  if (survivor && Array.isArray(survivor.chamber)) {
    const idx = survivor.chamber.indexOf('bullet');
    if (idx !== -1) {
      survivor.chamber[idx] = null;
      survivor.riskLevel = survivor.chamber.filter(s => s === 'bullet').length;
    }
  }
  return { ok: true, survivorId };
}

/**
 * If an active pact's two partners are the LAST players standing (≤2 alive and
 * both alive players are the partners), return [partnerA, partnerB] player
 * objects for the shared victory. Returns null otherwise.
 */
function checkDualWin(room) {
  const pact = room?.pact;
  if (!pact?.active) return null;
  const alive = _alive(room);
  if (alive.length === 0 || alive.length > 2) return null;
  const aliveIds = new Set(alive.map(p => p.id));
  if (alive.length === 2 && aliveIds.has(pact.a) && aliveIds.has(pact.b)) {
    const a = room.players.find(p => p.id === pact.a);
    const b = room.players.find(p => p.id === pact.b);
    if (a && b) return [a, b];
  }
  return null;
}

module.exports = {
  assignPactRoles,
  pactSelectorAutoAssignPower,
  grantPactSelectorCard,
  applyPactResponse,
  isPactBluffBlocked,
  checkPactVolunteerEligible,
  applyPactPartnerDeath,
  checkDualWin,
};
