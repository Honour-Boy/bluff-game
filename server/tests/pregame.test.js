// ============================================================
// Tests for v2 Phase G — Pre-game selection & role reveal (#116)
//
// Covers:
//   - isBarehandVisible threshold (> 9)
//   - dealCards extraCards / _appendExtraCards bonus-card mechanism
//   - generateSelectionPool composition (6 power + 1 normal, unique)
//   - beginPreGame: online-only, pools per alive player, phase flip
//   - startPreGameSelection: opens window + stamps deadline
//   - applyPreGameSelection: validation, one-shot, ready counts
//   - finalizePreGame: auto-assign, bonus appended, phase → playing,
//     cleanup, idempotency
//   - serializeRoom pregame block: owner-scoped, counts, no leakage
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  startGame,
  serializeRoom,
  generateDeck,
  dealCards,
  _appendExtraCards,
  generateSelectionPool,
  beginPreGame,
  startPreGameSelection,
  applyPreGameSelection,
  finalizePreGame,
  isBarehandVisible,
  POWER_TYPES,
  ROLES_AT_MIN_ALIVE,
  MODES,
} from '../gameEngine.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeOnlineRoom(playerCount, config = null) {
  const room = createRoom('host-socket', MODES.ONLINE, config || defaultRoomConfig());
  for (let i = 0; i < playerCount; i++) {
    room.players.push(createPlayer(`p${i}`, `Player${i}`, `sock-${i}`));
  }
  return room;
}

// Drive a room up to an OPEN pre-game selection window.
function makeRoomInPreGameSelection(playerCount, config = null) {
  const room = makeOnlineRoom(playerCount, config);
  startGame(room);          // deals 6 + assigns roles, phase 'playing'
  beginPreGame(room);       // phase 'pre_game', pools built, selection closed
  startPreGameSelection(room); // open + deadline
  return room;
}

// ─── isBarehandVisible ───────────────────────────────────────

describe('isBarehandVisible', () => {
  it('hides the Barehand label at or below the role threshold', () => {
    expect(isBarehandVisible(2)).toBe(false);
    expect(isBarehandVisible(ROLES_AT_MIN_ALIVE)).toBe(false); // exactly 9 → "Standard"
  });
  it('shows the Barehand label above the threshold', () => {
    expect(isBarehandVisible(ROLES_AT_MIN_ALIVE + 1)).toBe(true); // 10
    expect(isBarehandVisible(15)).toBe(true);
  });
});

// ─── Bonus-card mechanism (dealCards extraCards) ─────────────

describe('dealCards extraCards / _appendExtraCards', () => {
  it('appends per-player extras after the normal deal (object map)', () => {
    const ids = ['a', 'b', 'c'];
    const extra = { a: [{ id: 'bonus-a', type: 'power', power: 'shield' }] };
    const { hands } = dealCards(generateDeck(), ids, 6, extra);
    expect(hands.get('a')).toHaveLength(7);
    expect(hands.get('a').some(c => c.id === 'bonus-a')).toBe(true);
    expect(hands.get('b')).toHaveLength(6);
    expect(hands.get('c')).toHaveLength(6);
  });

  it('accepts a Map and leaves absent players untouched', () => {
    const ids = ['a', 'b'];
    const extra = new Map([['b', [{ id: 'x', type: 'shape', shape: 'circle', number: 4 }]]]);
    const { hands } = dealCards(generateDeck(), ids, 6, extra);
    expect(hands.get('a')).toHaveLength(6);
    expect(hands.get('b')).toHaveLength(7);
  });

  it('is a no-op when extraCards is null', () => {
    const { hands } = dealCards(generateDeck(), ['a'], 6, null);
    expect(hands.get('a')).toHaveLength(6);
  });

  it('_appendExtraCards mutates and returns the same Map', () => {
    const hands = new Map([['a', [{ id: '1' }]]]);
    const out = _appendExtraCards(hands, { a: [{ id: '2' }] });
    expect(out).toBe(hands);
    expect(hands.get('a')).toHaveLength(2);
  });
});

// ─── generateSelectionPool ───────────────────────────────────

