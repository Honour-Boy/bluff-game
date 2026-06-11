// ============================================================
// Tutorial / Practice — server-driven bot opponent.
//
// A seated bot (isBot) has no socket, so the bot turn driver (lib/bots.js) runs
// its moves server-side via the engine + shared spin pipeline and broadcasts —
// the same pattern the idle-turn safety net uses. These tests lock:
//   • the bot strategy (honest vs. bluff card choice, Whot fallback),
//   • _pendingBotAction (when a bot owes a play / end / spin, and when it doesn't),
//   • the play → end-turn beat cycle driven through broadcastRoomState,
//   • the bot taking a spin when it's the bluff-called target,
//   • create_tutorial_room seeding a 2-player room (human + bot), all-off config.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const engine = require('../gameEngine.js');
const {
  chooseCardPlay,
  shouldCallBluff,
  chooseBotPowerActivation,
  shouldBotInterceptBluff,
  chooseInterceptCard,
  chooseSwapPick,
  rollBotCallRate,
  BOT_CALL_RATE_MIN,
  BOT_CALL_RATE_MAX,
} = require('../engine/botStrategy.js');
const {
  armBotTurn,
  _pendingBotAction,
  _onBotActExpire,
  _roomHasBots,
} = require('../lib/bots.js');
const { broadcastRoomState } = require('../lib/broadcast.js');
const { _idleTurnActive } = require('../lib/idleTurn.js');
const roomHandler = require('../handlers/room.js');
const gameHandler = require('../handlers/game.js');
const {
  rooms,
  saveRoom,
  botTimers,
  idleTurnTimers,
  speedModeTimers,
  spinPendingTimers,
  pregameTimers,
  _clearBotTimer,
  _clearIdleTurnTimer,
  _clearSpinPendingTimer,
  _clearPreGameTimer,
} = require('../lib/state.js');

// ─── Mock io: ordered emit log + empty socket set (online broadcast path) ──────
function makeIo() {
  const log = [];
  return {
    log,
    to: () => ({ emit: (event, payload) => log.push({ event, payload }) }),
    in: () => ({ fetchSockets: async () => [] }),
  };
}

// A started 2-player tutorial room: human first, bot second, phase 'playing'.
function makeTutorialRoom() {
  const room = engine.createRoom('host-sock', engine.MODES.ONLINE, null);
  room.code = 'TUT001';
  room.hostUserId = 'human';
  room.isTutorial = true;
  const human = engine.createPlayer('human', 'You', 'host-sock');
  const bot = engine.createPlayer('bot:1', 'Dealer Bot', null);
  bot.isBot = true;
  room.players.push(human, bot);
  engine.startGame(room); // deals 6 shape cards each, phase → 'playing'
  // Deterministic turn order regardless of startGame's shuffle.
  room.turnOrder = ['human', 'bot:1'];
  room.currentTurnIndex = 0;
  return room;
}

const handLen = (room, id) => (room.hands.get(id) || []).length;

beforeEach(() => {
  rooms.clear();
});

afterEach(() => {
  for (const code of [...botTimers.keys()]) _clearBotTimer(code);
  for (const code of [...idleTurnTimers.keys()]) _clearIdleTurnTimer(code);
  for (const code of [...spinPendingTimers.keys()]) _clearSpinPendingTimer(code);
  for (const code of [...pregameTimers.keys()]) _clearPreGameTimer(code);
  for (const code of [...speedModeTimers.keys()]) {
    clearTimeout(speedModeTimers.get(code));
    speedModeTimers.delete(code);
  }
  rooms.clear();
  vi.clearAllMocks();
});

// ─── Strategy ──────────────────────────────────────────────────────────────
describe('botStrategy.chooseCardPlay', () => {
  function roomWithBotHand(hand, currentCardType = 'circle') {
    return { hands: new Map([['bot:1', hand]]), currentCardType };
  }

  it('plays an honest (matching) card when not bluffing', () => {
    const hand = [
      { id: 'c1', type: 'shape', shape: 'circle', number: 3 },
      { id: 'c2', type: 'shape', shape: 'square', number: 5 },
    ];
    // rng → 0.99 keeps us above BOT_BLUFF_RATE, so honest play is chosen.
    const choice = chooseCardPlay(roomWithBotHand(hand, 'circle'), 'bot:1', () => 0.99);
    expect(choice.cardId).toBe('c1');
    expect(choice.nominatedShape).toBeNull();
  });

  it('plays a non-matching card (a bluff) when rng is below the bluff rate', () => {
    const hand = [
      { id: 'c1', type: 'shape', shape: 'circle', number: 3 },
      { id: 'c2', type: 'shape', shape: 'square', number: 5 },
    ];
    const choice = chooseCardPlay(roomWithBotHand(hand, 'circle'), 'bot:1', () => 0.0);
    expect(choice.cardId).toBe('c2'); // the lie (square ≠ circle)
  });

  it('always bluffs when no honest play exists', () => {
    const hand = [{ id: 'c2', type: 'shape', shape: 'square', number: 5 }];
    const choice = chooseCardPlay(roomWithBotHand(hand, 'circle'), 'bot:1', () => 0.99);
    expect(choice.cardId).toBe('c2');
  });

  it('falls back to a Whot wild (nominating the required shape) when no plain card', () => {
    const hand = [{ id: 'w', type: 'shape', shape: 'whot', number: 20 }];
    const choice = chooseCardPlay(roomWithBotHand(hand, 'triangle'), 'bot:1', () => 0.5);
    expect(choice.cardId).toBe('w');
    expect(choice.nominatedShape).toBe('triangle');
  });

  it('returns null when the bot has nothing playable', () => {
    const hand = [{ id: 'pw', type: 'power', power: 'shield' }];
    expect(chooseCardPlay(roomWithBotHand(hand), 'bot:1', () => 0.5)).toBeNull();
  });
});

