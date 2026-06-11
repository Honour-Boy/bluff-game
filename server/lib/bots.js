// ============================================================
// SOCKET LIB — Bot turn driver (tutorial / practice opponent)
// ============================================================
// A seated bot has no socket, so it can't emit play_card_online / end_turn /
// player_spin like a human. Instead this driver runs the bot's moves SERVER-side
// by calling the engine + the shared spin pipeline directly, then broadcasting —
// exactly the pattern the idle-turn safety net (lib/idleTurn.js) uses for an AFK
// player, just on a much shorter, human-legible beat so the player can watch.
//
// armBotTurn is idempotent and is called at the END of every broadcastRoomState
// (right after armIdleTurnTimer). It figures out whether a bot owes an action
// right now and, if so, schedules ONE beat. Performing that beat broadcasts,
// which re-arms the next beat — so a bot's turn plays out as: play a card → end
// the turn; and a bot that's bluff-called spins when it's the target.
//
// Cycle note: this module is required at the top of lib/broadcast.js, so it must
// NOT require broadcast / orchestration at top level. Those are pulled in via
// DEFERRED requires inside the expiry handler (same trick idleTurn.js uses).

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const {
  chooseCardPlay,
  shouldCallBluff,
  chooseBotPowerActivation,
  shouldBotInterceptBluff,
  chooseInterceptCard,
  chooseSwapPick,
  rollBotCallRate,
} = require('../engine/botStrategy');
const {
  getRoom,
  saveRoom,
  botTimers,
  _clearBotTimer,
  _clearSpinPendingTimer,
  _clearBluffInterceptTimer,
} = require('./state');

// Beat timing — long enough to read on screen, short enough to feel responsive.
const BOT_MOVE_DELAY_MS = 1100; // play a card / end the turn
const BOT_SPIN_DELAY_MS = 1500; // pause on "<bot> is on the spot" before spinning
const BOT_INTERCEPT_DELAY_MS = 700; // brief "deciding" beat before auto-passing a bluff intercept
// (Module 2.1) In the Power Clinic, the bot's spin (e.g. a reflected Mirror/Swap
// spin) waits much longer so the learner can read the expanded coach before the
// cylinder turns. Clinic-only (lesson 'powers'); Basics keeps the snappy beat.
const CLINIC_BOT_SPIN_DELAY_MS = 10000;

// "Thinking" delay before the bot plays a card. A real opponent doesn't slam a
// card down instantly — a randomized 4–12s pause per turn makes the bot feel
// like it's actually weighing what to play (and masks the fact that its choice
// is computed instantly). Applies to the card-play beat only; ending the turn /
// arming / spinning keep their snappy beats. Re-rolled per distinct beat (the
// armBotTurn key-guard fixes the chosen delay for that beat so repeated
// broadcasts don't restack or re-randomize it).
const BOT_PLAY_THINK_MIN_MS = 4000;
const BOT_PLAY_THINK_MAX_MS = 12000;
function _botPlayThinkDelay() {
  return Math.floor(
    BOT_PLAY_THINK_MIN_MS + Math.random() * (BOT_PLAY_THINK_MAX_MS - BOT_PLAY_THINK_MIN_MS),
  );
}

// Tutorial rooms are never group rooms (room.groupId is null), so the leaderboard
// repo handed to the spin pipeline is never actually invoked — every call site
// guards on room.groupId first. Pass an inert stub so we don't have to load the
// Supabase client (which throws without env) into the broadcast path, and so the
// driver works unchanged in unit tests that don't register handlers.
const NOOP_LEADERBOARD_REPO = {
  recordWinner: async () => ({}),
  recordGameStart: async () => ({}),
  // #205 — XP is never awarded in tutorial/practice rooms (maybeAwardGameXp
  // gates on !room.isTutorial), but keep the surface shape complete.
  getProgression: async () => ({ xp: 0, gamesPlayed: 0, equipped: {} }),
  addXp: async () => ({}),
  setEquippedCosmetics: async () => ({}),
};

