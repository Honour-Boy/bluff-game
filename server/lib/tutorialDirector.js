// ============================================================
// SOCKET LIB — Tutorial progression director (Basics → Power Clinic)
// ============================================================
// The bot "hosts" a practice room and the SERVER drives the lesson flow:
//   • when a Basics game ends, hand the learner off to the Power Clinic;
//   • inside the clinic, step through the scripted drills (engine/
//     tutorialScenarios.js) — stage a drill, wait for the learner to use the
//     power, hold a beat on the "what happened" explanation, then advance.
//
// Modelled on lib/bots.js: armTutorialDirector is idempotent and called at the
// END of every broadcastRoomState (next to armBotTurn). It figures out the one
// staged step the room owes and schedules it; performing the step broadcasts,
// which re-arms the next. No-op for any room that isn't a tutorial, so normal
// rooms are untouched.
//
// Cycle note: this module is required at the top of lib/broadcast.js, so it must
// NOT require ./broadcast at top level — that is pulled in via a DEFERRED require
// inside the expiry handler (same trick lib/bots.js / lib/idleTurn.js use).

const engine = require('../gameEngine');
const { POWER_CLINIC, stageScenario, scenarioComplete } = require('../engine/tutorialScenarios');
const {
  getRoom,
  saveRoom,
  tutorialTimers,
  _clearTutorialTimer,
} = require('./state');

// Beat timing (ms): long enough to read, short enough to feel guided.
const DELAYS = {
  start_clinic: 2600,  // "you finished the basics round" → deal the clinic
  resolve: 650,        // brief beat after the power lands → show the explanation
  advance: 2900,       // hold the "what happened" copy before the next drill
  finish: 1700,        // last drill done → clinic-complete screen
};

const ALL_POWERS_ON = {
  shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true,
};

/**
 * The one staged step the room owes right now, or null. Pure read.
 *   start_clinic — a Basics tutorial reached game over; move to the clinic.
 *   resolve      — the current drill's power was used; show the explanation.
 *   advance      — the explanation beat elapsed; stage the next drill.
 *   finish       — the last drill is done; show clinic-complete.
 */
function _pendingDirectorAction(room) {
  if (!room || !room.isTutorial) return null;
  const lesson = room.tutorialLesson || 'basics';

  // Basics finished (win OR lose) → hand off to the Power Clinic.
  if (lesson !== 'powers') {
    if (room.phase === 'game_over' || room.phase === 'round_end') {
      return { kind: 'start_clinic' };
    }
    return null;
  }

  // Inside the clinic.
  const sc = room.tutorialScenario;
  if (!sc || typeof sc.index !== 'number') return null;
  if (sc.step === 'intro') {
    if (scenarioComplete(room, sc.index)) return { kind: 'resolve', index: sc.index };
    return null;
  }
  if (sc.step === 'resolved') {
    const isLast = sc.index >= POWER_CLINIC.length - 1;
    return isLast ? { kind: 'finish', index: sc.index } : { kind: 'advance', index: sc.index };
  }
  return null;
}

function _directorKey(action, room) {
  const sc = room.tutorialScenario;
  return [
    action.kind,
    room.tutorialLesson || 'basics',
    room.phase,
    sc?.index ?? -1,
    sc?.step || '',
    room.roundNumber || 0,
  ].join(':');
}

/**
 * Idempotent. Arms (or re-arms on progression) the director's next step, or
 * tears the timer down when nothing is owed. Safe on every broadcast and on
 * non-tutorial rooms (no-op).
 */
function armTutorialDirector(io, room) {
  if (!room || !room.code) return;
  if (!room.isTutorial) { _clearTutorialTimer(room.code); return; }

  const action = _pendingDirectorAction(room);
  if (!action) {
    room._tutorialKey = null;
    _clearTutorialTimer(room.code);
    return;
  }

  const key = _directorKey(action, room);
  if (room._tutorialKey === key && tutorialTimers.has(room.code)) return;

  _clearTutorialTimer(room.code);
  room._tutorialKey = key;
  const delay = DELAYS[action.kind] || 1500;
  const handle = setTimeout(() => {
    _onDirectorExpire(io, room.code, key).catch((err) => {
      console.error('[tutorialDirector] step failed', err);
    });
  }, delay);
  if (typeof handle.unref === 'function') handle.unref();
  tutorialTimers.set(room.code, handle);
}

// Reconfigure a finished Basics room into the Power Clinic (drill 0). The seats
// are revived + re-chambered by stageScenario; we just flip the lesson + powers.
function _beginPowerClinic(room) {
  room.tutorialLesson = 'powers';
  room.tutorialClinicComplete = false;
  room.botBluffCallsThisGame = 0;
  if (!room.config) room.config = engine.defaultRoomConfig();
  room.config.powerCards = room.config.powerCards || {};
  room.config.powerCards.enabled = { ...ALL_POWERS_ON };
  room.tutorialScenario = stageScenario(room, 0);
}

function _finishClinic(room) {
  const human = room.players.find(p => p && !p.isBot) || null;
  room.tutorialScenario = null;
  room.tutorialClinicComplete = true;
  room.phase = 'game_over';
  room.lastAction = { type: 'game_over', winnerId: human?.id || null, winnerName: human?.username || null };
}

/**
 * Fired one beat after a step became due. Re-fetches + re-validates (a stale
 * timer that fires after the learner moved on is a harmless no-op), then
 * performs exactly one step and broadcasts.
 */
async function _onDirectorExpire(io, code, key) {
  const { broadcastRoomState } = require('./broadcast');

  _clearTutorialTimer(code);
  const room = await getRoom(code);
  const action = _pendingDirectorAction(room);
  if (!action) return;
  if (key && _directorKey(action, room) !== key) return; // state moved on

  room._tutorialKey = null;

  switch (action.kind) {
    case 'start_clinic':
      _beginPowerClinic(room);
      break;
    case 'resolve':
      if (room.tutorialScenario) room.tutorialScenario.step = 'resolved';
      break;
    case 'advance':
      room.tutorialScenario = stageScenario(room, action.index + 1);
      break;
    case 'finish':
      _finishClinic(room);
      break;
    default:
      return;
  }

  await saveRoom(room);
  await broadcastRoomState(io, code);
}

module.exports = {
  armTutorialDirector,
  _pendingDirectorAction,
  _beginPowerClinic,
  _finishClinic,
};