describe('botStrategy.shouldCallBluff', () => {
  function room(extra = {}) {
    return {
      isFirstTurn: false,
      bluffUsedThisTurn: false,
      bluffBlockedThisTurn: false,
      challengeableCard: { id: 'c', type: 'shape', shape: 'circle' },
      prevTurnPlayerId: 'human',
      turnOrder: ['human', 'bot:1'],
      currentTurnIndex: 1,
      players: [
        { id: 'human', status: 'alive' },
        { id: 'bot:1', status: 'alive' },
      ],
      ...extra,
    };
  }

  it('is eligible only as a probability gamble when there is a card to challenge', () => {
    expect(shouldCallBluff(room(), 'bot:1', () => 0.0)).toBe(true);
    expect(shouldCallBluff(room(), 'bot:1', () => 0.99)).toBe(false);
  });

  it('never challenges on the first turn / after a bluff / when frozen / with no card', () => {
    expect(shouldCallBluff(room({ isFirstTurn: true }), 'bot:1', () => 0)).toBe(false);
    expect(shouldCallBluff(room({ bluffUsedThisTurn: true }), 'bot:1', () => 0)).toBe(false);
    expect(shouldCallBluff(room({ bluffBlockedThisTurn: true }), 'bot:1', () => 0)).toBe(false);
    expect(shouldCallBluff(room({ challengeableCard: null }), 'bot:1', () => 0)).toBe(false);
  });

  it('never challenges itself or a non-alive accused', () => {
    expect(shouldCallBluff(room({ prevTurnPlayerId: 'bot:1' }), 'bot:1', () => 0)).toBe(false);
    expect(shouldCallBluff(
      room({ players: [{ id: 'human', status: 'eliminated' }, { id: 'bot:1', status: 'alive' }] }),
      'bot:1',
      () => 0,
    )).toBe(false);
  });
});

// ─── Pending-action detection ────────────────────────────────────────────────
describe('_pendingBotAction', () => {
  it('returns null for a room with no bots', () => {
    const room = makeTutorialRoom();
    room.players = room.players.filter((p) => !p.isBot);
    room.turnOrder = ['human'];
    expect(_roomHasBots(room)).toBe(false);
    expect(_pendingBotAction(room)).toBeNull();
  });

  it('is null on the human turn, play on the bot turn before a card, end after', () => {
    const room = makeTutorialRoom();
    room.currentTurnIndex = 0; // human
    expect(_pendingBotAction(room)).toBeNull();

    room.currentTurnIndex = 1; // bot
    expect(_pendingBotAction(room)).toEqual({ kind: 'play', botId: 'bot:1' });

    room.cardPlayedThisTurn = true;
    expect(_pendingBotAction(room)).toEqual({ kind: 'end', botId: 'bot:1' });
  });

  it('returns a spin action only when the bot is the spin target', () => {
    const room = makeTutorialRoom();
    room.phase = 'spin_pending';

    room.spinTargetId = 'bot:1';
    expect(_pendingBotAction(room)).toEqual({ kind: 'spin', botId: 'bot:1' });

    room.spinTargetId = 'human';
    expect(_pendingBotAction(room)).toBeNull();
  });

  it('waits (null) while a betting window is still open on the bot', () => {
    const room = makeTutorialRoom();
    room.phase = 'spin_pending';
    room.spinTargetId = 'bot:1';
    room.betting = { closed: false };
    expect(_pendingBotAction(room)).toBeNull();
    room.betting = { closed: true };
    expect(_pendingBotAction(room)).toEqual({ kind: 'spin', botId: 'bot:1' });
  });

  it('is null in non-play phases (lobby / pre_game / game_over)', () => {
    const room = makeTutorialRoom();
    room.currentTurnIndex = 1; // bot would be current
    for (const phase of ['lobby', 'pre_game', 'game_over', 'round_end']) {
      room.phase = phase;
      expect(_pendingBotAction(room)).toBeNull();
    }
  });

  it('auto-passes a bluff intercept only when the accused is a bot', () => {
    const room = makeTutorialRoom();
    room.phase = 'bluff_intercept_pending';
    room.pendingBluffIntercept = { accuserId: 'human', accusedId: 'bot:1' };
    expect(_pendingBotAction(room)).toEqual({ kind: 'intercept_pass', botId: 'bot:1' });

    // The human decides their own defence — no bot action.
    room.pendingBluffIntercept = { accuserId: 'bot:1', accusedId: 'human' };
    expect(_pendingBotAction(room)).toBeNull();
  });
});