function _roomHasBots(room) {
  return Array.isArray(room?.players) && room.players.some((p) => p?.isBot);
}

// Is the bot eligible to CHALLENGE the previous play right now? (Clinic-scripted
// bluff calls bypass the random rate but still need a real, live target.)
function _botCanForceBluff(room, botId) {
  if (room.isFirstTurn || room.bluffUsedThisTurn || room.bluffBlockedThisTurn) return false;
  if (!room.challengeableCard) return false;
  const accusedId = engine.getPreviousTurnPlayerId(room);
  if (!accusedId || accusedId === botId) return false;
  const accused = room.players.find((p) => p.id === accusedId);
  return !!accused && accused.status === 'alive';
}

/**
 * What, if anything, does a seated bot owe right now? Returns
 *   { kind: 'play' | 'end' | 'spin', botId }
 * or null when no bot action is pending (human's turn, a non-bot is on the spot,
 * a pause phase the server's own timers resolve, etc.).
 */
function _pendingBotAction(room) {
  if (!room || room.mode !== engine.MODES.ONLINE || !_roomHasBots(room)) return null;

  // A bot accused during a bluff-intercept window normally auto-passes — it has
  // no socket to arm a defence, so without this a human bluff against a power-
  // holding bot would stall the whole window. EXCEPTION: the clinic's bot-Shield
  // demo scripts the bot to ARM its defence so the learner sees a power used
  // against them.
  if (room.phase === 'bluff_intercept_pending' && room.pendingBluffIntercept) {
    const accused = room.players.find((p) => p.id === room.pendingBluffIntercept.accusedId);
    if (accused?.isBot && accused.status === 'alive') {
      // Clinic: the bot-Shield demo scripts the arm; everything else passes.
      if (room.tutorialScenario) {
        return room.tutorialScenario.botArmsIntercept
          ? { kind: 'intercept_arm', botId: accused.id }
          : { kind: 'intercept_pass', botId: accused.id };
      }
      // Free play (sandbox, powers ON): defend only when it helps — the bot
      // actually lied AND holds an interceptable card. Anywhere else the bot has
      // no socket to defend, so it passes (no 8s stall).
      if (
        room.sandbox
        && shouldBotInterceptBluff(room, accused.id)
        && engine.listInterceptCards(room, accused.id).length > 0
      ) {
        return { kind: 'intercept_arm', botId: accused.id };
      }
      return { kind: 'intercept_pass', botId: accused.id };
    }
    return null;
  }

  // Free play: the bot is the Swap holder resolving a swap_pending pause — it
  // must pick a card from the played pile (the human picker has no analogue for
  // a bot). Clinic Swap is a learner-defence drill, never bot-held, so this is
  // free-play only.
  if (room.phase === 'swap_pending' && room.swapHolderId && room.sandbox && !room.tutorialScenario) {
    const holder = room.players.find((p) => p.id === room.swapHolderId);
    if (holder?.isBot && holder.status === 'alive') {
      return { kind: 'swap_pick', botId: holder.id };
    }
    return null;
  }

  // A bot is on the spot for a spin.
  if (room.phase === 'spin_pending' && room.spinTargetId) {
    const target = room.players.find((p) => p.id === room.spinTargetId);
    if (target?.isBot && target.status === 'alive') {
      // If a betting window is open, wait — its close re-broadcasts and re-arms us.
      if (room.betting && !room.betting.closed) return null;
      return { kind: 'spin', botId: target.id };
    }
    return null;
  }

  // A bot is the current player in normal play.
  if (room.phase === 'playing' && Array.isArray(room.turnOrder) && room.turnOrder.length > 0) {
    const currentId = room.turnOrder[room.currentTurnIndex];
    const current = room.players.find((p) => p.id === currentId);
    if (current?.isBot && current.status === 'alive') {
      // Inside a scripted clinic drill the bot does NOT free-play — it stays idle
      // unless the drill scripts it to CHALLENGE (the Assassin drill), so a stray
      // bot card can't derail the staged instance. The director owns the flow.
      if (room.tutorialScenario) {
        if (room.tutorialScenario.forceBotBluff && _botCanForceBluff(room, current.id)) {
          // (Module 4.1) Show a distinct "Dealer Bot calls bluff!" beat before the
          // Assassin strike resolves, so the challenge reads as its own moment.
          if (!room._clinicAssassinAnnounced) return { kind: 'force_bluff_announce', botId: current.id };
          return { kind: 'force_bluff', botId: current.id };
        }
        return null;
      }
      // Free play (sandbox, powers ON): open the turn by maybe ACTIVATING an
      // offensive power (Peek / Freeze / Assassin) BEFORE the card play. Only at
      // turn start (no card played, no bluff called yet); the engine ledger caps
      // it at one per turn, so the next beat falls through to play.
      if (room.sandbox && !room.cardPlayedThisTurn && !room.bluffUsedThisTurn) {
        const activation = chooseBotPowerActivation(room, current.id);
        if (activation) {
          return { kind: 'activate', botId: current.id, cardId: activation.cardId, power: activation.power };
        }
      }
      return { kind: room.cardPlayedThisTurn ? 'end' : 'play', botId: current.id };
    }
  }

  // Every other phase (pre_game, *_pending pauses, round_end, game_over, lobby)
  // is left to the human and the server's existing auto-resolve timers.
  return null;
}

