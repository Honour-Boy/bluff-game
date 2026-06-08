// ============================================================
// Tutorial v2 — Power Clinic (scripted drills) + progression director.
//
// Locks:
//   • the Basics "bot calls bluff ≥2 per game" guarantee (botStrategy),
//   • stageScenario producing the intended staged state for each drill,
//   • scenarioComplete flipping once the power is actually used (driven through
//     the REAL resolution pipeline — shield blocks, mirror reflects, swap
//     re-faces, assassin eliminates),
//   • the director's Basics→clinic hand-off and drill-stepping transitions,
//   • the start_game tutorial bypass (a non-host human starts their own game).
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const engine = require('../gameEngine.js');
const bluffPipeline = require('../bluffPipeline.js');
const { shouldCallBluff } = require('../engine/botStrategy.js');
const {
  POWER_CLINIC,
  stageScenario,
  scenarioComplete,
  REQUIRED_SHAPE,
} = require('../engine/tutorialScenarios.js');
const {
  _pendingDirectorAction,
  _beginPowerClinic,
  _finishClinic,
  advanceClinic,
} = require('../lib/tutorialDirector.js');

// Drive the (drill-0) Shield intercept drill to completion through the real
// pipeline: arm the shield, resolve the bluff (blocked), settle the phase.
function completeShieldDrill(room) {
  const cardId = room.powerCardSlot['human'][0].id;
  engine.armInterceptCard(room, 'human', cardId);
  bluffPipeline.resolveBluff(room, 'bot:1');
  room.phase = 'playing';
}
const roomHandler = require('../handlers/room.js');
const gameHandler = require('../handlers/game.js');
const { broadcastRoomState } = require('../lib/broadcast.js');
const {
  rooms, saveRoom,
  tutorialTimers, botTimers, idleTurnTimers, speedModeTimers,
  _clearTutorialTimer, _clearBotTimer, _clearIdleTurnTimer, _clearSpeedModeTimer,
} = require('../lib/state.js');

function clearAllTimers() {
  for (const c of [...tutorialTimers.keys()]) _clearTutorialTimer(c);
  for (const c of [...botTimers.keys()]) _clearBotTimer(c);
  for (const c of [...idleTurnTimers.keys()]) _clearIdleTurnTimer(c);
  for (const c of [...speedModeTimers.keys()]) _clearSpeedModeTimer(c);
}

beforeEach(() => rooms.clear());
afterEach(() => { clearAllTimers(); rooms.clear(); vi.clearAllMocks(); });

// A 2-seat tutorial room (non-host human + bot host), no deal yet.
function clinicRoom() {
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, null);
  room.code = 'CLN001';
  room.isTutorial = true;
  room.tutorialLesson = 'powers';
  room.hostUserId = 'bot:1';
  room.hostSocketId = null;
  const human = engine.createPlayer('human', 'You', 'host-sock');
  const bot = engine.createPlayer('bot:1', 'Dealer Bot', null);
  bot.isBot = true;
  room.players.push(human, bot);
  return room;
}

const holds = (room, id, power) =>
  (room.powerCardSlot?.[id] || []).some((c) => c?.power === power);

