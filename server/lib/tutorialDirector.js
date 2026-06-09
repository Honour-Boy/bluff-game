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
const { POWER_CLINIC, stageScenario, scenarioComplete, BOT_ID } = require('../engine/tutorialScenarios');
const BOT_NAME = 'Dealer Bot';
const {
  getRoom,
  saveRoom,
  tutorialTimers,
  _clearTutorialTimer,
} = require('./state');

// Beat timing (ms). Module 4 slows the clinic down deliberately so each beat is
// legible — the player should never feel rushed through a power.
const DELAYS = {
  start_clinic: 2600,   // "you finished the basics round" → deal the clinic
  announce_challenge: 1600, // (Module 4.1) "Dealer Bot calls bluff!" beat BEFORE the defend window
  open_intercept: 1400, // beat before the arm/defend window actually opens
  resolve: 1800,        // hold on the live consequence before the explanation
  // (Module 2.2) The clinic's final beat — the Assassin strike that eliminates the
  // bot (= you win) — holds longer so the victory coach + Eliminated card are fully
  // readable before the clinic-complete card / cleanup transitions.
  resolve_victory: 4200,
};

const ALL_POWERS_ON = {
  shield: true, mirror: true, swap: true, peek: true, freeze: true, assassin: true,
};

/**
 * The one staged step the room owes right now, or null. Pure read.
 *   start_clinic — a Basics tutorial reached game over; move to the clinic.
 *   resolve      — the current drill's power was used; show the explanation.
 *
 * Advancing PAST a resolved drill is NOT timed — it waits for the learner to tap
 * "I Understand" (the `tutorial_advance` socket event → advanceClinic below), so
 * each power's explanation stays up until the player is ready.
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

  // Defensive full-loop drill: the player has played + ended their turn → the bot
  // "challenges" (we open the intercept window) so the player can defend.
  if (sc.step === 'intro' && sc.expect === 'play_then_defend' && room.phase === 'playing') {
    const humanId = room.players.find(p => p && !p.isBot)?.id;
    const onTurnId = room.turnOrder?.[room.currentTurnIndex];
    if (humanId && onTurnId && onTurnId !== humanId
      && room.challengeableCard
      && engine.getPreviousTurnPlayerId(room) === humanId
      && engine.canInterceptBluff(room, humanId)) {
      // (Module 4.1) Two beats: first announce the bot's challenge, THEN open the
      // defend window — so "the bot called your bluff" reads before the arm panel.
      if (!sc.challengeAnnounced) return { kind: 'announce_challenge', index: sc.index };
      return { kind: 'open_intercept', index: sc.index };
    }
  }

  // The intro→resolved (power used) beat is timed.
  if (sc.step === 'intro' && scenarioComplete(room, sc.index)) {
    return { kind: 'resolve', index: sc.index };
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
  // Inert for non-tutorial rooms AND for an uncoached practice replay (a plain
  // game vs the bot, opted out of the guided progression — no clinic hand-off).
  if (!room.isTutorial || room.tutorialCoaching === false) { _clearTutorialTimer(room.code); return; }

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
  let delay = DELAYS[action.kind] || 1500;
  // (Module 2.2) Extend the hold on the final (Assassin) drill's resolve so the
  // bot-elimination victory is digestible before the clinic wraps up.
  if (action.kind === 'resolve'
    && room.tutorialScenario
    && room.tutorialScenario.index >= POWER_CLINIC.length - 1) {
    delay = DELAYS.resolve_victory;
  }
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

// The "bot challenges you" beat of a defensive drill: open the bluff-intercept
// window against the human's just-played (mismatched) card so they can arm their
// defence. No server safety timeout — the clinic is guided and the BluffIntercept
// overlay hides its countdown in tutorial mode.
function _openInterceptForDefence(room) {
  const human = room.players.find(p => p && !p.isBot) || null;
  const humanId = human?.id || null;
  if (!humanId) return;
  room.bluffUsedThisTurn = true;
  room.phase = 'bluff_intercept_pending';
  room.pendingBluffIntercept = {
    accuserId: BOT_ID,
    accuserName: BOT_NAME,
    accusedId: humanId,
    accusedName: human?.username || 'You',
    deadline: Date.now() + 600_000,
    options: engine.listInterceptCards(room, humanId).map(c => ({ cardId: c.id, power: c.power })),
  };
  room.lastAction = {
    type: 'bluff_intercept_window',
    accuserId: BOT_ID,
    accuserName: BOT_NAME,
    accusedId: humanId,
    accusedName: human?.username || null,
  };
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
    case 'announce_challenge': {
      // (Module 4.1) Distinct "Dealer Bot is calling your bluff" beat shown before
      // the defend window. Phase stays 'playing'; the client coach surfaces it via
      // the scenario's challengeAnnounced flag.
      const human = room.players.find(p => p && !p.isBot) || null;
      if (room.tutorialScenario) room.tutorialScenario.challengeAnnounced = true;
      room.lastAction = {
        type: 'tutorial_bot_challenge',
        accuserId: BOT_ID,
        accuserName: BOT_NAME,
        accusedId: human?.id || null,
        accusedName: human?.username || null,
      };
      break;
    }
    case 'open_intercept':
      _openInterceptForDefence(room);
      break;
    case 'resolve':
      if (room.tutorialScenario) room.tutorialScenario.step = 'resolved';
      break;
    default:
      return;
  }

  await saveRoom(room);
  await broadcastRoomState(io, code);
}

/**
 * Player-driven advance past a RESOLVED clinic drill ("I Understand"). Stages the
 * next drill, or finishes the clinic after the last one. Returns true on advance.
 */
function advanceClinic(room) {
  if (!room || !room.isTutorial || (room.tutorialLesson || 'basics') !== 'powers') return false;
  const sc = room.tutorialScenario;
  if (!sc || sc.step !== 'resolved') return false;
  if (sc.index >= POWER_CLINIC.length - 1) {
    _finishClinic(room);
  } else {
    room.tutorialScenario = stageScenario(room, sc.index + 1);
  }
  return true;
}

module.exports = {
  armTutorialDirector,
  _pendingDirectorAction,
  _beginPowerClinic,
  _finishClinic,
  advanceClinic,
};
