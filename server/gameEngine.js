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
 * Create a fresh chamber with exactly 1 bullet at a random position
 */
function initChamber() {
  const chamber = new Array(CHAMBER_SIZE).fill(null);
  chamber[Math.floor(Math.random() * CHAMBER_SIZE)] = 'bullet';
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
 * Returns { spinIndex, eliminated, chamber, bulletCount }
 */
function pullTrigger(chamber) {
  const spinIndex = Math.floor(Math.random() * CHAMBER_SIZE);
  const eliminated = chamber[spinIndex] === 'bullet';
  const updatedChamber = eliminated ? chamber : addBulletToChamber(chamber);
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

  return room;
}

// ─── Gun spin ──────────────────────────────────────────────────
// Now fully deterministic — backend picks spinIndex from chamber array.
// Frontend receives { spinIndex, chamber } and animates to that exact slot.

function spinGun(player) {
  // v2 Phase D — Gambler role: risk level NEVER increases from
  // surviving spins. We accomplish this by spinning normally to
  // determine elimination, but on SURVIVAL we revert the chamber
  // back to its pre-spin state (no extra bullet added). On
  // elimination we still let `pullTrigger` return its result —
  // chamber stays as-is in either case (pullTrigger only mutates
  // it on survival anyway). Note: external modifiers like Sudden
  // Death (Phase E2) are applied OUTSIDE this fn and can still
  // bump Gambler's risk level — exactly per spec.
  const isGambler = player.role === 'gambler';
  const before = [...player.chamber];

  const { spinIndex, eliminated, chamber, bulletCount } = pullTrigger(player.chamber);

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
};
