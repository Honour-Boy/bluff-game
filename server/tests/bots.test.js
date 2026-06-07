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
const { chooseCardPlay, shouldCallBluff } = require('../engine/botStrategy.js');
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

    // Broadcast arms beat 1 (play).
    await broadcastRoomState(io, room.code);
    expect(botTimers.has(room.code)).toBe(true);

    // Beat 1 — bot plays a card.
    await vi.advanceTimersByTimeAsync(1200);
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

    await broadcastRoomState(io, room.code);
    // Beat 1 (play last card) + Beat 2 (end turn → empty hand wins).
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(1200);

    expect(room.phase).toBe('game_over');
    expect(room.lastAction.type).toBe('game_over');
    expect(room.lastAction.winnerId).toBe('bot:1');
    expect(bot.isBot).toBe(true);
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
      await vi.advanceTimersByTimeAsync(1200);  // bot challenges the human

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
      await vi.advanceTimersByTimeAsync(1200);

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

  it('seats the human host + one bot in an all-off online tutorial room', async () => {
    const io = makeIo();
    const handlers = captureHandlers(io);
    const cb = vi.fn();

    await handlers['create_tutorial_room']({}, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const res = cb.mock.calls[0][0];
    expect(res.success).toBe(true);
    expect(res.isTutorial).toBe(true);
    expect(res.isHost).toBe(true);
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
