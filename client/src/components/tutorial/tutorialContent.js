// ============================================================
// TUTORIAL — Content + contextual coaching logic (pure)
// ============================================================
// No React here. INTRO_SLIDES is the stepped welcome walkthrough; coachFor()
// maps the current game state to the single most relevant tip. Keeping this
// pure makes the (otherwise stateful) tutorial trivially unit-testable and keeps
// all the player-facing copy in one editable place.

export const BOT_NAME = 'Dealer Bot';

// ─── Intro walkthrough — a few slides before the first deal ──────────────────
// Plain data: the modal renders title + body (+ an optional bullet list). The
// final slide's primary action ("Begin practice") deals the cards.
export const INTRO_SLIDES = [
  {
    id: 'welcome',
    title: 'The Practice Table',
    body: `Welcome. This is a solo round against ${BOT_NAME} — a safe table where nothing counts. We'll walk you through a real game one beat at a time.`,
  },
  {
    id: 'controls',
    title: 'Where Things Live',
    body: 'First, a quick tour of the table controls — you’ll use these in real games:',
    // Rendered as a small icon grid by the intro modal (a visual cue, not a bullet list).
    controls: [
      { icon: 'gear', label: 'Settings', where: 'Top-right gear — house rules, sound, and Leave Table.' },
      { icon: 'chat', label: 'Chat', where: 'Header button — talk to the table during a real game.' },
      { icon: 'trophy', label: 'Leaderboard', where: 'In group games — standings live in the Controls menu.' },
    ],
  },
  {
    id: 'goal',
    title: 'The Goal',
    body: 'Bluff is last-player-standing. Two ways the round moves:',
    points: [
      'Empty your hand to win the round.',
      'Survive the gun — a wrong move can put you on the spot.',
    ],
  },
  {
    id: 'turn',
    title: 'Each Turn',
    body: 'A required shape sits on the table. On your turn you play one card:',
    points: [
      'Play a card that MATCHES the shape — an honest play.',
      "Or play one that doesn't and hope nobody notices — a bluff.",
      'Nobody sees your card unless someone calls your bluff.',
    ],
  },
  {
    id: 'bluff',
    title: 'Calling a Bluff',
    body: 'Suspicious of the last card played? Call Bluff to flip it face-up.',
    points: [
      'They lied → THEY spin the gun.',
      'They were honest → YOU spin instead.',
      "The round's first card can't be challenged.",
    ],
  },
  {
    id: 'gun',
    title: 'The Gun',
    body: 'Every player has a 6-slot revolver with one bullet. On a spin the chamber turns and lands on a slot.',
    points: [
      'Land on the bullet → eliminated.',
      'Survive → a NEW bullet is added for next time.',
      'It only ever gets deadlier. Pick your challenges well.',
    ],
  },
  {
    id: 'ready',
    title: "You're Ready",
    body: `Press Begin and we'll deal you in against ${BOT_NAME}. A guide at the top of the table will tell you what to do at each step. You can reopen these notes any time from the “Guide” button.`,
    cta: 'Begin practice',
  },
];

// Extra slide for the Power Cards lesson, inserted before the final "ready" slide.
const POWERS_SLIDE = {
  id: 'powers',
  title: 'Power Cards',
  body: 'This round mixes two power cards into the deck. You start holding one in a slot beside your hand:',
  points: [
    'Peek — privately see the last card played before you decide.',
    'Shield — block the next bluff called against you.',
    'Tap your power card on your turn to use it (you hold one at a time).',
  ],
};

// Display labels for the power keys the coach references.
const POWER_LABELS = {
  shield: 'Shield', mirror: 'Mirror', swap: 'Swap',
  peek: 'Peek', freeze: 'Freeze', assassin: 'Assassin',
};

