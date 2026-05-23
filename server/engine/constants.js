// ============================================================
// ENGINE — Shared constants + room-config normalisation
// ============================================================
// Pure data. Importable from anywhere in the engine without
// risking a cycle. Anything that's purely a value (number, string,
// frozen lookup, default-shape factory) belongs here.

const CARD_TYPES = ['square', 'circle', 'triangle', 'cross', 'star'];
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const MAX_PLAYERS = 15;
const CHAMBER_SIZE = 6;

// ─── v2 Phase D — Secret roles ───────────────────────────────
const ROLES = {
  BAREHAND: 'barehand',
  GAMBLER: 'gambler',
  SHERIFF: 'sheriff',
  MEDIC: 'medic',
  SABOTEUR: 'saboteur',
  SNIPER: 'sniper',
  COLLECTOR: 'collector',
};
const ROLE_TYPES = Object.values(ROLES);
const ROLES_AT_MIN_ALIVE = 9;
const COLLECTOR_POWER_CARD_CAP = 3;
// v2 #120 — Medic may revive at most this many eliminations per game
// (tracked per-player as `medicSavesUsed`, enforced in roles.js +
// handlers/roles.js). A 4th attempt is rejected server-side.
const MEDIC_MAX_SAVES = 3;
// #142 — a Medic save costs +2 cards, so it is refused once the Medic's hand
// is already this large. Sized to the 6-shape-card starting hand (#139) plus
// the 2-card save cost: a Medic CAN save from a fresh starting hand, but must
// play cards down before stacking another save. (Previously hard-coded to 6,
// which silently blocked every Medic the moment the deal grew to 6 shapes.)
const MEDIC_SAVE_HAND_CAP = 8;

// ─── v2 Phase G — Pre-game selection & role reveal (#116) ────
// How long the private role-reveal card lingers before the server
// opens the selection window. Selection then auto-resolves after
// PRE_GAME_SELECTION_TIMEOUT_MS for any player who hasn't picked.
const ROLE_REVEAL_DISPLAY_MS = 2000;
const PRE_GAME_SELECTION_TIMEOUT_MS = 15000;
// Playtest §2.1 — the 15s window always runs to completion (no quick-skip when
// the last player confirms). A pick made at/after the 12s mark is "late": the
// picker earns a private 5s review buffer to look at what they drew, and is
// deprioritised off the very first active turn so they aren't on the clock
// while reviewing.
const PRE_GAME_LATE_THRESHOLD_MS = 12000;
const PRE_GAME_LATE_REVIEW_MS = 5000;

const CARD_TYPES_DISCRIMINATOR = {
  SHAPE: 'shape',
  POWER: 'power',
};
const POWER_TYPES = ['shield', 'mirror', 'swap', 'peek', 'freeze', 'assassin'];

// §1.1 — Bluff interception window. When a bluff is called, an accused who
// still holds an un-armed DEFENSIVE power card gets a short window to arm it in
// response, BEFORE resolution runs. Only reactive/defensive powers qualify:
// shield (blocks), mirror (reflects), swap (re-faces the played card). Assassin
// is offensive and freeze/peek have no bluff-time effect, so they're excluded.
const INTERCEPTABLE_POWERS = ['shield', 'mirror', 'swap'];
const BLUFF_INTERCEPT_WINDOW_MS = 8000;

// ─── v2 #119 — Unified Event Resolution Engine ───────────────
//
// `bluffPipeline.js` resolves every bluff by pushing a single typed
// `GameEvent` through an ordered `ResolutionQueue`. The queue has
// exactly six priority tiers; no tier runs until the previous one has
// fully resolved. Priority is declarative (the tier number) rather
// than implicit in array position — there are no pairwise card-vs-card
// overrides. Clashes that used to be encoded by stage ordering (e.g.
// "Assassin > Mirror") are now expressed through event flags: a
// non-`redirectable` event is one that Tier-4 redirectors (Mirror,
// Sniper) must leave untouched.
const RESOLUTION_TIERS = {
  PREVENTION: 1,      // Shield, Freeze — cancel the bluff outright
  MODIFICATION: 2,    // Swap, Peek — mutate the played card / pause
  BLUFF_VALIDATION: 3,// Determine truth of the played card + type the consequence
  REDIRECTION: 4,     // Mirror, Sniper — retarget a redirectable consequence
  CONSEQUENCE: 5,     // Spin, Assassin (FORCED_ELIMINATION) — materialise it
  POST_RESOLUTION: 6, // Medic, Bounty, Role effects, Announcements
};