// ─── Beat execution (driven through the real broadcast path) ──────────────────
describe('bot turn driver — beats', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('arms no timer (and does not act) on a non-bot room', async () => {
    const room = makeTutorialRoom();
    room.players = room.players.filter((p) => !p.isBot);
    room.turnOrder = ['human'];
    await saveRoom(room);
    armBotTurn(makeIo(), room);
    expect(botTimers.has(room.code)).toBe(false);
  });

  it('plays a card then ends the bot turn across two beats', async () => {
    const room = makeTutorialRoom();
    room.currentTurnIndex = 1; // bot's turn
    await saveRoom(room);
    const io = makeIo();

    const botHandBefore = handLen(room, 'bot:1');
    const pileBefore = room.playedPile.length;

    // Pin Math.random so the randomized think delay is deterministic (0.5 →
    // 8000ms) and we can observe the play beat BEFORE the end beat.
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      // Broadcast arms beat 1 (play).
      await broadcastRoomState(io, room.code);
      expect(botTimers.has(room.code)).toBe(true);

      // Beat 1 — bot plays a card (after its ~8s "thinking" pause).
      await vi.advanceTimersByTimeAsync(8000);
      expect(handLen(room, 'bot:1')).toBe(botHandBefore - 1);
      expect(room.playedPile.length).toBe(pileBefore + 1);
      expect(room.cardPlayedThisTurn).toBe(true);
      expect(room.lastAction.type).toBe('card_played_online');
      expect(room.lastAction.playerId).toBe('bot:1');
      expect(room.currentTurnIndex).toBe(1); // still the bot's turn

      // Beat 2 — bot ends its turn → control passes back to the human.
      await vi.advanceTimersByTimeAsync(1200);
      expect(room.currentTurnIndex).toBe(0);
      expect(room.phase).toBe('playing');
      expect(room.cardPlayedThisTurn).toBe(false);

      // On the human's turn the driver stops arming.
      expect(_pendingBotAction(room)).toBeNull();
      expect(botTimers.has(room.code)).toBe(false);
    } finally {
      rng.mockRestore();
    }
  });

  it('takes a spin when the bot is the bluff-called target', async () => {
    const room = makeTutorialRoom();
    // Stage a spin aimed at the bot. Empty its chamber so it deterministically
    // survives (no game-over branch) and we can assert a clean spin_result.
    const bot = room.players.find((p) => p.id === 'bot:1');
    bot.chamber = [null, null, null, null, null, null];
    bot.riskLevel = 0;
    room.phase = 'spin_pending';
    room.spinTargetId = 'bot:1';
    room.currentTurnIndex = 0; // human is the accuser, still on turn
    await saveRoom(room);
    const io = makeIo();

    await broadcastRoomState(io, room.code);
    expect(botTimers.has(room.code)).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);

    expect(room.lastAction.type).toBe('spin_result');
    expect(room.lastAction.spinTargetId).toBe('bot:1');
    expect(room.lastAction.eliminated).toBe(false);
    expect(room.spinTargetId).toBeNull();
    expect(room.phase).toBe('playing');
  });

  it('drives a full game to game_over without the human touching the bot turns', async () => {
    const room = makeTutorialRoom();
    // Shrink the bot to a single card so it empties its hand and wins quickly,
    // proving the bot can carry a game start-to-finish on its own.
    const bot = room.players.find((p) => p.id === 'bot:1');
    room.hands.set('bot:1', [{ id: 'last', type: 'shape', shape: room.currentCardType, number: 7 }]);
    room.currentTurnIndex = 1; // bot's turn
    await saveRoom(room);
    const io = makeIo();

    // Pin Math.random so the think delay is deterministic (0.5 → 8000ms).
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      await broadcastRoomState(io, room.code);
      // Beat 1 (play last card, after the ~8s think pause) + Beat 2 (end → win).
      await vi.advanceTimersByTimeAsync(8000);
      await vi.advanceTimersByTimeAsync(1200);

      expect(room.phase).toBe('game_over');
      expect(room.lastAction.type).toBe('game_over');
      expect(room.lastAction.winnerId).toBe('bot:1');
      expect(bot.isBot).toBe(true);
    } finally {
      rng.mockRestore();
    }
  });

  it('opens its turn by challenging the human when the bluff roll fires', async () => {
    const room = makeTutorialRoom();
    // Human leads: play a card, then advance so it's the bot's turn with a
    // challengeable card on the table and isFirstTurn cleared.
    const humanHand = room.hands.get('human');
    engine.validateAndPlayCard(room, 'human', humanHand[0].id);
    engine.advanceTurn(room);
    expect(room.currentTurnIndex).toBe(1);        // bot's turn
    expect(room.challengeableCard).toBeTruthy();
    expect(room.isFirstTurn).toBe(false);
    await saveRoom(room);
    const io = makeIo();

    // Force the bluff roll to fire (and pin spin RNG) deterministically.
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await broadcastRoomState(io, room.code); // arms the bot's pre-card beat
      // rng 0 → think delay = 4000ms; advance just past it (stop before the 1.5s
      // spin beat so we observe the spin_pending the challenge produced).
      await vi.advanceTimersByTimeAsync(4100); // bot challenges the human

      // The bot called bluff → it resolved into a pending spin on someone.
      expect(room.bluffUsedThisTurn).toBe(true);
      expect(room.phase).toBe('spin_pending');
      expect(room.lastAction.type).toBe('spin_pending');
      expect(room.lastAction.accuserId).toBe('bot:1');
      expect(room.lastAction.accusedId).toBe('human');
    } finally {
      rng.mockRestore();
    }
  });

  it('opens the §1.1 defence window for the human when the bot challenges them', async () => {
    const room = makeTutorialRoom();
    // Human leads with a card, then it's the bot's turn with a challengeable
    // card — and the human still holds an UN-ARMED Shield, so a challenge must
    // pause for their defence pop-up exactly like a human accuser's would.
    const humanHand = room.hands.get('human');
    engine.validateAndPlayCard(room, 'human', humanHand[0].id);
    engine.advanceTurn(room);
    room.powerCardSlot = { human: [{ id: 'sh', type: 'power', power: 'shield' }], 'bot:1': [] };
    await saveRoom(room);
    const io = makeIo();

    const rng = vi.spyOn(Math, 'random').mockReturnValue(0); // bluff roll fires
    try {
      await broadcastRoomState(io, room.code);
      await vi.advanceTimersByTimeAsync(4100); // think delay (rng 0 → 4000ms)

      // The challenge did NOT resolve — the human got the interception window.
      expect(room.bluffUsedThisTurn).toBe(true);
      expect(room.phase).toBe('bluff_intercept_pending');
      expect(room.pendingBluffIntercept).toMatchObject({
        accuserId: 'bot:1',
        accusedId: 'human',
        options: [{ cardId: 'sh', power: 'shield' }],
      });
      expect(room.lastAction.type).toBe('bluff_intercept_window');
      // The bot waits — no beat is pending while the human decides.
      expect(_pendingBotAction(room)).toBeNull();

      // Human ignores it → the shared timeout closes the window and resolves.
      await vi.advanceTimersByTimeAsync(engine.BLUFF_INTERCEPT_WINDOW_MS + 100);
      expect(room.pendingBluffIntercept).toBeNull();
      expect(room.phase).toBe('spin_pending');
      expect(room.lastAction.type).toBe('spin_pending');
      expect(room.lastAction.accuserId).toBe('bot:1');
      expect(room.lastAction.accusedId).toBe('human');
    } finally {
      rng.mockRestore();
    }
  });

  it('full Mirror loop: bot challenges → human arms Mirror via the real handler → bot takes the reflected spin', async () => {
    const room = makeTutorialRoom();
    // Stage: human (previous player) LIED — square on a circle table — and
    // still holds an un-armed Mirror. It's the bot's turn.
    room.turnOrder = ['human', 'bot:1'];
    room.currentTurnIndex = 1;
    room.isFirstTurn = false;
    room.prevTurnPlayerId = 'human';
    const card = { id: 'c1', type: 'shape', shape: 'square', number: 3 };
    room.lastPlayedCard = card;
    room.challengeableCard = card;
    room.challengeableCardType = 'circle';
    room.playedPile = [card];
    room.powerCardSlot = { human: [{ id: 'mr', type: 'power', power: 'mirror' }], 'bot:1': [] };
    // Empty the bot's chamber so the reflected spin deterministically survives.
    const bot = room.players.find((p) => p.id === 'bot:1');
    bot.chamber = [null, null, null, null, null, null];
    bot.riskLevel = 0;
    await saveRoom(room);
    const io = makeIo();

    const rng = vi.spyOn(Math, 'random').mockReturnValue(0); // bluff roll fires
    try {
      await broadcastRoomState(io, room.code);
      await vi.advanceTimersByTimeAsync(4100); // bot challenges → window opens
      expect(room.phase).toBe('bluff_intercept_pending');
      expect(room.pendingBluffIntercept.options).toEqual([{ cardId: 'mr', power: 'mirror' }]);

      // The human defends through the REAL bluff_intercept socket handler.
      const bluffHandler = require('../handlers/bluff.js');
      const handlers = {};
      bluffHandler.register(io, { id: 'host-sock', userId: 'human', on: (e, cb) => { handlers[e] = cb; } }, {
        leaderboardRepo: { recordWinner: async () => ({}), recordGameStart: async () => ({}) },
      });
      const cb = vi.fn();
      await handlers['bluff_intercept']({ roomCode: room.code, cardId: 'mr' }, cb);
      expect(cb.mock.calls[0][0]).toMatchObject({ success: true, armed: 'mirror' });

      // Mirror reflected the consequence onto the accuser — the BOT spins.
      expect(room.pendingBluffIntercept).toBeNull();
      expect(room.phase).toBe('spin_pending');
      expect(room.spinTargetId).toBe('bot:1');

      // …and the bot driver finishes the loop on its own (spin beat).
      await vi.advanceTimersByTimeAsync(1600);
      expect(room.lastAction.type).toBe('spin_result');
      expect(room.lastAction.spinTargetId).toBe('bot:1');
      expect(room.lastAction.eliminated).toBe(false);
      expect(room.phase).toBe('playing');
    } finally {
      rng.mockRestore();
    }
  });

  it('still resolves the bot challenge directly when the human has no defence', async () => {
    const room = makeTutorialRoom();
    const humanHand = room.hands.get('human');
    engine.validateAndPlayCard(room, 'human', humanHand[0].id);
    engine.advanceTurn(room);
    room.powerCardSlot = { human: [], 'bot:1': [] }; // nothing to intercept with
    await saveRoom(room);
    const io = makeIo();

    const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await broadcastRoomState(io, room.code);
      await vi.advanceTimersByTimeAsync(4100);

      expect(room.bluffUsedThisTurn).toBe(true);
      expect(room.phase).toBe('spin_pending'); // no window — straight to resolution
      expect(room.lastAction.accuserId).toBe('bot:1');
    } finally {
      rng.mockRestore();
    }
  });

  it('auto-passes a bluff-intercept window aimed at the bot (no 8s stall)', async () => {
    const room = makeTutorialRoom();
    // Stage a window: the bot was the previous player, holds an un-armed Shield,
    // and the human (now on turn) has called bluff on it.
    room.turnOrder = ['bot:1', 'human'];
    room.currentTurnIndex = 1;
    room.isFirstTurn = false;
    room.prevTurnPlayerId = 'bot:1';
    const card = { id: 'c1', type: 'shape', shape: 'square', number: 3 };
    room.lastPlayedCard = card;
    room.challengeableCard = card;
    room.challengeableCardType = 'circle'; // square ≠ circle → the bot "lied"
    room.playedPile = [card];
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'sh', type: 'power', power: 'shield' }] };
    room.bluffUsedThisTurn = true;
    room.phase = 'bluff_intercept_pending';
    room.pendingBluffIntercept = {
      accuserId: 'human', accuserName: 'You',
      accusedId: 'bot:1', accusedName: 'Dealer Bot',
      deadline: Date.now() + 8000,
      options: [{ cardId: 'sh', power: 'shield' }],
    };
    await saveRoom(room);
    const io = makeIo();

    expect(_pendingBotAction(room)).toEqual({ kind: 'intercept_pass', botId: 'bot:1' });

    await broadcastRoomState(io, room.code);
    await vi.advanceTimersByTimeAsync(900); // BOT_INTERCEPT_DELAY_MS = 700

    // Window closed and the bluff resolved (the bot didn't shield → it spins).
    expect(room.pendingBluffIntercept).toBeNull();
    expect(room.phase).toBe('spin_pending');
    expect(room.spinTargetId).toBe('bot:1');
  });

  it('does NOT challenge when the bluff roll misses — it just plays', async () => {
    const room = makeTutorialRoom();
    const humanHand = room.hands.get('human');
    engine.validateAndPlayCard(room, 'human', humanHand[0].id);
    engine.advanceTurn(room);
    await saveRoom(room);
    const io = makeIo();

    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99); // miss the bluff roll
    try {
      const botHandBefore = handLen(room, 'bot:1');
      await broadcastRoomState(io, room.code);
      await vi.advanceTimersByTimeAsync(12000);

      expect(room.bluffUsedThisTurn).toBe(false);
      expect(room.phase).toBe('playing');
      expect(handLen(room, 'bot:1')).toBe(botHandBefore - 1); // played a card instead
    } finally {
      rng.mockRestore();
    }
  });
});

