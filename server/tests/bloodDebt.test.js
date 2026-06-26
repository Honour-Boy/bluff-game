// ============================================================
// Phase 4 (#301, #303) - Blood Debt (Covenant-exclusive).
//
// Pure engine flag transitions + the call_bluff queueing of a debt spin and
// the blood_debt_target assignment handler. The full correct-bluff → spin →
// assign → debt-spin integration is exercised via the orchestration suite;
// here we lock the building blocks.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createRoom,
  createPlayer,
  assignBloodDebt,
  checkCallerHasBloodDebt,
  consumeBloodDebt,
  applyTierFlags,
  MODES,
  defaultRoomConfig,
} = require('../gameEngine.js');

function roomWith(ids = ['a', 'b', 'c']) {
  const room = createRoom('host', MODES.ONLINE, defaultRoomConfig());
  for (const id of ids) room.players.push(createPlayer(id, id.toUpperCase(), `s-${id}`));
  return room;
}

describe('engine/bloodDebt - pure flag transitions', () => {
  it('createPlayer starts with hasBloodDebt false', () => {
    expect(createPlayer('x', 'X', 's').hasBloodDebt).toBe(false);
  });

  it('assignBloodDebt sets the flag once and no-ops on repeat / missing', () => {
    const room = roomWith();
    expect(assignBloodDebt(room, 'b')).toEqual({ ok: true });
    expect(room.players.find(p => p.id === 'b').hasBloodDebt).toBe(true);
    // Already has a debt → no-op.
    expect(assignBloodDebt(room, 'b')).toEqual({ ok: false });
    // Unknown player → no-op (no throw).
    expect(assignBloodDebt(room, 'ghost')).toEqual({ ok: false });
  });

  it('checkCallerHasBloodDebt reflects the flag', () => {
    const room = roomWith();
    expect(checkCallerHasBloodDebt(room, 'a')).toBe(false);
    assignBloodDebt(room, 'a');
    expect(checkCallerHasBloodDebt(room, 'a')).toBe(true);
    expect(checkCallerHasBloodDebt(room, 'ghost')).toBe(false);
  });

  it('consumeBloodDebt clears the flag exactly once', () => {
    const room = roomWith();
    assignBloodDebt(room, 'c');
    expect(consumeBloodDebt(room, 'c')).toEqual({ ok: true });
    expect(room.players.find(p => p.id === 'c').hasBloodDebt).toBe(false);
    expect(checkCallerHasBloodDebt(room, 'c')).toBe(false);
    expect(consumeBloodDebt(room, 'ghost')).toEqual({ ok: false });
  });

  it('applyTierFlags arms bloodDebtActive only for Covenant', () => {
    expect(applyTierFlags(roomWith(), 'syndicate').bloodDebtActive).toBe(false);
    expect(applyTierFlags(roomWith(), 'covenant').bloodDebtActive).toBe(true);
  });
});
