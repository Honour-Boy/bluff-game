// ============================================================
// ENGINE - Spotlight tour staged instances (pure)
// ============================================================
// The "Show me around" tour runs its Part-B (in-game) beats over REAL staged
// instances in the live practice room, firing the REAL socket events. This
// module deterministically stages each instance and exposes the completion
// predicate the director (lib/tutorialDirector.js) polls to advance - mirroring
// engine/tutorialScenarios.js (the Power Clinic), just simpler.
//
// Three ordered steps cover the nine Part-B beats:
//   play_card        (B1–B4) - browse the hand, tap a card, confirm, end turn.
//   call_bluff_chain (B5–B7) - call a (truthful) bluff → it's WRONG → you face
//                              the chamber → pull the trigger (survive: empty
//                              chamber) → continue.
//   activate_power   (B8–B10) - tap a seeded Peek, activate it, read the result.
//
// Pure: no I/O, no sockets, no timers. The director owns timing + broadcasts; the
// bot is FROZEN for the whole tour (lib/bots.js bails on lesson 'tour'), so the
// staged "bot plays" are written here, never performed by the bot driver.

const { initChamber } = require('./chamber');

const BOT_ID = 'bot:1';
const REQUIRED_SHAPE = 'circle';
const MISMATCH_SHAPES = ['triangle', 'square', 'cross', 'star'];

// Ordered step ids - the director stages these one at a time.
const TOUR_STEPS = ['play_card', 'call_bluff_chain', 'activate_power'];

// ─── Deterministic card factories (namespaced ids, never collide) ─────────────
let _seq = 0;
function _shape(shape, number) {
  return { id: `tour-${shape}-${number}-${_seq++}`, type: 'shape', shape, number };
}
function _power(power) {
  return { id: `tour-power-${power}-${_seq++}`, type: 'power', power };
}
function _mismatch(i = 0) {
  return _shape(MISMATCH_SHAPES[i % MISMATCH_SHAPES.length], (i % 9) + 2);
}
function _fillerDeck(n = 24) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(_shape(MISMATCH_SHAPES[i % 4], (i % 13) + 1));
  return cards;
}

function _humanId(room) {
  return room.players.find((p) => p && !p.isBot)?.id || null;
}

