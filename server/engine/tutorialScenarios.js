// ============================================================
// ENGINE — Tutorial Power Clinic (scripted drill staging, pure)
// ============================================================
// The Powers lesson is a CLINIC: a fixed sequence of staged mid-game
// "instances", each engineering the exact moment one power card is needed
// so the learner activates it and sees the effect (and, for one drill,
// watches the bot use a power). No free-play RNG — `stageScenario` writes a
// deterministic snapshot onto the room and `scenarioComplete` is the pure
// predicate the director (lib/tutorialDirector.js) polls to advance.
//
// Pure: no I/O, no sockets, no timers. The director owns the timing + the
// socket broadcasts; the bot driver (lib/bots.js) reads the per-drill flags
// (`forceBotBluff`, `botArmsIntercept`) to play its scripted part.
//
// Each drill stages one of two shapes:
//   • own-turn drills (peek / freeze / assassin) — the human acts on their
//     own turn; `lockBluff` disables the Call-Bluff button so they stay on
//     script.
//   • intercept drills (shield / mirror / swap) — staged DIRECTLY into the
//     `bluff_intercept_pending` window with the human as the accused holding
//     the defensive card, so the only move is to arm it (or pick, for Swap).
//   • the bot-Shield demo — staged in `playing` with the bot holding a Shield
//     and the human prompted to Call Bluff; the bot arms it (botArmsIntercept)
//     so the learner sees a power used against them.

const { initChamber } = require('./chamber');

const BOT_ID = 'bot:1';
const REQUIRED_SHAPE = 'circle';            // the shape on the table for every drill
const MISMATCH_SHAPES = ['triangle', 'square', 'cross', 'star'];

// ─── Card factories (deterministic ids, namespaced so they never collide) ─────
let _seq = 0;
function _shape(shape, number) {
  return { id: `tut-${shape}-${number}-${_seq++}`, type: 'shape', shape, number };
}
function _power(power) {
  return { id: `tut-power-${power}-${_seq++}`, type: 'power', power };
}
function _mismatch(i = 0) {
  return _shape(MISMATCH_SHAPES[i % MISMATCH_SHAPES.length], (i % 9) + 2);
}
// A small filler draw pile so any incidental draw (e.g. an Assassin backfire
// dealing +3) has shape cards to hand out.
function _fillerDeck(n = 24) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(_shape(MISMATCH_SHAPES[i % 4], (i % 13) + 1));
  return cards;
}

function _humanId(room) {
  return room.players.find(p => p && !p.isBot)?.id || null;
}
function _humanName(room) {
  return room.players.find(p => p && !p.isBot)?.username || 'You';
}

// Shared reset applied before every drill: both seats alive with a fresh
// 1-bullet chamber, no armed cards, clean ledger + piles.
function _resetForDrill(room) {
  for (const p of room.players) {
    p.status = 'alive';
    p.isSpectator = false;
    p.armedPowerCard = null;
    p.role = 'barehand';
    // The bot gets an EMPTY chamber so a Mirror/Swap reflected spin always lands
    // on a survival slot — the learner sees the spin drama, but a stray ~15%
    // bot death can't end the round (and the clinic) before the Assassin drill,
    // which is the one place the bot is meant to be eliminated. The human keeps a
    // normal 1-bullet chamber (they're saved by the power in every drill anyway).
    if (p.isBot) { p.chamber = initChamber(0); p.riskLevel = 0; }
    else { p.chamber = initChamber(1); p.riskLevel = 1; }
  }
  room.deck = _fillerDeck();
  room.playedPile = [];
  room.discardPile = [];
  room.hands = new Map();
  room.powerCardSlot = {};
  room.currentCard = _shape(REQUIRED_SHAPE, 4);
  room.currentCardType = REQUIRED_SHAPE;
  room.lastAction = null;
  room.lastPlayedCard = null;
  room.challengeableCard = null;
  room.challengeableCardType = null;
  room.prevTurnPlayerId = null;
  room.spinTargetId = null;
  room.swapHolderId = null;
  room.pendingBluffIntercept = null;
  room.pendingMedicSave = null;
  room.pendingSniperRedirect = null;
  room.betting = null;
  room.ghostVote = null;
  room.isFirstTurn = false;
  room.skipNextPlayer = false;
  room.bluffBlockedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.powerActivatedThisTurn = false;
  room.suddenDeathCounter = 0;
  room.roundNumber = 1;
}