// ─── Basics: bot calls bluff ≥2 per game ──────────────────────────────────────
describe('bot bluff minimum (tutorial Basics)', () => {
  function eligibleRoom({ isTutorial = true, calls = 0, oppHand = 6 } = {}) {
    return {
      isTutorial,
      botBluffCallsThisGame: calls,
      isFirstTurn: false,
      bluffUsedThisTurn: false,
      bluffBlockedThisTurn: false,
      challengeableCard: { type: 'shape', shape: 'triangle', number: 3 },
      players: [
        { id: 'human', isBot: false, status: 'alive' },
        { id: 'bot:1', isBot: true, status: 'alive' },
      ],
      turnOrder: ['human', 'bot:1'],
      currentTurnIndex: 1,
      prevTurnPlayerId: 'human',
      hands: new Map([
        ['human', new Array(oppHand).fill({ type: 'shape', shape: 'x', number: 1 })],
        ['bot:1', []],
      ]),
    };
  }

  it('FORCES the call when below the minimum and the round is winding down', () => {
    const room = eligibleRoom({ calls: 0, oppHand: 2 });
    // rng that would normally never call — the force ignores it.
    expect(shouldCallBluff(room, 'bot:1', () => 0.999)).toBe(true);
  });

  it('challenges eagerly (high rate) below the minimum with a full opponent hand', () => {
    const room = eligibleRoom({ calls: 0, oppHand: 6 });
    expect(shouldCallBluff(room, 'bot:1', () => 0.9)).toBe(false); // > 0.85
    expect(shouldCallBluff(room, 'bot:1', () => 0.5)).toBe(true);  // < 0.85
  });

  it('reverts to the normal rate once the minimum is met', () => {
    const room = eligibleRoom({ calls: 2, oppHand: 2 });
    expect(shouldCallBluff(room, 'bot:1', () => 0.5)).toBe(false); // > 0.34
    expect(shouldCallBluff(room, 'bot:1', () => 0.1)).toBe(true);  // < 0.34
  });

  it('does NOT boost outside tutorial rooms', () => {
    const room = eligibleRoom({ isTutorial: false, calls: 0, oppHand: 2 });
    expect(shouldCallBluff(room, 'bot:1', () => 0.5)).toBe(false); // plain 0.34
  });
});

// ─── stageScenario ────────────────────────────────────────────────────────────
describe('stageScenario', () => {
  it('stages all six powers + the bot demo, each with the right holder + phase', () => {
    const expected = [
      ['shield', 'player', 'bluff_intercept_pending'],
      ['shield', 'bot', 'playing'],
      ['peek', 'player', 'playing'],
      ['freeze', 'player', 'playing'],
      ['mirror', 'player', 'bluff_intercept_pending'],
      ['swap', 'player', 'bluff_intercept_pending'],
      ['assassin', 'player', 'playing'],
    ];
    expect(POWER_CLINIC).toHaveLength(expected.length);

    expected.forEach(([power, actor, phase], i) => {
      const room = clinicRoom();
      const sc = stageScenario(room, i);
      expect(sc.power).toBe(power);
      expect(sc.actor).toBe(actor);
      expect(sc.step).toBe('intro');
      expect(sc.total).toBe(POWER_CLINIC.length);
      expect(room.phase).toBe(phase);
      expect(room.turnOrder).toEqual(['human', 'bot:1']);
      // The holder (human for player drills, bot for the demo) has the power.
      const holderId = actor === 'bot' ? 'bot:1' : 'human';
      expect(holds(room, holderId, power)).toBe(true);
      // The bot always has an empty chamber so a reflected spin can't kill it.
      const bot = room.players.find((p) => p.isBot);
      expect(bot.chamber.filter((s) => s === 'bullet')).toHaveLength(0);
      // Freshly staged → not yet complete.
      expect(scenarioComplete(room, i)).toBe(false);
    });
  });

  it('returns null for an out-of-range index', () => {
    const room = clinicRoom();
    expect(stageScenario(room, 99)).toBeNull();
  });

  it('locks Call Bluff on own-turn drills but not the intercept/bot drills', () => {
    // Order: shield, bot-shield, peek, freeze, mirror, swap, assassin.
    const lock = POWER_CLINIC.map((_, i) => stageScenario(clinicRoom(), i).lockBluff);
    expect(lock).toEqual([false, false, true, true, false, false, true]);
  });

  it('numbers player drills 1..6 and leaves the bot demo un-numbered', () => {
    const steps = POWER_CLINIC.map((_, i) => {
      const sc = stageScenario(clinicRoom(), i);
      return [sc.actor, sc.playerStep, sc.playerTotal];
    });
    expect(steps).toEqual([
      ['player', 1, 6], // shield
      ['bot', null, 6], // bot demo
      ['player', 2, 6], // peek
      ['player', 3, 6], // freeze
      ['player', 4, 6], // mirror
      ['player', 5, 6], // swap
      ['player', 6, 6], // assassin
    ]);
  });
});