// Stable per-beat key so repeated broadcasts inside one beat don't restack the
// timer, but a genuine progression re-arms a fresh one:
//   • cardPlayedThisTurn flips false→true between the play beat and the end beat;
//   • bluffUsedThisTurn flips false→true when the bot opens its turn by calling
//     a bluff, so the post-bluff "now play a card" beat re-arms distinctly.
function _botActionKey(action, room) {
  return [
    action.kind,
    action.botId,
    room.roundNumber || 0,
    room.currentTurnIndex,
    room.phase,
    room.cardPlayedThisTurn ? 1 : 0,
    room.bluffUsedThisTurn ? 1 : 0,
    // §free-play: an offensive activation flips this false→true, so the
    // post-activation "now play a card" beat re-arms distinctly (mirrors the
    // bluffUsedThisTurn trick for a post-challenge play).
    room.powerActivatedThisTurn ? 1 : 0,
    room.spinTargetId || '',
    room.swapHolderId || '',
  ].join(':');
}

/**
 * Idempotent. Arms (or re-arms on progression) the bot's next beat, or tears the
 * timer down when no bot action is pending. Safe to call on every broadcast and
 * on non-bot rooms (no-op when the room has no bots).
 */
function armBotTurn(io, room) {
  if (!room || !room.code) return;
  const code = room.code;

  // Seed this game's spontaneous bluff-call personality once play begins (sandbox
  // only). Cleared on replay (resetRoomForReplay / restart_room) so every game
  // gets a fresh random rate. Read by botStrategy.shouldCallBluff.
  if (room.sandbox && room.phase === 'playing' && typeof room.botCallRate !== 'number') {
    room.botCallRate = rollBotCallRate();
  }

  const action = _pendingBotAction(room);
  if (!action) {
    room._botActionKey = null;
    _clearBotTimer(code);
    return;
  }

  const key = _botActionKey(action, room);
  if (room._botActionKey === key && botTimers.has(code)) return;

  _clearBotTimer(code);
  room._botActionKey = key;
  // (Module 2.1) Clinic spins get a long read-the-coach pause; everything else
  // keeps its normal human-legible beat.
  const isClinicSpin = action.kind === 'spin'
    && room.isTutorial && room.tutorialLesson === 'powers';
  let delay;
  if (action.kind === 'spin') {
    delay = isClinicSpin ? CLINIC_BOT_SPIN_DELAY_MS : BOT_SPIN_DELAY_MS;
  } else if (action.kind === 'intercept_pass') {
    delay = BOT_INTERCEPT_DELAY_MS;
  } else if (action.kind === 'play') {
    // Random 4–12s "deciding what to play" pause.
    delay = _botPlayThinkDelay();
  } else {
    delay = BOT_MOVE_DELAY_MS;
  }
  const handle = setTimeout(() => {
    _onBotActExpire(io, code, key).catch((err) => {
      console.error('[bot] act handler failed', err);
    });
  }, delay);
  if (typeof handle.unref === 'function') handle.unref();
  botTimers.set(code, handle);
}