// ─── Power Clinic — scripted before/after coaching ────────────────────────────
// The Powers lesson runs as a clinic: each drill stages the exact moment one
// power is needed. `room.tutorialScenario` carries { power, actor, step, index,
// total }; clinicCoachFor maps that to the tip — `intro` tells the learner WHY +
// HOW to use it now, `resolved` explains WHAT just happened (including when the
// bot uses one). Pure copy, keyed by a `${power}:${actor}` slug.
const CLINIC_COACH = {
  'peek:player': {
    intro: { tone: 'action', title: 'Peek — look before you leap',
      body: `It's your turn, but did ${BOT_NAME} play honestly? Tap your Peek card in the Power slot beside your hand to secretly see its last card.` },
    resolved: { tone: 'info', title: "That's Peek",
      body: `You alone saw the real card — now you'd know if a challenge is safe. Peek is spent after one look.` },
  },
  'freeze:player': {
    intro: { tone: 'action', title: 'Freeze — skip their turn',
      body: `Freeze is an offensive power, so you arm it BEFORE you play: tap your Freeze card first, then play any card, then End Turn. ${BOT_NAME} loses its very next turn.` },
    resolved: { tone: 'info', title: 'Frozen out',
      body: `${BOT_NAME}'s next turn just got skipped — you stole the tempo. Freeze triggers once, then it's gone.` },
  },
  'shield:player': {
    play: { tone: 'action', title: 'Your turn — bluff it',
      body: `None of your cards match the shape, so any play is a bluff. Play one face-down, then End Turn. Don't arm your Shield yet — defensive powers fire when you're challenged, so you'll use it the moment ${BOT_NAME} calls your bluff.` },
    intro: { tone: 'danger', title: 'Caught — Shield up!',
      body: `${BOT_NAME} called your bluff! Tap your Shield (highlighted) to block the challenge completely.` },
    resolved: { tone: 'win', title: 'Blocked!',
      body: `Shield cancelled the bluff outright — no spin, no risk. It blocks one challenge, then it's spent.` },
  },
  'shield:bot': {
    intro: { tone: 'action', title: 'Now challenge the bot',
      body: `${BOT_NAME} just played. Hit Call Bluff — then watch how it defends itself.` },
    resolved: { tone: 'info', title: 'The bot shielded',
      body: `Even though your call was right, ${BOT_NAME} armed a Shield and blocked it — no spin. Powers work for the bot too, so read the table.` },
  },
  'mirror:player': {
    play: { tone: 'action', title: 'Your turn — bluff it',
      body: `None of your cards match the shape, so any play is a bluff. Play one face-down, then End Turn. Don't arm your Mirror yet — defensive powers fire when you're challenged, so you'll use it the moment ${BOT_NAME} calls your bluff.` },
    intro: { tone: 'danger', title: 'Bounce it back',
      body: `${BOT_NAME} called your bluff! Tap your Mirror (highlighted) to reflect the spin straight back onto ${BOT_NAME} instead of you.` },
    resolved: { tone: 'win', title: 'Reflected!',
      body: `Mirror sent the spin to ${BOT_NAME} — they're on the spot now, not you. One use, then it's spent.` },
  },
  'swap:player': {
    play: { tone: 'action', title: 'Your turn — bluff it',
      body: `None of your cards match the shape, so any play is a bluff. Play one face-down, then End Turn. Don't arm your Swap yet — defensive powers fire when you're challenged, so you'll use it the moment ${BOT_NAME} calls your bluff.` },
    intro: { tone: 'danger', title: 'Swap the evidence',
      body: `${BOT_NAME} called your bluff! Tap Swap (highlighted), then pick the matching card from the table to switch with your played card — making your play honest after all.` },
    resolved: { tone: 'win', title: 'Swapped!',
      body: `Your played card became a match, so the bluff failed — ${BOT_NAME} spins instead. Swap re-faces your card once.` },
  },
  'assassin:player': {
    intro: { tone: 'action', title: 'Assassin — bait the trap',
      body: `Tap your Assassin to arm it, play a card that MATCHES the shape (an honest play), then End Turn. If ${BOT_NAME} recklessly challenges you…` },
    resolved: { tone: 'win', title: 'Struck!',
      body: `${BOT_NAME} challenged your honest play — and your Assassin eliminated it on the spot. A wrong challenge against an armed Assassin is fatal. That's every power — clinic complete!` },
  },
};

/**
 * The coaching tip for the active clinic drill. `scenario` is the serialized
 * room.tutorialScenario ({ power, actor, step, index, total }); returns
 * { key, tone, title, body } or null.
 */
// Shown when the learner taps their (dimmed) defensive power card too early — i.e.
// during the "play a bluff + end turn" step of a Shield/Mirror/Swap drill, before
// the bot's challenge opens the defence window. Mirrors the server block in
// `activatePowerCard` so pre-arming can never stall the clinic.
export const DEFENSE_PREARM_HINT = `Not yet — defensive powers fire when you're challenged. Play a card and End Turn first; the instant ${BOT_NAME} calls your bluff, that's when you defend.`;

/**
 * True while a defensive drill is waiting on the learner to play + end their turn
 * (BEFORE the bot's challenge opens the intercept window). In this window the
 * staged Shield/Mirror/Swap must not be armed yet — the client dims it and the
 * server refuses early activation. Pure read of the serialized scenario + phase.
 */
