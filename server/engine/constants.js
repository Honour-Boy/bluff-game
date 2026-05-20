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

// ─── v2 Phase G — Pre-game selection & role reveal (#116) ────
// How long the private role-reveal card lingers before the server
// opens the selection window. Selection then auto-resolves after
// PRE_GAME_SELECTION_TIMEOUT_MS for any player who hasn't picked.
const ROLE_REVEAL_DISPLAY_MS = 2000;
const PRE_GAME_SELECTION_TIMEOUT_MS = 15000;

const CARD_TYPES_DISCRIMINATOR = {
  SHAPE: 'shape',
  POWER: 'power',
};
const POWER_TYPES = ['shield', 'mirror', 'swap', 'peek', 'freeze', 'assassin'];

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
  ROLE_REVEAL_DISPLAY_MS,
  PRE_GAME_SELECTION_TIMEOUT_MS,
  CARD_TYPES_DISCRIMINATOR,
  POWER_TYPES,
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