// Play a single card for the bot via the engine (NOT the socket handler — the bot
// has no socket). Returns true if a card was actually played. Mirrors the
// play_card_online handler's post-validate bookkeeping (Whot nomination +
// lastAction) so the human's client sees an identical "card played" beat.
function _botPlayCard(room, botId) {
  const choice = chooseCardPlay(room, botId);
  if (!choice || !choice.cardId) return false;

  const result = engine.validateAndPlayCard(room, botId, choice.cardId);
  if (!result.ok) return false;

  if (result.card?.shape === 'whot' && choice.nominatedShape) {
    room.currentCardType = choice.nominatedShape;
  }
  const bot = room.players.find((p) => p.id === botId);
  room.lastAction = {
    type: 'card_played_online',
    playerId: botId,
    playerName: bot?.username || null,
  };
  return true;
}

// End the bot's turn via the engine, mirroring the end_turn handler exactly:
// empty hand → the bot emptied its hand and wins; otherwise freeze-consume →
// advanceTurn → sudden-death tick → game-over check. Saves + broadcasts and
// fans out any freeze / sudden-death banners.
async function _botEndTurn(io, code, room) {
  const { broadcastRoomState } = require('./broadcast');
  const { maybeRecordGroupWinner } = require('./roomBuilders');

  const botId = room.turnOrder[room.currentTurnIndex];
  const bot = room.players.find((p) => p.id === botId);

  const hand = room.hands?.get(botId);
  if (hand && hand.length === 0) {
    // Online mode is single-round-per-game (#70): an emptied hand wins outright.
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: botId, winnerName: bot?.username || null };
    await maybeRecordGroupWinner(io, room, NOOP_LEADERBOARD_REPO);
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return;
  }

  const freezeTrigger = engine.consumeFreezeOnTurnEnd(room, botId);
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room._botPeekedChallengeable = null; // free-play Peek info doesn't outlive the turn
  engine.advanceTurn(room);
  const suddenDeathBanner = engine.tickSuddenDeath(room);

  const gameOverWinner = engine.checkGameOver(room);
  if (gameOverWinner) {
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
    await maybeRecordGroupWinner(io, room, NOOP_LEADERBOARD_REPO);
  }

  await saveRoom(room);
  await broadcastRoomState(io, code);
  if (freezeTrigger) io.to(code).emit('power_card_triggered', freezeTrigger);
  if (suddenDeathBanner) io.to(code).emit('power_card_triggered', suddenDeathBanner);
}

/**
 * Fired one beat after a bot move became due. Re-fetches the room and re-checks
 * the pending action (so a stale timer that fires after the human acted, or after
 * teardown, is a harmless no-op), then performs exactly one beat.
 */