export function isDefensivePreArmLocked(scenario, phase) {
  return !!scenario
    && scenario.expect === 'play_then_defend'
    && scenario.step !== 'resolved'
    && phase === 'playing';
}

/**
 * Power-Clinic End-Turn gate (client mirror of the server `clinicEndTurnBlock`):
 * the learner must do the drill's scripted action before ending their turn.
 * Returns a coach-hint string to BLOCK End Turn, or null to allow.
 * `flags` = { cardPlayedThisTurn, bluffUsedThisTurn, powerActivatedThisTurn }.
 * play_then_defend needs only a card play (the End Turn button already requires
 * that), so it returns null. Inert outside an active (intro-step) clinic drill.
 */
/**
 * Power-Clinic play-a-card lock (client mirror of the server `clinicActionBlock`
 * for `play_card`): returns a coach-hint string to BLOCK a card play that isn't
 * the drill's scripted action, or null to allow. Keeps the learner from breaking
 * the lesson by tapping a card when they should Call Bluff / use a power first.
 * `flags` = { powerActivatedThisTurn }. Inert outside an active clinic drill, so
 * normal play is never blocked.
 */
export function clinicCardPlayLock(scenario, flags = {}) {
  if (!scenario || scenario.step === 'resolved') return null;
  const power = scenario.power ? scenario.power[0].toUpperCase() + scenario.power.slice(1) : 'power';
  if (scenario.expect === 'call_bluff') {
    return `Call ${BOT_NAME}'s bluff first — that's this drill. Don't play a card yet.`;
  }
  if ((scenario.expect === 'use_power' || scenario.expect === 'arm_then_play') && !flags.powerActivatedThisTurn) {
    return `Use your ${power} first — tap it in the slot beside your hand before playing a card.`;
  }
  return null;
}

export function clinicEndTurnLock(scenario, flags = {}) {
  if (!scenario || scenario.step === 'resolved') return null;
  const power = scenario.power ? scenario.power[0].toUpperCase() + scenario.power.slice(1) : 'power';
  if (scenario.expect === 'call_bluff' && !flags.bluffUsedThisTurn) {
    return `Call ${BOT_NAME}'s bluff first — that's this drill.`;
  }
  if (scenario.expect === 'use_power' && !flags.powerActivatedThisTurn) {
    return `Use your ${power} first.`;
  }
  if (scenario.expect === 'arm_then_play' && !flags.powerActivatedThisTurn) {
    return `Arm your ${power} first, then play a card and End Turn.`;
  }
  return null;
}

export function clinicCoachFor(scenario, ctx = {}) {
  if (!scenario || !scenario.power) return null;
  const slug = `${scenario.power}:${scenario.actor || 'player'}`;
  const entry = CLINIC_COACH[slug] || CLINIC_COACH[`${scenario.power}:player`];
  if (!entry) return null;
  // Defensive full-loop drills speak in two intro beats: a "play a bluff + end
  // turn" prompt BEFORE the bot challenges, then the "arm your defence" prompt
  // once the intercept window opens.
  let stepName;
  if (scenario.step === 'resolved') stepName = 'resolved';
  else if (scenario.expect === 'play_then_defend' && entry.play && ctx.phase !== 'bluff_intercept_pending') {
    stepName = 'play';
  } else stepName = 'intro';
  const tip = entry[stepName];
  // "Power N of M" counts only player-facing drills (the bot demo has no number).
  const n = scenario.playerStep ?? null;
  const total = scenario.playerTotal ?? null;
  const counter = n && total ? `Power ${n} of ${total} · ` : '';
  return {
    key: `clinic-${slug}-${stepName}`,
    tone: tip.tone,
    title: `${counter}${tip.title}`,
    body: tip.body,
  };
}

// One-line "what this power does" for the per-drill briefing pop-up shown BEFORE
// the staged instance (the learner taps "Got it" to enter it).
const CLINIC_BRIEFING = {
  shield: `Shield blocks a bluff called against you — completely. No spin, no risk. We'll put you in a spot where ${BOT_NAME} calls your bluff so you can use it.`,
  peek: `Peek lets you secretly look at ${BOT_NAME}'s last card before you decide. Information wins games.`,
  freeze: `Freeze skips ${BOT_NAME}'s next turn — arm it, play a card, end your turn, and steal the tempo.`,
  mirror: `Mirror reflects a spin back onto whoever challenged you. ${BOT_NAME} wanted you on the spot — now it is.`,
  swap: `Swap switches your played card with one on the table, turning a caught bluff into an honest play.`,
  assassin: `Assassin punishes a reckless challenge: arm it, play honestly, and a wrong bluff-call eliminates the challenger outright.`,
};

