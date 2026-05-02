// ============================================================
// GAME ENGINE — Pure in-memory game logic, no I/O side effects
// ============================================================

const CARD_TYPES = ['square', 'circle', 'triangle', 'cross', 'star'];
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const MAX_PLAYERS = 15;
const CHAMBER_SIZE = 6;

// ─── v2 Phase D — Secret roles ───────────────────────────────
// Roles auto-activate when alive count at startGame >= 9. Each
// special role appears AT MOST ONCE per game (Sheriff, Medic,
// Saboteur, Sniper, Collector). Gambler may appear 1-2 times.
// Everyone else is Barehand.
//
// Role distribution function — picks a sensible random subset of
// special roles to assign, scaling with player count, then fills
// the remainder with Barehand.
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
// Role-specific hand caps for power cards. Only Collector is
// allowed to hold up to 3 power cards; everyone else is gated to
// 1 by `_powerCardCapForPlayer`.
const COLLECTOR_POWER_CARD_CAP = 3;

// ─── v2 power-card vocabulary ─────────────────────────────────
// Card.type discriminator: existing shape/whot cards = 'shape'.
// Power cards = 'power' and additionally carry a `power` slug.
// Phase B is pure plumbing — actual EFFECTS land in Phase C.
const CARD_TYPES_DISCRIMINATOR = {
  SHAPE: 'shape',
  POWER: 'power',
};
const POWER_TYPES = ['shield', 'mirror', 'swap', 'peek', 'freeze', 'assassin'];

const MODES = {
  PHYSICAL: 'physical',
  ONLINE: 'online',
};

// ─── v2 config defaults ───────────────────────────────────────
// Shape mirrors client/src/components/PreGameSettingsPanel.js
// DEFAULT_V2_CONFIG. All toggles default OFF, copiesPerDeck = 1.
// secretRoles is intentionally NOT a host toggle — the spec says
// it auto-activates at alive count >= 9. Kept off the config.
//
// Phase A2 = pure plumbing. Nothing reads room.config yet.

function defaultRoomConfig() {
  return {
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

// Merge an untrusted incoming config from the client over the
// known-good default shape. Prevents unknown keys from polluting
// room state and clamps copiesPerDeck to [1, 2]. Booleans only
// for toggle fields.
function normalizeRoomConfig(input) {
  const base = defaultRoomConfig();
  if (!input || typeof input !== 'object') return base;

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

// ─── Deck helpers ─────────────────────────────────────────────

function generateDeck() {
  const cards = [];
  let idCounter = 0;
  for (const shape of SHAPES) {
    for (let num = 1; num <= 14; num++) {
      cards.push({ id: `${shape}-${num}-${idCounter++}`, type: 'shape', shape, number: num });
    }
  }
  cards.push({ id: `whot-20-${idCounter++}`, type: 'shape', shape: 'whot', number: 20 });
  return cards;
}

function shuffleDeck(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Power card construction ──────────────────────────────────
// Power cards have NO shape and NO number — they are a wholly
// distinct card kind. The `power` slug identifies which effect the
// card carries; effects themselves arrive in Phase C.
//
// Spec note (locked): copiesPerDeck SCALES with double deck.
// If copiesPerDeck=1 and the table is double-deck (>10 players),
// each enabled power type gets 2 copies, not 1. If copiesPerDeck=2
// in a double deck, each enabled type gets 4. This matches "one copy
// per deck and two copies in a double-deck game" reading literally.
let _powerIdCounter = 0;
function _nextPowerId(power) {
  return `power-${power}-${Date.now().toString(36)}-${(_powerIdCounter++).toString(36)}`;
}

function buildPowerCards(config, playerCount) {
  if (!config || !config.powerCards || !config.powerCards.enabled) return [];
  const enabled = config.powerCards.enabled;
  const baseCopies = Number.isFinite(config.powerCards.copiesPerDeck)
    ? Math.max(1, Math.min(2, Math.floor(config.powerCards.copiesPerDeck)))
    : 1;
  const deckMultiplier = playerCount > 10 ? 2 : 1;
  const totalCopies = baseCopies * deckMultiplier;

  const cards = [];
  for (const power of POWER_TYPES) {
    if (!enabled[power]) continue;
    for (let i = 0; i < totalCopies; i++) {
      cards.push({
        id: _nextPowerId(power),
        type: 'power',
        power,
      });
    }
  }
  return cards;
}

function buildDeck(playerCount, config = null) {
  const base = generateDeck();
  const full = playerCount > 10 ? [...base, ...generateDeck()] : base;
  const powers = buildPowerCards(config, playerCount);
  return shuffleDeck([...full, ...powers]);
}

function dealCards(deck, orderedPlayerIds, cardsPerPlayer = 6) {
  const hands = new Map();
  let remaining = [...deck];
  for (const pid of orderedPlayerIds) {
    hands.set(pid, remaining.splice(0, cardsPerPlayer));
  }
  return { hands, remainingDeck: remaining };
}

// ─── Chamber system ────────────────────────────────────────────
// Each player has a 6-slot chamber array: null | 'bullet'
// Bullets are placed by the backend only — the frontend renders
// exactly what the backend returns, ensuring perfect sync.

/**
 * Create a fresh chamber with `bullets` bullets at random positions.
 * Default = 1 bullet (vanilla rules). Russian Roulette risk modifier
 * (Phase E1) starts every chamber with 3 bullets — pass `bullets: 3`.
 */
function initChamber(bullets = 1) {
  const safe = Math.max(0, Math.min(CHAMBER_SIZE, Math.floor(bullets)));
  const chamber = new Array(CHAMBER_SIZE).fill(null);
  // Sample `safe` distinct slot indices for bullet placement.
  const slots = [];
  while (slots.length < safe) {
    const idx = Math.floor(Math.random() * CHAMBER_SIZE);
    if (!slots.includes(idx)) slots.push(idx);
  }
  for (const i of slots) chamber[i] = 'bullet';
  return chamber;
}

/**
 * Add one more bullet at a random empty slot.
 * Called after a player survives a spin.
 * If all slots are full (shouldn't happen in normal play), returns unchanged.
 */
function addBulletToChamber(chamber) {
  const empty = chamber.reduce((acc, s, i) => (s === null ? [...acc, i] : acc), []);
  if (empty.length === 0) return chamber;
  const next = [...chamber];
  next[empty[Math.floor(Math.random() * empty.length)]] = 'bullet';
  return next;
}

/**
 * Pull the trigger.
 * Backend picks a random slot index, checks for bullet.
 * On survival → add another bullet for next time.
 *
 * v2 Phase E1 — Risk modifiers:
 *   - doubleBarrel: roll TWO independent spin indices and take the
 *     higher value before checking the chamber. Skews probability of
 *     landing on a higher slot — combined with the spec's "bullets
 *     placed at random" this shifts elimination odds in the early
 *     game (when there's only 1 bullet and it could be anywhere).
 *     The reported `spinIndex` is the chosen (higher) index.
 *   - hotPotato: on SURVIVAL, add 2 bullets instead of 1. Clamps at
 *     full chamber — addBulletToChamber is a no-op when no empties
 *     remain, so the second add naturally degrades to "add 1" if the
 *     chamber was already 5/6, or "add 0" if 6/6.
 *
 * Returns { spinIndex, eliminated, chamber, bulletCount }.
 */
function pullTrigger(chamber, modifiers = {}) {
  let spinIndex = Math.floor(Math.random() * CHAMBER_SIZE);
  if (modifiers.doubleBarrel) {
    const second = Math.floor(Math.random() * CHAMBER_SIZE);
    spinIndex = Math.max(spinIndex, second);
  }
  const eliminated = chamber[spinIndex] === 'bullet';
  let updatedChamber = chamber;
  if (!eliminated) {
    updatedChamber = addBulletToChamber(chamber);
    if (modifiers.hotPotato) {
      // Hot Potato: +2 bullets on survival. The first add is the
      // standard one; the second add is the modifier bonus. If the
      // chamber is already full, addBulletToChamber returns it
      // unchanged (graceful clamp at chamber capacity).
      updatedChamber = addBulletToChamber(updatedChamber);
    }
  }
  const bulletCount = updatedChamber.filter(s => s === 'bullet').length;
  return { spinIndex, eliminated, chamber: updatedChamber, bulletCount };
}

// ─── Room / Player creation ────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostSocketId, mode = MODES.PHYSICAL, config = null) {
  return {
    code: generateRoomCode(),
    hostSocketId,
    mode,
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    currentCardType: null,
    phase: 'lobby',
    roundNumber: 1,
    lastAction: null,
    bluffUsedThisTurn: false,
    cardPlayedThisTurn: false,
    spinTargetId: null,
    createdAt: Date.now(),
    deck: null,
    playedPile: null,
    hands: null,
    currentCard: null,
    lastPlayedCard: null,
    chatLog: [],   // [{ id, userId, username, text, ts }] — capped at CHAT_LOG_MAX
    // v2 host-selected toggles. Pure plumbing — nothing reads it yet.
    // Always normalised so unknown keys / bad types from clients
    // can't corrupt room state.
    config: normalizeRoomConfig(config),
    // v2 power-card discard pile — over-cap power cards from the
    // initial deal/draw land here. Initialised on demand to keep
    // physical-mode rooms lean, but startGame/resetRoundOnline
    // create it eagerly anyway.
    discardPile: [],
    // Phase C — Freeze. One-shot skip queue: when the holder ends
    // their turn after arming freeze, we set skipNextPlayer=true so
    // the next advanceTurn burns through the next player. The player
    // AFTER the skip inherits bluffBlockedThisTurn so they can't call
    // bluff (no card was played by the skipped player).
    skipNextPlayer: false,
    bluffBlockedThisTurn: false,
  };
}

const CHAT_LOG_MAX = 50;
const CHAT_TEXT_MAX = 500;

function appendChatMessage(room, { userId, username, text }) {
  if (!room.chatLog) room.chatLog = [];
  const trimmed = String(text || '').slice(0, CHAT_TEXT_MAX).trim();
  if (!trimmed) return null;
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    username,
    text: trimmed,
    ts: Date.now(),
  };
  room.chatLog.push(msg);
  if (room.chatLog.length > CHAT_LOG_MAX) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_MAX);
  }
  return msg;
}

/**
 * Create a new player.
 * chamber is always initialised here (backend only — never on client).
 *
 * v2 fields (Phase B):
 *   armedPowerCard — null | { power, cardId, activatedAtTurn }.
 *     null = not armed. When set, the player has activated a power
 *     at start-of-turn and the trigger logic in Phase C will look
 *     here to decide whether the effect fires.
 */
