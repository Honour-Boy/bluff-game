// ============================================================
// Tests for §3.2 — spectator anti-cheat lockout in serializeRoom
//
// The old #81 "spectate one chosen player's hand" feature is removed:
// an eliminated / dead player must NEVER receive any opponent hand in a
// room_state payload. These tests pin that no path emits `spectatedHand`.
//
// `currentPromptTarget` (player id + prompt kind, NO card data) is
// retained and still gated to eliminated callers for ghost overlays;
// its privacy tests are unchanged below.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createRoom,
  createPlayer,
  defaultRoomConfig,
  serializeRoom,
  MODES,
} from '../gameEngine.js';

function makeOnlineRoom(playerCount, configOverrides = null) {
  const cfg = configOverrides || defaultRoomConfig();
  const room = createRoom('host-socket', MODES.ONLINE, cfg);
  for (let i = 0; i < playerCount; i++) {
    room.players.push(createPlayer(`p${i}`, `Player${i}`, `sock-${i}`));
  }
  // serializeRoom expects room.hands to exist for online mode; some
  // helpers rely on startGame to populate it, but for spectator tests
  // we don't need a full deal — a Map of arbitrary card stand-ins is
  // enough to exercise the gating.
  if (!room.hands) room.hands = new Map();
  for (const p of room.players) {
    if (!room.hands.has(p.id)) room.hands.set(p.id, []);
  }
  return room;
}

function setHand(room, playerId, cards) {
  room.hands.set(playerId, cards);
}

describe('serializeRoom — spectator hand lockout (§3.2)', () => {
  it('NEVER exposes spectatedHand to an eliminated caller, even with a target', () => {
    const room = makeOnlineRoom(3);
    const [eliminated, alive1] = room.players;
    eliminated.status = 'eliminated';
    eliminated.isSpectator = true;
    const aliveHand = [{ id: 'c1', type: 'shape', shape: 'circle' }];
    setHand(room, alive1.id, aliveHand);

    const view = serializeRoom(room, eliminated.id, { spectatingTargetId: alive1.id });
    expect(view.spectatedHand).toBeUndefined();
    expect(view.spectatedPlayerId).toBeUndefined();
  });

  it('omits spectatedHand for living callers even if they claim a target', () => {
    const room = makeOnlineRoom(3);
    const [alive0, alive1] = room.players;
    setHand(room, alive1.id, [{ id: 'c1', type: 'shape', shape: 'circle' }]);

    const view = serializeRoom(room, alive0.id, { spectatingTargetId: alive1.id });
    expect(view.spectatedHand).toBeUndefined();
    expect(view.spectatedPlayerId).toBeUndefined();
  });

  it('only the caller ever sees a hand — opponents are limited to handSize', () => {
    const room = makeOnlineRoom(3);
    const [eliminated, alive1, alive2] = room.players;
    eliminated.status = 'eliminated';
    eliminated.isSpectator = true;
    setHand(room, alive1.id, [{ id: 'c1', type: 'shape', shape: 'circle' }]);
    setHand(room, alive2.id, [{ id: 'c2', type: 'shape', shape: 'square' }]);

    const view = serializeRoom(room, eliminated.id, { spectatingTargetId: alive1.id });
    // No opponent hand array reaches the eliminated client — only counts.
    const opponents = view.players.filter(p => p.id !== eliminated.id);
    for (const p of opponents) {
      expect(p).not.toHaveProperty('hand');
      expect(typeof p.handSize).toBe('number');
    }
    expect(view.spectatedHand).toBeUndefined();
  });
});