// ─── create_tutorial_room handler ─────────────────────────────────────────────
describe('create_tutorial_room', () => {
  const deps = {
    groupsRepo: { getActiveGroupByCode: async () => null },
    groupSettingsRepo: {},
    leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
  };

  function captureHandlers(io, { userId = 'human', username = 'You' } = {}) {
    const handlers = {};
    const socket = {
      id: 'host-sock',
      userId,
      username,
      data: {},
      on: (evt, cb) => { handlers[evt] = cb; },
      join: () => {},
      leave: () => {},
    };
    roomHandler.register(io, socket, deps);
    return handlers;
  }

  it('seats a non-host human + a bot HOST in an all-off online tutorial room', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const cb = vi.fn();

    await handlers['create_tutorial_room']({}, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const res = cb.mock.calls[0][0];
    expect(res.success).toBe(true);
    expect(res.isTutorial).toBe(true);
    // A newbie should NOT hold the room controls — the bot "hosts" the table.
    expect(res.isHost).toBe(false);
    expect(res.mode).toBe(engine.MODES.ONLINE);
    expect(res.playerId).toBe('human');

    const room = rooms.get(res.roomCode);
    expect(room).toBeTruthy();
    expect(room.isTutorial).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(2);

    const human = room.players.find((p) => p.id === 'human');
    const bot = room.players.find((p) => p.isBot);
    expect(human).toBeTruthy();
    expect(human.isBot).toBeFalsy();
    expect(bot).toBeTruthy();
    expect(bot.username).toBe('Dealer Bot');
    expect(bot.socketId).toBeNull();

    // Bot is host-of-record (no socket); the human's amHost is therefore false.
    expect(room.hostUserId).toBe('bot:1');
    expect(room.hostSocketId).toBeNull();
    expect(room.botBluffCallsThisGame).toBe(0);
    expect(engine.serializeRoom(room, 'human').amHost).toBe(false);

    // All powers / modifiers / systems off.
    expect(Object.values(room.config.powerCards.enabled).every((v) => v === false)).toBe(true);
    expect(Object.values(room.config.riskModifiers).every((v) => v === false)).toBe(true);
    expect(Object.values(room.config.systems).every((v) => v === false)).toBe(true);
  });

  it('rejects an unauthenticated socket', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io, { userId: null });
    const cb = vi.fn();
    await handlers['create_tutorial_room']({}, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
  });

  it('serializes isTutorial + bot flags over the wire', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const cb = vi.fn();
    await handlers['create_tutorial_room']({}, cb);
    const room = rooms.get(cb.mock.calls[0][0].roomCode);

    const view = engine.serializeRoom(room, 'human');
    expect(view.isTutorial).toBe(true);
    expect(view.players.find((p) => p.id === 'bot:1').isBot).toBe(true);
    expect(view.players.find((p) => p.id === 'human').isBot).toBe(false);
  });
});