function createPlayer(id, username, socketId) {
  return {
    id,
    username,
    socketId,
    status: 'alive',
    chamber: initChamber(),      // 6-slot array, 1 bullet
    riskLevel: 1,                // = bullet count; kept for RiskMeter display
    isSpectator: false,
    connectedAt: Date.now(),
    armedPowerCard: null,        // v2 — Phase B plumbing, no triggers yet
    // v2 Phase D — Secret roles. Default 'barehand' (no special
    // ability). Real role is assigned by `assignRoles` at startGame
    // when alive count >= 9. `serializeRoom` ONLY exposes a player's
    // own role to themselves (privacy), with one exception: when a
    // role activates publicly (Sheriff anti-Assassin banner, Sniper
    // redirect banner, etc.) the trigger event carries the role
    // name in its payload.
    role: ROLES.BAREHAND,
    // Once-per-game ability gates. true = ability still available.
    // Reset is only at game start — survives round resets.
    medicAbilityAvailable: true,
    saboteurAbilityAvailable: true,
    sniperAbilityAvailable: true,
    // v2 Phase F — Bounty system. Counter increments when the player
    // survives a spin; resets when (a) bounty is placed at 3, (b) the
    // bounty is collected by a successful bluff call, (c) the bounty
    // holder is eliminated. Persists across rounds — Section 7 hand
    // reset does NOT clear it.
    consecutiveSurvivedSpins: 0,
    hasBounty: false,
    // v2 Phase F — Betting system. Counter increments when this
    // player's bet on a spin outcome was correct. At 3, drop risk by 1
    // and reset to 0. Skipped bets do not change the counter.
    consecutiveCorrectBets: 0,
  };
}

// ─── Card type helpers ─────────────────────────────────────────

function randomCardType() {
  return CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
}

function randomShape() {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

function newCardType(room) {
  room.currentCardType = room.mode === MODES.ONLINE ? randomShape() : randomCardType();
  return room;
}

// ─── Player helpers ────────────────────────────────────────────

function getCurrentPlayer(room) {
  if (!room.turnOrder.length) return null;
  const playerId = room.turnOrder[room.currentTurnIndex % room.turnOrder.length];
  return room.players.find(p => p.id === playerId) || null;
}

// ─── Turn management ───────────────────────────────────────────
//
// v2 Phase C — Freeze. When the freeze holder ends their turn we
// stamp room.skipNextPlayer = true (and queue the bluff-block). On
// the very next advanceTurn, we advance an EXTRA step so the next
// player in turn order is fully skipped. The player AFTER the
// skipped one inherits room.bluffBlockedThisTurn = true, which the
// call_bluff handler honours by rejecting the bluff (the previous
// "turn" had no card to challenge — it never happened).

function advanceTurn(room) {
  if (!room.turnOrder.length) return room;

  // Capture which player is finishing their turn BEFORE we advance;
  // their id is what we credit for Swap "they took a turn" tracking.
  const finishingPlayerId = room.turnOrder[room.currentTurnIndex] || null;
  if (finishingPlayerId) _creditSwapTurnFor(room, finishingPlayerId);

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.lastAction = null;
  room.phase = 'playing';
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = false;
  // Default: clear the bluff-blocked flag — it only persists for the
  // single turn that immediately follows a freeze-skip. The handler
  // that fired the freeze re-sets the flag AFTER advanceTurn runs so
  // it survives this reset (see consumeFreezeOnTurnEnd).
  room.bluffBlockedThisTurn = false;

  // Freeze: if the previous holder armed a freeze and we owe the table
  // one extra advance, do it here. We re-credit Swap for the SKIPPED
  // player (they "spent" their turn from the engine's perspective even
  // though they didn't act), advance a second time, and stamp the
  // bluff-block flag for the player who actually takes the turn.
  if (room.skipNextPlayer) {
    const skippedPlayerId = room.turnOrder[room.currentTurnIndex] || null;
    if (skippedPlayerId) _creditSwapTurnFor(room, skippedPlayerId);
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    room.skipNextPlayer = false;
    // The player AFTER the skip inherits the bluff-block.
    room.bluffBlockedThisTurn = true;
  }

  return room;
}

/**
 * Did `playerId` survive a full circuit of the table without anyone
 * calling bluff on them since they armed `armedPowerCard`? Returns
 * true when their next turn comes around and the armed card is the
 * same one they armed last time. Used by the Assassin "decide to
 * re-arm or take penalty" flow at turn start.
 *
 * Specifically: if the active turn just rotated back to a player
 * whose armedPowerCard.activatedAtTurn !== currentTurnIndex, we
 * know the activation has aged through one full rotation.
 */
function isArmedFromPriorTurn(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player?.armedPowerCard) return false;
  // We armed at activatedAtTurn, and the turn index has advanced
  // (and wrapped) at least once. The simple check: turnIndex
  // changed since arming. NOTE: turn index can be the SAME on the
  // next visit if no eliminations and the modulo math lines up,
  // so we additionally compare roundNumber as a tiebreaker.
  return (
    player.armedPowerCard.activatedAtTurn !== room.currentTurnIndex
    || (player.armedPowerCard.activatedAtRound !== undefined
        && player.armedPowerCard.activatedAtRound !== room.roundNumber)
  );
}

/**
 * Walk every Swap card in every hand and remove `playerId` from its
 * pending-set (the set of "alive players who must still take a turn
 * before this Swap is activatable"). When the set empties, the Swap
 * is activatable. Called when a player ends their turn.
 */
function _creditSwapTurnFor(room, playerId) {
  if (!room.hands) return;
  for (const hand of room.hands.values()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
        card.swapPendingPlayerIds = card.swapPendingPlayerIds.filter(id => id !== playerId);
      }
    }
  }
}

/**
 * Eliminations remove a player from every Swap snapshot WITHOUT
 * crediting (locked decision — eliminating someone shouldn't unlock
 * a Swap mechanically). Called from elimination paths.
 */
function _removePlayerFromSwapSnapshots(room, playerId) {
  if (!room.hands) return;
  for (const hand of room.hands.values()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && Array.isArray(card.swapPendingPlayerIds)) {
        card.swapPendingPlayerIds = card.swapPendingPlayerIds.filter(id => id !== playerId);
      }
    }
  }
}

// ─── v2 Phase D — Role assignment ─────────────────────────────
//
// Spec (locked):
//   - Roles activate ONLY when alive count >= 9. Below that
//     threshold every player is Barehand.
//   - Each "unique" special role (Sheriff, Medic, Saboteur, Sniper,
//     Collector) appears AT MOST ONCE per game.
//   - Gambler may appear 1-2 times.
//   - Remaining players are Barehand.
//
// Distribution (sensible default — matches the task spec):
//   • 9 players  → 5 special + 4 Barehand
//   • 10        → 5 special + 5 Barehand
//   • 11        → 6 special (incl. 2nd Gambler) + 5 Barehand
//   • 12        → 6 special + 6 Barehand
//   • 13        → 7 special (incl. 2nd Gambler) + 6 Barehand
//   • 14        → 7 special + 7 Barehand
//   • 15        → 7 special + 8 Barehand
//
// "Special" = exactly one of {Sheriff, Medic, Saboteur, Sniper,
//              Collector, Gambler×1}, plus optionally a 2nd Gambler
// for tables of 11+.
//
// Pure function — operates on `room.players` and mutates each
// alive player's `role`. Returns the room for chaining.
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _roleAssignmentFor(aliveCount) {
  if (aliveCount < ROLES_AT_MIN_ALIVE) {
    return Array.from({ length: aliveCount }).map(() => ROLES.BAREHAND);
  }
  // Always include all five unique roles + 1 Gambler when threshold met.
  const specials = [
    ROLES.SHERIFF,
    ROLES.MEDIC,
    ROLES.SABOTEUR,
    ROLES.SNIPER,
    ROLES.COLLECTOR,
    ROLES.GAMBLER,
  ];
  // Add a 2nd Gambler at 11+; add a 3rd-special slot escalates with size.
  // Cap the special count so Barehand always remains a real cohort.
  let extraGambler = aliveCount >= 11 ? 1 : 0;
  const slots = [...specials, ...Array.from({ length: extraGambler }).map(() => ROLES.GAMBLER)];
  while (slots.length < aliveCount) slots.push(ROLES.BAREHAND);
  return _shuffle(slots);
}

function assignRoles(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  const assignment = _roleAssignmentFor(alivePlayers.length);
  const shuffledPlayers = _shuffle(alivePlayers);
  for (let i = 0; i < shuffledPlayers.length; i++) {
    shuffledPlayers[i].role = assignment[i] || ROLES.BAREHAND;
  }
  // Eliminated players (shouldn't be possible at startGame) stay barehand.
  for (const p of room.players) {
    if (p.status !== 'alive') p.role = ROLES.BAREHAND;
  }
  return room;
}

function getRole(room, playerId) {
  const p = room.players.find(pp => pp.id === playerId);
  return p?.role || ROLES.BAREHAND;
}

// Per-player power-card hand cap — Collector lifts to 3, everyone
// else is gated at 1. Used by deal normalisation + drawCardForPlayer.
function _powerCardCapForPlayer(player) {
  if (!player) return 1;
  return player.role === ROLES.COLLECTOR ? COLLECTOR_POWER_CARD_CAP : 1;
}

// ─── Game start ────────────────────────────────────────────────

function startGame(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  if (alivePlayers.length < 2) throw new Error('Need at least 2 players');

  const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
  room.turnOrder = shuffled.map(p => p.id);
  room.currentTurnIndex = 0;
  room.phase = 'playing';
  room.roundNumber = 1;
  room.lastAction = null;
  room.isFirstTurn = true;
  room.lastPlayedCard = null;
  room.discardPile = room.discardPile || [];

  // v2 Phase E1 — Risk modifiers initial state.
  //   • Russian Roulette: every player starts with 3 bullets in their
  //     chamber instead of 1. createPlayer already rolled a 1-bullet
  //     chamber so we re-init here once we know the room config.
  //   • All other risk modifiers (Double Barrel, Hot Potato, Redemption
  //     Spin) only affect spin-time behaviour and are read off
  //     `room.config.riskModifiers` at the call sites.
  //
  // v2 Phase E2 — Room modifiers initial state.
  //   • Sudden Death: counter starts at 0 and increments on every
  //     elimination-free advanceTurn. Resets on any elimination.
  //   • Mirror Match: only legal at game-start when the alive count
  //     is even. Caller (start_game socket handler) is responsible
  //     for refusing the start if mirrorMatch is set with an odd
  //     alive count — engine just forwards.
  if (room.config?.riskModifiers?.russianRoulette) {
    for (const p of alivePlayers) {
      p.chamber = initChamber(3);
      p.riskLevel = 3;
    }
  }
  room.suddenDeathCounter = 0;
  // mirrorMatchActive is latched at startGame and stays on for the
  // full game even if alive count goes odd post-elimination (locked
  // decision in the spec roadmap).
  room.mirrorMatchActive = !!room.config?.roomModifiers?.mirrorMatch;
  // Speed Mode is a runtime concern handled in socketHandlers — no
  // engine-side state required. We expose the flag to the client via
  // serializeRoom for UI affordances (countdown ring, etc.).

  // v2 Phase D — assign roles BEFORE the deal so the per-player
  // power-card hand cap (Collector = 3, others = 1) is honoured
  // by `_normalisePowerCardHandCap`.
  assignRoles(room);

  if (room.mode === MODES.ONLINE) {
    const deck = buildDeck(alivePlayers.length, room.config);
    const { hands, remainingDeck } = dealCards(deck, room.turnOrder, 6);
    room.hands = hands;
    room.deck = remainingDeck;
    room.playedPile = [];

    // Power-card hand-cap normalisation: a player may hold at most
    // ONE power card. (Collector role lifts this in Phase D — until
    // then, 1 is the universal cap.) Any extras from the initial
    // deal go to discardPile, replaced with shape cards drawn from
    // the top of the remaining deck (option (b) in the Phase B spec).
    _normalisePowerCardHandCap(room);

    // Snapshot Swap "every alive player took a turn since the card
    // entered the hand" tracker on every Swap that landed in a hand.
    _snapshotSwapHolders(room);

    // Start card must be a shape card (not Whot wild, not power).
    let startIdx = room.deck.findIndex(c => c.type === 'shape' && c.shape !== 'whot');
    if (startIdx === -1) startIdx = room.deck.findIndex(c => c.type === 'shape');
    if (startIdx === -1) startIdx = 0;
    const [startCard] = room.deck.splice(startIdx, 1);
    room.currentCard = startCard;
    room.currentCardType = startCard?.shape || null;
  } else {
    room.currentCardType = randomCardType();
    room.deck = null;
    room.playedPile = null;
    room.hands = null;
    room.currentCard = null;
  }

  return room;
}

