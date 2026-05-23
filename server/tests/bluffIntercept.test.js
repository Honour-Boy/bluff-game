// ============================================================
// Tests for the §1.1 bluff INTERCEPTION window.
//
// When a bluff is called, the accused (the previous player, who is
// OFF-turn) gets a short window to arm a DEFENSIVE power card in
// response BEFORE the bluff resolves. The engine half is two helpers
// (canInterceptBluff / listInterceptCards) + an off-turn arm
// (armInterceptCard). The key design property — the resolution
// pipeline already reads `accused.armedPowerCard` at every tier — is
// proven by arming a Shield via the intercept path and then resolving:
// the bluff comes back BLOCKED with no pipeline change.
//
// The socket pause/timer/resume + client modal live in
// handlers/bluff.js + the client; they're covered by CI + browser
// play-test.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  listInterceptCards,
  canInterceptBluff,
  armInterceptCard,
  INTERCEPTABLE_POWERS,
  MODES,
} from '../gameEngine.js';
import { resolveBluff } from '../bluffPipeline.js';

// ─── Helpers ─────────────────────────────────────────────────

// Two online players. p1 is the active player (accuser); p0 is the
// previous player (accused). `p0Slot` seeds the accused's power slot.
function makeRoom(p0Slot = []) {
  const cfg = defaultRoomConfig();
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  room.players.push(createPlayer('p0', 'Player0', 'sock-0'));
  room.players.push(createPlayer('p1', 'Player1', 'sock-1'));
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 1; // p1's turn → accused (prev) is p0
  room.phase = 'playing';
  room.powerCardSlot = { p0: p0Slot, p1: [] };
  room.hands = new Map([['p0', []], ['p1', []]]);
  room.deck = [];
  room.playedPile = [];
  room.discardPile = [];
  room.lastPlayedCard = { id: 'sq-3', type: 'shape', shape: 'square', number: 3 };
  return room;
}

const shield = () => ({ id: 'shield-1', type: 'power', power: 'shield' });
const mirror = () => ({ id: 'mirror-1', type: 'power', power: 'mirror' });
const assassin = () => ({ id: 'assassin-1', type: 'power', power: 'assassin' });
const peek = () => ({ id: 'peek-1', type: 'power', power: 'peek' });
// A Swap whose activation gate is already satisfied (no pending players).
const readySwap = () => ({ id: 'swap-1', type: 'power', power: 'swap', swapPendingPlayerIds: [] });
// A Swap still gated (someone hasn't taken a turn since it landed).
const gatedSwap = () => ({ id: 'swap-2', type: 'power', power: 'swap', swapPendingPlayerIds: ['p1'] });

// ─── listInterceptCards ───────────────────────────────────────

describe('listInterceptCards (§1.1)', () => {
  it('returns only defensive powers (shield/mirror/swap)', () => {
    expect(INTERCEPTABLE_POWERS).toEqual(['shield', 'mirror', 'swap']);
    const room = makeRoom([shield(), assassin(), peek()]);
    const list = listInterceptCards(room, 'p0').map(c => c.power);
    expect(list).toEqual(['shield']);
  });

  it('excludes a Swap that is not yet activatable', () => {
    const room = makeRoom([gatedSwap()]);
    expect(listInterceptCards(room, 'p0')).toHaveLength(0);
  });

  it('includes a Swap once its activation gate clears', () => {
    const room = makeRoom([readySwap()]);
    expect(listInterceptCards(room, 'p0').map(c => c.power)).toEqual(['swap']);
  });

  it('returns empty for an offensive/no-effect-only slot', () => {
    const room = makeRoom([assassin(), peek()]);
    expect(listInterceptCards(room, 'p0')).toHaveLength(0);
  });
});

// ─── canInterceptBluff ────────────────────────────────────────

describe('canInterceptBluff (§1.1)', () => {
  it('is true when the accused holds an un-armed defensive card', () => {
    expect(canInterceptBluff(makeRoom([shield()]), 'p0')).toBe(true);
    expect(canInterceptBluff(makeRoom([mirror()]), 'p0')).toBe(true);
    expect(canInterceptBluff(makeRoom([readySwap()]), 'p0')).toBe(true);
  });

  it('is false when the accused holds no defensive card', () => {
    expect(canInterceptBluff(makeRoom([assassin()]), 'p0')).toBe(false);
    expect(canInterceptBluff(makeRoom([]), 'p0')).toBe(false);
  });

  it('is false when the accused is already armed (pipeline handles it directly)', () => {
    const room = makeRoom([shield()]);
    room.players[0].armedPowerCard = { power: 'shield', cardId: 'shield-1' };
    expect(canInterceptBluff(room, 'p0')).toBe(false);
  });

  it('is false for an eliminated player', () => {
    const room = makeRoom([shield()]);
    room.players[0].status = 'eliminated';
    expect(canInterceptBluff(room, 'p0')).toBe(false);
  });
});

// ─── armInterceptCard ─────────────────────────────────────────

describe('armInterceptCard (§1.1)', () => {
  it('arms a defensive card off-turn and stamps viaIntercept', () => {
    const room = makeRoom([shield()]);
    const res = armInterceptCard(room, 'p0', 'shield-1');
    expect(res.ok).toBe(true);
    expect(res.power).toBe('shield');
    const armed = room.players[0].armedPowerCard;
    expect(armed).toMatchObject({ power: 'shield', cardId: 'shield-1', viaIntercept: true });
    expect(room.powerCardSlot.p0[0].armed).toBe(true);
  });

  it('arms the first eligible card when no cardId is given', () => {
    const room = makeRoom([assassin(), mirror()]);
    const res = armInterceptCard(room, 'p0');
    expect(res.ok).toBe(true);
    expect(res.power).toBe('mirror'); // assassin is skipped (not defensive)
  });

  it('rejects an offensive card (assassin)', () => {
    const room = makeRoom([assassin()]);
    const res = armInterceptCard(room, 'p0', 'assassin-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/defensive/i);
  });

  it('rejects when the player is already armed', () => {
    const room = makeRoom([shield()]);
    room.players[0].armedPowerCard = { power: 'shield', cardId: 'shield-1' };
    const res = armInterceptCard(room, 'p0', 'shield-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already armed/i);
  });

  it('rejects a Swap that is not yet activatable', () => {
    const room = makeRoom([gatedSwap()]);
    const res = armInterceptCard(room, 'p0', 'swap-2');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/swap/i);
  });
});

// ─── Arm → resolve integration (the design proof) ─────────────

describe('intercept → pipeline resolution (§1.1)', () => {
  it('a Shield armed via interception BLOCKS the bluff with no pipeline change', () => {
    const room = makeRoom([shield()]);
    // The accused (p0) intercepts with a Shield in response to p1's call.
    const armed = armInterceptCard(room, 'p0', 'shield-1');
    expect(armed.ok).toBe(true);

    // Resolve the bluff exactly as the handler does on resume.
    const { events, outcome } = resolveBluff(room, 'p1');
    expect(outcome.kind).toBe('blocked');
    expect(events.some(e => e.kind === 'shield_blocked' && e.holderId === 'p0')).toBe(true);
    // Shield consumed: out of the slot, into discard, no longer armed.
    expect(room.players[0].armedPowerCard).toBeNull();
    expect(room.powerCardSlot.p0).toHaveLength(0);
  });
});
