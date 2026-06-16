// ============================================================
// Spotlight tour — staged instances, completion predicates, director + bot.
//
// Locks the PURE logic (no io / timers):
//   • stageTourStep writes a deterministic, on-script room per step,
//   • tourStepComplete flips true only at the right moment,
//   • the director owes tour_next / tour_finish exactly when a step completes,
//   • the bot is FROZEN for the whole tour lesson.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const engine = require('../gameEngine.js');
const {
  TOUR_STEPS,
  stageTourStep,
  tourStepComplete,
  REQUIRED_SHAPE,
  BOT_ID,
} = require('../engine/tourScenarios.js');
const { _pendingDirectorAction } = require('../lib/tutorialDirector.js');
const { _pendingBotAction } = require('../lib/bots.js');

function tourRoom() {
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, null);
  room.code = 'TOUR01';
  room.isTutorial = true;
  room.tutorialLesson = 'tour';
  const human = engine.createPlayer('human', 'You', 'host-sock');
  const bot = engine.createPlayer(BOT_ID, 'Dealer Bot', null);
  bot.isBot = true;
  room.players.push(human, bot);
  room.phase = 'playing';
  return room;
}

const holds = (room, id, power) => (room.powerCardSlot?.[id] || []).some((c) => c?.power === power);

describe('TOUR_STEPS', () => {
  it('is the three ordered Part-B steps', () => {
    expect(TOUR_STEPS).toEqual(['play_card', 'call_bluff_chain', 'activate_power']);
  });
});

describe('stageTourStep — play_card (B1–B4)', () => {
  it('puts the human on turn with an all-legal hand and no Call Bluff', () => {
    const room = tourRoom();
    const sc = stageTourStep(room, 0);
    expect(room.turnOrder).toEqual(['human', BOT_ID]);
    expect(room.currentTurnIndex).toBe(0);
    expect(room.isFirstTurn).toBe(true);
    expect(room.phase).toBe('playing');
    // Every card in hand matches the required shape → any tap is a legal play.
    const hand = room.hands.get('human');
    expect(hand.length).toBeGreaterThan(0);
    expect(hand.every((c) => c.shape === REQUIRED_SHAPE)).toBe(true);
    expect(sc).toMatchObject({ tour: true, step: 'play_card', stepIndex: 0, totalSteps: 3, expect: 'play_card' });
  });

  it('completes only once the human has ended their turn (bot now on turn)', () => {
    const room = tourRoom();
    stageTourStep(room, 0);
    expect(tourStepComplete(room, 0)).toBe(false);
    room.currentTurnIndex = 1; // turn passed to the (frozen) bot
    expect(tourStepComplete(room, 0)).toBe(true);
  });
});

describe('stageTourStep — call_bluff_chain (B5–B7)', () => {
  it('stages an HONEST bot play (matching) so the call is wrong, and empties the human chamber', () => {
    const room = tourRoom();
    const sc = stageTourStep(room, 1);
    expect(room.currentTurnIndex).toBe(0);
    expect(room.isFirstTurn).toBe(false);               // Call Bluff available
    expect(room.prevTurnPlayerId).toBe(BOT_ID);
    expect(room.challengeableCard.shape).toBe(REQUIRED_SHAPE); // honest → call is WRONG
    // Human chamber empty → the wrong-call spin always survives.
    const human = room.players.find((p) => p.id === 'human');
    expect(human.chamber.every((s) => s == null)).toBe(true);
    // Bot holds no interceptable power → no intercept window.
    expect(room.powerCardSlot[BOT_ID]).toEqual([]);
    expect(sc).toMatchObject({ tour: true, step: 'call_bluff_chain', stepIndex: 1, expect: 'call_bluff' });
  });

  it('completes only once the spin has been acknowledged (tourSpinAcked)', () => {
    const room = tourRoom();
    stageTourStep(room, 1);
    expect(tourStepComplete(room, 1)).toBe(false);
    room.tourSpinAcked = true;
    expect(tourStepComplete(room, 1)).toBe(true);
  });
});

describe('stageTourStep — activate_power (B8–B10)', () => {
  it('seeds a Peek in the human slot and locks Call Bluff', () => {
    const room = tourRoom();
    const sc = stageTourStep(room, 2);
    expect(holds(room, 'human', 'peek')).toBe(true);
    expect(room.prevTurnPlayerId).toBe(BOT_ID); // a last play for Peek to reveal
    expect(sc).toMatchObject({ tour: true, step: 'activate_power', stepIndex: 2, expect: 'activate_power', lockBluff: true });
  });

  it('completes once the Peek is spent', () => {
    const room = tourRoom();
    stageTourStep(room, 2);
    expect(tourStepComplete(room, 2)).toBe(false);
    room.powerCardSlot.human = []; // peek consumed
    expect(tourStepComplete(room, 2)).toBe(true);
  });
});

describe('director — tour step advancement', () => {
  it('owes nothing while the current step is incomplete', () => {
    const room = tourRoom();
    stageTourStep(room, 0);
    expect(_pendingDirectorAction(room)).toBeNull();
  });

  it('owes tour_next when a non-final step completes', () => {
    const room = tourRoom();
    stageTourStep(room, 0);
    room.currentTurnIndex = 1; // play_card complete
    expect(_pendingDirectorAction(room)).toEqual({ kind: 'tour_next', index: 0 });
  });

  it('owes tour_finish when the last step completes', () => {
    const room = tourRoom();
    stageTourStep(room, 2);
    room.powerCardSlot.human = []; // activate_power complete
    expect(_pendingDirectorAction(room)).toEqual({ kind: 'tour_finish' });
  });
});

describe('bot is frozen for the whole tour', () => {
  it('returns no bot action when the lesson is "tour", even with the bot on turn', () => {
    const room = tourRoom();
    stageTourStep(room, 0);
    room.currentTurnIndex = 1;        // bot on turn
    room.tutorialScenario = null;     // rule out the scenario-idle guard
    expect(_pendingBotAction(room)).toBeNull();
  });

  it('the SAME state acts when the lesson is not the tour (proves the tour guard)', () => {
    const room = tourRoom();
    stageTourStep(room, 0);
    room.currentTurnIndex = 1;
    room.tutorialScenario = null;
    room.tutorialLesson = 'basics';
    const action = _pendingBotAction(room);
    expect(action).not.toBeNull();
    expect(action.botId).toBe(BOT_ID);
  });
});