// Shared reset before every staged step: both seats alive + fresh, clean ledger,
// empty piles, human on a 1-bullet chamber by default (call_bluff_chain empties
// it so the wrong-call spin always survives).
function _resetForTour(room) {
  for (const p of room.players) {
    p.status = 'alive';
    p.isSpectator = false;
    p.armedPowerCard = null;
    p.role = 'barehand';
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
  // Per-step reset of the tour's spin-acknowledge marker (set by the
  // spin_acknowledged handler so the director can complete call_bluff_chain).
  room.tourSpinAcked = false;
}

function _holds(room, holderId, power) {
  return (room.powerCardSlot?.[holderId] || []).some((c) => c?.power === power);
}

// ─── Step definitions ─────────────────────────────────────────────────────────
const _STEP_DEFS = {
  // B1–B4: the human browses, plays a (legal) card, and ends their turn.
  play_card: {
    expect: 'play_card',
    lockBluff: false,
    stage(room) {
      const hid = _humanId(room);
      _resetForTour(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;          // human on turn
      room.isFirstTurn = true;            // no Call Bluff yet → a clean "play a card"
      room.prevTurnPlayerId = null;
      // All matching cards, so whatever they tap is a legal play.
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 7), _shape(REQUIRED_SHAPE, 3), _shape(REQUIRED_SHAPE, 11)]);
      room.hands.set(BOT_ID, [_shape('triangle', 3), _shape('cross', 8)]);
    },
    // Done once the human has played a card AND ended their turn - the (frozen)
    // bot is now on turn.
    complete(room) {
      return room.turnOrder?.[room.currentTurnIndex] === BOT_ID;
    },
  },

  // B5–B7: the human calls a bluff that's WRONG (the bot was honest), faces the
  // chamber, and survives an EMPTY chamber, then continues.
  call_bluff_chain: {
    expect: 'call_bluff',
    lockBluff: false,
    stage(room) {
      const hid = _humanId(room);
      _resetForTour(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;          // human on turn
      room.isFirstTurn = false;           // Call Bluff is available
      room.prevTurnPlayerId = BOT_ID;     // the bot "just played"
      // The bot's last play MATCHES the required shape → it was HONEST → calling
      // bluff is WRONG → the spin lands on the human (who survives, below).
      const botPlay = _shape(REQUIRED_SHAPE, 6);
      room.challengeableCard = botPlay;
      room.challengeableCardType = REQUIRED_SHAPE;
      room.playedPile = [botPlay];
      room.lastPlayedCard = botPlay;
      room.hands.set(hid, [_shape('square', 5), _shape('star', 9)]);
      room.hands.set(BOT_ID, [_shape('triangle', 3)]);
      // The wrong-call spin must always survive → empty the human's chamber.
      const human = room.players.find((p) => p.id === hid);
      if (human) { human.chamber = initChamber(0); human.riskLevel = 0; }
      // Bot holds no interceptable power → no intercept window opens.
      room.powerCardSlot[BOT_ID] = [];
    },
    // Done once the human has acknowledged the resulting spin (B7). A survived
    // spin doesn't advance the turn or otherwise mutate state, so the
    // spin_acknowledged handler stamps `tourSpinAcked` for this lesson.
    complete(room) {
      return !!room.tourSpinAcked;
    },
  },

  // B8–B10: a seeded Peek the human activates and reads. Mirrors the proven
  // Power-Clinic peek drill exactly (own-turn, prev play to reveal).
  activate_power: {
    expect: 'activate_power',
    lockBluff: true,                      // keep the learner on the power, not Call Bluff
    stage(room) {
      const hid = _humanId(room);
      _resetForTour(room);
      room.turnOrder = [hid, BOT_ID];
      room.currentTurnIndex = 0;          // human on turn
      room.isFirstTurn = false;
      room.prevTurnPlayerId = BOT_ID;     // bot "just played" - Peek reveals it
      const botPlay = _mismatch(0);
      room.challengeableCard = botPlay;
      room.challengeableCardType = REQUIRED_SHAPE;
      room.playedPile = [botPlay];
      room.lastPlayedCard = botPlay;
      room.hands.set(hid, [_shape(REQUIRED_SHAPE, 7), _shape('square', 5)]);
      room.hands.set(BOT_ID, [_shape('triangle', 3)]);
      room.powerCardSlot[hid] = [_power('peek')];
    },
    // Done once the Peek has been spent.
    complete(room) {
      return !_holds(room, _humanId(room), 'peek');
    },
  },
};

/**
 * Stage tour step `index` onto the room. Returns the scenario descriptor stamped
 * on `room.tutorialScenario` (serialized for the client tour layer). Out-of-range
 * index → null.
 */
function stageTourStep(room, index) {
  const step = TOUR_STEPS[index];
  const def = _STEP_DEFS[step];
  if (!def) return null;
  def.stage(room);
  if (room.phase !== 'bluff_intercept_pending') room.phase = 'playing';
  room.tutorialScenario = {
    tour: true,
    step,
    stepIndex: index,
    totalSteps: TOUR_STEPS.length,
    expect: def.expect,
    lockBluff: !!def.lockBluff,
  };
  return room.tutorialScenario;
}

/**
 * Has tour step `index` been satisfied? Pure read of room state.
 */
function tourStepComplete(room, index) {
  const step = TOUR_STEPS[index];
  const def = _STEP_DEFS[step];
  if (!def) return false;
  return !!def.complete(room);
}

module.exports = {
  TOUR_STEPS,
  stageTourStep,
  tourStepComplete,
  REQUIRED_SHAPE,
  BOT_ID,
};
