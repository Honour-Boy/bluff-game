// ============================================================
// §1.1 - Granular single-action turn ledger.
//
// The three turn actions (play a card, call a bluff, activate a power
// card) are order-free but each capped at once per turn. advanceTurn is
// the SINGLE authoritative reset point; mid-turn resolutions (bluff /
// spin / assassin) must NOT clear the ledger, or the on-turn player gets
// a second card play after a bluff resolves (the post-bluff double-play
// exploit reported in play-testing).
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  advanceTurn,
  activatePowerCard,
  GAME_EVENT_TYPES,
  MODES,
} from '../gameEngine.js';
import {
  finaliseAssassinElimination,
  applyBluffOutcome,
} from '../lib/orchestration.js';

function onlineRoom(playerIds) {
  const room = createRoom('host-socket', MODES.ONLINE);
  for (const id of playerIds) {
    room.players.push(createPlayer(id, `User-${id}`, `sock-${id}`));
  }
  room.turnOrder = [...playerIds];
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.hands = new Map(playerIds.map(id => [id, []]));
  room.playedPile = [];
  room.discardPile = [];
  room.powerCardSlot = {};
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room.powerActivatedThisTurn = false;
  return room;
}

describe('§1.1 turn-action ledger - reset boundaries', () => {
  it('advanceTurn clears all three action flags', () => {
    const room = onlineRoom(['p0', 'p1']);
    room.cardPlayedThisTurn = true;
    room.bluffUsedThisTurn = true;
    room.powerActivatedThisTurn = true;

    advanceTurn(room);

    expect(room.cardPlayedThisTurn).toBe(false);
    expect(room.bluffUsedThisTurn).toBe(false);
    expect(room.powerActivatedThisTurn).toBe(false);
  });

  it('finaliseAssassinElimination preserves the ledger (no mid-turn reset)', () => {
    // The accuser (p1) played a card AND called a bluff this turn; the bluff
    // resolves into an Assassin strike. The turn has NOT advanced, so the
    // ledger must stay set - p1 cannot play a second card.
    const room = onlineRoom(['p0', 'p1', 'p2']);
    room.currentTurnIndex = 1; // p1 is on turn
    room.cardPlayedThisTurn = true;
    room.bluffUsedThisTurn = true;

    finaliseAssassinElimination(room, { eliminatedPlayerId: 'p0', accusedId: 'p0' });

    expect(room.cardPlayedThisTurn).toBe(true);
    expect(room.bluffUsedThisTurn).toBe(true);
    expect(room.phase).not.toBe('round_end');
  });

  it('applyBluffOutcome(ASSASSIN_BACKFIRE) preserves the played-card flag', () => {
    const room = onlineRoom(['p0', 'p1', 'p2']);
    room.currentTurnIndex = 1;
    room.cardPlayedThisTurn = true;
    room.bluffUsedThisTurn = true;

    applyBluffOutcome(room, {
      type: GAME_EVENT_TYPES.ASSASSIN_BACKFIRE,
      accusedId: 'p0',
      accuserId: 'p1',
      cardsToDrawForAccused: 3,
    });

    expect(room.cardPlayedThisTurn).toBe(true);
  });
});

describe('§1.1 turn-action ledger - single power activation per turn', () => {
  it('rejects a second power activation after Peek is consumed', () => {
    const room = onlineRoom(['p0']);
    room.challengeableCard = { id: 'x', type: 'shape', shape: 'circle', number: 4 };
    // Collector-style: holding two power cards. Peek first, then try to arm.
    room.powerCardSlot.p0 = [
      { id: 'pk', type: 'power', power: 'peek' },
      { id: 'sh', type: 'power', power: 'shield' },
    ];

    const first = activatePowerCard(room, 'p0');
    expect(first.ok).toBe(true);
    expect(first.power).toBe('peek');
    expect(room.powerActivatedThisTurn).toBe(true);

    const second = activatePowerCard(room, 'p0');
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already used a power card/i);
  });

  it('allows a power activation again on the next turn', () => {
    const room = onlineRoom(['p0', 'p1']);
    room.powerCardSlot.p0 = [{ id: 'sh', type: 'power', power: 'shield' }];

    const armed = activatePowerCard(room, 'p0');
    expect(armed.ok).toBe(true);
    expect(room.powerActivatedThisTurn).toBe(true);

    // Turn passes to p1 and back; the ledger re-opens via advanceTurn.
    advanceTurn(room); // -> p1
    advanceTurn(room); // -> p0
    expect(room.powerActivatedThisTurn).toBe(false);
  });
});
