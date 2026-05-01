// ============================================================
// Tests for the Freeze power card (v2 Phase C).
//
// Spec recap:
//  1. Holder activates freeze at turn start (Phase B already arms it
//     via engine.activatePowerCard).
//  2. After the holder ends their turn, the next player in turn
//     order is skipped completely — they get no turn at all.
//  3. The player AFTER the skipped player takes their turn but
//     CANNOT call bluff (the previous turn never produced a card to
//     challenge).
//  4. Freeze is consumed at turn end: the card moves from the
//     holder's hand to room.discardPile, and player.armedPowerCard
//     is cleared.
//
// These tests exercise the engine helpers directly (consumeFreeze
// OnTurnEnd + advanceTurn). The socket-level integration with the
// `bluffBlockedThisTurn` flag in call_bluff is a thin wrapper —
// tested here at the engine layer by reading the flag the engine
// stamps on the room.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  consumeFreezeOnTurnEnd,
  advanceTurn,
  resetRoundOnline,
  MODES,
} from '../gameEngine.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeFrozenRoom() {
  // Three online players, freeze enabled in config. We hand-build the
  // hand state so freeze test setup is independent of shuffle. p0 is
  // the freeze holder, p1 is the player about to be skipped, p2 takes
  // the post-skip turn (and shouldn't be able to call bluff).
  const cfg = defaultRoomConfig();
  cfg.powerCards.enabled.freeze = true;
  const room = createRoom('host-socket', MODES.ONLINE, cfg);

  for (let i = 0; i < 3; i++) {
    const id = `p${i}`;
    room.players.push(createPlayer(id, `Player${i}`, `socket-${i}`));
  }
  room.turnOrder = ['p0', 'p1', 'p2'];
  room.currentTurnIndex = 0;
  room.phase = 'playing';

  // Hand contents: shape filler so the hand-cap rule isn't tripped,
  // plus the freeze card itself in p0's hand.
  const freezeCard = { id: 'freeze-1', type: 'power', power: 'freeze', armed: true };
  room.hands = new Map([
    ['p0', [freezeCard, { id: 'circle-1-x', type: 'shape', shape: 'circle', number: 1 }]],
    ['p1', [{ id: 'square-2-x', type: 'shape', shape: 'square', number: 2 }]],
    ['p2', [{ id: 'star-3-x', type: 'shape', shape: 'star', number: 3 }]],
  ]);
  room.deck = [];
  room.playedPile = [];
  room.discardPile = [];
  room.lastPlayedCard = null;

  // Mark p0 armed with freeze, as Phase B activatePowerCard would do.
  const p0 = room.players[0];
  p0.armedPowerCard = { power: 'freeze', cardId: 'freeze-1', activatedAtTurn: 0 };

  return { room, freezeCard };
}

// ─── Skip + bluff-block flow ─────────────────────────────────

describe('Freeze: armed → end turn → skip + bluff block', () => {
  it('end-of-turn flow skips the next player and blocks bluff for the player after', () => {
    const { room } = makeFrozenRoom();

    // Holder ends their turn. Server flow: consumeFreezeOnTurnEnd
    // first, then advanceTurn.
    const trigger = consumeFreezeOnTurnEnd(room, 'p0');
    expect(trigger).toEqual({
      kind: 'freeze_skip',
      holderId: 'p0',
      holderName: 'Player0',
      skippedId: 'p1',
      skippedName: 'Player1',
    });
    // Skip queued; bluff-block not yet stamped (advanceTurn does that).
    expect(room.skipNextPlayer).toBe(true);
    expect(room.bluffBlockedThisTurn).toBe(false);

    advanceTurn(room);

    // We advanced p0 → p1 → p2 (one normal step + one skip step).
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p2');
    expect(room.skipNextPlayer).toBe(false);
    expect(room.bluffBlockedThisTurn).toBe(true);
  });

  it('the player after the skip cannot call bluff (flag honoured)', () => {
    const { room } = makeFrozenRoom();
    consumeFreezeOnTurnEnd(room, 'p0');
    advanceTurn(room);

    // The bluffBlockedThisTurn flag is what call_bluff checks. As an
    // engine-level assertion we just confirm the flag is set on the
    // turn p2 inherits.
    expect(room.bluffBlockedThisTurn).toBe(true);
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p2');
  });

  it("the bluff-block flag clears once the post-skip player ends their own turn", () => {
    const { room } = makeFrozenRoom();
    consumeFreezeOnTurnEnd(room, 'p0');
    advanceTurn(room); // → p2, bluffBlockedThisTurn = true

    // p2 ends their turn (without arming a freeze of their own).
    advanceTurn(room);
    expect(room.bluffBlockedThisTurn).toBe(false);
    // Wraps back to p0 (we removed nobody from turnOrder).
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p0');
  });
});