describe('generateSelectionPool', () => {
  it('returns all 6 power types plus one normal card, with unique ids', () => {
    const pool = generateSelectionPool('p0');
    expect(pool).toHaveLength(POWER_TYPES.length + 1);

    const powers = pool.filter(c => c.type === 'power').map(c => c.power);
    expect(powers.sort()).toEqual([...POWER_TYPES].sort());

    const shapes = pool.filter(c => c.type === 'shape');
    expect(shapes).toHaveLength(1);
    expect(shapes[0].shape).not.toBe('whot');
    expect(shapes[0].number).toBeGreaterThanOrEqual(1);
    expect(shapes[0].number).toBeLessThanOrEqual(14);

    const ids = pool.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates independent pools per player (duplicates allowed across players)', () => {
    const a = generateSelectionPool('p0');
    const b = generateSelectionPool('p1');
    // Distinct id namespaces, but both contain every power type.
    expect(a.every(c => b.some(o => o.id === c.id))).toBe(false);
    expect(a.filter(c => c.type === 'power')).toHaveLength(POWER_TYPES.length);
    expect(b.filter(c => c.type === 'power')).toHaveLength(POWER_TYPES.length);
  });
});

// ─── beginPreGame ────────────────────────────────────────────

describe('beginPreGame', () => {
  it('flips an online room to pre_game with a pool per alive player', () => {
    const room = makeOnlineRoom(3);
    startGame(room);
    beginPreGame(room);

    expect(room.phase).toBe('pre_game');
    expect(room.pregameSelectionOpen).toBe(false);
    expect(room.pregameSelectionDeadline).toBeNull();
    expect(Object.keys(room.pregamePools)).toHaveLength(3);
    for (const p of room.players) {
      expect(room.pregamePools[p.id]).toHaveLength(POWER_TYPES.length + 1);
    }
    expect(room.pregameSelectionsReady.size).toBe(0);
  });

  it('is a no-op for physical rooms', () => {
    const room = createRoom('h', MODES.PHYSICAL);
    room.players.push(createPlayer('p0', 'A', 's0'), createPlayer('p1', 'B', 's1'));
    startGame(room);
    beginPreGame(room);
    expect(room.phase).toBe('playing');
    expect(room.pregamePools).toBeUndefined();
  });
});

// ─── startPreGameSelection ───────────────────────────────────

describe('startPreGameSelection', () => {
  it('opens the window and stamps a future deadline', () => {
    const room = makeOnlineRoom(2);
    startGame(room);
    beginPreGame(room);
    const before = Date.now();
    const deadline = startPreGameSelection(room);
    expect(room.pregameSelectionOpen).toBe(true);
    expect(deadline).toBeGreaterThan(before);
    expect(room.pregameSelectionDeadline).toBe(deadline);
  });
});

// ─── applyPreGameSelection ───────────────────────────────────

describe('applyPreGameSelection', () => {
  it('rejects when not in pre_game phase', () => {
    const room = makeOnlineRoom(2);
    startGame(room); // phase 'playing'
    const res = applyPreGameSelection(room, 'p0', 'whatever');
    expect(res.ok).toBe(false);
  });

  it('rejects before the window opens', () => {
    const room = makeOnlineRoom(2);
    startGame(room);
    beginPreGame(room); // not opened yet
    const optId = room.pregamePools.p0[0].id;
    const res = applyPreGameSelection(room, 'p0', optId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not open/i);
  });

  it('rejects an option id not in the player pool', () => {
    const room = makeRoomInPreGameSelection(2);
    const res = applyPreGameSelection(room, 'p0', 'bogus-id');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid/i);
  });

  it('rejects an unknown / non-alive player', () => {
    const room = makeRoomInPreGameSelection(2);
    const res = applyPreGameSelection(room, 'ghost', room.pregamePools.p0[0].id);
    expect(res.ok).toBe(false);
  });

  it('records a valid pick once and reports counts', () => {
    const room = makeRoomInPreGameSelection(3);
    const optId = room.pregamePools.p0[2].id;
    const res = applyPreGameSelection(room, 'p0', optId);
    expect(res.ok).toBe(true);
    expect(res.totalCount).toBe(3);
    expect(res.pendingCount).toBe(2);
    expect(res.allReady).toBe(false);
    expect(room.pregameSelections.p0.id).toBe(optId);
    expect(room.pregameSelectionsReady.has('p0')).toBe(true);
  });

  it('rejects a second pick from the same player', () => {
    const room = makeRoomInPreGameSelection(2);
    applyPreGameSelection(room, 'p0', room.pregamePools.p0[0].id);
    const again = applyPreGameSelection(room, 'p0', room.pregamePools.p0[1].id);
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already/i);
  });

  it('flags allReady once the last player confirms', () => {
    const room = makeRoomInPreGameSelection(2);
    applyPreGameSelection(room, 'p0', room.pregamePools.p0[0].id);
    const last = applyPreGameSelection(room, 'p1', room.pregamePools.p1[0].id);
    expect(last.ok).toBe(true);
    expect(last.pendingCount).toBe(0);
    expect(last.allReady).toBe(true);
  });
});