/**
 * The briefing pop-up for a drill: { title, body } or null. Player drills are
 * titled "Power Card N: <Name>"; the bot demo gets a framing title instead.
 */
export function clinicBriefingFor(scenario) {
  if (!scenario || !scenario.power) return null;
  const label = POWER_LABELS[scenario.power] || 'Power';
  if ((scenario.actor || 'player') === 'bot') {
    return {
      title: 'The bot’s side',
      body: `Powers aren’t just yours. Challenge ${BOT_NAME} here — and watch it defend itself with a ${label}.`,
    };
  }
  const n = scenario.playerStep;
  const total = scenario.playerTotal;
  const num = n ? `Power Card ${n}${total ? ` of ${total}` : ''}: ` : '';
  return { title: `${num}${label}`, body: CLINIC_BRIEFING[scenario.power] || '' };
}

// Shown on the felt the moment a Basics practice round ends, just before the bot
// ushers the learner into the Power Clinic.
export const BASICS_HANDOFF_COACH = {
  key: 'basics-handoff',
  tone: 'win',
  title: 'Nice — that’s the core loop',
  body: `Play, bluff, spin, survive. Now ${BOT_NAME} will deal you into the Power Cards lesson…`,
};

// Shown once every clinic drill is done.
export const CLINIC_COMPLETE_COACH = {
  key: 'clinic-complete',
  tone: 'win',
  title: 'You’ve learned the powers! 🎉',
  body: 'Peek, Freeze, Shield, Mirror, Swap, Assassin — you’ve used them all. Play again to practise, or jump into a real game.',
};

// The intro deck for a given lesson. 'powers' splices the Power Cards slide in
// just before the closing "ready" slide; everything else gets the basics deck.
export function introSlidesFor(lesson) {
  if (lesson === 'powers') {
    return [...INTRO_SLIDES.slice(0, -1), POWERS_SLIDE, INTRO_SLIDES[INTRO_SLIDES.length - 1]];
  }
  return INTRO_SLIDES;
}

// Tone drives the coach card's accent colour in the layer.
//   'info'   — neutral teaching
//   'action' — it's on you to do something now
//   'danger' — a spin / on-the-spot moment
//   'win'    — round over

/**
 * The one coaching tip to show for the current game state. Returns
 *   { key, tone, title, body }  or null (no coach — e.g. lobby / pre-deal,
 * where the intro modal is in charge).
 *
 * ctx fields (all optional, defensively defaulted):
 *   phase, isMyTurn, cardPlayedThisTurn, bluffUsedThisTurn, isFirstTurn,
 *   bluffBlockedThisTurn, spinTargetIsMe, currentPlayerName, spinTargetName,
 *   amWinner, winnerName, eliminated
 */
