// ============================================================
// ENGINE — Spin orchestration + bounty + survival hand reset
// ============================================================
// spinGun wraps pullTrigger with the role-aware survival rules
// (Gambler) and the risk-modifier flags pulled off room.config.
// Bounty + survival-reset live here too because they're triggered
// on the spin pipeline.

const { MODES, BOUNTY_THRESHOLD } = require('./constants');
const { pullTrigger } = require('./chamber');
const { drawCardForPlayer, newCardType } = require('./cards');

/**
 * Pluck the risk-modifier flags out of room.config defensively. Used
 * by spinGun call sites to forward the right modifiers into pullTrigger.
 */
function getSpinModifiers(room) {
  const r = room?.config?.riskModifiers || {};
  return {
    doubleBarrel: !!r.doubleBarrel,
    hotPotato: !!r.hotPotato,
  };
}

/**
 * v2 Phase D — Gambler role: risk level NEVER increases from
 * surviving spins. We spin normally to determine elimination, but on
 * SURVIVAL we revert the chamber back to its pre-spin state. External
 * modifiers like Sudden Death still bump Gambler's risk — spec.
 *
 * v2 Phase E1 — Risk modifiers (Double Barrel, Hot Potato) are
 * forwarded to pullTrigger via `modifiers`.
 */
function spinGun(player, modifiers = {}) {
  const isGambler = player.role === 'gambler';
  const before = [...player.chamber];

  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber, modifiers);

  if (!eliminated && isGambler) {
    player.chamber = before;
    player.riskLevel = before.filter(s => s === 'bullet').length;
    return { eliminated, spinIndex, chamber: player.chamber, riskLevel: player.riskLevel };
  }

  player.chamber = chamber;
  player.riskLevel = bulletCount;
  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  }
  return { eliminated, spinIndex, chamber, riskLevel: bulletCount };
}

/**
 * Survive-and-reset (Section 7 of v2 spec, locked):
 * When an online-mode player SURVIVES a spin, their existing SHAPE
 * hand is discarded and they are dealt a fresh batch of cards. Power
 * cards survive the spin (issue #62).
 *
 *   - Normal spin survival → fresh cards EQUAL to the surviving SHAPE
 *     count (omit cardsToDeal).
 *   - Redemption Spin survival → 3 fresh cards (caller passes 3).
 */
function resetHandOnSurvival(room, playerId, cardsToDeal = null) {
  if (room.mode !== MODES.ONLINE) return [];
  if (!room.hands) return [];

  const player = room.players.find(p => p.id === playerId);
  if (!player) return [];
  if (player.status !== 'alive') return [];

  if (!room.discardPile) room.discardPile = [];

  const oldHand = room.hands.get(playerId) || [];
  const retainedPowerCards = oldHand.filter(c => c?.type === 'power');
  const shapeCards = oldHand.filter(c => c?.type !== 'power');
  const targetCount = cardsToDeal == null ? shapeCards.length : cardsToDeal;

  for (const card of shapeCards) {
    room.discardPile.push(card);
  }
  room.hands.set(playerId, retainedPowerCards.slice());

  if (player.armedPowerCard) {
    const armedId = player.armedPowerCard.id;
    if (!retainedPowerCards.some(c => c.id === armedId)) {
      player.armedPowerCard = null;
    }
  }

  const dealt = [];
  for (let i = 0; i < targetCount; i++) {
    const card = drawCardForPlayer(room, playerId);
    if (card) dealt.push(card);
    else break;
  }
  return dealt;
}

/**
 * §1.1 — Global bluff reshuffle.
 *
 * The moment a Bluff ("Block") challenge is CALLED AND RESOLVED, the table is
 * rotated uniformly for everyone still in the match — not just the player who
 * survived/lost the specific interaction:
 *
 *   • Global Card Change: EVERY alive player has their SHAPE hand discarded and
 *     re-dealt a fresh batch of equal size. Power cards are retained (same rule
 *     as a survival reset) so the power economy isn't wiped.
 *   • Required Target Shift: the match's "card to clear" (`currentCardType`)
 *     cycles to a fresh random type immediately.
 *
 * Online-only — hands and the target type only exist in online mode. No-op (and
 * safe) for physical rooms or rooms without a dealt deck. Returns a summary the
 * caller can fold into `lastAction` / telemetry.
 */