// ─── Power-card hand bookkeeping ──────────────────────────────

function _countPowerCardsInHand(hand) {
  if (!hand) return 0;
  let n = 0;
  for (const c of hand) if (c?.type === 'power') n++;
  return n;
}

function _hasPowerCardInHand(hand) {
  return _countPowerCardsInHand(hand) > 0;
}

/**
 * After an initial deal, walk every player's hand and move any
 * extras over the 1-power-card cap into room.discardPile, replacing
 * them with shape cards taken from the top of room.deck. If the
 * deck runs dry of shape cards, the slot stays empty (caller can
 * decide what to do — in practice the deck is always large enough).
 */
function _normalisePowerCardHandCap(room) {
  if (!room.discardPile) room.discardPile = [];

  for (const [pid, hand] of room.hands.entries()) {
    if (!hand) continue;
    const player = room.players.find(p => p.id === pid);
    const cap = _powerCardCapForPlayer(player); // Collector → 3, default → 1
    let powerCount = _countPowerCardsInHand(hand);
    while (powerCount > cap) {
      // Find an extra power card, push to discard, replace with shape.
      const extraIdx = hand.findIndex(c => c?.type === 'power');
      // Re-find from the END to peel off the most-recently-placed
      // duplicate; equivalent for correctness, just a touch tidier.
      const tailIdx = (() => {
        for (let i = hand.length - 1; i >= 0; i--) if (hand[i]?.type === 'power') return i;
        return extraIdx;
      })();
      // Skip the FIRST power card (the one we keep) by finding the
      // second-from-front, falling back to the tail.
      let removeIdx = -1;
      let seen = 0;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i]?.type === 'power') {
          seen++;
          if (seen > cap) { removeIdx = i; break; }
        }
      }
      if (removeIdx === -1) removeIdx = tailIdx;

      const [extra] = hand.splice(removeIdx, 1);
      room.discardPile.push(extra);

      // Replace from deck — must be a shape card.
      const shapeIdx = room.deck.findIndex(c => c?.type === 'shape');
      if (shapeIdx === -1) {
        // No shape replacement available — leave hand short. In
        // practice the deck is always >> hand size, so this branch
        // should be unreachable in a real game. Surface a warning.
        console.warn('[engine] _normalisePowerCardHandCap: no shape card available for replacement');
        break;
      }
      const [shape] = room.deck.splice(shapeIdx, 1);
      hand.push(shape);
      powerCount = _countPowerCardsInHand(hand);
    }
  }
}

/**
 * For every alive player, look at the Swap cards in their hand and
 * stamp the "alive playerIds who must take a turn before this Swap
 * is activatable" snapshot. Idempotent — won't overwrite an existing
 * snapshot. Decision: eliminations remove from the set without
 * crediting (locked, see roadmap).
 *
 * Stored as an array (not a Set) so it round-trips through JSON
 * cleanly — myHand is sent over the wire to the holding player.
 */
function _snapshotSwapHolders(room) {
  if (!room.hands) return;
  const aliveIds = room.players.filter(p => p.status === 'alive').map(p => p.id);
  for (const [pid, hand] of room.hands.entries()) {
    if (!hand) continue;
    for (const card of hand) {
      if (card?.type === 'power' && card.power === 'swap' && !card.swapPendingPlayerIds) {
        // Per-Swap-card tracking. Snapshot at the moment it lands.
        // Player who holds the card is excluded (they obviously can't
        // gate themselves — the rule is "every OTHER alive player").
        card.swapPendingPlayerIds = aliveIds.filter(id => id !== pid);
      }
    }
  }
}

// ─── Online-mode card play ─────────────────────────────────────

function validateAndPlayCard(room, playerId, cardId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Not in online mode' };

  const hand = room.hands.get(playerId);
  if (!hand) return { ok: false, error: 'Player has no hand' };

  const cardIdx = hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Card not in hand' };

  const card = hand[cardIdx];
  hand.splice(cardIdx, 1);
  room.playedPile.push(card);
  room.lastPlayedCard = card;
  room.cardPlayedThisTurn = true;

  return { ok: true, card };
}

function ensureDrawPile(room) {
  if (room.deck.length >= 5) return;
  if (room.playedPile.length === 0) return;
  const topCard = room.playedPile.pop();
  room.deck = shuffleDeck(room.playedPile);
  room.playedPile = [topCard];
}

/**
 * Draw a card for a player, honouring the v2 power-card hand cap.
 *
 * Rule (Phase B, locked): a player may hold at most ONE power card.
 * If the next card off the deck is a power card and the player is
 * already holding one, the would-be-drawn card is moved to
 * room.discardPile and we try again. This loops until either a
 * shape card lands in the hand or the deck is exhausted of viable
 * cards.
 *
 * Edge case: if no eligible card can be dealt (deck empty, OR every
 * remaining card is a power card and the player is capped), returns
 * null and logs a warning. In practice this should not happen.
 *
 * Returns the card actually placed in the player's hand, or null.
 */
function drawCardForPlayer(room, playerId) {
  if (!room.discardPile) room.discardPile = [];
  const hand = room.hands?.get(playerId);
  if (!hand) return null;
  const player = room.players.find(p => p.id === playerId);
  const cap = _powerCardCapForPlayer(player); // Collector → 3, default → 1

  // Loop with a safety bound — at worst we'd churn the entire deck,
  // so cap iterations at deck size + played pile size + 1 to never
  // spin forever even if state is corrupted.
  let safety = (room.deck?.length || 0) + (room.playedPile?.length || 0) + 4;
  while (safety-- > 0) {
    ensureDrawPile(room);
    if (!room.deck || room.deck.length === 0) {
      console.warn('[engine] drawCardForPlayer: deck exhausted with no eligible card');
      return null;
    }
    const card = room.deck.shift();

    if (card?.type === 'power' && _countPowerCardsInHand(hand) >= cap) {
      // Hand-cap collision — discard and try again.
      room.discardPile.push(card);
      continue;
    }

    hand.push(card);

    // If we just placed a Swap into this hand, snapshot the alive
    // playerIds at this moment for activation gating.
    if (card?.type === 'power' && card.power === 'swap' && !card.swapPendingPlayerIds) {
      const aliveIds = room.players.filter(p => p.status === 'alive').map(p => p.id);
      card.swapPendingPlayerIds = aliveIds.filter(id => id !== playerId);
    }

    return card;
  }
  console.warn('[engine] drawCardForPlayer: safety bound exceeded');
  return null;
}

// ─── Power card activation (Phase B) ──────────────────────────
// Pure plumbing — actual EFFECTS arrive in Phase C. This fn is the
// engine-side validator + state mutator for the activate_power_card
// socket event. Returns { ok, ...detail } so the caller can decide
// what to broadcast.
//
// Special cases:
//   - peek: consumed-on-use. Card moves to discardPile, the caller
//     gets `peekedCard` (the room.lastPlayedCard at activation time,
//     or null). armedPowerCard stays null because the effect already
//     resolved at activation.
//   - all others: card stays in hand but is marked `armed = true` so
//     it can never accidentally be played as if it were a shape card.
//     player.armedPowerCard records { power, cardId, activatedAtTurn }
//     so Phase C trigger logic can find it.

function _findPowerCardInHand(hand) {
  if (!hand) return null;
  for (const card of hand) {
    if (card?.type === 'power') return card;
  }
  return null;
}

/**
 * Assassin "decline to re-arm" penalty (Phase C, locked):
 *   The holder armed Assassin on a previous turn but no bluff was
 *   called on them. At their next turn the activation prompt fires
 *   again. If they DECLINE to re-arm, they take +4 shape cards as
 *   penalty (drawn via drawCardForPlayer; hand cap is honoured).
 *   Either way, the Assassin is consumed.
 *
 *   Hand cap > 6 IS allowed here (Section 7 hand reset will wash it
 *   on next survival, per the locked roadmap decision).
 *
 *   Returns:
 *     { ok: true, dealt: Card[] }       — penalty applied successfully
 *     { ok: false, error: string }      — couldn't apply (no armed
 *                                         Assassin, wrong mode, etc.)
 */
function applyAssassinDeclinePenalty(room, playerId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };
  if (!player.armedPowerCard || player.armedPowerCard.power !== 'assassin') {
    return { ok: false, error: 'No armed Assassin to decline' };
  }

  const hand = room.hands?.get(playerId) || [];
  const cardId = player.armedPowerCard.cardId;
  const idx = hand.findIndex(c => c?.id === cardId);
  if (idx !== -1) {
    const [card] = hand.splice(idx, 1);
    if (!room.discardPile) room.discardPile = [];
    room.discardPile.push(card);
  }
  player.armedPowerCard = null;

  // Draw 4 cards. Hand cap is enforced per-card by drawCardForPlayer
  // (power cards over the cap go to discardPile and are replaced
  // with shapes — exactly what we want for a "regular shape cards"
  // penalty). Hand size > 6 is allowed by spec.
  const dealt = [];
  for (let i = 0; i < 4; i++) {
    const card = drawCardForPlayer(room, playerId);
    if (card) dealt.push(card);
    else break;
  }
  return { ok: true, dealt };
}

// ─── v2 Phase D — Role helpers ───────────────────────────────

/**
 * Return the alive Medic player who can still use their save
 * ability AND has hand-room (< 6 cards), or null. Hand-room check
 * uses the locked spec rule: ability is unavailable when Medic is
 * already at 6+ cards at the moment of intervention.
 */
function findAvailableMedic(room) {
  const medic = room.players.find(p =>
    p.role === ROLES.MEDIC
    && p.status === 'alive'
    && p.medicAbilityAvailable
  );
  if (!medic) return null;
  if (room.mode === MODES.ONLINE) {
    const hand = room.hands?.get(medic.id) || [];
    if (hand.length >= 6) return null;
  }
  return medic;
}

/**
 * Return the alive Sniper who can still redirect, or null. Sniper
 * has no hand-cap precondition.
 */
function findAvailableSniper(room) {
  return room.players.find(p =>
    p.role === ROLES.SNIPER
    && p.status === 'alive'
    && p.sniperAbilityAvailable
  ) || null;
}

