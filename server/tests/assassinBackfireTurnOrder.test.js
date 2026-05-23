// ============================================================
// #141 — Assassin backfire turn-order
//
// Play-test regression: when an Assassin backfires (the accuser
// called the holder's bluff CORRECTLY), the engine was advancing
// the turn and auto-ending the correct caller's turn. The caller
// must instead KEEP priority so they can still play a card or
// activate a power card.
//
// The wrong-call fallback (FORCED_ELIMINATION) must eliminate the
// caller, consume the Assassin, and pass the turn to the next
// clockwise player.
//
// These compose the same pieces the call_bluff handler uses:
//   resolveBluff (pipeline) → applyAssassinBackfirePenalty →
//   applyBluffOutcome (orchestration). The handler no longer calls
//   advanceTurn on a backfire — this pins that behaviour.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  MODES,
  applyAssassinBackfirePenalty,
} from '../gameEngine.js';
import { resolveBluff } from '../bluffPipeline.js';
import { applyBluffOutcome } from '../lib/orchestration.js';

// Build a 2-player online room ready for resolveBluff. p0 is the
// accused (just played a card, holds the Assassin); p1 is the
// accuser and the CURRENT player (currentTurnIndex = 1).
function buildRoom({ lastPlayedShape }) {
  const cfg = defaultRoomConfig();
  cfg.powerCards.enabled.assassin = true;
  const room = createRoom('host', MODES.ONLINE, cfg);

  const p0 = createPlayer('p0', 'Accused', 'sock-0');
  const p1 = createPlayer('p1', 'Accuser', 'sock-1');
  // p2 is an uninvolved bystander so eliminating one player on a wrong call
  // leaves >1 alive (otherwise the round legitimately ends in game_over).
  const p2 = createPlayer('p2', 'Bystander', 'sock-2');
  room.players.push(p0, p1, p2);
  room.turnOrder = ['p0', 'p1', 'p2'];
  room.currentTurnIndex = 1; // p1 (accuser) is taking their turn
  room.phase = 'playing';
  room.bluffUsedThisTurn = true; // the call_bluff handler sets this first
  room.cardPlayedThisTurn = false;
  room.discardPile = [];
  room.deck = Array.from({ length: 10 }).map((_, i) => ({
    id: `d-${i}`, type: 'shape', shape: 'square', number: (i % 14) + 1,
  }));
  room.hands = new Map();

  const assassinCard = { id: 'kill-A', type: 'power', power: 'assassin', armed: true };
  room.hands.set('p0', [assassinCard]);
  room.hands.set('p1', []);
  room.hands.set('p2', []);
  p0.armedPowerCard = { power: 'assassin', cardId: 'kill-A', activatedAtTurn: 0, activatedAtRound: 1 };

  const playedCard = { id: 'p-1', type: 'shape', shape: lastPlayedShape, number: 7 };
  room.playedPile = [playedCard];
  room.lastPlayedCard = playedCard;
  room.currentCardType = 'circle';

  return { room, p0, p1, p2 };
}

describe('#141 — Assassin backfire keeps the turn on the correct caller', () => {
  it('CORRECT call: holder draws 3, card consumed, and turn STAYS on the caller', () => {
    // lastPlayedShape 'square' vs currentCardType 'circle' → bluff is correct.
    const { room, p0 } = buildRoom({ lastPlayedShape: 'square' });

    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('assassin_backfire');
    expect(outcome.accusedId).toBe('p0');

    const handBefore = room.hands.get('p0').length;
    const dealt = applyAssassinBackfirePenalty(room, outcome.accusedId, 3);
    applyBluffOutcome(room, outcome);

    // Holder (accused) took the +3 penalty and lost the armed Assassin.
    expect(dealt).toHaveLength(3);
    expect(room.hands.get('p0').length).toBe(handBefore + 3);
    expect(p0.armedPowerCard).toBeNull();

    // Turn priority stays with the caller — NOT advanced.
    expect(room.currentTurnIndex).toBe(1);
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p1');
    // Caller can still act: phase playing, no card played yet this turn.
    expect(room.phase).toBe('playing');
    expect(room.cardPlayedThisTurn).toBe(false);
  });

  it('WRONG call: caller is eliminated, Assassin consumed, turn passes clockwise', () => {
    // lastPlayedShape 'circle' === currentCardType 'circle' → bluff is wrong.
    const { room, p0, p1 } = buildRoom({ lastPlayedShape: 'circle' });

    const { outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('p1');

    applyBluffOutcome(room, outcome);

    // The caller (accuser) is struck down and removed from the order.
    expect(p1.status).toBe('eliminated');
    expect(room.turnOrder).not.toContain('p1');
    // Assassin is spent after striking.
    expect(p0.armedPowerCard).toBeNull();
    // Turn passes to the next clockwise player (p2), game continues.
    expect(room.turnOrder[room.currentTurnIndex]).toBe('p2');
    expect(room.phase).toBe('playing');
  });
});