// ─── Phase 5 — tutorial pacing ────────────────────────────────────────────────
describe('tutorial pacing', () => {
  it('disables the idle-turn auto-play in a tutorial room (a learner is not rushed)', () => {
    const room = makeTutorialRoom();
    expect(room.isTutorial).toBe(true);
    expect(_idleTurnActive(room)).toBe(false);

    // The same room without the tutorial flag DOES arm the idle net (sanity).
    room.isTutorial = false;
    expect(_idleTurnActive(room)).toBe(true);
  });

  it('start_game skips the pre_game role-reveal for a tutorial room (lobby → playing)', async () => {
    const io = makeIo();
    const deps = {
      groupsRepo: { getActiveGroupByCode: async () => null },
      groupSettingsRepo: { upsertGroupSettings: vi.fn() },
      leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
    };
    const handlers = {};
    const socket = {
      id: 'host-sock',
      userId: 'human',
      username: 'You',
      data: {},
      on: (evt, cb) => { handlers[evt] = cb; },
      join: () => {},
      leave: () => {},
    };
    // Both handler modules share the one socket so create + start are captured.
    roomHandler.register(io, socket, deps);
    gameHandler.register(io, socket, deps);

    const createCb = vi.fn();
    await handlers['create_tutorial_room']({}, createCb);
    const code = createCb.mock.calls[0][0].roomCode;

    const startCb = vi.fn();
    await handlers['start_game']({ roomCode: code }, startCb);

    expect(startCb).toHaveBeenCalledTimes(1);
    expect(startCb.mock.calls[0][0].success).toBe(true);

    const room = rooms.get(code);
    expect(room.phase).toBe('playing');     // NOT 'pre_game'
    expect(pregameTimers.has(code)).toBe(false);
    // Hands were dealt and a target shape was set — the game is genuinely live.
    expect(room.hands.get('human').length).toBeGreaterThan(0);
    expect(room.currentCardType).toBeTruthy();

    _clearBotTimer(code); // the broadcast may have armed a bot beat — don't leak it
  });
});

// ─── Leaving a tutorial destroys the room (no bot-host migration) ─────────────
describe('tutorial teardown on leave', () => {
  it('pickReplacementHost never hands the seat to a bot', () => {
    const room = makeTutorialRoom();
    // The human leaving leaves only the bot — which must be skipped → null,
    // so the caller tears the room down instead of migrating.
    expect(engine.pickReplacementHost(room, 'human')).toBeNull();
  });

  it('leaving a tutorial room destroys it rather than migrating host to the bot', async () => {
    const io = makeIo();
    const deps = {
      groupsRepo: { getActiveGroupByCode: async () => null },
      groupSettingsRepo: { upsertGroupSettings: vi.fn() },
      leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
    };
    const handlers = {};
    const socket = {
      id: 'host-sock', userId: 'human', username: 'You', data: {},
      on: (evt, cb) => { handlers[evt] = cb; }, join: () => {}, leave: () => {},
    };
    roomHandler.register(io, socket, deps);
    gameHandler.register(io, socket, deps);

    const createCb = vi.fn();
    await handlers['create_tutorial_room']({}, createCb);
    const code = createCb.mock.calls[0][0].roomCode;
    await handlers['start_game']({ roomCode: code }, vi.fn());
    expect(rooms.has(code)).toBe(true);

    const leaveCb = vi.fn();
    await handlers['leave_room']({ roomCode: code, playerId: 'human' }, leaveCb);

    expect(leaveCb).toHaveBeenCalledWith({ success: true, roomClosed: true });
    expect(rooms.has(code)).toBe(false);                                  // destroyed
    expect(io.log.some((e) => e.event === 'host_migrated')).toBe(false);  // never migrated to the bot
  });
});