function applyGlobalBluffReshuffle(room) {
  if (!room || room.mode !== MODES.ONLINE) {
    return { reshuffled: false, playerIds: [], cardType: room?.currentCardType ?? null };
  }
  const aliveIds = room.players.filter(p => p.status === 'alive').map(p => p.id);
  for (const id of aliveIds) {
    // Re-deal each alive player's shape hand to an equal-sized fresh batch
    // (cardsToDeal omitted ⇒ "deal as many as you just discarded").
    resetHandOnSurvival(room, id);
  }
  newCardType(room);
  return { reshuffled: true, playerIds: aliveIds, cardType: room.currentCardType ?? null };
}

// ─── v2 Phase F — Bounty ─────────────────────────────────────
//
// When a player survives 3 spins in a row, a bounty is placed on
// them. A successful bluff call against a bounty holder drops the
// accuser's risk level by 1 AND clears the bounty. Bounty also
// clears when the holder is eliminated.

/**
 * Called after a successful spin survival. Increments the counter
 * and, if it crosses the threshold and the player doesn't yet hold
 * a bounty, places one. Returns a banner-event payload when a bounty
 * is placed, otherwise null.
 */
function onSurvivalForBounty(room, playerId) {
  if (!room?.config?.systems?.bounty) return null;
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  player.consecutiveSurvivedSpins = (player.consecutiveSurvivedSpins || 0) + 1;
  if (
    player.consecutiveSurvivedSpins >= BOUNTY_THRESHOLD
    && !player.hasBounty
  ) {
    player.hasBounty = true;
    player.consecutiveSurvivedSpins = 0;
    return {
      kind: 'bounty_placed',
      holderId: player.id,
      holderName: player.username || null,
    };
  }
  return null;
}

/**
 * Called when a bullet hits — counter resets, and if the player held
 * a bounty it's cleared (no reward, just gone).
 */
function onEliminationForBounty(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;
  player.consecutiveSurvivedSpins = 0;
  if (player.hasBounty) {
    player.hasBounty = false;
  }
}

/**
 * A successful bluff against the bounty holder collects the bounty:
 *   - Bounty clears.
 *   - Accuser's risk level drops by 1 (one bullet removed if any).
 *   - Counter resets.
 */
function collectBounty(room, accusedId, accuserId) {
  const accused = room.players.find(p => p.id === accusedId);
  const accuser = room.players.find(p => p.id === accuserId);
  if (!accused?.hasBounty) return null;
  accused.hasBounty = false;
  accused.consecutiveSurvivedSpins = 0;
  let droppedTo = null;
  if (accuser) {
    const bullets = accuser.chamber
      .map((s, i) => (s === 'bullet' ? i : -1))
      .filter(i => i !== -1);
    if (bullets.length > 0) {
      const removeIdx = bullets[Math.floor(Math.random() * bullets.length)];
      const next = [...accuser.chamber];
      next[removeIdx] = null;
      accuser.chamber = next;
      accuser.riskLevel = next.filter(s => s === 'bullet').length;
      droppedTo = accuser.riskLevel;
    } else {
      droppedTo = 0;
    }
  }
  return {
    kind: 'bounty_collected',
    holderId: accusedId,
    holderName: accused.username || null,
    accuserId: accuser?.id || null,
    accuserName: accuser?.username || null,
    accuserRiskAfter: droppedTo,
  };
}

module.exports = {
  getSpinModifiers,
  spinGun,
  resetHandOnSurvival,
  applyGlobalBluffReshuffle,
  onSurvivalForBounty,
  onEliminationForBounty,
  collectBounty,
};
