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
        title: 'You’re out — watch and learn',
        body: `Spectate the rest of the round. Notice when ${BOT_NAME} plays honestly vs. bluffs.`,
      };
    }
    if (isMyTurn) {
      if (cardPlayedThisTurn) {
        return {
          key: 'end-turn',
          tone: 'action',
          title: 'Card played',
          body: `Now press End Turn to pass play to ${BOT_NAME}.`,
        };
      }
      if (isFirstTurn) {
        return {
          key: 'first-play',
          tone: 'action',
          title: 'Your turn — you lead',
          body: 'You play first this round, so there’s nothing to challenge yet. Tap a card to play it (matching the shape is the safe move).' + powerNote,
        };
      }
      if (bluffBlockedThisTurn) {
        return {
          key: 'play-only',
          tone: 'action',
          title: 'Your turn',
          body: 'No card to challenge this turn — just play a card from your hand.',
        };
      }
      return {
        key: 'play-or-bluff',
        tone: 'action',
        title: 'Your turn',
        body: `Play a card that matches the shape — or, if you think ${BOT_NAME} just bluffed, hit Call Bluff to flip its card. Right → it spins. Wrong → you do.` + powerNote,
      };
    }
    // Bot's turn.
    return {
      key: 'bot-turn',
      tone: 'info',
      title: `${BOT_NAME} is playing`,
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