// Does `holderId` still hold a card of `power` in their slot?
function _holds(room, holderId, power) {
  return (room.powerCardSlot?.[holderId] || []).some(c => c?.power === power);
}

// ─── Drill specs ──────────────────────────────────────────────────────────────
// Order is pedagogical: a gentle info power, a tempo power, then the bluff-time
// defences (with a bot-uses-Shield demo wedged in), then the offensive trap LAST
// — its kill ends the round, which is exactly the clinic-complete beat.
const POWER_CLINIC = [
  // 0 — PEEK: own-turn, reveals the previous play.
  {
    id: 'peek', power: 'peek', actor: 'player', lockBluff: true,
    stage(room) {
      const hid = _humanId(room);
      _resetForDrill(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;            // human on turn
      room.prevTurnPlayerId = BOT_ID;       // bot "just played"
      // The bot's last play was a mismatch — Peek will expose the lie.
      const botPlay = _mismatch(0);
      room.challengeableCard = botPlay;
      room.challengeableCardType = REQUIRED_SHAPE;
      room.playedPile = [botPlay];
      room.lastPlayedCard = botPlay;
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 7), _shape('square', 5), _shape('star', 9)]);
      room.hands.set(BOT_ID, [_shape('triangle', 3), _shape('cross', 8)]);
      room.powerCardSlot[hid] = [_power('peek')];
    },
    complete(room) {
      return !_holds(room, _humanId(room), 'peek');
    },
  },

  // 1 — FREEZE: own-turn, arm + play + end → skip the bot's next turn.
  {
    id: 'freeze', power: 'freeze', actor: 'player', lockBluff: true,
    stage(room) {
      const hid = _humanId(room);
      _resetForDrill(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;
      room.isFirstTurn = true;              // human leads — nothing to challenge
      room.prevTurnPlayerId = null;
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 6), _shape('square', 4), _shape('cross', 2)]);
      room.hands.set(BOT_ID, [_shape('triangle', 5), _shape('star', 7)]);
      room.powerCardSlot[hid] = [_power('freeze')];
    },
    // The freeze leaves the slot only when the holder ends their turn with it
    // armed (consumeFreezeOnTurnEnd) — i.e. the skip has been queued.
    complete(room) {
      return !_holds(room, _humanId(room), 'freeze');
    },
  },

  // 2 — SHIELD: staged into the intercept window; arm it to block the bluff.
  {
    id: 'shield', power: 'shield', actor: 'player',
    stage(room) { _stageIntercept(room, 'shield'); },
    complete(room) {
      return !_holds(room, _humanId(room), 'shield') && room.phase === 'playing';
    },
  },

  // 3 — BOT SHIELD DEMO: the human calls bluff, the bot blocks with a Shield so
  //     the learner sees a power used against them.
  {
    id: 'bot-shield', power: 'shield', actor: 'bot', lockBluff: false,
    expect: 'call_bluff', botArmsIntercept: true,
    stage(room) {
      const hid = _humanId(room);
      _resetForDrill(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;            // human on turn
      room.prevTurnPlayerId = BOT_ID;       // bot "just played" a mismatch
      const botPlay = _mismatch(1);
      room.challengeableCard = botPlay;
      room.challengeableCardType = REQUIRED_SHAPE;
      room.playedPile = [botPlay];
      room.lastPlayedCard = botPlay;
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 3), _shape('star', 6)]);
      room.hands.set(BOT_ID, [_shape('triangle', 2), _shape('square', 9)]);
      room.powerCardSlot[BOT_ID] = [_power('shield')]; // the BOT holds the Shield
    },
    // Done when the bot's Shield has been spent blocking the human's challenge.
    complete(room) {
      return !_holds(room, BOT_ID, 'shield') && room.phase === 'playing';
    },
  },

  // 4 — MIRROR: intercept window; arm it to bounce the spin onto the bot.
  {
    id: 'mirror', power: 'mirror', actor: 'player',
    stage(room) { _stageIntercept(room, 'mirror'); },
    complete(room) {
      return !_holds(room, _humanId(room), 'mirror') && room.phase === 'playing';
    },
  },

  // 5 — SWAP: intercept window; arm it, then pick the matching card from the
  //     played pile so the bluff fails and the bot spins instead.
  {
    id: 'swap', power: 'swap', actor: 'player',
    stage(room) { _stageIntercept(room, 'swap'); },
    complete(room) {
      return !_holds(room, _humanId(room), 'swap')
        && room.phase !== 'swap_pending'
        && room.phase !== 'bluff_intercept_pending';
    },
  },

  // 6 — ASSASSIN (LAST): own-turn, arm + honest play + end → a reckless bot
  //     challenge eliminates it, ending the clinic on a win.
  {
    id: 'assassin', power: 'assassin', actor: 'player', lockBluff: true,
    expect: 'arm_then_play', forceBotBluff: true,
    stage(room) {
      const hid = _humanId(room);
      _resetForDrill(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;
      room.isFirstTurn = true;              // human leads — they play honestly
      room.prevTurnPlayerId = null;
      // All matching cards, so whatever the human plays is HONEST — the bot's
      // forced challenge is therefore wrong, and the Assassin strikes it.
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 8), _shape(REQUIRED_SHAPE, 3), _shape(REQUIRED_SHAPE, 11)]);
      room.hands.set(BOT_ID, [_shape('triangle', 4), _shape('square', 6)]);
      room.powerCardSlot[hid] = [_power('assassin')];
    },
    // The strike eliminates the bot (2-player → the round is won).
    complete(room) {
      const bot = room.players.find(p => p.id === BOT_ID);
      return bot?.status === 'eliminated' || !_holds(room, _humanId(room), 'assassin');
    },
  },
];