// ─── Phase 4 — power-cards lesson ─────────────────────────────────────────────
describe('power-cards lesson', () => {
  const deps = {
    groupsRepo: { getActiveGroupByCode: async () => null },
    groupSettingsRepo: { upsertGroupSettings: vi.fn() },
    leaderboardRepo: { recordWinner: vi.fn(), recordGameStart: vi.fn() },
  };
  function capture(io) {
    const handlers = {};
    const socket = {
      id: 'host-sock', userId: 'human', username: 'You', data: {},
      on: (e, cb) => { handlers[e] = cb; }, join: () => {}, leave: () => {},
    };
    roomHandler.register(io, socket, deps);
    gameHandler.register(io, socket, deps);
    return handlers;
  }

  it("defaults to the basics lesson (all powers off) when unspecified", async () => {
    const handlers = capture(makeIo());
    const cb = vi.fn();
    await handlers['create_tutorial_room']({}, cb);
    const room = rooms.get(cb.mock.calls[0][0].roomCode);
    expect(room.tutorialLesson).toBe('basics');
    expect(Object.values(room.config.powerCards.enabled).every((v) => v === false)).toBe(true);
  });

  it('seeds Peek + Shield and guarantees a power card per seat for the powers lesson', async () => {
    const handlers = capture(makeIo());
    const cb = vi.fn();
    await handlers['create_tutorial_room']({ lesson: 'powers' }, cb);
    const res = cb.mock.calls[0][0];
    expect(res.lesson).toBe('powers');

    const room = rooms.get(res.roomCode);
    expect(room.tutorialLesson).toBe('powers');
    expect(room.config.powerCards.enabled.peek).toBe(true);
    expect(room.config.powerCards.enabled.shield).toBe(true);
    expect(room.config.powerCards.enabled.assassin).toBe(false);
    expect(engine.serializeRoom(room, 'human').tutorialLesson).toBe('powers');

    await handlers['start_game']({ roomCode: res.roomCode }, vi.fn());
    expect((room.powerCardSlot.human || []).length).toBeGreaterThanOrEqual(1);
    expect((room.powerCardSlot['bot:1'] || []).length).toBeGreaterThanOrEqual(1);
    _clearBotTimer(res.roomCode);
  });
});

// ─── Free-play power-card strategy (sandbox, powers ON) ───────────────────────
describe('botStrategy — free-play power activation', () => {
  function playingRoom(slot, extra = {}) {
    return {
      phase: 'playing',
      turnOrder: ['human', 'bot:1'],
      currentTurnIndex: 1,
      powerActivatedThisTurn: false,
      currentCardType: 'circle',
      isFirstTurn: false,
      bluffUsedThisTurn: false,
      bluffBlockedThisTurn: false,
      challengeableCard: { id: 'ch', type: 'shape', shape: 'square', number: 4 },
      challengeableCardType: 'circle',
      prevTurnPlayerId: 'human',
      players: [
        { id: 'human', status: 'alive' },
        { id: 'bot:1', status: 'alive' },
      ],
      hands: new Map([
        ['human', [{ id: 'h1', type: 'shape', shape: 'circle', number: 2 }]],
        ['bot:1', [{ id: 'b1', type: 'shape', shape: 'circle', number: 5 }]],
      ]),
      powerCardSlot: { 'bot:1': slot, human: [] },
      ...extra,
    };
  }

  it('never returns a power the bot was not dealt', () => {
    // Slot holds ONLY a freeze — the strategy must never reach for shield/peek/etc.
    const room = playingRoom([{ id: 'f1', type: 'power', power: 'freeze' }]);
    const choice = chooseBotPowerActivation(room, 'bot:1', () => 0); // 0 → would arm freeze if ahead
    // bot hand (1) <= human hand (1) → ahead; rng 0 < freeze rate → arms the held freeze
    expect(choice).toEqual({ cardId: 'f1', power: 'freeze' });
    expect(['f1']).toContain(choice.cardId); // only the assigned card id
  });

  it('returns null when the slot is empty (nothing to activate)', () => {
    expect(chooseBotPowerActivation(playingRoom([]), 'bot:1', () => 0)).toBeNull();
  });

  it('activates a held Peek when there is a previous play to challenge', () => {
    const room = playingRoom([{ id: 'pk', type: 'power', power: 'peek' }]);
    expect(chooseBotPowerActivation(room, 'bot:1', () => 0.99)).toEqual({ cardId: 'pk', power: 'peek' });
  });

  it('respects the one-power-per-turn ledger and the armed marker', () => {
    const slot = [{ id: 'pk', type: 'power', power: 'peek' }];
    expect(chooseBotPowerActivation(playingRoom(slot, { powerActivatedThisTurn: true }), 'bot:1', () => 0)).toBeNull();
    const armedRoom = playingRoom(slot);
    armedRoom.players.find((p) => p.id === 'bot:1').armedPowerCard = { power: 'freeze' };
    expect(chooseBotPowerActivation(armedRoom, 'bot:1', () => 0)).toBeNull();
  });

  it('only the on-turn bot activates offensively', () => {
    const room = playingRoom([{ id: 'pk', type: 'power', power: 'peek' }], { currentTurnIndex: 0 });
    expect(chooseBotPowerActivation(room, 'bot:1', () => 0)).toBeNull();
  });
});

describe('botStrategy — free-play reactive defence', () => {
  function interceptRoom(slot, { lied = true } = {}) {
    return {
      challengeableCard: { id: 'ch', type: 'shape', shape: lied ? 'square' : 'circle', number: 4 },
      challengeableCardType: 'circle',
      powerCardSlot: { 'bot:1': slot },
    };
  }

  it('defends only when the bot actually lied', () => {
    const slot = [{ id: 'sh', type: 'power', power: 'shield' }];
    expect(shouldBotInterceptBluff(interceptRoom(slot, { lied: true }), 'bot:1')).toBe(true);
    expect(shouldBotInterceptBluff(interceptRoom(slot, { lied: false }), 'bot:1')).toBe(false);
  });

  it('does not defend without a held interceptable card', () => {
    const slot = [{ id: 'pk', type: 'power', power: 'peek' }]; // peek is not defensive
    expect(shouldBotInterceptBluff(interceptRoom(slot), 'bot:1')).toBe(false);
  });

  it('picks Shield > Mirror > Swap from the held cards (never an unheld one)', () => {
    const room = interceptRoom([
      { id: 'mi', type: 'power', power: 'mirror' },
      { id: 'sh', type: 'power', power: 'shield' },
    ]);
    expect(chooseInterceptCard(room, 'bot:1')).toBe('sh');
    const onlyMirror = interceptRoom([{ id: 'mi', type: 'power', power: 'mirror' }]);
    expect(chooseInterceptCard(onlyMirror, 'bot:1')).toBe('mi');
    const onlyOffensive = interceptRoom([{ id: 'pk', type: 'power', power: 'peek' }]);
    expect(chooseInterceptCard(onlyOffensive, 'bot:1')).toBeNull();
  });
});

