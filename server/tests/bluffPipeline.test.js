// ============================================================
// Tests for Phase C bluff-pipeline:
//   Shield, Mirror, Swap, Assassin trigger logic + clash priorities
//
// The pipeline (`server/bluffPipeline.js`) is the single contract
// that all bluff-resolution stages plug into. These tests lock the
// per-card behaviour and the spec-locked clash resolutions:
//   - Shield > Assassin
//   - Assassin > Mirror
//   - Swap > Mirror (Swap re-runs bluff check; Mirror still runs after)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  applyAssassinDeclinePenalty,
  MODES,
} from '../gameEngine.js';
import { resolveBluff, resumeAfterSwap } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

function configWith(enabled = {}, copiesPerDeck = 1) {
  const cfg = defaultRoomConfig();
  for (const k of Object.keys(cfg.powerCards.enabled)) {
    cfg.powerCards.enabled[k] = !!enabled[k];
  }
  cfg.powerCards.copiesPerDeck = copiesPerDeck;
  return cfg;
}

/**
 * Build a minimal online room ready for a bluff resolution.
 *
 * Layout: 2 players, p0 = accused (just played a card), p1 = accuser
 * (current turn, about to call bluff). lastPlayedCard is configurable
 * — by default it MATCHES the required shape (so a bluff would be
 * wrong), so unless the test overrides currentCardType / shape, the
 * accuser is the spin target by default.
 */
function buildBluffScenario({
  accusedArmed = null,    // { power, cardId } | null
  accuserArmed = null,
  lastPlayedShape = 'circle',
  currentCardType = 'circle',
  swapPicked = null,      // unused here — kept for symmetry
} = {}) {
  const room = createRoom('host', MODES.ONLINE, configWith({
    shield: true, mirror: true, swap: true, assassin: true,
  }));
  const p0 = createPlayer('p0', 'Accused', 'sock-0');
  const p1 = createPlayer('p1', 'Accuser', 'sock-1');
  room.players.push(p0, p1);
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 1; // accuser is current turn
  room.phase = 'playing';
  room.mode = MODES.ONLINE;
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.discardPile = [];
  room.hands = new Map();

  // Cards played this round live in playedPile; lastPlayedCard is
  // the top of the pile (= accused's most recent card).
  const playedCard = {
    id: 'shape-played-1',
    type: 'shape',
    shape: lastPlayedShape,
    number: 7,
  };
  room.playedPile = [playedCard];
  room.lastPlayedCard = playedCard;
  room.currentCardType = currentCardType;

  // Wire armed cards into the holder's hand + armedPowerCard.
  function armPlayer(player, armed) {
    if (!armed) {
      room.hands.set(player.id, []);
      return;
    }
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
  armPlayer(p0, accusedArmed);
  armPlayer(p1, accuserArmed);

  return { room, p0, p1 };
}

// ─── Stage 1 — Shield ────────────────────────────────────────

describe('pipeline / Shield', () => {
  it('blocks the bluff and consumes the Shield', () => {
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'shield', cardId: 'shield-A' },
    });

    const { events, outcome } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('blocked');
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'shield_blocked',
        holderId: 'p0',
        holderName: 'Accused',
      }),
    ]);
    // Shield consumed: armedPowerCard cleared, card moved to discard.
    expect(p0.armedPowerCard).toBeNull();
    expect(room.discardPile.find(c => c.id === 'shield-A')).toBeTruthy();
    expect(room.hands.get('p0')).toEqual([]);
  });

  it('is a one-shot — only blocks the next bluff', () => {
    const { room, p0 } = buildBluffScenario({
      accusedArmed: { power: 'shield', cardId: 'shield-A' },
    });
    resolveBluff(room, 'p1'); // first call → blocked
    // Shield is consumed; no armed card. A second bluff resolves
    // normally (default spin target = the wrong-bluff caller). The
    // first call also ate the bluff opportunity by spec, but that
    // gating happens in the socket layer, not here.
    expect(p0.armedPowerCard).toBeNull();
    const second = resolveBluff(room, 'p1');
    expect(second.outcome.kind).toBe('spin');
  });
});

// ─── Stage 2 — Assassin ──────────────────────────────────────