/**
 * Apply a Medic save against an already-eliminated player. The
 * elimination is reverted: status returns to 'alive', isSpectator
 * cleared, and the player is restored to the turn order at the
 * position they vacated (or appended if their slot is gone).
 *
 * Spec: "saved player survives with risk level still incremented
 * normally". For spin eliminations the chamber is left at whatever
 * pullTrigger returned (which on the elim path is the pre-spin
 * chamber, since pullTrigger only adds a bullet on survival). To
 * meet the "still incremented" rule we add ONE bullet after the
 * revive. For Assassin saves there is no spin, so no extra bullet
 * is added (risk wasn't being incremented in the first place).
 *
 * Cost: +2 shape cards to Medic's hand. Drawn via drawCardForPlayer
 * so the per-player power-card cap is honoured (extras land in
 * discardPile, replaced with shapes).
 *
 * Returns { ok, dealt: Card[], revivedPlayerId } | { ok:false, error }.
 */
function applyMedicSave(room, eliminatedPlayerId, source = 'spin') {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const medic = findAvailableMedic(room);
  if (!medic) return { ok: false, error: 'No Medic available' };
  const target = room.players.find(p => p.id === eliminatedPlayerId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.status !== 'eliminated') {
    return { ok: false, error: 'Target is not eliminated' };
  }

  // Revive — set status back to alive and re-insert in turn order
  // if they were already removed.
  target.status = 'alive';
  target.isSpectator = false;
  if (!room.turnOrder.includes(target.id)) {
    // Append to the end of the turn order. The next advanceTurn
    // will land on whoever is *after* the current actor in the
    // existing order, not the revived player — they take a turn
    // when rotation reaches them.
    room.turnOrder.push(target.id);
  }

  // For spin saves, bump risk by one (the bullet that hit them
  // stayed in the chamber; on a regular survival a new bullet
  // would have been added — that's the "still incremented" rule).
  if (source === 'spin') {
    target.chamber = addBulletToChamber(target.chamber);
    target.riskLevel = target.chamber.filter(s => s === 'bullet').length;
  }

  // Cost: +2 shape cards to Medic. Loop drawCardForPlayer; if the
  // top of the deck is a power card the per-player cap kicks in
  // and discards it, eventually surfacing a shape.
  const dealt = [];
  for (let i = 0; i < 2; i++) {
    const card = drawCardForPlayer(room, medic.id);
    if (card) dealt.push(card);
    else break;
  }
  medic.medicAbilityAvailable = false;

  return { ok: true, dealt, revivedPlayerId: target.id, medicId: medic.id };
}

/**
 * Saboteur: silently move ONE random card from holder's hand into
 * a target player's hand. Validates: holder is alive Saboteur,
 * ability available, hand size > 3, target alive and != holder.
 *
 * Returns { ok, movedCardId, targetPlayerId } | { ok:false, error }.
 * No banner — the only thing the table sees is the recipient's
 * handSize tick up by 1 in the next room_state.
 */
function applySaboteurTransfer(room, holderId, targetPlayerId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const holder = room.players.find(p => p.id === holderId);
  if (!holder) return { ok: false, error: 'Holder not found' };
  if (holder.role !== ROLES.SABOTEUR) return { ok: false, error: 'Not the Saboteur' };
  if (holder.status !== 'alive') return { ok: false, error: 'Saboteur not alive' };
  if (!holder.saboteurAbilityAvailable) return { ok: false, error: 'Ability already used' };

  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.id === holder.id) return { ok: false, error: 'Cannot target self' };
  if (target.status !== 'alive') return { ok: false, error: 'Target not alive' };

  const holderHand = room.hands?.get(holder.id) || [];
  if (holderHand.length <= 3) return { ok: false, error: 'Need more than 3 cards to use ability' };

  const targetHand = room.hands?.get(target.id);
  if (!targetHand) return { ok: false, error: 'Target has no hand' };

  // Random card pick — power cards are eligible too. The recipient
  // honours their per-player power-card cap; if the move would
  // exceed it, we re-roll the random pick once. Failing that, we
  // route the over-cap power card to discard and pull a shape
  // replacement from the holder so the ability still resolves
  // silently. (Edge case — in practice this is rare.)
  function pickRandomIndex(hand) {
    return Math.floor(Math.random() * hand.length);
  }
  let pickIdx = pickRandomIndex(holderHand);
  let pickedCard = holderHand[pickIdx];

  const targetCap = _powerCardCapForPlayer(target);
  if (
    pickedCard?.type === 'power'
    && _countPowerCardsInHand(targetHand) >= targetCap
  ) {
    // Try one re-roll for a shape card if any exist.
    const shapeIdx = holderHand.findIndex(c => c?.type === 'shape');
    if (shapeIdx !== -1) {
      pickIdx = shapeIdx;
      pickedCard = holderHand[shapeIdx];
    } else {
      // All cards in holder hand are power cards & target is capped.
      // Return error rather than violate the cap silently.
      return { ok: false, error: 'Cannot transfer — recipient power-card cap reached' };
    }
  }

  holderHand.splice(pickIdx, 1);
  targetHand.push(pickedCard);
  holder.saboteurAbilityAvailable = false;

  return { ok: true, movedCardId: pickedCard.id, targetPlayerId: target.id };
}

/**
 * Sniper: redirect a pending spin to a different alive player.
 * Validates: redirector is alive Sniper, ability available, target
 * alive and != Sniper, target is not the Mirror holder (anyone
 * with armed Mirror).
 *
 * Returns { ok, newSpinTargetId } | { ok:false, error }.
 */
function applySniperRedirect(room, sniperId, newSpinTargetId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  const sniper = room.players.find(p => p.id === sniperId);
  if (!sniper) return { ok: false, error: 'Sniper not found' };
  if (sniper.role !== ROLES.SNIPER) return { ok: false, error: 'Not the Sniper' };
  if (!sniper.sniperAbilityAvailable) return { ok: false, error: 'Ability already used' };

  const target = room.players.find(p => p.id === newSpinTargetId);
  if (!target) return { ok: false, error: 'Target not found' };
  if (target.id === sniper.id) return { ok: false, error: 'Cannot redirect to self' };
  if (target.status !== 'alive') return { ok: false, error: 'Target not alive' };
  if (target.armedPowerCard?.power === 'mirror') {
    return { ok: false, error: 'Cannot redirect to Mirror holder' };
  }

  sniper.sniperAbilityAvailable = false;
  return { ok: true, newSpinTargetId: target.id };
}

/**
 * Is the given Swap card eligible to be activated right now?
 * Swap requires that every alive player at the time the card landed
 * has since taken at least one turn.
 */
function isSwapActivatable(card) {
  if (!card || card.power !== 'swap') return false;
  if (!Array.isArray(card.swapPendingPlayerIds)) return true; // no snapshot = no gate
  return card.swapPendingPlayerIds.length === 0;
}

function activatePowerCard(room, playerId) {
  if (room.mode !== MODES.ONLINE) return { ok: false, error: 'Online mode only' };
  if (room.phase !== 'playing') return { ok: false, error: 'Wrong phase' };

  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  if (currentPlayerId !== playerId) return { ok: false, error: 'Not your turn' };

  if (room.cardPlayedThisTurn) return { ok: false, error: 'Card already played this turn' };
  if (room.bluffUsedThisTurn)  return { ok: false, error: 'Bluff already called this turn' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };
  if (player.status !== 'alive') return { ok: false, error: 'Player not alive' };
  if (player.armedPowerCard)    return { ok: false, error: 'Already armed' };

  const hand = room.hands?.get(playerId);
  const powerCard = _findPowerCardInHand(hand);
  if (!powerCard) return { ok: false, error: 'No power card in hand' };

  // Swap activatability gate.
  if (powerCard.power === 'swap' && !isSwapActivatable(powerCard)) {
    return { ok: false, error: 'Swap not yet activatable — every alive player must take a turn first' };
  }

  if (!room.discardPile) room.discardPile = [];

  // Peek: consumed-on-use. The card leaves the hand immediately,
  // armedPowerCard stays null.
  if (powerCard.power === 'peek') {
    const idx = hand.indexOf(powerCard);
    if (idx !== -1) hand.splice(idx, 1);
    room.discardPile.push(powerCard);
    const peekedCard = room.lastPlayedCard || null;
    return {
      ok: true,
      power: 'peek',
      consumed: true,
      peekedCard,
      cardId: powerCard.id,
    };
  }

  // All other powers: arm the player and mark the card as armed in
  // the hand. The card itself stays in the hand and is consumed on
  // trigger (Phase C). Marking it armed is defensive — power cards
  // already aren't playable as shape cards because they have no
  // shape, but armed makes the intent explicit and gives Phase C a
  // simple flag to gate "is this Shield ready to fire".
  powerCard.armed = true;
  player.armedPowerCard = {
    power: powerCard.power,
    cardId: powerCard.id,
    activatedAtTurn: room.currentTurnIndex, // turn index when armed
    activatedAtRound: room.roundNumber,
  };

  return {
    ok: true,
    power: powerCard.power,
    consumed: false,
    cardId: powerCard.id,
  };
}

// ─── Freeze trigger (Phase C) ──────────────────────────────────
// The freeze power card is "activated at turn start" (Phase B arms
// it) and "consumed on turn end". Concretely: when the holder calls
// end_turn, we look for an armed freeze on the player. If present we
// pull the card from their hand into the discard pile, clear the
// armed marker, and queue a one-shot skip on the room. The next
// advanceTurn() will burn through the skipped player without giving
// them a turn; the player AFTER the skipped one inherits a bluff
// block (the spec: there's "no card to challenge" because the last
// turn never happened).
//
// Returns the trigger payload (so the caller can broadcast a
// `power_card_triggered` event) or null if the holder had no armed
// freeze. Callers should invoke this BEFORE advanceTurn().

function consumeFreezeOnTurnEnd(room, holderId) {
  if (room.mode !== MODES.ONLINE) return null;
  if (!room.turnOrder?.length) return null;

  const holder = room.players.find(p => p.id === holderId);
  if (!holder) return null;
  const armed = holder.armedPowerCard;
  if (!armed || armed.power !== 'freeze') return null;

  // Identify who would be skipped: the next player in turn order,
  // computed BEFORE any advance happens. We don't mutate
  // currentTurnIndex here — advanceTurn will, then act on the flag.
  const holderIdx = room.turnOrder.indexOf(holderId);
  if (holderIdx === -1) return null;
  const skippedIdx = (holderIdx + 1) % room.turnOrder.length;
  const skippedId = room.turnOrder[skippedIdx];
  // If the only "next" player is the holder themselves (1-player table
  // shouldn't happen in practice but be defensive), bail without
  // arming the skip.
  if (!skippedId || skippedId === holderId) return null;
  const skipped = room.players.find(p => p.id === skippedId) || null;

  // Pull the freeze card from the holder's hand into discard. The
  // armed.cardId points at it; fall back to a search on power slug
  // in case state drifted.
  if (!room.discardPile) room.discardPile = [];
  const hand = room.hands?.get(holderId);
  if (hand) {
    let idx = armed.cardId
      ? hand.findIndex(c => c?.id === armed.cardId)
      : -1;
    if (idx === -1) idx = hand.findIndex(c => c?.type === 'power' && c.power === 'freeze');
    if (idx !== -1) {
      const [card] = hand.splice(idx, 1);
      room.discardPile.push(card);
    }
  }

  // Clear armed state and stamp the one-shot skip on the room.
  holder.armedPowerCard = null;
  room.skipNextPlayer = true;

  return {
    kind: 'freeze_skip',
    holderId,
    holderName: holder.username || null,
    skippedId,
    skippedName: skipped?.username || null,
  };
}

// ─── Bluff resolution ──────────────────────────────────────────

