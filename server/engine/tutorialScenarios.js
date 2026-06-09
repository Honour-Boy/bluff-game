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
    // The bot gets a LOADED 1-bullet chamber so a Mirror/Swap reflected spin shows
    // real drama (a live round in the cylinder, not an empty barrel). The bot can
    // still never DIE here: the spin pipeline force-survives the clinic bot and
    // lands the chamber on an empty slot (see applySpinAndBroadcast), so a stray
    // ~15% death can't end the round (and the clinic) before the Assassin drill —
    // the one place the bot is meant to be eliminated. The human keeps a normal
    // 1-bullet chamber (they're saved by the power in every drill anyway).
    p.chamber = initChamber(1);
    p.riskLevel = 1;
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

// ─── Drill defs (keyed by id; run order set by _CLINIC_ORDER below) ────────────
const _DRILL_DEFS = [
  // 0 — PEEK: own-turn, reveals the previous play.
  {
    id: 'peek', power: 'peek', actor: 'player', lockBluff: true, expect: 'use_power',
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
    id: 'freeze', power: 'freeze', actor: 'player', lockBluff: true, expect: 'arm_then_play',
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
    // (Module 3.1) Double-turn drill. The freeze leaves the slot when the holder
    // ends their turn with it armed (consumeFreezeOnTurnEnd queues the skip), and
    // the skip bounces play straight back to the human for a free SECOND turn.
    // So the drill is NOT done the moment the freeze is consumed — it completes
    // only after the learner has taken that bonus turn and ended it, which
    // advances the turn onto the (previously skipped) bot.
    complete(room) {
      return !_holds(room, _humanId(room), 'freeze')
        && room.turnOrder[room.currentTurnIndex] === BOT_ID;
    },
  },

  // 2 — SHIELD: full loop — deal mismatches, the player plays + ends turn, the bot
  //     challenges (director opens the window), the player arms Shield to block.
  {
    id: 'shield', power: 'shield', actor: 'player', expect: 'play_then_defend',
    stage(room) { _stageDefensiveDrill(room, 'shield'); },
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

  // 4 — MIRROR: full loop; arm it to bounce the spin onto the bot.
  {
    id: 'mirror', power: 'mirror', actor: 'player', expect: 'play_then_defend',
    stage(room) { _stageDefensiveDrill(room, 'mirror'); },
    complete(room) {
      return !_holds(room, _humanId(room), 'mirror') && room.phase === 'playing';
    },
  },

  // 5 — SWAP: full loop; arm it, then pick the matching card from the played pile
  //     so the bluff fails and the bot spins instead.
  {
    id: 'swap', power: 'swap', actor: 'player', expect: 'play_then_defend',
    stage(room) { _stageDefensiveDrill(room, 'swap'); },
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

// Run order. Shield is "Power Card 1" (onboarding spec); the bot-Shield demo
// follows so the learner immediately sees the same card from the other side; the
// offensive Assassin is LAST because its kill ends the round = clinic complete.
const _CLINIC_ORDER = ['shield', 'bot-shield', 'peek', 'freeze', 'mirror', 'swap', 'assassin'];
const POWER_CLINIC = _CLINIC_ORDER.map(id => _DRILL_DEFS.find(d => d.id === id));

// Stage a DEFENSIVE drill as a full loop (Module 4): the human is on turn with a
// hand of ALL non-matching cards (so any play is a bluff) and holds an un-armed
// defensive `power`. The player plays a card + ends their turn; the director then
// opens the intercept window (the "bot challenges"), and the player arms the
// defence. For Swap a matching card is pre-seeded into the played pile so the
// holder has something to swap onto their play.
function _stageDefensiveDrill(room, power) {
  const hid = _humanId(room);
  _resetForDrill(room);
  room.turnOrder = [hid, BOT_ID];
  room.currentTurnIndex = 0;               // human on turn — they lead with a bluff
  room.isFirstTurn = true;
  room.prevTurnPlayerId = null;
  // Step A — a hand guaranteed to never match the required shape.
  room.hands.set(hid, [_mismatch(0), _mismatch(1), _mismatch(2)]);
  room.hands.set(BOT_ID, [_shape('triangle', 7), _shape('cross', 5)]);

  const card = _power(power);
  if (power === 'swap') {
    card.swapPendingPlayerIds = []; // gate-free here
    room.playedPile = [_shape(REQUIRED_SHAPE, 9)]; // a card to swap TO
  }
  room.powerCardSlot[hid] = [card];
  // phase stays 'playing' (set by stageScenario).
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
  // "Power Card N of M" numbering counts only the player-facing drills — the bot
  // demo is an un-numbered aside (playerStep = null).
  const playerTotal = POWER_CLINIC.filter(d => (d.actor || 'player') === 'player').length;
  const playerStep = (spec.actor === 'bot')
    ? null
    : POWER_CLINIC.slice(0, index + 1).filter(d => (d.actor || 'player') === 'player').length;
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
    playerStep,
    playerTotal,
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

/**
 * Power-Clinic turn gate: a learner must perform the drill's scripted action
 * BEFORE they can End Turn, so they can't skip a lesson by ending early. Returns
 * { reason } to refuse, or null to allow. Pure read; inert outside an active
 * (intro-step) clinic drill, so it never touches normal gameplay.
 *   call_bluff       (bot-Shield demo)   → must Call Bluff first
 *   arm_then_play    (Freeze, Assassin)  → must arm the power first
 *   use_power        (Peek)              → must use the power first
 *   play_then_defend (Shield/Mirror/Swap)→ only needs a card play, which the
 *                    end_turn handler already requires — no extra gate here.
 */
function clinicEndTurnBlock(room) {
  if (!room || !room.isTutorial || (room.tutorialLesson || 'basics') !== 'powers') return null;
  const sc = room.tutorialScenario;
  if (!sc || sc.step === 'resolved') return null;
  switch (sc.expect) {
    case 'call_bluff':
      if (!room.bluffUsedThisTurn) return { reason: "Call the bot's bluff first — that's this drill." };
      break;
    case 'arm_then_play':
    case 'use_power':
      // (Module 3.1) Freeze double-turn: once the freeze is consumed the learner
      // takes a free second turn with no power to arm — don't gate End Turn on it.
      if (sc.power === 'freeze' && !_holds(room, _humanId(room), 'freeze')) break;
      if (!room.powerActivatedThisTurn) return { reason: 'Use your power card first — follow the coach before ending your turn.' };
      break;
    default:
      break;
  }
  return null;
}

/**
 * Power-Clinic *action* gate: refuses an action that isn't the drill's scripted
 * one, so a stray tap can't break the lesson. The reported failure was the
 * bot-Shield demo (expect 'call_bluff') — the coach says "Call Bluff", but if the
 * learner instead plays a card it overwrites the bot's challengeable card, the
 * call-bluff target is gone, and the drill can never complete (End Turn is also
 * blocked) → the clinic hangs. We block the off-script `play_card` up front and
 * surface the same coach line. Pure read; inert outside an active clinic drill.
 *   call_bluff                  → must Call Bluff; playing a card is off-script.
 *   use_power / arm_then_play    → must use/arm the power BEFORE playing a card
 *                                  (peeking after a card play reveals the wrong
 *                                  card; arming is meant to precede the play).
 *   play_then_defend             → playing a card IS the step — never blocked.
 */
function clinicActionBlock(room, action) {
  if (!room || !room.isTutorial || (room.tutorialLesson || 'basics') !== 'powers') return null;
  const sc = room.tutorialScenario;
  if (!sc || sc.step === 'resolved') return null;
  if (action === 'play_card') {
    if (sc.expect === 'call_bluff') {
      return { reason: "Call the bot's bluff first — that's this drill. Don't play a card yet." };
    }
    if ((sc.expect === 'use_power' || sc.expect === 'arm_then_play') && !room.powerActivatedThisTurn) {
      // (Module 3.1) Freeze bonus turn: freeze already spent, so the second card
      // play is free — don't block it.
      if (sc.power === 'freeze' && !_holds(room, _humanId(room), 'freeze')) return null;
      return { reason: 'Use your power card first — follow the coach before playing a card.' };
    }
  }
  return null;
}

module.exports = {
  POWER_CLINIC,
  stageScenario,
  scenarioComplete,
  clinicEndTurnBlock,
  clinicActionBlock,
  REQUIRED_SHAPE,
  BOT_ID,
};