// ─── scenarioComplete via the real resolution pipeline ────────────────────────
describe('scenarioComplete (driven through real resolution)', () => {
  const idxOf = (power, actor = 'player') =>
    POWER_CLINIC.findIndex((s) => s.power === power && (s.actor || 'player') === actor);

  it('PEEK completes when the card is consumed', () => {
    const room = clinicRoom();
    const i = idxOf('peek');
    stageScenario(room, i);
    expect(scenarioComplete(room, i)).toBe(false);
    const res = engine.activatePowerCard(room, 'human'); // peek is FIFO slot[0]
    expect(res.ok).toBe(true);
    expect(res.power).toBe('peek');
    expect(scenarioComplete(room, i)).toBe(true);
  });

  it('SHIELD blocks the bluff and completes', () => {
    const room = clinicRoom();
    const i = idxOf('shield', 'player');
    stageScenario(room, i);
    const cardId = room.powerCardSlot['human'][0].id;
    expect(engine.armInterceptCard(room, 'human', cardId).ok).toBe(true);
    const { outcome } = bluffPipeline.resolveBluff(room, 'bot:1');
    expect(outcome.kind).toBe('blocked');
    room.phase = 'playing'; // caller settles the phase
    expect(holds(room, 'human', 'shield')).toBe(false);
    expect(scenarioComplete(room, i)).toBe(true);
  });

  it('MIRROR reflects the spin onto the bot and completes', () => {
    const room = clinicRoom();
    const i = idxOf('mirror');
    stageScenario(room, i);
    const cardId = room.powerCardSlot['human'][0].id;
    expect(engine.armInterceptCard(room, 'human', cardId).ok).toBe(true);
    const { outcome } = bluffPipeline.resolveBluff(room, 'bot:1');
    expect(outcome.kind).toBe('spin');
    expect(outcome.spinTargetId).toBe('bot:1'); // bounced onto the accuser
    room.phase = 'playing';
    expect(scenarioComplete(room, i)).toBe(true);
  });

  it('SWAP re-faces the played card so the bluff fails, then completes', () => {
    const room = clinicRoom();
    const i = idxOf('swap');
    stageScenario(room, i);
    const cardId = room.powerCardSlot['human'][0].id;
    expect(engine.armInterceptCard(room, 'human', cardId).ok).toBe(true);
    const { outcome } = bluffPipeline.resolveBluff(room, 'bot:1');
    expect(outcome.kind).toBe('swap_pending');
    // Pick the matching card seeded in the played pile.
    const matching = room.playedPile.find((c) => c.shape === REQUIRED_SHAPE);
    const after = bluffPipeline.resumeAfterSwap(room, 'bot:1', matching.id);
    expect(after.outcome.kind).toBe('spin');
    expect(after.outcome.spinTargetId).toBe('bot:1');
    room.phase = 'playing';
    expect(scenarioComplete(room, i)).toBe(true);
  });

  it('ASSASSIN eliminates a recklessly-challenging bot and completes', () => {
    const room = clinicRoom();
    const i = idxOf('assassin');
    stageScenario(room, i);
    // Human arms Assassin, plays an honest (matching) card, ends the turn.
    expect(engine.activatePowerCard(room, 'human').power).toBe('assassin');
    const honest = room.hands.get('human').find((c) => c.shape === REQUIRED_SHAPE);
    expect(engine.validateAndPlayCard(room, 'human', honest.id).ok).toBe(true);
    engine.advanceTurn(room); // bot is now on turn; human is the accused
    // Bot recklessly challenges the honest play → Assassin strikes the accuser.
    const { outcome } = bluffPipeline.resolveBluff(room, 'bot:1');
    expect(outcome.kind).toBe('eliminated');
    expect(outcome.eliminatedPlayerId).toBe('bot:1');
    engine.applyBluffOutcome
      ? engine.applyBluffOutcome(room, outcome)
      : (room.players.find((p) => p.id === 'bot:1').status = 'eliminated');
    expect(scenarioComplete(room, i)).toBe(true);
  });

  it('BOT-SHIELD demo completes when the bot spends its Shield', () => {
    const room = clinicRoom();
    const i = idxOf('shield', 'bot');
    stageScenario(room, i);
    expect(holds(room, 'bot:1', 'shield')).toBe(true);
    // Human challenges; the bot arms its Shield (the demo's scripted move).
    const cardId = room.powerCardSlot['bot:1'][0].id;
    expect(engine.armInterceptCard(room, 'bot:1', cardId).ok).toBe(true);
    const { outcome } = bluffPipeline.resolveBluff(room, 'human');
    expect(outcome.kind).toBe('blocked');
    room.phase = 'playing';
    expect(scenarioComplete(room, i)).toBe(true);
  });
});