function resolveBluffOnline(room) {
  const accuserId = room.turnOrder[room.currentTurnIndex];
  const accuser = room.players.find(p => p.id === accuserId);

  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const accusedId = room.turnOrder[prevIdx];
  const accused = room.players.find(p => p.id === accusedId);

  const revealedCard = room.lastPlayedCard;

  let bluffIsCorrect;
  if (!revealedCard) {
    bluffIsCorrect = true;
  } else {
    const isWhot = revealedCard.shape === 'whot';
    const matchesRequired = revealedCard.shape === room.currentCardType;
    bluffIsCorrect = !isWhot && !matchesRequired;
  }

  const spinTarget = bluffIsCorrect ? accused : accuser;
  return { bluffIsCorrect, spinTarget, revealedCard, accuser, accused };
}

function resolveBluff(room, bluffIsCorrect) {
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);

  const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
  const prevPlayer = room.players.find(p => p.id === room.turnOrder[prevIdx]);

  const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;
  const spinResult = spinGun(spinTarget);

  if (spinResult.eliminated) eliminateFromTurnOrder(room, spinTarget.id);

  room.phase = 'playing';
  room.lastAction = {
    type: 'bluff_resolved',
    bluffCorrect: bluffIsCorrect,
    spinTargetId: spinTarget.id,
    spinTargetName: spinTarget.username,
    ...spinResult,
  };

  return { spinTarget, spinResult };
}

// ─── Online round reset ────────────────────────────────────────
// NOTE: chamber state is intentionally preserved across rounds.
// Bullets accumulated in earlier rounds carry into the next so that
// tension escalates the longer the game runs — surviving 5 spins is
// supposed to feel earned. To reset chambers between rounds, clear
// player.chamber + riskLevel before the resumed turn.

function resetRoundOnline(room) {
  const alivePlayers = room.players.filter(p => p.status === 'alive');
  const deck = buildDeck(alivePlayers.length, room.config);
  const aliveIds = alivePlayers.map(p => p.id);

  const { hands, remainingDeck } = dealCards(deck, aliveIds, 6);
  room.hands = hands;
  room.deck = remainingDeck;
  room.playedPile = [];
  room.discardPile = room.discardPile || [];

  // Same hand-cap normalisation as startGame — power cards never
  // stack, even on round reset.
  _normalisePowerCardHandCap(room);
  _snapshotSwapHolders(room);

  // Round reset clears any armed power cards — armed state does not
  // carry across rounds.
  for (const p of alivePlayers) p.armedPowerCard = null;

  let startIdx = room.deck.findIndex(c => c.type === 'shape' && c.shape !== 'whot');
  if (startIdx === -1) startIdx = room.deck.findIndex(c => c.type === 'shape');
  if (startIdx === -1) startIdx = 0;
  const [startCard] = room.deck.splice(startIdx, 1);
  room.currentCard = startCard;
  room.currentCardType = startCard?.shape || null;

  room.phase = 'playing';
  room.lastAction = null;
  room.lastPlayedCard = null;
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = true;
  // Phase C — Freeze: any pending skip / bluff-block from the previous
  // round is cleared on a fresh round, just like armedPowerCard.
  room.skipNextPlayer = false;
  room.bluffBlockedThisTurn = false;
  // v2 Phase E — Sudden Death counter resets between rounds; the
  // 4-turn streak is per-round, not game-wide. Redemption flags also
  // clear so newly-eliminated players are eligible in future rounds.
  room.suddenDeathCounter = 0;
  resetRedemptionFlags(room);

  return room;
}

// ─── Gun spin ──────────────────────────────────────────────────
// Now fully deterministic — backend picks spinIndex from chamber array.
// Frontend receives { spinIndex, chamber } and animates to that exact slot.

function spinGun(player, modifiers = {}) {
  // v2 Phase D — Gambler role: risk level NEVER increases from
  // surviving spins. We accomplish this by spinning normally to
  // determine elimination, but on SURVIVAL we revert the chamber
  // back to its pre-spin state (no extra bullet added). On
  // elimination we still let `pullTrigger` return its result —
  // chamber stays as-is in either case (pullTrigger only mutates
  // it on survival anyway). Note: external modifiers like Sudden
  // Death (Phase E2) are applied OUTSIDE this fn and can still
  // bump Gambler's risk level — exactly per spec.
  //
  // v2 Phase E1 — Risk modifiers (Double Barrel, Hot Potato) are
  // forwarded to pullTrigger via `modifiers`. Russian Roulette is
  // applied at startGame (chamber init) so it doesn't need to
  // appear here. Gambler's "no bullet on survival" still wins over
  // Hot Potato — we revert the chamber after the fact regardless of
  // how many bullets pullTrigger would've added.
  const isGambler = player.role === 'gambler';
  const before = [...player.chamber];

  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber, modifiers);

  if (!eliminated && isGambler) {
    // Skip the survival bullet add — Gambler's chamber is frozen
    // at start-of-game state for survival outcomes.
    player.chamber = before;
    player.riskLevel = before.filter(s => s === 'bullet').length;
    return { eliminated, spinIndex, chamber: player.chamber, riskLevel: player.riskLevel };
  }

  player.chamber = chamber;
  player.riskLevel = bulletCount;   // bullet count is the new "risk level"
  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  }
  return { eliminated, spinIndex, chamber, riskLevel: bulletCount };
}

/**
 * Survive-and-reset (Section 7 of v2 spec, locked):
 *   When an online-mode player SURVIVES a spin, their existing hand
 *   is discarded and they are dealt a fresh batch of cards.
 *
 *   - Normal spin survival → 6 fresh cards.
 *   - Redemption Spin survival → 3 fresh cards. (Redemption Spin
 *     itself ships in Phase E1; this fn accepts a `cardsToDeal`
 *     parameter so the Phase E plug-in is a one-liner.)
 *
 *   Hand-cap rule applies during the fresh deal — `drawCardForPlayer`
 *   already discards over-cap power cards onto room.discardPile and
 *   reaches for shapes instead.
 *
 *   Armed power card is cleared on survival (the card was held in
 *   the now-discarded hand and the spec says hand reset is total).
 *
 *   Returns the array of fresh cards dealt (caller can broadcast).
 */
function resetHandOnSurvival(room, playerId, cardsToDeal = 6) {
  if (room.mode !== MODES.ONLINE) return [];
  if (!room.hands) return [];

  const player = room.players.find(p => p.id === playerId);
  if (!player) return [];
  if (player.status !== 'alive') return [];

  if (!room.discardPile) room.discardPile = [];

  const oldHand = room.hands.get(playerId) || [];
  // Surface any power cards the player had into the discard pile too.
  // The spec is "discard the existing hand" — power cards included.
  for (const card of oldHand) {
    room.discardPile.push(card);
  }
  room.hands.set(playerId, []);

  // Armed power state is cleared: the card vanished with the hand.
  player.armedPowerCard = null;

  const dealt = [];
  for (let i = 0; i < cardsToDeal; i++) {
    const card = drawCardForPlayer(room, playerId);
    if (card) dealt.push(card);
    else break;
  }
  return dealt;
}

// ─── v2 Phase F — Bounty ─────────────────────────────────────
//
// When a player survives 3 spins in a row, a bounty is placed on
// them. A successful bluff call against a bounty holder drops the
// accuser's risk level by 1 AND clears the bounty. Bounty also
// clears when the holder is eliminated.
//
// Counters live on the player; helpers here are pure mutations.
const BOUNTY_THRESHOLD = 3;

/**
 * Called after a successful spin survival. Increments the counter
 * and, if it crosses the threshold and the player doesn't yet hold
 * a bounty, places one. Returns a banner-event payload when a bounty
 * is placed, otherwise null.
 *
 * Gated by `room.config.systems.bounty` — caller is responsible for
 * checking that flag before invoking, but we noop when disabled to
 * keep call sites tidy.
 */
function onSurvivalForBounty(room, playerId) {
  if (!room?.config?.systems?.bounty) return null;
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  player.consecutiveSurvivedSpins = (player.consecutiveSurvivedSpins || 0) + 1;
  if (
    player.consecutiveSurvivedSpins >= BOUNTY_THRESHOLD
    && !player.hasBounty
  ) {
    player.hasBounty = true;
    // Counter is "collected into" the bounty — reset to 0.
    player.consecutiveSurvivedSpins = 0;
    return {
      kind: 'bounty_placed',
      holderId: player.id,
      holderName: player.username || null,
    };
  }
  return null;
}

// ─── v2 Phase E — Risk + Room Modifier helpers ───────────────
//
// These are pure helpers — no I/O, no socket access. Callers in
// socketHandlers.js orchestrate timing (when each fires) and broadcast
// the resulting events. Engine just owns the rule.

/**
 * Pluck the risk-modifier flags out of room.config defensively. Used
 * by spinGun call sites to forward the right modifiers into pullTrigger.
 * Returns a frozen object with `doubleBarrel` / `hotPotato` booleans
 * (other risk mods don't affect pullTrigger directly).
 */
function getSpinModifiers(room) {
  const r = room?.config?.riskModifiers || {};
  return {
    doubleBarrel: !!r.doubleBarrel,
    hotPotato: !!r.hotPotato,
  };
}

// ─── Sudden Death (Phase E2) ─────────────────────────────────
//
// Spec: every 4 elimination-free turns, all alive players' risk
// levels increase by 1 simultaneously. Counter resets to 0 on any
// elimination.
//
// Implementation contract:
//   - `tickSuddenDeath(room)` is called at the END of an advanceTurn
//     that did not eliminate anyone. Increments the counter; if it
//     hits 4 it bumps every alive chamber and returns a banner
//     payload (caller broadcasts as `power_card_triggered`).
//   - `resetSuddenDeath(room)` is called whenever someone gets
//     eliminated (any path: spin, Assassin, disconnect).
//
// Important: Sudden Death IS allowed to bump Gambler's chamber
// (locked: external modifiers still affect Gambler — only spin-
// survival is frozen). Same logic for any role.
const SUDDEN_DEATH_THRESHOLD = 4;

function tickSuddenDeath(room) {
  if (!room?.config?.roomModifiers?.suddenDeath) return null;
  if (typeof room.suddenDeathCounter !== 'number') room.suddenDeathCounter = 0;
  room.suddenDeathCounter++;
  if (room.suddenDeathCounter < SUDDEN_DEATH_THRESHOLD) return null;

  // Threshold reached — bump every alive player's chamber by one,
  // reset counter, return banner payload.
  const bumpedIds = [];
  for (const p of room.players) {
    if (p.status !== 'alive') continue;
    const before = p.chamber || [];
    const next = addBulletToChamber(before);
    if (next !== before) {
      p.chamber = next;
      p.riskLevel = next.filter(s => s === 'bullet').length;
      bumpedIds.push(p.id);
    } else {
      // Chamber was already full — nothing changes. Still credit the
      // player as "affected" so the UI can flash them; their risk
      // stays at 6.
      bumpedIds.push(p.id);
    }
  }
  room.suddenDeathCounter = 0;
  return {
    kind: 'sudden_death',
    affectedPlayerIds: bumpedIds,
  };
}

function resetSuddenDeath(room) {
  if (room) room.suddenDeathCounter = 0;
}