// ─── finalizePreGame ─────────────────────────────────────────

describe('finalizePreGame', () => {
  it('auto-assigns non-responders, appends bonus cards, and starts play', () => {
    const room = makeRoomInPreGameSelection(3);
    // Only p0 picks; p1 and p2 will be auto-assigned.
    applyPreGameSelection(room, 'p0', room.pregamePools.p0[0].id);

    const result = finalizePreGame(room);
    expect(result.ok).toBe(true);
    expect(result.autoAssigned.sort()).toEqual(['p1', 'p2']);

    expect(room.phase).toBe('playing');
    // Each alive player's hand grew from the dealt 6 to 6 + 1 bonus.
    for (const p of room.players) {
      expect(room.hands.get(p.id)).toHaveLength(7);
    }

    // Pre-game bookkeeping cleared.
    expect(room.pregamePools).toBeUndefined();
    expect(room.pregameSelections).toBeUndefined();
    expect(room.pregameSelectionsReady).toBeUndefined();
    expect(room.pregameSelectionOpen).toBeUndefined();
    expect(room.pregameSelectionDeadline).toBeUndefined();
  });

  it('adds exactly the chosen bonus card to the hand', () => {
    const room = makeRoomInPreGameSelection(2);
    const chosen = room.pregamePools.p0[1];
    applyPreGameSelection(room, 'p0', chosen.id);
    applyPreGameSelection(room, 'p1', room.pregamePools.p1[0].id);
    finalizePreGame(room);
    expect(room.hands.get('p0').some(c => c.id === chosen.id)).toBe(true);
  });

  it('is idempotent — a second finalise after playing is a no-op', () => {
    const room = makeRoomInPreGameSelection(2);
    finalizePreGame(room); // auto-assigns both
    const second = finalizePreGame(room);
    expect(second.ok).toBe(false);
  });
});

// ─── serializeRoom pregame block ─────────────────────────────

describe('serializeRoom — pregame block', () => {
  it('exposes only the requesting player own pool + live counts', () => {
    const room = makeRoomInPreGameSelection(11); // > 9 → barehandVisible
    const view0 = serializeRoom(room, 'p0');
    expect(view0.pregame).toBeTruthy();
    expect(view0.pregame.selectionOpen).toBe(true);
    expect(view0.pregame.totalCount).toBe(11);
    expect(view0.pregame.pendingCount).toBe(11);
    expect(view0.pregame.barehandVisible).toBe(true);
    expect(view0.pregame.mySelectionId).toBeNull();
    expect(view0.pregame.myPool).toHaveLength(POWER_TYPES.length + 1);
    // p0 only ever sees its own pool, never p1's.
    expect(view0.pregame.myPool).toEqual(room.pregamePools.p0);
    expect(view0.pregame.myPool).not.toEqual(room.pregamePools.p1);
  });

  it('reflects a confirmed pick and decrements pending', () => {
    const room = makeRoomInPreGameSelection(4);
    const optId = room.pregamePools.p0[0].id;
    applyPreGameSelection(room, 'p0', optId);
    const view = serializeRoom(room, 'p0');
    expect(view.pregame.mySelectionId).toBe(optId);
    expect(view.pregame.pendingCount).toBe(3);
  });

  it('drops the pregame block once play begins', () => {
    const room = makeRoomInPreGameSelection(2);
    finalizePreGame(room);
    expect(serializeRoom(room, 'p0').pregame).toBeNull();
  });
});