describe('pipeline / Assassin', () => {
  it('eliminates the bluff caller regardless of correctness (correct bluff)', () => {
    // Accused played a wrong-shape card → bluff would be correct →
    // accused would normally spin. With Assassin armed, accuser dies
    // INSTEAD, regardless.
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'assassin', cardId: 'kill-A' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });

    const { events, outcome } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
    expect(outcome.eliminatedReason).toBe('assassin');
    expect(events.find(e => e.kind === 'assassin_strike')).toBeTruthy();
    expect(p0.armedPowerCard).toBeNull(); // consumed
    expect(room.discardPile.find(c => c.id === 'kill-A')).toBeTruthy();
  });

  it('also eliminates the caller on a WRONG bluff', () => {
    const { room } = buildBluffScenario({
      accusedArmed: { power: 'assassin', cardId: 'kill-A' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
  });
});

// ─── Stage 3 — Mirror ────────────────────────────────────────

describe('pipeline / Mirror', () => {
  it('scenario 1 — incoming bluff on holder is reflected back to accuser', () => {
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'mirror', cardId: 'mir-A' },
      lastPlayedShape: 'square',  // bluff would be CORRECT → accused
      currentCardType: 'circle',  // would normally spin. Mirror flips.
    });

    const { events, outcome } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('p1'); // accuser spins
    expect(outcome.bluffIsCorrect).toBe(true);
    const evt = events.find(e => e.kind === 'mirror_reflected');
    expect(evt).toBeTruthy();
    expect(evt.scenario).toBe('incoming');
    expect(evt.redirectedToId).toBe('p1');
    expect(p0.armedPowerCard).toBeNull(); // consumed
    expect(outcome.mirrorEndsAccusedTurn).toBe(true);
  });

  it('scenario 2 — outgoing wrong bluff by Mirror holder reflects to accused', () => {
    // Accuser holds Mirror. Calls bluff on accused who told the truth
    // (last played card matches required) → bluff is WRONG → accuser
    // would normally spin → Mirror redirects to accused.
    const { room, p0, p1 } = buildBluffScenario({
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });

    const { events, outcome } = resolveBluff(room, 'p1');

    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false);
    expect(outcome.spinTargetId).toBe('p0'); // accused now spins
    const evt = events.find(e => e.kind === 'mirror_reflected');
    expect(evt).toBeTruthy();
    expect(evt.scenario).toBe('outgoing');
    expect(p1.armedPowerCard).toBeNull();
  });

  it('scenario 2 does NOT trigger when the Mirror holder calls a CORRECT bluff', () => {
    // If the bluff is correct, the accuser doesn't spin — accused
    // does. Mirror only fires on the "would normally spin me" path.
    const { room, p1 } = buildBluffScenario({
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('p0');
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeFalsy();
    // Mirror stays armed (didn't fire).
    expect(p1.armedPowerCard).not.toBeNull();
  });
});

// ─── Stage 4 — Swap ──────────────────────────────────────────

describe('pipeline / Swap', () => {
  function buildSwapScenario({ pickedShape = 'circle' } = {}) {
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'swap', cardId: 'sw-A' },
      lastPlayedShape: 'square',  // accused's played card is wrong
      currentCardType: 'circle',  // bluff would be correct without Swap
    });
    // Add an alternate card to the played pile that the holder
    // could pick. The holder's just-played card is at the top.
    const earlierCard = {
      id: 'older-card',
      type: 'shape',
      shape: pickedShape,
      number: 4,
    };
    // Push the earlier card BEFORE the accused's played card.
    room.playedPile = [earlierCard, room.playedPile[0]];
    return { room, p0, p1, earlierCard };
  }

  it('pauses the pipeline and returns swap_pending', () => {
    const { room, p0 } = buildSwapScenario();
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('swap_pending');
    expect(outcome.swapHolderId).toBe('p0');
    // No banner events fire yet — the swap event lands on resume.
    expect(events).toEqual([]);
    // Swap card NOT yet consumed (waiting for pick).
    expect(p0.armedPowerCard).not.toBeNull();
  });

  it('resumeAfterSwap re-runs bluff check against the swapped card — match → accuser spins', () => {
    const { room, earlierCard } = buildSwapScenario({ pickedShape: 'circle' });
    resolveBluff(room, 'p1');

    const { events, outcome } = resumeAfterSwap(room, 'p1', earlierCard.id);

    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false); // swapped card matches required shape
    expect(outcome.spinTargetId).toBe('p1');    // accuser spins
    expect(events.find(e => e.kind === 'swap_resolved')).toBeTruthy();
    // Swap card IS now consumed.
    const accused = room.players.find(p => p.id === 'p0');
    expect(accused.armedPowerCard).toBeNull();
    // lastPlayedCard updated to the swapped-in card.
    expect(room.lastPlayedCard.id).toBe(earlierCard.id);
  });

  it('resumeAfterSwap: swapped card still wrong shape → holder spins', () => {
    const { room, earlierCard } = buildSwapScenario({ pickedShape: 'star' });
    resolveBluff(room, 'p1');
    const { outcome } = resumeAfterSwap(room, 'p1', earlierCard.id);
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);
    expect(outcome.spinTargetId).toBe('p0');
  });

  it('returns error when picked card is not in the played pile', () => {
    const { room } = buildSwapScenario();
    resolveBluff(room, 'p1');
    const { outcome } = resumeAfterSwap(room, 'p1', 'non-existent-id');
    expect(outcome.kind).toBe('error');
  });

  it('swap is NOT activated when pendingPlayerIds is non-empty', () => {
    // Build a Swap scenario but stamp the gate so it's not yet
    // activatable. The pipeline should fall through to default.
    const { room } = buildSwapScenario();
    const accused = room.players.find(p => p.id === 'p0');
    const swapCard = room.hands.get('p0').find(c => c.power === 'swap');
    swapCard.swapPendingPlayerIds = ['p1']; // gate not satisfied
    const { outcome } = resolveBluff(room, 'p1');
    // Stage 5 (Swap) saw the gate, did not pause. Falls through to
    // stage 6 → default spin. Bluff was correct (square vs circle),
    // so accused spins.
    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('p0');
  });
});