// ─── Mirror Match (Phase E2) ─────────────────────────────────
//
// Spec: only selectable when alive count is EVEN at game start.
// When a player spins, the player directly opposite them in the
// turn order ALSO spins immediately. Modifier stays active even
// when alive count goes odd post-elimination (locked decision —
// fall back to "next alive in opposite direction").
//
// Engine helper: pure target finder. Returns the opposite player's
// id, or null if there's no eligible opposite (only one alive, etc.).

function getMirrorMatchOpposite(room, originalPlayerId) {
  if (!room?.mirrorMatchActive) return null;
  const order = room.turnOrder || [];
  if (order.length < 2) return null;
  const idx = order.indexOf(originalPlayerId);
  if (idx === -1) return null;

  const oppositeIdx = (idx + Math.floor(order.length / 2)) % order.length;
  const oppositeId = order[oppositeIdx];
  if (!oppositeId || oppositeId === originalPlayerId) return null;

  const opposite = room.players.find(p => p.id === oppositeId);
  if (opposite && opposite.status === 'alive') return oppositeId;

  // Fallback: walk forward from oppositeIdx looking for the next alive
  // player who isn't `originalPlayerId`. Spec phrasing: "next alive in
  // opposite direction".
  for (let step = 1; step < order.length; step++) {
    const probeIdx = (oppositeIdx + step) % order.length;
    const probeId = order[probeIdx];
    if (probeId === originalPlayerId) continue;
    const probe = room.players.find(p => p.id === probeId);
    if (probe && probe.status === 'alive') return probeId;
  }
  return null;
}

/**
 * Called when a bullet hits — counter resets, and if the player held
 * a bounty it's cleared (no reward, just gone).
 */
function onEliminationForBounty(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;
  player.consecutiveSurvivedSpins = 0;
  if (player.hasBounty) {
    player.hasBounty = false;
  }
}

/**
 * A successful bluff against the bounty holder collects the bounty:
 *   - Bounty clears.
 *   - Accuser's risk level drops by 1 (one bullet removed if any).
 *   - Counter resets.
 *
 * Returns a banner event payload or null. Pure mutation — does NOT
 * gate on room.config.systems.bounty here so callers can replay the
 * collection on legacy rooms; the caller checks the flag before
 * invoking in normal flow.
 */
function collectBounty(room, accusedId, accuserId) {
  const accused = room.players.find(p => p.id === accusedId);
  const accuser = room.players.find(p => p.id === accuserId);
  if (!accused?.hasBounty) return null;
  accused.hasBounty = false;
  accused.consecutiveSurvivedSpins = 0;
  let droppedTo = null;
  if (accuser) {
    const bullets = accuser.chamber
      .map((s, i) => (s === 'bullet' ? i : -1))
      .filter(i => i !== -1);
    if (bullets.length > 0) {
      const removeIdx = bullets[Math.floor(Math.random() * bullets.length)];
      const next = [...accuser.chamber];
      next[removeIdx] = null;
      accuser.chamber = next;
      accuser.riskLevel = next.filter(s => s === 'bullet').length;
      droppedTo = accuser.riskLevel;
    } else {
      droppedTo = 0;
    }
  }
  return {
    kind: 'bounty_collected',
    holderId: accusedId,
    holderName: accused.username || null,
    accuserId: accuser?.id || null,
    accuserName: accuser?.username || null,
    accuserRiskAfter: droppedTo,
  };
}

// ─── v2 Phase F — Betting ────────────────────────────────────
//
// When a spin enters spin_pending, a 10s betting window opens for
// every alive player except the spin target. Players bet
// 'survive' | 'eliminated'. After the spin resolves we evaluate.
// Correct guesses bump consecutiveCorrectBets; at 3 the player's
// risk level drops by 1 and counter resets.
const BETTING_STREAK_REWARD = 3;
const BETTING_WINDOW_MS = 10_000;

/**
 * Initialise the betting state on a room. Called when entering
 * spin_pending if the system is enabled. Returns the eligible bettor
 * ids (everyone alive except the spin target).
 */
function startBettingWindow(room) {
  if (!room?.config?.systems?.betting) return [];
  if (!room.spinTargetId) return [];
  const eligibleIds = room.players
    .filter(p => p.status === 'alive' && p.id !== room.spinTargetId)
    .map(p => p.id);
  room.betting = {
    spinTargetId: room.spinTargetId,
    eligibleIds,
    bets: {}, // playerId → 'survive' | 'eliminated'
    startedAt: Date.now(),
    closesAt: Date.now() + BETTING_WINDOW_MS,
    closed: false,
  };
  return eligibleIds;
}

/**
 * Place / overwrite a bet. Returns { ok, error? }.
 */
function placeBet(room, playerId, prediction) {
  if (!room?.betting || room.betting.closed) {
    return { ok: false, error: 'No betting window open' };
  }
  if (!['survive', 'eliminated'].includes(prediction)) {
    return { ok: false, error: 'Invalid prediction' };
  }
  if (!room.betting.eligibleIds.includes(playerId)) {
    return { ok: false, error: 'Not eligible to bet' };
  }
  room.betting.bets[playerId] = prediction;
  return { ok: true };
}

/**
 * Close the betting window without evaluating. Idempotent.
 */
function closeBettingWindow(room) {
  if (!room?.betting) return;
  room.betting.closed = true;
}

/**
 * Evaluate bets after a spin resolves. For each bet:
 *   - correct  → consecutiveCorrectBets++
 *                if reaches BETTING_STREAK_REWARD, drop a bullet from
 *                their chamber and reset to 0.
 *   - wrong    → consecutiveCorrectBets resets to 0.
 *
 * Returns array of banner events for streak rewards.
 */
function evaluateBets(room, eliminated) {
  if (!room?.betting) return [];
  const events = [];
  const actual = eliminated ? 'eliminated' : 'survive';
  for (const [pid, prediction] of Object.entries(room.betting.bets)) {
    const player = room.players.find(p => p.id === pid);
    if (!player) continue;
    if (prediction === actual) {
      player.consecutiveCorrectBets = (player.consecutiveCorrectBets || 0) + 1;
      if (player.consecutiveCorrectBets >= BETTING_STREAK_REWARD) {
        // Drop one bullet (if any).
        const bullets = player.chamber
          .map((s, i) => (s === 'bullet' ? i : -1))
          .filter(i => i !== -1);
        if (bullets.length > 0) {
          const removeIdx = bullets[Math.floor(Math.random() * bullets.length)];
          const next = [...player.chamber];
          next[removeIdx] = null;
          player.chamber = next;
          player.riskLevel = next.filter(s => s === 'bullet').length;
        }
        player.consecutiveCorrectBets = 0;
        events.push({
          kind: 'betting_streak_reward',
          holderId: player.id,
          holderName: player.username || null,
          riskAfter: player.riskLevel,
        });
      }
    } else {
      player.consecutiveCorrectBets = 0;
    }
  }
  // Clear the betting state after evaluation.
  room.betting = null;
  return events;
}

// ─── v2 Phase F — Dead Man's Hand ────────────────────────────
//
// When eliminated count crosses the threshold (alive < total - 2),
// trigger a 15s ghost vote among eliminated players. Each new
// elimination past the threshold opens a fresh vote.
//
// Three options:
//   1. Change required card shape to a new random shape
//   2. Give all living players one extra card
//   3. Activate a random risk modifier for one round
//      (only available if host enabled at least one risk modifier)
const DMH_VOTE_WINDOW_MS = 15_000;
const DMH_THRESHOLD_MARGIN = 2;

function _hasAnyRiskModifierEnabled(room) {
  const rm = room?.config?.riskModifiers;
  if (!rm) return false;
  return Object.values(rm).some(Boolean);
}

/**
 * Should we open a DMH vote? Called immediately after an
 * elimination is finalised in the turn order. Returns true if
 * eliminated count > DMH_THRESHOLD_MARGIN.
 */
function shouldOpenGhostVote(room) {
  if (!room?.config?.systems?.deadMansHand) return false;
  const total = room.players.length;
  const alive = room.players.filter(p => p.status === 'alive').length;
  return (total - alive) > DMH_THRESHOLD_MARGIN;
}

/**
 * Initialise the ghost vote state. Returns the option list (array of
 * 1-3 ints corresponding to vote option ids; option 3 is omitted
 * when no risk modifiers are configured).
 */
function startGhostVote(room) {
  const optionIds = [1, 2];
  if (_hasAnyRiskModifierEnabled(room)) optionIds.push(3);
  room.ghostVote = {
    optionIds,
    votes: {}, // ghostId → optionId
    startedAt: Date.now(),
    closesAt: Date.now() + DMH_VOTE_WINDOW_MS,
    eligibleVoterIds: room.players
      .filter(p => p.status === 'eliminated')
      .map(p => p.id),
    closed: false,
  };
  return room.ghostVote;
}

function castGhostVote(room, voterId, optionId) {
  if (!room?.ghostVote || room.ghostVote.closed) {
    return { ok: false, error: 'No ghost vote open' };
  }
  if (!room.ghostVote.optionIds.includes(optionId)) {
    return { ok: false, error: 'Invalid option' };
  }
  if (!room.ghostVote.eligibleVoterIds.includes(voterId)) {
    return { ok: false, error: 'Only eliminated players can vote' };
  }
  room.ghostVote.votes[voterId] = optionId;
  return { ok: true };
}

/**
 * Tally the ghost vote and apply the winning effect (or no-op on
 * tie). Returns { winningOption, applied, banner } where banner is
 * the event payload for the table.
 */
