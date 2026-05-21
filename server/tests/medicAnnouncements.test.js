// ============================================================
// #121 — Medic pause is announced to the whole room
//
// Before #121 `maybeStartMedicPause` only pinged the Medic's own
// socket, so every other player sat through an unexplained freeze
// while the game waited on a `pending_elimination` decision. The fix
// broadcasts a public `medic_deciding` banner to room.code while still
// sending the private save prompt to the Medic only.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createRoom, createPlayer, defaultRoomConfig, MODES, ROLES } from '../gameEngine.js';
import { maybeStartMedicPause } from '../lib/orchestration.js';

// Minimal io double that records every emit with its target so we can
// assert who each message went to.
function makeIo() {
  const sent = [];
  return {
    to: (target) => ({
      emit: (event, payload) => { sent.push({ target, event, payload }); },
    }),
    sent,
  };
}

function setupMedicRoom() {
  const room = createRoom('host', MODES.ONLINE, defaultRoomConfig());
  const medic = createPlayer('p0', 'Doc', 'sock-0');
  const patient = createPlayer('p1', 'Patient', 'sock-1');
  medic.role = ROLES.MEDIC;
  patient.role = ROLES.BAREHAND;
  room.players.push(medic, patient);
  room.turnOrder = ['p0', 'p1'];
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.hands = new Map([['p0', []], ['p1', []]]);
  return { room, medic, patient };
}

describe('#121 — Medic pause broadcast', () => {
  it('emits a public medic_deciding banner to room.code AND the private prompt to the Medic', () => {
    const { room } = setupMedicRoom();
    const io = makeIo();

    const started = maybeStartMedicPause(io, room, 'p1', 'spin', () => {});
    expect(started).toBe(true);
    expect(room.phase).toBe('medic_pending');

    // Public, room-wide deciding banner.
    const deciding = io.sent.find(
      (m) => m.event === 'power_card_triggered' && m.payload?.kind === 'medic_deciding',
    );
    expect(deciding).toBeTruthy();
    expect(deciding.target).toBe(room.code);
    expect(deciding.payload.eliminatedPlayerName).toBe('Patient');

    // Private prompt still goes only to the Medic's socket.
    const prompt = io.sent.find((m) => m.event === 'medic_save_pending');
    expect(prompt).toBeTruthy();
    expect(prompt.target).toBe('sock-0');
  });

  it('does not pause or announce when no Medic is available', () => {
    const { room, medic } = setupMedicRoom();
    medic.medicAbilityAvailable = false;
    const io = makeIo();

    const started = maybeStartMedicPause(io, room, 'p1', 'spin', () => {});
    expect(started).toBe(false);
    expect(io.sent).toHaveLength(0);
  });
});