export function coachFor(ctx = {}) {
  const {
    phase,
    isMyTurn = false,
    cardPlayedThisTurn = false,
    bluffUsedThisTurn = false,
    isFirstTurn = false,
    bluffBlockedThisTurn = false,
    spinTargetIsMe = false,
    spinTargetName = null,
    amWinner = false,
    winnerName = null,
    eliminated = false,
    heldPowerLabel = null,
    amAccusedIntercept = false,
  } = ctx;

  // Power Cards lesson — a defensive-power holder being bluff-called can block it.
  if (phase === 'bluff_intercept_pending') {
    if (amAccusedIntercept) {
      return {
        key: 'intercept-defend',
        tone: 'danger',
        title: 'Block it!',
        body: `${BOT_NAME} called bluff on your card. Arm your ${heldPowerLabel || 'defence'} to block it — or pass to let the bluff resolve.`,
      };
    }
    return {
      key: 'intercept-wait',
      tone: 'info',
      title: 'Defence window',
      body: `${BOT_NAME} is deciding whether to block your challenge…`,
    };
  }

  // Appended to the on-turn tips when the player is holding a power card.
  const powerNote = heldPowerLabel
    ? ` You also hold a ${heldPowerLabel} — tap it beside your hand to use it.`
    : '';
  // The turn-action rule: all three are optional and order-free, but a card MUST
  // be played before the turn can end.
  const turnRules = ' This turn you may play a card, call a bluff, and arm a power — in any order — but you must play a card before you can End Turn.';

  if (phase === 'pre_game') {
    return {
      key: 'dealing',
      tone: 'info',
      title: 'Dealing you in…',
      body: `You're being dealt 6 cards. Watch for the required shape on the table — that's what an honest play has to match.`,
    };
  }

  if (phase === 'spin_pending') {
    if (spinTargetIsMe) {
      return {
        key: 'spin-me',
        tone: 'danger',
        title: "You're on the spot",
        body: 'Pull the trigger below to spin the chamber. Survive and you play on — a fresh bullet just gets added.',
      };
    }
    return {
      key: 'spin-bot',
      tone: 'danger',
      title: `${spinTargetName || BOT_NAME} is on the spot`,
      body: 'The chamber spins. Land on the bullet and they’re out; survive and the gun gets one bullet heavier.',
    };
  }

  if (phase === 'redemption_pending') {
    return {
      key: 'redemption',
      tone: 'danger',
      title: 'A second chance',
      body: 'An eliminated player gets one redemption spin. Survive it and they re-enter the round.',
    };
  }

  if (phase === 'playing') {
    if (eliminated) {
      return {
        key: 'spectating',
        tone: 'info',
        title: 'You’re out — spectate',
        body: `Spectate the rest of the round. Notice when ${BOT_NAME} plays honestly vs. bluffs.`,
      };
    }
    if (isMyTurn) {
      if (cardPlayedThisTurn) {
        return {
          key: 'end-turn',
          tone: 'action',
          title: 'End your turn',
          body: `Now press End Turn to pass play to ${BOT_NAME}.`,
        };
      }
      if (isFirstTurn) {
        return {
          key: 'first-play',
          tone: 'action',
          title: 'Your lead — play a card',
          body: 'You play first this round, so there’s nothing to challenge yet. Tap a card to play it (matching the shape is the safe move).' + powerNote + turnRules,
        };
      }
      if (bluffBlockedThisTurn) {
        return {
          key: 'play-only',
          tone: 'action',
          title: 'Your move — play a card',
          body: 'No card to challenge this turn — just play a card from your hand.',
        };
      }
      return {
        key: 'play-or-bluff',
        tone: 'action',
        title: 'Your move — play or call',
        body: `Play a card that matches the shape — or, if you think ${BOT_NAME} just bluffed, hit Call Bluff to flip its card. Right → it spins. Wrong → you do.` + powerNote + turnRules,
      };
    }
    // Bot's turn.
    return {
      key: 'bot-turn',
      tone: 'info',
      title: `${BOT_NAME}’s turn — watch`,
      body: `Watch what it puts down. On your next turn you can Call Bluff if you think it didn't match the shape.`,
    };
  }

  if (phase === 'round_end' || phase === 'game_over') {
    return {
      key: 'over',
      tone: 'win',
      title: amWinner ? 'You win! 🎉' : `${winnerName || BOT_NAME} takes it`,
      body: amWinner
        ? 'You carried a full practice round. Play again to try the bluff calls, or jump into a real game.'
        : `That's the loop: play, bluff, spin, survive. Play again — you'll read ${BOT_NAME} better next time.`,
    };
  }

  return null;
}

/**
 * Build the coachFor context from a serialized roomState + the local player's id.
 * Centralised so the component and tests derive state identically.
 */
export function coachContextFromRoom(roomState, myPlayerId) {
  if (!roomState) return {};
  const me = (roomState.players || []).find((p) => p.id === myPlayerId) || null;
  const winnerId = roomState.lastAction?.winnerId || null;
  return {
    phase: roomState.phase,
    isMyTurn: roomState.currentPlayerId === myPlayerId,
    cardPlayedThisTurn: !!roomState.cardPlayedThisTurn,
    bluffUsedThisTurn: !!roomState.bluffUsedThisTurn,
    isFirstTurn: !!roomState.isFirstTurn,
    bluffBlockedThisTurn: !!roomState.bluffBlockedThisTurn,
    spinTargetIsMe: roomState.spinTargetId === myPlayerId,
    spinTargetName: (roomState.players || []).find((p) => p.id === roomState.spinTargetId)?.username || null,
    amWinner: winnerId === myPlayerId,
    winnerName: roomState.lastAction?.winnerName || null,
    eliminated: me?.status === 'eliminated',
    // Power Cards lesson — what the player is holding + whether they're the one
    // being bluff-called (so the coach can prompt a block).
    heldPowerLabel: POWER_LABELS[roomState.myPowerCardSlot?.[0]?.power] || null,
    amAccusedIntercept: roomState.phase === 'bluff_intercept_pending'
      && !!roomState.pendingBluffIntercept?.amAccused,
  };
}