function resolveGhostVote(room) {
  if (!room?.ghostVote) return null;
  room.ghostVote.closed = true;
  const counts = {};
  for (const opt of room.ghostVote.optionIds) counts[opt] = 0;
  for (const v of Object.values(room.ghostVote.votes)) {
    if (counts[v] !== undefined) counts[v]++;
  }
  // Find max — if a tie at the top, no-op.
  let max = -1;
  let winner = null;
  let tie = false;
  for (const [opt, n] of Object.entries(counts)) {
    if (n > max) { max = n; winner = Number(opt); tie = false; }
    else if (n === max) { tie = true; }
  }
  if (max <= 0 || tie || winner == null) {
    const banner = {
      kind: 'ghost_vote_result',
      winningOption: null,
      applied: 'noop',
      counts,
    };
    room.ghostVote = null;
    return banner;
  }

  let applied = 'noop';
  if (winner === 1) {
    // Change required shape to a new random shape (different from
    // the current).
    const candidates = SHAPES.filter(s => s !== room.currentCardType);
    const next = candidates[Math.floor(Math.random() * candidates.length)] || SHAPES[0];
    room.currentCardType = next;
    applied = `shape:${next}`;
  } else if (winner === 2) {
    // Give every alive player one extra card.
    if (room.mode === MODES.ONLINE) {
      for (const p of room.players) {
        if (p.status !== 'alive') continue;
        drawCardForPlayer(room, p.id);
      }
    }
    applied = 'extra_cards';
  } else if (winner === 3) {
    // Activate a random enabled risk modifier "for one round only".
    // We just stamp it on a temporary slot — Phase E owns the actual
    // semantics. We keep this conservative and well-documented.
    const enabledMods = Object.entries(room.config?.riskModifiers || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (enabledMods.length > 0) {
      const pick = enabledMods[Math.floor(Math.random() * enabledMods.length)];
      room.activeGhostRiskMod = { name: pick, expiresAtRound: room.roundNumber + 1 };
      applied = `risk_mod:${pick}`;
    } else {
      applied = 'noop';
    }
  }

  const banner = {
    kind: 'ghost_vote_result',
    winningOption: winner,
    applied,
    counts,
  };
  room.ghostVote = null;
  return banner;
}

// ─── v2 Phase F — Last Stand ─────────────────────────────────
//
// When alive count = 2 and no pending pause phases, the room
// transitions into Last Stand mode. Both players' hands are cleared,
// chambers reset to 1 bullet, armed power cards consumed, role
// passives suspended for the duration. Two actions per turn:
// last_stand_spin and last_stand_end_turn. Winner = last alive after
// a fail spin.

function _allPendingPhasesClear(room) {
  return ![
    'spin_pending',
    'swap_pending',
    'medic_pending',
    'sniper_pending',
    'bluff_resolution',
    'betting_pending',
    'ghost_vote_pending',
    'last_stand',
  ].includes(room.phase);
}

function shouldEnterLastStand(room) {
  if (!room?.config?.systems?.lastStand) return false;
  if (room.phase === 'last_stand') return false;
  const alive = room.players.filter(p => p.status === 'alive');
  if (alive.length !== 2) return false;
  return _allPendingPhasesClear(room);
}

/**
 * Initialise Last Stand on the room. Mutates: clears the two
 * finalists' hands (push to discardPile), resets chambers, clears
 * armedPowerCard. Sets phase = 'last_stand'. Records lastStand state
 * with a turn pointer.
 */
function enterLastStand(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  if (alive.length !== 2) return null;

  if (!room.discardPile) room.discardPile = [];

  for (const p of alive) {
    if (room.hands && room.hands.has(p.id)) {
      const hand = room.hands.get(p.id) || [];
      for (const card of hand) room.discardPile.push(card);
      room.hands.set(p.id, []);
    }
    p.armedPowerCard = null;
    p.chamber = initChamber();
    p.riskLevel = p.chamber.filter(s => s === 'bullet').length;
  }

  room.phase = 'last_stand';
  room.spinTargetId = null;
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  // Pick a starting player — first finalist in the existing turn
  // order so it's deterministic from the room's perspective.
  const orderedFinalists = room.turnOrder.filter(id =>
    alive.some(p => p.id === id)
  );
  room.lastStand = {
    finalistIds: orderedFinalists.length === 2 ? orderedFinalists : alive.map(p => p.id),
    activeFinalistId: (orderedFinalists[0] || alive[0].id),
    startedAt: Date.now(),
  };
  // Synthesise the turn order to just the two finalists so any
  // generic turn-querying UI still works coherently.
  room.turnOrder = [...room.lastStand.finalistIds];
  room.currentTurnIndex = 0;
  if (room.turnOrder[0] !== room.lastStand.activeFinalistId) {
    room.currentTurnIndex = room.turnOrder.indexOf(room.lastStand.activeFinalistId);
  }
  room.lastAction = {
    type: 'last_stand_started',
    finalistIds: room.lastStand.finalistIds,
  };
  return room.lastStand;
}

/**
 * The active finalist pulls the trigger. Returns the spin result
 * payload and any post-state (game_over winner if applicable).
 */
function lastStandSpin(room, playerId) {
  if (room.phase !== 'last_stand') return { ok: false, error: 'Not in Last Stand' };
  if (!room.lastStand) return { ok: false, error: 'Last Stand state missing' };
  if (room.lastStand.activeFinalistId !== playerId) {
    return { ok: false, error: 'Not your turn' };
  }
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found' };

  const chamberBefore = [...player.chamber];
  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber);
  player.chamber = chamber;
  player.riskLevel = bulletCount;
  if (eliminated) {
    player.status = 'eliminated';
    player.isSpectator = true;
  }
  return {
    ok: true,
    spinIndex,
    eliminated,
    chamberBefore,
    chamberAfter: player.chamber,
    riskLevel: bulletCount,
  };
}

function isMirrorMatchEligibleAtStart(room) {
  // Mirror Match requires an EVEN alive count at the moment of
  // start_game. Caller validates and refuses the start if this is
  // false; the engine's own startGame doesn't enforce it because the
  // physical-mode start has different validation needs.
  const alive = room.players.filter(p => p.status === 'alive').length;
  return alive >= 2 && alive % 2 === 0;
}

// ─── Redemption Spin (Phase E1) ──────────────────────────────
//
// Spec table for K (number of eliminated players who get a second
// chance): 2-4 → 1, 5-6 → 2, 7-9 → 3, 10-12 → 4, 13-15 → 5.
// Trigger: end of every round (between round_end and the next deal).
// Each chosen player spins their CURRENT chamber. Survivors re-enter
// with 3 fresh cards and their chamber is RESET to a fresh 1-bullet
// chamber. Failures stay eliminated.
//
// Disabled once Last Stand is active — `room.lastStandActive` is the
// hook flag (Phase F3 will flip it on; until then it's never set, so
// Redemption Spin always runs when configured).

function _redemptionSubsetSize(totalPlayers) {
  // Locked-decision table from the spec roadmap. Total = ALL players
  // ever in the game (alive + eliminated). Round-up of 40% would also
  // produce the same numbers across this range, but the explicit
  // table avoids ambiguity.
  if (totalPlayers <= 1) return 0;
  if (totalPlayers <= 4) return 1;
  if (totalPlayers <= 6) return 2;
  if (totalPlayers <= 9) return 3;
  if (totalPlayers <= 12) return 4;
  return 5;
}

/**
 * Pure helper: pick the eliminated players who get a second chance
 * this round. Returns up to K random eliminated player ids. Does NOT
 * mutate state.
 */
function pickRedemptionCandidates(room) {
  if (!room?.config?.riskModifiers?.redemptionSpin) return [];
  if (room.lastStandActive) return [];
  const total = room.players.length;
  const eliminated = room.players.filter(p => p.status === 'eliminated' && !p._redemptionConsumed);
  if (eliminated.length === 0) return [];
  const alive = room.players.filter(p => p.status === 'alive').length;
  if (alive <= 1) return []; // Game's already over.

  const k = Math.min(_redemptionSubsetSize(total), eliminated.length);
  if (k === 0) return [];
  const shuffled = _shuffle(eliminated);
  return shuffled.slice(0, k).map(p => p.id);
}

/**
 * Run a single redemption spin for `playerId` against their CURRENT
 * chamber. On survival: revive into the turn order (append), reset
 * chamber to a fresh 1-bullet chamber, deal 3 fresh cards (online
 * mode), clear isSpectator. On failure: stay eliminated.
 *
 * Modifier interactions:
 *   • Double Barrel still applies during a redemption spin (it's a
 *     spin like any other).
 *   • Hot Potato also applies — if they survive, the +2 bullet rule
 *     would kick in… BUT the chamber is reset on success regardless,
 *     so functionally the only relevant case is elimination.
 *   • Russian Roulette: chamber reset on success ALWAYS goes back to
 *     1 bullet (not 3). Spec language: "gun chamber RESETS to 1 bullet".
 *
 * Returns:
 *   {
 *     playerId, eliminated, spinIndex,
 *     chamber: chamberBefore,        // for animation
 *     chamberAfter: chamberAfter,    // post-spin / post-reset
 *     riskLevel,
 *     freshCards: Card[]             // empty array if eliminated
 *   }
 */
function runRedemptionSpin(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  if (player.status !== 'eliminated') return null;
  player._redemptionConsumed = true; // each elim only gets one shot per round

  const chamberBefore = [...player.chamber];
  const modifiers = getSpinModifiers(room);
  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber, modifiers);

  if (eliminated) {
    // Stay eliminated — chamber stays as-is. (pullTrigger only mutates
    // chamber on survival, so `chamber` here is the unchanged input.)
    player.chamber = chamber;
    player.riskLevel = bulletCount;
    return {
      playerId,
      eliminated: true,
      spinIndex,
      chamber: chamberBefore,
      chamberAfter: chamber,
      riskLevel: bulletCount,
      freshCards: [],
    };
  }

  // Survived → revive.
  player.status = 'alive';
  player.isSpectator = false;
  // Chamber RESETS to 1 bullet (locked).
  player.chamber = initChamber(1);
  player.riskLevel = 1;
  // Re-insert into turn order if not already present. We APPEND;
  // they take their turn when rotation comes around to them.
  if (!room.turnOrder.includes(playerId)) {
    room.turnOrder.push(playerId);
  }

  // Online mode: fresh hand of 3 (Redemption Spin survivors get a
  // smaller hand than normal-survival's 6 — see locked decision).
  let freshCards = [];
  if (room.mode === MODES.ONLINE) {
    freshCards = resetHandOnSurvival(room, playerId, 3);
  }

  return {
    playerId,
    eliminated: false,
    spinIndex,
    chamber: chamberBefore,
    chamberAfter: player.chamber,
    riskLevel: player.riskLevel,
    freshCards,
  };
}

/**
 * Pass the gun to the other finalist. Used when the active player
 * survives. Updates lastStand.activeFinalistId and currentTurnIndex.
 */
function lastStandEndTurn(room, playerId) {
  if (room.phase !== 'last_stand') return { ok: false, error: 'Not in Last Stand' };
  if (!room.lastStand) return { ok: false, error: 'Last Stand state missing' };
  if (room.lastStand.activeFinalistId !== playerId) {
    return { ok: false, error: 'Not your turn' };
  }
  const [a, b] = room.lastStand.finalistIds;
  const next = playerId === a ? b : a;
  room.lastStand.activeFinalistId = next;
  room.currentTurnIndex = room.turnOrder.indexOf(next);
  if (room.currentTurnIndex < 0) room.currentTurnIndex = 0;
  return { ok: true, nextActiveId: next };
}

/**
 * Reset per-round redemption bookkeeping. Called from resetRoundOnline
 * BEFORE a new round starts so the next round's redemption pass can
 * pick from any newly-eliminated players too.
 */
function resetRedemptionFlags(room) {
  for (const p of room.players) {
    delete p._redemptionConsumed;
  }
}

// ─── Utilities ─────────────────────────────────────────────────

function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;
  room.turnOrder.splice(idx, 1);
  // Splice already advanced the position for idx === currentTurnIndex
  // (the next player slid into the eliminated player's slot). Only
  // decrement when an earlier-positioned player was removed.
  if (idx < room.currentTurnIndex) {
    room.currentTurnIndex--;
  }
  if (room.turnOrder.length > 0) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
  }
  // Eliminations remove from Swap pending sets WITHOUT crediting —
  // a Swap shouldn't suddenly unlock just because someone died. The
  // alive-set snapshot still mirrors the live alive set this way.
  _removePlayerFromSwapSnapshots(room, playerId);
  // v2 Phase E2 — Sudden Death: any elimination resets the streak
  // counter to 0. Locked decision per the roadmap.
  resetSuddenDeath(room);
}

function handleDisconnect(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player || player.status === 'eliminated') return null;
  player.status = 'eliminated';
  player.isSpectator = true;
  eliminateFromTurnOrder(room, player.id);
  return player;
}

function checkGameOver(room) {
  const alive = room.players.filter(p => p.status === 'alive');
  return alive.length <= 1 ? alive[0] || null : false;
}