describe('botStrategy — free-play swap pick', () => {
  it('prefers a pile card that makes the played card honest', () => {
    const room = {
      challengeableCard: { id: 'ch', type: 'shape', shape: 'square' },
      challengeableCardType: 'circle',
      playedPile: [
        { id: 'p1', type: 'shape', shape: 'triangle' },
        { id: 'p2', type: 'shape', shape: 'circle' }, // matches required → honest swap
        { id: 'ch', type: 'shape', shape: 'square' },
      ],
    };
    expect(chooseSwapPick(room)).toBe('p2');
  });

  it('falls back to any other pile card, else a no-op on its own', () => {
    const room = {
      challengeableCard: { id: 'ch', type: 'shape', shape: 'square' },
      challengeableCardType: 'circle',
      playedPile: [
        { id: 'p1', type: 'shape', shape: 'triangle' },
        { id: 'ch', type: 'shape', shape: 'square' },
      ],
    };
    expect(chooseSwapPick(room)).toBe('p1');
    const lone = { challengeableCard: { id: 'ch', shape: 'square' }, challengeableCardType: 'circle', playedPile: [{ id: 'ch', shape: 'square' }] };
    expect(chooseSwapPick(lone)).toBe('ch');
  });
});

describe('botStrategy — sandbox bluff calling is spontaneous (no card knowledge)', () => {
  function sandboxRoom(extra = {}) {
    return {
      sandbox: true,
      isTutorial: true,
      isFirstTurn: false,
      bluffUsedThisTurn: false,
      bluffBlockedThisTurn: false,
      challengeableCard: { id: 'c', type: 'shape', shape: 'circle' },
      challengeableCardType: 'circle',
      prevTurnPlayerId: 'human',
      currentCardType: 'circle',
      turnOrder: ['human', 'bot:1'],
      currentTurnIndex: 1,
      botCallRate: 0.3,
      players: [
        { id: 'human', status: 'alive' },
        { id: 'bot:1', status: 'alive' },
      ],
      hands: new Map([['bot:1', [{ id: 'b', type: 'shape', shape: 'circle' }]]]),
      ...extra,
    };
  }

  it('is a pure gamble at the per-game rate, regardless of the opponent card', () => {
    // The challengeable card is HONEST (matches required) yet the bot still
    // gambles — it cannot "see" that, proving no card-knowledge cheat.
    expect(shouldCallBluff(sandboxRoom(), 'bot:1', () => 0.1)).toBe(true);  // 0.1 < 0.3
    expect(shouldCallBluff(sandboxRoom(), 'bot:1', () => 0.5)).toBe(false); // 0.5 > 0.3
  });

  it('does NOT use the coached ≥2-call guarantee in sandbox', () => {
    // botBluffCallsThisGame=0 would force calls in coached Basics; in sandbox the
    // low per-game rate still applies (no forced 0.85 lean).
    const room = sandboxRoom({ botBluffCallsThisGame: 0, botCallRate: 0.2 });
    expect(shouldCallBluff(room, 'bot:1', () => 0.5)).toBe(false);
  });

  it('leans toward calling when stuck (no honest play → wants a global re-deal)', () => {
    // Bot hand has no card matching the required shape and no whot → stuck.
    const room = sandboxRoom({
      currentCardType: 'triangle',
      botCallRate: 0.1,
      hands: new Map([['bot:1', [{ id: 'b', type: 'shape', shape: 'circle' }]]]),
    });
    // 0.5 is above the 0.1 base rate but below the 0.7 stuck rate → calls.
    expect(shouldCallBluff(room, 'bot:1', () => 0.5)).toBe(true);
  });

  it('rollBotCallRate stays within the configured band', () => {
    expect(rollBotCallRate(() => 0)).toBeCloseTo(BOT_CALL_RATE_MIN);
    expect(rollBotCallRate(() => 0.999999)).toBeLessThan(BOT_CALL_RATE_MAX);
    expect(rollBotCallRate(() => 0.5)).toBeGreaterThan(BOT_CALL_RATE_MIN);
  });
});