// ─── No-op when no freeze is armed ───────────────────────────

describe('Freeze: NOT armed → normal turn flow', () => {
  it('consumeFreezeOnTurnEnd returns null and does not stamp the skip', () => {
    const { room } = makeFrozenRoom();
    const p0 = room.players[0];
    p0.armedPowerCard = null; // remove the armed marker
    // Even though p0 still HOLDS a freeze card, consumeFreezeOnTurnEnd
    // requires the armed marker.
    const trigger = consumeFreezeOnTurnEnd(room, 'p0');
    expect(trigger).toBeNull();
    expect(room.skipNextPlayer).toBe(false);

    advanceTurn(room);
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p1');
    expect(room.bluffBlockedThisTurn).toBe(false);
  });

  it('returns null when armedPowerCard is a different power (e.g. shield)', () => {
    const { room } = makeFrozenRoom();
    const p0 = room.players[0];
    p0.armedPowerCard = { power: 'shield', cardId: 'whatever', activatedAtTurn: 0 };
    const trigger = consumeFreezeOnTurnEnd(room, 'p0');
    expect(trigger).toBeNull();
    expect(room.skipNextPlayer).toBe(false);
  });
});

// ─── Skipped player's hand and state untouched ───────────────

describe("Freeze: the skipped player's hand and state are untouched", () => {
  it('skipped player keeps every card in their hand and stays alive', () => {
    const { room } = makeFrozenRoom();
    const p1HandBefore = [...room.hands.get('p1')];
    const p1StatusBefore = room.players[1].status;

    consumeFreezeOnTurnEnd(room, 'p0');
    advanceTurn(room);

    expect(room.hands.get('p1')).toEqual(p1HandBefore);
    expect(room.players[1].status).toBe(p1StatusBefore);
    expect(room.players[1].status).toBe('alive');
  });

  it('chamber/risk of the skipped player is untouched', () => {
    const { room } = makeFrozenRoom();
    const chamberBefore = [...room.players[1].chamber];
    const riskBefore = room.players[1].riskLevel;

    consumeFreezeOnTurnEnd(room, 'p0');
    advanceTurn(room);

    expect(room.players[1].chamber).toEqual(chamberBefore);
    expect(room.players[1].riskLevel).toBe(riskBefore);
  });
});

// ─── Freeze card consumed ────────────────────────────────────

describe('Freeze: card removed from hand to discardPile, armed cleared', () => {
  it('moves the freeze card from holder hand to room.discardPile', () => {
    const { room, freezeCard } = makeFrozenRoom();
    const handBefore = room.hands.get('p0');
    expect(handBefore).toContain(freezeCard);

    consumeFreezeOnTurnEnd(room, 'p0');

    expect(room.hands.get('p0')).not.toContain(freezeCard);
    expect(room.discardPile).toContain(freezeCard);
  });

  it('clears player.armedPowerCard on consumption', () => {
    const { room } = makeFrozenRoom();
    const p0 = room.players[0];
    expect(p0.armedPowerCard).not.toBeNull();
    consumeFreezeOnTurnEnd(room, 'p0');
    expect(p0.armedPowerCard).toBeNull();
  });

  it('falls back to power-slug match if cardId drifted from the actual card in hand', () => {
    // Defensive path: armedPowerCard.cardId points at an id no longer
    // in the hand (e.g. state corruption). The helper still finds and
    // consumes the freeze card by power slug.
    const { room } = makeFrozenRoom();
    const p0 = room.players[0];
    p0.armedPowerCard = { power: 'freeze', cardId: 'wrong-id', activatedAtTurn: 0 };
    consumeFreezeOnTurnEnd(room, 'p0');
    // Freeze card was removed via the slug-match fallback.
    expect(room.hands.get('p0').some(c => c?.power === 'freeze')).toBe(false);
    expect(room.discardPile.some(c => c?.power === 'freeze')).toBe(true);
  });
});

// ─── Round reset clears freeze state ─────────────────────────

describe('Freeze: round reset clears any pending skip / bluff-block', () => {
  it('resetRoundOnline zeroes skipNextPlayer and bluffBlockedThisTurn', () => {
    const { room } = makeFrozenRoom();
    room.skipNextPlayer = true;
    room.bluffBlockedThisTurn = true;
    resetRoundOnline(room);
    expect(room.skipNextPlayer).toBe(false);
    expect(room.bluffBlockedThisTurn).toBe(false);
  });
});