function declareRoundWinner(room, playerId) {
  const winner = room.players.find(p => p.id === playerId);
  if (!winner) return null;
  room.phase = 'round_end';
  room.roundNumber++;
  room.lastAction = { type: 'round_win', winnerId: playerId, winnerName: winner.username };
  return winner;
}

function reconnectPlayer(room, playerId, newSocketId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  player.socketId = newSocketId;
  return player;
}

// ─── Serialization ─────────────────────────────────────────────

function serializeRoom(room, requestingPlayerId = null) {
  const isOnline = room.mode === MODES.ONLINE;

  return {
    code: room.code,
    mode: room.mode,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      status: p.status,
      riskLevel: p.riskLevel,
      chamber: p.chamber,            // ← full chamber exposed to all clients
      isSpectator: p.isSpectator,
      handSize: isOnline && room.hands ? (room.hands.get(p.id) || []).length : undefined,
      // armedPowerCard is exposed publicly so UI can hint that this
      // player has a power ready (e.g. "armed: shield"). Phase B
      // ships the field; effects + announce banners come in Phase C.
      armedPowerCard: p.armedPowerCard
        ? { power: p.armedPowerCard.power }
        : null,
      // v2 Phase D — role privacy. Only expose the requesting
      // player's own role (or game_over reveal). Everyone else's
      // role is `null` to keep the secret-roles game intact.
      // Public role activation banners (Sheriff anti-Assassin,
      // Sniper redirect) ride in `power_card_triggered` payloads.
      role:
        p.id === requestingPlayerId
          ? (p.role || 'barehand')
          : (room.phase === 'game_over' ? (p.role || 'barehand') : null),
      // v2 Phase D — role ability flags. Only the player themselves
      // sees their own ability availability — never leaked publicly
      // (would expose role identity by elimination).
      medicAbilityAvailable: p.id === requestingPlayerId ? !!p.medicAbilityAvailable : undefined,
      saboteurAbilityAvailable: p.id === requestingPlayerId ? !!p.saboteurAbilityAvailable : undefined,
      sniperAbilityAvailable: p.id === requestingPlayerId ? !!p.sniperAbilityAvailable : undefined,
      // v2 Phase F — Bounty + Betting public state. hasBounty is
      // public (the table NEEDS to know who is targeted). The streak
      // counters are also public so the player list can show a small
      // running tally next to each chip.
      hasBounty: !!p.hasBounty,
      consecutiveSurvivedSpins: p.consecutiveSurvivedSpins || 0,
      consecutiveCorrectBets: p.consecutiveCorrectBets || 0,
    })),
    turnOrder: room.turnOrder,
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    currentCardType: room.currentCardType,
    currentCard: room.currentCard || null,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastAction: room.lastAction,
    bluffUsedThisTurn: room.bluffUsedThisTurn || false,
    cardPlayedThisTurn: room.cardPlayedThisTurn || false,
    // Phase C — Freeze. Exposed so the UI can grey out / hide the
    // "Call Bluff" button on the turn that follows a freeze-skip.
    bluffBlockedThisTurn: room.bluffBlockedThisTurn || false,
    spinTargetId: room.spinTargetId || null,
    isFirstTurn: room.isFirstTurn || false,
    deckSize: isOnline && room.deck ? room.deck.length : undefined,
    playedPileSize: isOnline && room.playedPile ? room.playedPile.length : undefined,
    discardPileSize: isOnline && room.discardPile ? room.discardPile.length : undefined,
    myHand: isOnline && requestingPlayerId && room.hands
      ? (room.hands.get(requestingPlayerId) || [])
      : undefined,
    chatLog: room.chatLog || [],
    config: room.config || null,
    // v2 Phase C — Swap pause: holderId is set while phase ===
    // 'swap_pending' so the holder's UI can render the picker. The
    // anonymised pile of options is computed client-side from
    // serialised playedPile-equivalent on the holder side; here we
    // expose it to ALL clients so they all know who is picking, but
    // only the holder will see the modal.
    swapHolderId: isOnline ? (room.swapHolderId || null) : undefined,
    // Anonymised options for the Swap picker. We expose this only
    // to the actual holder (the engine has no socket context, so we
    // gate on requestingPlayerId here in the engine layer to keep
    // socketHandlers free of card-data leak risk). Each item is just
    // an opaque id; shape and number are intentionally stripped so
    // the picker is truly blind.
    swapPickOptions:
      isOnline
      && room.phase === 'swap_pending'
      && room.swapHolderId
      && requestingPlayerId === room.swapHolderId
      && Array.isArray(room.playedPile)
        ? room.playedPile.map(c => ({ id: c.id }))
        : undefined,
    // v2 Phase D — Medic save pause. Public summary so every client
    // can render "Medic is deciding..." while the privately-prompted
    // Medic chooses save / decline. We don't leak the Medic's id to
    // anyone except themselves (would defeat secret-roles).
    pendingMedicSave: isOnline && room.pendingMedicSave
      ? {
          eliminatedPlayerId: room.pendingMedicSave.eliminatedPlayerId,
          eliminatedPlayerName: room.pendingMedicSave.eliminatedPlayerName,
          source: room.pendingMedicSave.source,
          // Only the Medic sees the prompt directly; everyone else
          // just sees "Medic deciding". The amTargetMedic flag is
          // here so the Medic's UI knows to render the modal.
          amTargetMedic: requestingPlayerId === room.pendingMedicSave.medicId,
        }
      : null,
    // v2 Phase D — Sniper redirect pause. Public knows "someone is
    // redirecting"; only the Sniper sees the target picker. The
    // Sniper's eligibleTargetIds list is gated to them.
    pendingSniperRedirect: isOnline && room.pendingSniperRedirect
      ? {
          // Public: original spin target so the table sees "Sniper
          // is redirecting away from <X>".
          originalSpinTargetId: room.pendingSniperRedirect.originalSpinTargetId,
          originalSpinTargetName: room.pendingSniperRedirect.originalSpinTargetName,
          amTargetSniper: requestingPlayerId === room.pendingSniperRedirect.sniperId,
          // Eligible targets only sent to the Sniper.
          eligibleTargetIds:
            requestingPlayerId === room.pendingSniperRedirect.sniperId
              ? room.pendingSniperRedirect.eligibleTargetIds
              : undefined,
        }
      : null,
    // v2 Phase F — Betting state. Exposed to all clients while the
    // window is open so each player can render the bet popup or the
    // "betting in progress" wait screen. Includes the spin target,
    // window deadline (server-time ms epoch), and whether THIS player
    // has already placed a bet. Does NOT leak others' bets.
    betting: isOnline && room.betting && !room.betting.closed
      ? {
          spinTargetId: room.betting.spinTargetId,
          eligibleIds: room.betting.eligibleIds,
          closesAt: room.betting.closesAt,
          myBet: requestingPlayerId
            ? (room.betting.bets[requestingPlayerId] || null)
            : null,
        }
      : null,
    // v2 Phase F — Ghost vote state. Exposed to all clients but only
    // the eligible voters (eliminated players) see the option list
    // — living players just see a "ghost council deciding" notice.
    ghostVote: isOnline && room.ghostVote && !room.ghostVote.closed
      ? {
          closesAt: room.ghostVote.closesAt,
          // Only eliminated players see options + their cast vote.
          optionIds: room.ghostVote.eligibleVoterIds.includes(requestingPlayerId)
            ? room.ghostVote.optionIds
            : null,
          myVote: requestingPlayerId
            ? (room.ghostVote.votes[requestingPlayerId] || null)
            : null,
          amGhostVoter: room.ghostVote.eligibleVoterIds.includes(requestingPlayerId),
        }
      : null,
    // v2 Phase F — Last Stand. Exposed to all clients so the
    // duel cinematic renders for everyone simultaneously.
    lastStand: isOnline && room.lastStand
      ? {
          finalistIds: room.lastStand.finalistIds,
          activeFinalistId: room.lastStand.activeFinalistId,
        }
      : null,
    // v2 Phase E2 — Speed Mode countdown. The server stores
    // `room.speedModeDeadline` (an absolute ms timestamp) when a
    // turn-bound timer is armed. We expose msRemaining so the client
    // can render a countdown ring without polling.
    speedModeMsRemaining:
      isOnline && room.config?.roomModifiers?.speedMode && room.speedModeDeadline
        ? Math.max(0, room.speedModeDeadline - Date.now())
        : undefined,
    // v2 Phase E2 — Sudden Death streak counter exposed publicly so
    // every client can hint "X turns until risk bump" if they want.
    suddenDeathCounter: isOnline ? (room.suddenDeathCounter || 0) : undefined,
    // v2 Phase E2 — Mirror Match active flag (latched at game start).
    mirrorMatchActive: isOnline ? !!room.mirrorMatchActive : undefined,
  };
}

module.exports = {
  MODES,
  CARD_TYPES,
  SHAPES,
  POWER_TYPES,
  ROLES,
  ROLE_TYPES,
  ROLES_AT_MIN_ALIVE,
  COLLECTOR_POWER_CARD_CAP,
  MAX_PLAYERS,
  CHAMBER_SIZE,
  generateRoomCode,
  defaultRoomConfig,
  normalizeRoomConfig,
  randomCardType,
  randomShape,
  generateDeck,
  shuffleDeck,
  buildDeck,
  buildPowerCards,
  dealCards,
  initChamber,
  addBulletToChamber,
  pullTrigger,
  createRoom,
  createPlayer,
  startGame,
  advanceTurn,
  newCardType,
  spinGun,
  resetHandOnSurvival,
  resolveBluff,
  resolveBluffOnline,
  eliminateFromTurnOrder,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
  validateAndPlayCard,
  ensureDrawPile,
  drawCardForPlayer,
  resetRoundOnline,
  activatePowerCard,
  applyAssassinDeclinePenalty,
  consumeFreezeOnTurnEnd,
  isSwapActivatable,
  isArmedFromPriorTurn,
  serializeRoom,
  getCurrentPlayer,
  appendChatMessage,
  CHAT_TEXT_MAX,
  // v2 Phase D — Secret roles
  assignRoles,
  getRole,
  findAvailableMedic,
  findAvailableSniper,
  applyMedicSave,
  applySaboteurTransfer,
  applySniperRedirect,
  // v2 Phase F — Bounty
  BOUNTY_THRESHOLD,
  onSurvivalForBounty,
  onEliminationForBounty,
  collectBounty,
  // v2 Phase F — Betting
  BETTING_WINDOW_MS,
  BETTING_STREAK_REWARD,
  startBettingWindow,
  placeBet,
  closeBettingWindow,
  evaluateBets,
  // v2 Phase F — Dead Man's Hand
  DMH_VOTE_WINDOW_MS,
  DMH_THRESHOLD_MARGIN,
  shouldOpenGhostVote,
  startGhostVote,
  castGhostVote,
  resolveGhostVote,
  // v2 Phase F — Last Stand
  shouldEnterLastStand,
  enterLastStand,
  lastStandSpin,
  lastStandEndTurn,
  // v2 Phase E — Risk + Room modifiers
  getSpinModifiers,
  tickSuddenDeath,
  resetSuddenDeath,
  SUDDEN_DEATH_THRESHOLD,
  getMirrorMatchOpposite,
  isMirrorMatchEligibleAtStart,
  pickRedemptionCandidates,
  runRedemptionSpin,
  resetRedemptionFlags,
};