// ─── Free-play power beats driven through the real broadcast path ─────────────
describe('sandbox bot — power beats', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // A started sandbox room: powers ON, human as local host, bot second.
  function makeSandboxRoom() {
    const room = makeTutorialRoom();
    room.sandbox = true;
    room.tutorialScenario = null;
    return room;
  }

  it('activates a held offensive power (Freeze) at turn start, then plays', async () => {
    const room = makeSandboxRoom();
    room.currentTurnIndex = 1; // bot's turn
    // Bot holds a Freeze and is ahead (hands are equal at deal → "ahead").
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'fz', type: 'power', power: 'freeze' }] };
    await saveRoom(room);
    const io = makeIo();

    const rng = vi.spyOn(Math, 'random').mockReturnValue(0); // arm freeze + min think delay
    try {
      await broadcastRoomState(io, room.code);
      // Beat 1 — activate (BOT_MOVE_DELAY_MS).
      await vi.advanceTimersByTimeAsync(1200);
      const bot = room.players.find((p) => p.id === 'bot:1');
      expect(bot.armedPowerCard?.power).toBe('freeze');
      expect(room.powerActivatedThisTurn).toBe(true);
      expect(io.log.some((e) => e.payload?.kind === 'bot_power_activated')).toBe(true);
      // Beat 2 — play a card (after the ~4s think pause).
      await vi.advanceTimersByTimeAsync(4500);
      expect(room.cardPlayedThisTurn).toBe(true);
    } finally {
      rng.mockRestore();
    }
  });

  it('defends a bluff by arming a held Shield (intercept_arm) → bluff blocked', async () => {
    const room = makeSandboxRoom();
    // Stage a window: the bot was the previous player, LIED (square ≠ circle),
    // holds an un-armed Shield, and the human (on turn) called bluff on it.
    room.turnOrder = ['bot:1', 'human'];
    room.currentTurnIndex = 1;
    room.isFirstTurn = false;
    room.prevTurnPlayerId = 'bot:1';
    const card = { id: 'c1', type: 'shape', shape: 'square', number: 3 };
    room.lastPlayedCard = card;
    room.challengeableCard = card;
    room.challengeableCardType = 'circle'; // square ≠ circle → the bot lied
    room.playedPile = [card];
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'sh', type: 'power', power: 'shield' }] };
    room.bluffUsedThisTurn = true;
    room.phase = 'bluff_intercept_pending';
    room.pendingBluffIntercept = {
      accuserId: 'human', accuserName: 'You',
      accusedId: 'bot:1', accusedName: 'Dealer Bot',
      deadline: Date.now() + 8000,
      options: [{ cardId: 'sh', power: 'shield' }],
    };
    await saveRoom(room);
    const io = makeIo();

    expect(_pendingBotAction(room)).toEqual({ kind: 'intercept_arm', botId: 'bot:1' });
    await broadcastRoomState(io, room.code);
    await vi.advanceTimersByTimeAsync(1300); // BOT_MOVE_DELAY_MS arm beat

    // Window closed; the Shield blocked the (correct) bluff → no spin on the bot.
    expect(room.pendingBluffIntercept).toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.lastAction.type).toBe('bluff_blocked');
  });

  it('defends a bluff by arming a held Mirror (intercept_arm) → reflects the spin onto the accuser', async () => {
    const room = makeSandboxRoom();
    // Same window as the Shield case, but the bot holds a Mirror instead. Mirror
    // (scenario "incoming") reflects the spin onto the accuser regardless of
    // correctness — so a correct bluff on a lying bot lands on the HUMAN.
    room.turnOrder = ['bot:1', 'human'];
    room.currentTurnIndex = 1;
    room.isFirstTurn = false;
    room.prevTurnPlayerId = 'bot:1';
    const card = { id: 'c1', type: 'shape', shape: 'square', number: 3 };
    room.lastPlayedCard = card;
    room.challengeableCard = card;
    room.challengeableCardType = 'circle'; // square ≠ circle → the bot lied
    room.playedPile = [card];
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'mi', type: 'power', power: 'mirror' }] };
    room.bluffUsedThisTurn = true;
    room.phase = 'bluff_intercept_pending';
    room.pendingBluffIntercept = {
      accuserId: 'human', accuserName: 'You',
      accusedId: 'bot:1', accusedName: 'Dealer Bot',
      deadline: Date.now() + 8000,
      options: [{ cardId: 'mi', power: 'mirror' }],
    };
    await saveRoom(room);
    const io = makeIo();

    expect(_pendingBotAction(room)).toEqual({ kind: 'intercept_arm', botId: 'bot:1' });
    await broadcastRoomState(io, room.code);
    await vi.advanceTimersByTimeAsync(1300); // BOT_MOVE_DELAY_MS arm beat

    // The bluff's spin is reflected onto the HUMAN accuser, not the bot.
    expect(room.pendingBluffIntercept).toBeNull();
    expect(room.phase).toBe('spin_pending');
    expect(room.spinTargetId).toBe('human');
    expect(io.log.some((e) => e.payload?.kind === 'mirror_reflected')).toBe(true);
    _clearSpinPendingTimer(room.code);
  });

  it('passes a bluff when it played HONESTLY (no wasted Shield)', async () => {
    const room = makeSandboxRoom();
    room.turnOrder = ['bot:1', 'human'];
    room.currentTurnIndex = 1;
    room.isFirstTurn = false;
    const card = { id: 'c1', type: 'shape', shape: 'circle', number: 3 };
    room.lastPlayedCard = card;
    room.challengeableCard = card;
    room.challengeableCardType = 'circle'; // circle === circle → the bot was honest
    room.playedPile = [card];
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'sh', type: 'power', power: 'shield' }] };
    room.bluffUsedThisTurn = true;
    room.phase = 'bluff_intercept_pending';
    room.pendingBluffIntercept = {
      accuserId: 'human', accusedId: 'bot:1',
      deadline: Date.now() + 8000, options: [{ cardId: 'sh', power: 'shield' }],
    };
    await saveRoom(room);

    // Honest play → don't burn the Shield; pass and let the wrong call spin the human.
    expect(_pendingBotAction(room)).toEqual({ kind: 'intercept_pass', botId: 'bot:1' });
  });

  it('resolves a swap_pending pause when the bot is the Swap holder', async () => {
    const room = makeSandboxRoom();
    room.phase = 'swap_pending';
    room.swapHolderId = 'bot:1';
    // The accused (bot) lied with a square; a circle sits in the pile to swap in.
    const lied = { id: 'lie', type: 'shape', shape: 'square', number: 2 };
    const honest = { id: 'hon', type: 'shape', shape: 'circle', number: 9 };
    room.playedPile = [honest, lied];
    room.challengeableCard = lied;
    room.challengeableCardType = 'circle';
    room.lastAction = { type: 'swap_pending', accuserId: 'human', accusedId: 'bot:1' };
    room.powerCardSlot = { human: [], 'bot:1': [{ id: 'sw', type: 'power', power: 'swap', armed: true }] };
    const botPlayer = room.players.find((p) => p.id === 'bot:1');
    botPlayer.armedPowerCard = { power: 'swap', cardId: 'sw' };
    await saveRoom(room);
    const io = makeIo();

    expect(_pendingBotAction(room)).toEqual({ kind: 'swap_pick', botId: 'bot:1' });
    await broadcastRoomState(io, room.code);
    await vi.advanceTimersByTimeAsync(1300);

    // Swap consumed and the bluff resolved off the swapped-in (honest) card → the
    // wrong call now spins the HUMAN accuser, not the bot.
    expect(room.swapHolderId).toBeNull();
    expect(room.phase).toBe('spin_pending');
    expect(room.spinTargetId).toBe('human');
    _clearSpinPendingTimer(room.code);
  });
});