// ─── Clash priorities ────────────────────────────────────────

describe('pipeline / clash priorities', () => {
  it('Shield > Assassin: Shield blocks before Assassin can fire', () => {
    // Accused holds Assassin AND Shield. Per spec the activation
    // model only allows ONE armed card at a time. To test the clash
    // we DIRECTLY simulate "Shield is armed" — the spec text is
    // "Shield blocks BEFORE Assassin can fire", which in a
    // single-card-armed world means: an armed Shield blocks a bluff
    // before the pipeline ever evaluates whether Assassin would
    // have fired. So we just confirm that Shield's stage runs first
    // and short-circuits.
    const { room, p0 } = buildBluffScenario({
      accusedArmed: { power: 'shield', cardId: 'shi-A' },
    });
    const { outcome, events } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('blocked');
    expect(events[0].kind).toBe('shield_blocked');
    // Shield consumed, but if there had been a *second* armed card
    // (future Collector role), Assassin's stage would never fire —
    // the pipeline short-circuited.
    expect(p0.armedPowerCard).toBeNull();
  });

  it('Assassin > Mirror: Mirror cannot deflect an Assassin elimination', () => {
    // Spec: "Mirror cannot deflect an Assassin elimination. Bluff
    // caller is eliminated regardless of Mirror." Same single-armed
    // constraint applies — we test that the pipeline runs Assassin
    // BEFORE Mirror, so even if a hypothetical setup had both, the
    // accuser dies. We simulate this by stamping both armed states.
    const { room, p0, p1 } = buildBluffScenario({
      accusedArmed: { power: 'assassin', cardId: 'k-A' },
      accuserArmed: { power: 'mirror',   cardId: 'm-out' },
      lastPlayedShape: 'circle',
      currentCardType: 'circle', // bluff is wrong → accuser would
                                 // spin, Mirror would normally flip.
    });
    const { outcome, events } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');
    // Assassin consumed, Mirror NOT consumed (didn't get to fire).
    expect(p0.armedPowerCard).toBeNull();
    expect(p1.armedPowerCard).not.toBeNull();
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeFalsy();
  });

  it('Swap > Mirror: Swap resolves first, Mirror runs against post-swap world', () => {
    // Accused holds Swap. Accuser holds Mirror. Bluff resolution:
    //   1. Pipeline pauses on Swap.
    //   2. Holder picks a card (still wrong shape) → re-run.
    //   3. Bluff check on swapped card: still wrong → accuser would
    //      spin → accuser's Mirror flips it back to accused.
    const { room } = buildBluffScenario({
      accusedArmed: { power: 'swap',   cardId: 'sw-A' },
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    // Add an earlier card to swap with — also wrong-shape, so the
    // bluff check still says CORRECT after swap.
    const earlier = { id: 'old-1', type: 'shape', shape: 'star', number: 3 };
    room.playedPile = [earlier, room.playedPile[0]];

    const first = resolveBluff(room, 'p1');
    expect(first.outcome.kind).toBe('swap_pending');

    const { outcome, events } = resumeAfterSwap(room, 'p1', earlier.id);
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true); // swapped card still wrong
    // Without Mirror, accused would spin. With outgoing Mirror it's
    // only triggered when bluff is WRONG — so here Mirror does NOT
    // fire and accused spins. Confirms Mirror runs AFTER swap+check.
    expect(outcome.spinTargetId).toBe('p0');
    // Mirror was not triggered (correct bluff path).
    expect(events.find(e => e.kind === 'mirror_reflected')).toBeFalsy();
  });

  it('Swap > Mirror: holder picks a MATCHING card → accuser spins → outgoing Mirror flips back', () => {
    // Same Swap+Mirror setup but the picked card is the right shape,
    // so post-swap the bluff is WRONG → accuser would spin → accuser's
    // Mirror flips → accused spins.
    const { room } = buildBluffScenario({
      accusedArmed: { power: 'swap',   cardId: 'sw-A' },
      accuserArmed: { power: 'mirror', cardId: 'mir-out' },
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const earlier = { id: 'old-2', type: 'shape', shape: 'circle', number: 9 };
    room.playedPile = [earlier, room.playedPile[0]];

    const first = resolveBluff(room, 'p1');
    expect(first.outcome.kind).toBe('swap_pending');
    const { outcome, events } = resumeAfterSwap(room, 'p1', earlier.id);

    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false); // swapped → matches required
    expect(outcome.spinTargetId).toBe('p0');    // Mirror flipped accuser → accused
    const mirEvt = events.find(e => e.kind === 'mirror_reflected');
    expect(mirEvt).toBeTruthy();
    expect(mirEvt.scenario).toBe('outgoing');
  });
});

// ─── Default behaviour (no power cards) ──────────────────────

describe('pipeline / default behaviour', () => {
  it('correct bluff (wrong-shape card) → accused spins', () => {
    const { room } = buildBluffScenario({
      lastPlayedShape: 'square',
      currentCardType: 'circle',
    });
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(true);
    expect(outcome.spinTargetId).toBe('p0');
    expect(events).toEqual([]);
  });

  it('wrong bluff (matching card) → accuser spins', () => {
    const { room } = buildBluffScenario({
      lastPlayedShape: 'circle',
      currentCardType: 'circle',
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.bluffIsCorrect).toBe(false);
    expect(outcome.spinTargetId).toBe('p1');
  });

  it('whot card was played → bluff is wrong (whot is wild)', () => {
    const { room } = buildBluffScenario({
      lastPlayedShape: 'whot',
      currentCardType: 'circle',
    });
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.bluffIsCorrect).toBe(false);
    expect(outcome.spinTargetId).toBe('p1');
  });

  it('no card played → bluff is correct (the previous player must have lied)', () => {
    const { room } = buildBluffScenario({});
    room.lastPlayedCard = null;
    room.playedPile = [];
    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.bluffIsCorrect).toBe(true);
    expect(outcome.spinTargetId).toBe('p0');
  });
});

// ─── Assassin decline penalty ────────────────────────────────

describe('applyAssassinDeclinePenalty', () => {
  function setupArmedAssassin() {
    const cfg = configWith({ assassin: true });
    const room = createRoom('host', MODES.ONLINE, cfg);
    const p0 = createPlayer('p0', 'Holder', 'sock-0');
    const p1 = createPlayer('p1', 'Other', 'sock-1');
    room.players.push(p0, p1);
    room.turnOrder = ['p0', 'p1'];
    room.currentTurnIndex = 0;
    room.phase = 'playing';
    room.hands = new Map();
    // Hand of 5 + 1 armed Assassin (= 6 total).
    const assassinCard = { id: 'k', type: 'power', power: 'assassin', armed: true };
    const fillers = Array.from({ length: 5 }).map((_, i) => ({
      id: `s-${i}`, type: 'shape', shape: 'circle', number: i + 1,
    }));
    room.hands.set('p0', [...fillers, assassinCard]);
    room.hands.set('p1', []);
    room.deck = Array.from({ length: 20 }).map((_, i) => ({
      id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
    }));
    room.playedPile = [];
    room.discardPile = [];
    p0.armedPowerCard = {
      power: 'assassin',
      cardId: 'k',
      activatedAtTurn: 0,
      activatedAtRound: 1,
    };
    return { room, p0, p1 };
  }

  it('consumes the Assassin and deals +4 shape cards on decline', () => {
    const { room, p0 } = setupArmedAssassin();
    const handSizeBefore = room.hands.get('p0').length;
    const res = applyAssassinDeclinePenalty(room, 'p0');
    expect(res.ok).toBe(true);
    expect(res.dealt).toHaveLength(4);
    expect(res.dealt.every(c => c.type === 'shape')).toBe(true);

    expect(p0.armedPowerCard).toBeNull();
    // Hand: 5 fillers + 4 penalty - 1 consumed Assassin = 9. Cap > 6
    // is allowed (locked spec decision).
    expect(room.hands.get('p0').length).toBe(handSizeBefore - 1 + 4);
    expect(room.discardPile.find(c => c.id === 'k')).toBeTruthy();
  });

  it('rejects when no armed Assassin', () => {
    const { room, p0 } = setupArmedAssassin();
    p0.armedPowerCard = null;
    const res = applyAssassinDeclinePenalty(room, 'p0');
    expect(res.ok).toBe(false);
  });

  it('rejects in physical mode', () => {
    const { room } = setupArmedAssassin();
    room.mode = MODES.PHYSICAL;
    const res = applyAssassinDeclinePenalty(room, 'p0');
    expect(res.ok).toBe(false);
  });
});