// ─── Director progression ─────────────────────────────────────────────────────
describe('tutorialDirector', () => {
  it('hands a finished Basics game off to the clinic', () => {
    const room = clinicRoom();
    room.tutorialLesson = 'basics';
    room.phase = 'game_over';
    expect(_pendingDirectorAction(room)).toEqual({ kind: 'start_clinic' });
  });

  it('_beginPowerClinic stages drill 0 (Shield) with all powers enabled', () => {
    const room = clinicRoom();
    room.tutorialLesson = 'basics';
    _beginPowerClinic(room);
    expect(room.tutorialLesson).toBe('powers');
    expect(room.tutorialScenario.index).toBe(0);
    expect(room.tutorialScenario.power).toBe('shield');
    expect(room.phase).toBe('bluff_intercept_pending');
    expect(Object.values(room.config.powerCards.enabled).every(Boolean)).toBe(true);
    expect(room.botBluffCallsThisGame).toBe(0);
  });

  it('resolves a completed drill, then advances only when the player asks', () => {
    const room = clinicRoom();
    _beginPowerClinic(room); // drill 0 (shield), step intro
    expect(_pendingDirectorAction(room)).toBeNull(); // not complete yet
    completeShieldDrill(room);
    expect(_pendingDirectorAction(room)).toEqual({ kind: 'resolve', index: 0 });
    room.tutorialScenario.step = 'resolved';
    // Advancing past a resolved drill is NO LONGER timed — the director waits.
    expect(_pendingDirectorAction(room)).toBeNull();
    expect(advanceClinic(room)).toBe(true);
    expect(room.tutorialScenario.index).toBe(1);
    expect(room.tutorialScenario.id).toBe('bot-shield');
  });

  it('advanceClinic only fires on a resolved drill', () => {
    const room = clinicRoom();
    _beginPowerClinic(room); // step intro
    expect(advanceClinic(room)).toBe(false); // intro, not resolved
  });

  it('finishes when the player advances past the last drill', () => {
    const room = clinicRoom();
    const last = POWER_CLINIC.length - 1;
    room.tutorialScenario = stageScenario(room, last);
    room.tutorialScenario.step = 'resolved';
    expect(_pendingDirectorAction(room)).toBeNull(); // not auto-timed
    expect(advanceClinic(room)).toBe(true);
    expect(room.phase).toBe('game_over');
    expect(room.tutorialClinicComplete).toBe(true);
    expect(room.lastAction.winnerId).toBe('human');
    expect(room.tutorialScenario).toBeNull();
  });

  it('is a no-op for non-tutorial rooms', () => {
    const room = clinicRoom();
    room.isTutorial = false;
    room.phase = 'game_over';
    expect(_pendingDirectorAction(room)).toBeNull();
  });
});