// Stage an intercept drill: the human has "played" a mismatch, the bot has just
// challenged it, and the human holds an un-armed defensive `power`. For Swap a
// matching card is seeded into the played pile so the holder has something to
// swap in.
function _stageIntercept(room, power) {
  const hid = _humanId(room);
  _resetForDrill(room);
  room.turnOrder = [hid, BOT_ID];
  room.currentTurnIndex = 1;               // bot is the accuser (on turn)
  room.prevTurnPlayerId = hid;             // human is the accused (previous)

  const humanPlay = _mismatch(2);          // the wrong card the human "played"
  room.challengeableCard = humanPlay;
  room.challengeableCardType = REQUIRED_SHAPE;
  room.lastPlayedCard = humanPlay;
  room.hands.set(hid, [_shape('star', 4), _shape('square', 6)]);
  room.hands.set(BOT_ID, [_shape('triangle', 7), _shape('cross', 5)]);

  const card = _power(power);
  if (power === 'swap') {
    // Swap is gate-free here (both seats have "taken a turn"); seed a matching
    // card into the pile for the holder to swap onto their play.
    card.swapPendingPlayerIds = [];
    const matching = _shape(REQUIRED_SHAPE, 9);
    room.playedPile = [matching, humanPlay];
  } else {
    room.playedPile = [humanPlay];
  }
  room.powerCardSlot[hid] = [card];

  room.phase = 'bluff_intercept_pending';
  room.pendingBluffIntercept = {
    accuserId: BOT_ID,
    accuserName: 'Dealer Bot',
    accusedId: hid,
    accusedName: _humanName(room),
    deadline: Date.now() + 60_000,         // generous — the director owns the safety
    options: [{ cardId: card.id, power }],
  };
}

/**
 * Stage clinic drill `index` onto the room. Returns the scenario descriptor that
 * the director stamps on `room.tutorialScenario` (the client coach keys off it).
 * Out-of-range index → null.
 */
function stageScenario(room, index) {
  const spec = POWER_CLINIC[index];
  if (!spec) return null;
  spec.stage(room);
  // Intercept drills set their own phase; everything else is normal play.
  if (room.phase !== 'bluff_intercept_pending') room.phase = 'playing';
  return {
    index,
    id: spec.id,
    power: spec.power,
    actor: spec.actor || 'player',
    step: 'intro',
    lockBluff: !!spec.lockBluff,
    expect: spec.expect || null,
    forceBotBluff: !!spec.forceBotBluff,
    botArmsIntercept: !!spec.botArmsIntercept,
    total: POWER_CLINIC.length,
  };
}

/**
 * Has the drill at `index` been satisfied? Pure read of room state.
 */
function scenarioComplete(room, index) {
  const spec = POWER_CLINIC[index];
  if (!spec) return false;
  return !!spec.complete(room);
}

module.exports = {
  POWER_CLINIC,
  stageScenario,
  scenarioComplete,
  REQUIRED_SHAPE,
  BOT_ID,
};