async function _onBotActExpire(io, code, key) {
  const { broadcastRoomState } = require('./broadcast');
  const { applySpinAndBroadcast, _resolveOnlineBluff } = require('./orchestration');

  _clearBotTimer(code);
  const room = await getRoom(code);
  const action = _pendingBotAction(room);
  if (!action) return;
  // Guard against a stale timer: the action that's now pending must be the one we
  // armed for. (State may have moved on between arm and fire.)
  if (key && _botActionKey(action, room) !== key) return;

  room._botActionKey = null;

  if (action.kind === 'intercept_arm') {
    // Clinic bot-Shield demo: the bot arms its defence in response to the human's
    // challenge so the learner sees a power used against them. Mirrors the human
    // bluff_intercept "arm" path: arm → close window → resolve.
    const { _resolveOnlineBluff } = require('./orchestration');
    const pending = room.pendingBluffIntercept;
    const accuserId = pending?.accuserId || null;
    // Clinic scripts the first option; free play picks the best held defence
    // (Shield → Mirror → Swap) via the strategy.
    const optionCardId = room.tutorialScenario
      ? (pending?.options?.[0]?.cardId || null)
      : (chooseInterceptCard(room, action.botId) || pending?.options?.[0]?.cardId || null);
    _clearBluffInterceptTimer(code);
    const res = engine.armInterceptCard(room, action.botId, optionCardId);
    room.pendingBluffIntercept = null;
    room.phase = 'playing';
    if (res?.ok) {
      const bot = room.players.find((p) => p.id === action.botId);
      io.to(code).emit('power_card_triggered', {
        kind: 'bluff_intercept_armed',
        holderId: action.botId,
        holderName: bot?.username || null,
        power: res.power,
      });
    }
    if (!accuserId) {
      await saveRoom(room);
      await broadcastRoomState(io, code);
      return;
    }
    await _resolveOnlineBluff(io, code, room, accuserId, NOOP_LEADERBOARD_REPO);
    return;
  }

  if (action.kind === 'force_bluff_announce') {
    // (Module 4.1) Beat 1 of the Assassin strike: announce the bot's challenge on
    // its own, so the table reads "Dealer Bot calls bluff!" before the strike +
    // elimination land on the next beat.
    room._clinicAssassinAnnounced = true;
    const human = room.players.find((p) => p && !p.isBot) || null;
    room.lastAction = {
      type: 'tutorial_bot_challenge',
      accuserId: action.botId,
      accuserName: room.players.find((p) => p.id === action.botId)?.username || null,
      accusedId: human?.id || null,
      accusedName: human?.username || null,
    };
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return;
  }

  if (action.kind === 'force_bluff') {
    // Clinic-scripted challenge (Assassin drill): the bot calls bluff on the
    // human's honest play. NOT counted toward the Basics ≥2 guarantee.
    const { _resolveOnlineBluff } = require('./orchestration');
    room.bluffUsedThisTurn = true;
    await _resolveOnlineBluff(io, code, room, action.botId, NOOP_LEADERBOARD_REPO);
    return;
  }

  if (action.kind === 'intercept_pass') {
    // The bot declines to arm a defence; resolve the bluff exactly as the
    // bluff_intercept "pass" path does (clear the window, restore play, resolve).
    const accuserId = room.pendingBluffIntercept?.accuserId || null;
    _clearBluffInterceptTimer(code);
    room.pendingBluffIntercept = null;
    room.phase = 'playing';
    if (!accuserId) {
      await saveRoom(room);
      await broadcastRoomState(io, code);
      return;
    }
    await _resolveOnlineBluff(io, code, room, accuserId, NOOP_LEADERBOARD_REPO);
    return;
  }

  if (action.kind === 'activate') {
    // Free play: the bot proactively activates an offensive power at turn start.
    // Mirrors the activate_power_card handler (engine mutation + broadcast); Peek
    // is consumed-on-use and its revealed card is stashed so the bot's challenge
    // beat can act on a KNOWN card (a fair, in-game use of the power — not a peek
    // at hidden state).
    const res = engine.activatePowerCard(room, action.botId, action.cardId);
    if (res?.ok) {
      const bot = room.players.find((p) => p.id === action.botId);
      if (res.power === 'peek') {
        room._botPeekedChallengeable = res.peekedCard || null;
      }
      io.to(code).emit('power_card_triggered', {
        kind: 'bot_power_activated',
        holderId: action.botId,
        holderName: bot?.username || null,
        power: res.power,
      });
    }
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return;
  }

  if (action.kind === 'swap_pick') {
    // Free play: the bot is the Swap holder. Pick a card from the played pile and
    // resume the bluff, mirroring the swap_pick handler. Sandbox has no roles
    // (Sniper/Medic) or betting, so the resume is the lean spin/elim path.
    const accuserId = room.lastAction?.accuserId || null;
    const pickedCardId = chooseSwapPick(room);
    if (!accuserId || !pickedCardId) {
      room.swapHolderId = null;
      room.phase = 'playing';
      await saveRoom(room);
      await broadcastRoomState(io, code);
      return;
    }

    const { applyBluffOutcome, applyPostElimSystemHooks, _bountyOnElimination,
      _scheduleSpinPendingTimeout } = require('./orchestration');
    const { emitPowerCardEvents } = require('./broadcast');
    const E = engine.GAME_EVENT_TYPES;

    const { events, outcome } = bluffPipeline.resumeAfterSwap(room, accuserId, pickedCardId);
    room.swapHolderId = null;
    if (outcome?.type === E.BLUFF_ERROR) {
      room.phase = 'playing';
      await saveRoom(room);
      await broadcastRoomState(io, code);
      return;
    }

    applyBluffOutcome(room, outcome);
    if (outcome.type === E.FORCED_ELIMINATION) {
      if (outcome.eliminatedPlayerId) _bountyOnElimination(room, outcome.eliminatedPlayerId);
      applyPostElimSystemHooks(io, room);
    }
    if (room.phase === 'spin_pending') {
      _scheduleSpinPendingTimeout(io, code, NOOP_LEADERBOARD_REPO);
    }
    await saveRoom(room);
    emitPowerCardEvents(io, code, events);
    await broadcastRoomState(io, code);
    return;
  }

  if (action.kind === 'spin') {
    const player = room.players.find((p) => p.id === action.botId);
    if (!player || player.status !== 'alive') return;
    // We're taking the spin now — cancel the spin_pending auto-resolve safety net
    // (mirrors the player_spin handler) and run the shared spin pipeline.
    _clearSpinPendingTimer(code);
    await applySpinAndBroadcast(io, code, room, player, NOOP_LEADERBOARD_REPO);
    return;
  }

  if (action.kind === 'play') {
    // Open the turn by maybe CHALLENGING the previous player (once per turn,
    // before playing a card). Mirrors the call_bluff handler: stamp the ledger
    // flag, then run the shared resolver (which sets spin_pending + broadcasts).
    // After it resolves (a spin lands on the bot or the human), the bot's turn
    // continues on the next beat — bluffUsedThisTurn is now set, so it can't
    // bluff again and will just play a card.
    if (shouldCallBluff(room, action.botId)) {
      room.bluffUsedThisTurn = true;
      // Tutorial "≥2 calls per game" guarantee reads this counter (botStrategy).
      room.botBluffCallsThisGame = (room.botBluffCallsThisGame || 0) + 1;
      await _resolveOnlineBluff(io, code, room, action.botId, NOOP_LEADERBOARD_REPO);
      return;
    }

    const played = _botPlayCard(room, action.botId);
    if (!played) {
      // Nothing playable (only power cards / empty) — don't stall; end the turn.
      await _botEndTurn(io, code, room);
      return;
    }
    await saveRoom(room);
    await broadcastRoomState(io, code);
    return;
  }

  // action.kind === 'end'
  await _botEndTurn(io, code, room);
}

module.exports = {
  armBotTurn,
  _pendingBotAction,
  _onBotActExpire,
  _roomHasBots,
  BOT_MOVE_DELAY_MS,
  BOT_SPIN_DELAY_MS,
  BOT_PLAY_THINK_MIN_MS,
  BOT_PLAY_THINK_MAX_MS,
};