// ─── Director async loop (real beats through broadcastRoomState) ──────────────
describe('tutorialDirector — live beats', () => {
  function makeIo() {
    return { to: () => ({ emit: () => {} }), in: () => ({ fetchSockets: async () => [] }) };
  }

  it('drives a finished Basics game into clinic drill 0 on its own timer', async () => {
    vi.useFakeTimers();
    try {
      const room = clinicRoom();
      room.tutorialLesson = 'basics';
      room.phase = 'game_over';
      room.tutorialScenario = null;
      await saveRoom(room);

      const io = makeIo();
      await broadcastRoomState(io, room.code); // arms the start_clinic beat
      expect(tutorialTimers.has(room.code)).toBe(true);

      await vi.advanceTimersByTimeAsync(2700); // fire it → _beginPowerClinic + re-broadcast

      expect(room.tutorialLesson).toBe('powers');
      expect(room.tutorialScenario.index).toBe(0);
      expect(room.tutorialScenario.power).toBe('shield');
      expect(room.phase).toBe('bluff_intercept_pending');
    } finally {
      clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('times the resolve beat but holds at resolved until the player advances', async () => {
    vi.useFakeTimers();
    try {
      const room = clinicRoom();
      _beginPowerClinic(room);     // drill 0 (shield), intro
      completeShieldDrill(room);   // arm + resolve → complete
      await saveRoom(room);

      const io = makeIo();
      await broadcastRoomState(io, room.code);  // arms 'resolve'
      await vi.advanceTimersByTimeAsync(800);   // resolve → step 'resolved'
      expect(room.tutorialScenario.step).toBe('resolved');

      // NOT auto-advanced: more time + another broadcast leaves it resolved.
      await broadcastRoomState(io, room.code);
      await vi.advanceTimersByTimeAsync(4000);
      expect(room.tutorialScenario.index).toBe(0);
      expect(room.tutorialScenario.step).toBe('resolved');

      // The player's "I Understand" advances it.
      expect(advanceClinic(room)).toBe(true);
      expect(room.tutorialScenario.index).toBe(1);
    } finally {
      clearAllTimers();
      vi.useRealTimers();
    }
  });
});

// ─── start_game tutorial bypass ───────────────────────────────────────────────
describe('start_game tutorial bypass', () => {
  const deps = {
    groupsRepo: { getActiveGroupByCode: async () => null },
    groupSettingsRepo: { upsertGroupSettings: vi.fn() },
    leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
  };
  function makeIo() {
    return { to: () => ({ emit: () => {} }), in: () => ({ fetchSockets: async () => [] }) };
  }
  function capture(handlerMod, io, socket) {
    const handlers = {};
    socket.on = (evt, cb) => { handlers[evt] = cb; };
    handlerMod.register(io, socket, deps);
    return handlers;
  }

  it('lets the seated (non-host) human start their practice game', async () => {
    const io = makeIo();
    const socket = { id: 'host-sock', userId: 'human', username: 'You', data: {}, join: () => {}, leave: () => {} };
    const roomHandlers = capture(roomHandler, io, socket);
    await roomHandlers['create_tutorial_room']({}, () => {});
    const room = [...rooms.values()][0];
    expect(room.hostSocketId).toBeNull(); // bot hosts; human is NOT the host

    const gameHandlers = capture(gameHandler, io, socket);
    const cb = vi.fn();
    await gameHandlers['start_game']({ roomCode: room.code }, cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(room.phase).toBe('playing'); // tutorial skips pre_game
  });

  it('still rejects a non-host starter in a NORMAL room', async () => {
    const io = makeIo();
    const hostSock = { id: 'host-sock', userId: 'host', username: 'Host', data: {}, join: () => {}, leave: () => {} };
    const roomHandlers = capture(roomHandler, io, hostSock);
    const cb = vi.fn();
    await roomHandlers['create_room']({ mode: engine.MODES.ONLINE }, cb);
    const code = cb.mock.calls[0][0].roomCode;
    const room = rooms.get(code);
    room.players.push(engine.createPlayer('intruder', 'Nope', 'other-sock'));

    const intruder = { id: 'other-sock', userId: 'intruder', username: 'Nope', data: {}, on: () => {} };
    const gameHandlers = capture(gameHandler, io, intruder);
    const reject = vi.fn();
    await gameHandlers['start_game']({ roomCode: code }, reject);
    expect(reject).toHaveBeenCalledWith({ success: false, error: 'Not the host' });
  });
});