describe('serializeRoom — currentPromptTarget (#81)', () => {
  it('exposes Medic prompt target to eliminated callers during medic_pending', () => {
    const room = makeOnlineRoom(3);
    const [eliminated, medic] = room.players;
    eliminated.status = 'eliminated';
    eliminated.isSpectator = true;
    room.phase = 'medic_pending';
    room.pendingMedicSave = {
      medicId: medic.id,
      eliminatedPlayerId: eliminated.id,
      eliminatedPlayerName: eliminated.username,
      source: 'spin',
    };

    const view = serializeRoom(room, eliminated.id);
    expect(view.currentPromptTarget).toEqual({
      playerId: medic.id,
      kind: 'medic_save_pending',
    });
  });

  it('exposes Sniper prompt target to eliminated callers during sniper_pending', () => {
    const room = makeOnlineRoom(4);
    const [eliminated, sniper, targetPlayer] = room.players;
    eliminated.status = 'eliminated';
    eliminated.isSpectator = true;
    room.phase = 'sniper_pending';
    room.pendingSniperRedirect = {
      sniperId: sniper.id,
      originalSpinTargetId: targetPlayer.id,
      originalSpinTargetName: targetPlayer.username,
      eligibleTargetIds: [targetPlayer.id],
    };

    const view = serializeRoom(room, eliminated.id);
    expect(view.currentPromptTarget).toEqual({
      playerId: sniper.id,
      kind: 'sniper_redirect_pending',
    });
  });

  it('NEVER leaks medicId to living callers — secret-role privacy', () => {
    const room = makeOnlineRoom(3);
    const [aliveCaller, medic, victim] = room.players;
    room.phase = 'medic_pending';
    room.pendingMedicSave = {
      medicId: medic.id,
      eliminatedPlayerId: victim.id,
      eliminatedPlayerName: victim.username,
      source: 'spin',
    };

    const view = serializeRoom(room, aliveCaller.id);
    expect(view.currentPromptTarget).toBeNull();
    // The public pendingMedicSave shape stays the same — amTargetMedic
    // is false for everyone except the medic themselves; no medicId
    // is exposed here.
    expect(view.pendingMedicSave).toBeTruthy();
    expect(view.pendingMedicSave.amTargetMedic).toBe(false);
    expect(view.pendingMedicSave).not.toHaveProperty('medicId');
  });

  it('NEVER leaks sniperId to living callers — secret-role privacy', () => {
    const room = makeOnlineRoom(4);
    const [aliveCaller, sniper, target] = room.players;
    room.phase = 'sniper_pending';
    room.pendingSniperRedirect = {
      sniperId: sniper.id,
      originalSpinTargetId: target.id,
      originalSpinTargetName: target.username,
      eligibleTargetIds: [target.id],
    };

    const view = serializeRoom(room, aliveCaller.id);
    expect(view.currentPromptTarget).toBeNull();
    expect(view.pendingSniperRedirect).toBeTruthy();
    expect(view.pendingSniperRedirect.amTargetSniper).toBe(false);
    expect(view.pendingSniperRedirect).not.toHaveProperty('sniperId');
  });

  it('returns null when phase is playing — no active prompt to ghost', () => {
    const room = makeOnlineRoom(3);
    const [eliminated] = room.players;
    eliminated.status = 'eliminated';
    eliminated.isSpectator = true;
    room.phase = 'playing';

    const view = serializeRoom(room, eliminated.id);
    expect(view.currentPromptTarget).toBeNull();
  });
});

describe('serializeRoom — spectator field backward compat', () => {
  it('two-arg form (room, playerId) still works for non-spectator callers', () => {
    const room = makeOnlineRoom(2);
    const [alive] = room.players;
    const view = serializeRoom(room, alive.id);
    expect(view.spectatedHand).toBeUndefined();
    expect(view.spectatedPlayerId).toBeUndefined();
    expect(view.currentPromptTarget).toBeNull();
  });

  it('opts.spectatingTargetId is ignored when caller is null (physical mode)', () => {
    const room = makeOnlineRoom(2);
    setHand(room, room.players[1].id, [{ id: 'c', type: 'shape', shape: 'circle' }]);
    const view = serializeRoom(room, null, { spectatingTargetId: room.players[1].id });
    expect(view.spectatedHand).toBeUndefined();
  });
});