// Typed `GameEvent.type` values. Each tier handler receives a
// `GameEvent` and returns the same event (pass-through), a mutated /
// re-typed event, or `null` (event cancelled / consumed).
const GAME_EVENT_TYPES = {
  BLUFF_CALLED: 'BLUFF_CALLED',           // initial, not-yet-typed event
  SPIN_CONSEQUENCE: 'SPIN_CONSEQUENCE',   // someone spins the chamber
  FORCED_ELIMINATION: 'FORCED_ELIMINATION', // Assassin strike — non-redirectable
  ASSASSIN_BACKFIRE: 'ASSASSIN_BACKFIRE', // correct call vs Assassin → +N penalty
  BLUFF_BLOCKED: 'BLUFF_BLOCKED',         // Shield — bluff never registers
  SWAP_PENDING: 'SWAP_PENDING',           // Swap — pause for the holder's pick
  BLUFF_ERROR: 'BLUFF_ERROR',             // resume-time invariant violation
};

/**
 * @typedef {Object} GameEvent
 * @property {string}  type         One of GAME_EVENT_TYPES.
 * @property {boolean} redirectable false ⇒ Mirror / Sniper cannot retarget it.
 * @property {boolean} preventable  false ⇒ Shield / Freeze cannot cancel it.
 * @property {string|null} source   playerId who triggered the effect.
 * @property {string|null} target   playerId the effect lands on.
 * @property {Object}  payload      effect-specific data carried to the caller.
 */

const MODES = {
  PHYSICAL: 'physical',
  ONLINE: 'online',
};

// ─── Chat ────────────────────────────────────────────────────
const CHAT_LOG_MAX = 50;
const CHAT_TEXT_MAX = 500;

// ─── Modifier thresholds ─────────────────────────────────────
const BOUNTY_THRESHOLD = 3;
const BETTING_STREAK_REWARD = 3;
const BETTING_WINDOW_MS = 10_000;
const DMH_VOTE_WINDOW_MS = 15_000;
const DMH_THRESHOLD_MARGIN = 2;
const SUDDEN_DEATH_THRESHOLD = 4;

// ─── v2 config defaults ───────────────────────────────────────
function defaultRoomConfig() {
  return {
    version: 1,
    powerCards: {
      enabled: {
        shield: false,
        mirror: false,
        swap: false,
        peek: false,
        freeze: false,
        assassin: false,
      },
      copiesPerDeck: 1,
    },
    riskModifiers: {
      doubleBarrel: false,
      russianRoulette: false,
      hotPotato: false,
      redemptionSpin: false,
    },
    roomModifiers: {
      speedMode: false,
      suddenDeath: false,
      mirrorMatch: false,
    },
    systems: {
      bounty: false,
      betting: false,
      deadMansHand: false,
      lastStand: false,
    },
  };
}

function normalizeRoomConfig(input) {
  const base = defaultRoomConfig();
  if (!input || typeof input !== 'object') return base;

  const version = Number(input.version);
  if (Number.isFinite(version) && version >= 1) {
    base.version = Math.floor(version);
  }

  const pickBool = (val, fallback) => (typeof val === 'boolean' ? val : fallback);

  if (input.powerCards && typeof input.powerCards === 'object') {
    const inEnabled = input.powerCards.enabled || {};
    Object.keys(base.powerCards.enabled).forEach((k) => {
      base.powerCards.enabled[k] = pickBool(inEnabled[k], base.powerCards.enabled[k]);
    });
    const copies = Number(input.powerCards.copiesPerDeck);
    if (Number.isFinite(copies)) {
      base.powerCards.copiesPerDeck = Math.max(1, Math.min(2, Math.floor(copies)));
    }
  }

  ['riskModifiers', 'roomModifiers', 'systems'].forEach((section) => {
    const incoming = input[section];
    if (incoming && typeof incoming === 'object') {
      Object.keys(base[section]).forEach((k) => {
        base[section][k] = pickBool(incoming[k], base[section][k]);
      });
    }
  });

  return base;
}

module.exports = {
  CARD_TYPES,
  SHAPES,
  MAX_PLAYERS,
  CHAMBER_SIZE,
  ROLES,
  ROLE_TYPES,
  ROLES_AT_MIN_ALIVE,
  COLLECTOR_POWER_CARD_CAP,
  MEDIC_MAX_SAVES,
  MEDIC_SAVE_HAND_CAP,
  ROLE_REVEAL_DISPLAY_MS,
  PRE_GAME_SELECTION_TIMEOUT_MS,
  PRE_GAME_LATE_THRESHOLD_MS,
  PRE_GAME_LATE_REVIEW_MS,
  CARD_TYPES_DISCRIMINATOR,
  POWER_TYPES,
  INTERCEPTABLE_POWERS,
  BLUFF_INTERCEPT_WINDOW_MS,
  RESOLUTION_TIERS,
  GAME_EVENT_TYPES,
  MODES,
  CHAT_LOG_MAX,
  CHAT_TEXT_MAX,
  BOUNTY_THRESHOLD,
  BETTING_STREAK_REWARD,
  BETTING_WINDOW_MS,
  DMH_VOTE_WINDOW_MS,
  DMH_THRESHOLD_MARGIN,
  SUDDEN_DEATH_THRESHOLD,
  defaultRoomConfig,
  normalizeRoomConfig,
};
