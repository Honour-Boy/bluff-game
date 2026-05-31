// ============================================================
// ENGINE — Pre-game selection & role reveal (v2 Phase G, #116)
// ============================================================
// Pure functions for the lobby → pre_game → playing flow. Roles are
// already assigned and hands already dealt by room.startGame(); this
// module only layers the pre_game phase on top: per-player selection
// pools, one-shot confirmation tracking, and the finaliser that adds
// the chosen bonus card before handing control to normal play.
//
// Timers + private socket emits live in the handler layer
// (handlers/game.js). Everything here is I/O-free and deterministic
// given Math.random, matching the rest of engine/.

const {
  MODES,
  SHAPES,
  POWER_TYPES,
  PRE_GAME_SELECTION_TIMEOUT_MS,
  PRE_GAME_LATE_THRESHOLD_MS,
} = require('./constants');
const { shuffleDeck } = require('./deck');

let _poolIdCounter = 0;
function _nextPoolId(playerId, tag) {
  return `pgsel-${playerId}-${tag}-${(_poolIdCounter++).toString(36)}`;
}

/**
 * Build ONE player's independent, non-finite selection pool: ONLY the
 * power types the host enabled for this room (`enabledPowers`) plus a
 * single randomly-generated normal shape card (the "Additional Card"
 * — the forgo-a-power option, always present). Pools are generated
 * per-player — duplicate picks across players are expected and fine
 * (nothing is drawn from the shared deck). Returned cards are real,
 * hand-ready card objects with unique ids; the order is shuffled so the
 * client's face-down layout doesn't betray which slot holds which
 * option.
 *
 * `enabledPowers` defaults to all POWER_TYPES so existing callers/tests
 * that don't pass a config keep their old behaviour; `beginPreGame`
 * passes the host-enabled subset so a disabled power never appears as a
 * pickable pre-game option.
 */
function generateSelectionPool(playerId, enabledPowers = POWER_TYPES) {
  const powers = Array.isArray(enabledPowers) ? enabledPowers : POWER_TYPES;
  const pool = powers
    .filter(power => POWER_TYPES.includes(power))
    .map(power => ({
      id: _nextPoolId(playerId, power),
      type: 'power',
      power,
    }));

  const nonWhotShapes = SHAPES.filter(s => s !== 'whot');
  const shape = nonWhotShapes[Math.floor(Math.random() * nonWhotShapes.length)];
  const number = 1 + Math.floor(Math.random() * 14);
  pool.push({
    id: _nextPoolId(playerId, 'shape'),
    type: 'shape',
    shape,
    number,
  });

  return shuffleDeck(pool);
}

function _alivePlayers(room) {
  return room.players.filter(p => p.status === 'alive');
}

/**
 * Enter the pre_game phase. Call AFTER room.startGame() has dealt
 * hands and assigned roles (online mode only). Generates a pool per
 * alive player and resets selection bookkeeping. Selection is NOT yet
 * open — the handler opens it via startPreGameSelection once the
 * role-reveal display window elapses.
 */
function beginPreGame(room) {
  if (room.mode !== MODES.ONLINE) return room;

  room.phase = 'pre_game';
  room.pregamePools = {};
  room.pregameSelections = {};
  room.pregameSelectionsReady = new Set();
  room.pregameSelectionOpen = false;
  room.pregameSelectionDeadline = null;
  // §2.1 — ids of players who confirmed at/after the 12s threshold. They get a
  // private review buffer client-side and are kept off the first active turn.
  room.pregameLateSelectors = [];

  // Only the host-enabled power types are pickable. A power the host left
  // off must never surface as a pre-game option (it isn't in the deck either).
  const enabledMap = room.config?.powerCards?.enabled || {};
  const enabledPowers = POWER_TYPES.filter(power => enabledMap[power]);

  for (const p of _alivePlayers(room)) {
    room.pregamePools[p.id] = generateSelectionPool(p.id, enabledPowers);
  }

  return room;
}

/**
 * Open the selection window and stamp the auto-resolve deadline.
 * Returns the deadline (ms epoch) so the handler can schedule the
 * matching timeout.
 */
function startPreGameSelection(room) {
  room.pregameSelectionOpen = true;
  room.pregameSelectionDeadline = Date.now() + PRE_GAME_SELECTION_TIMEOUT_MS;
  return room.pregameSelectionDeadline;
}

function _readyCounts(room) {
  const total = _alivePlayers(room).length;
  const ready = room.pregameSelectionsReady ? room.pregameSelectionsReady.size : 0;
  return { totalCount: total, readyCount: ready, pendingCount: Math.max(0, total - ready) };
}

/**
 * Record a player's one-shot pick. Validates phase, that selection is
 * open, that the option belongs to the player's own pool, and that
 * they haven't already confirmed. Returns ready/pending counts and an
 * `allReady` flag so the caller can finalise early.
 */
function applyPreGameSelection(room, playerId, optionId) {
  if (room.phase !== 'pre_game') return { ok: false, error: 'Not in pre-game phase' };
  if (!room.pregameSelectionOpen) return { ok: false, error: 'Selection is not open yet' };

  const player = room.players.find(p => p.id === playerId);
  if (!player || player.status !== 'alive') return { ok: false, error: 'Not an active player' };

  const pool = room.pregamePools?.[playerId];
  if (!pool) return { ok: false, error: 'No selection pool for player' };
  if (room.pregameSelectionsReady?.has(playerId)) {
    return { ok: false, error: 'Selection already confirmed' };
  }

  const chosen = pool.find(c => c.id === optionId);
  if (!chosen) return { ok: false, error: 'Invalid selection' };

  room.pregameSelections[playerId] = chosen;
  room.pregameSelectionsReady.add(playerId);

  // §2.1 Rule 2 — a confirmation landing at/after the 12s threshold (i.e. with
  // at most TIMEOUT-THRESHOLD ms left on the clock) is "late". Record it so the
  // finaliser keeps the picker off the first turn, and flag it back to the
  // caller so the client can show the private review buffer.
  const remaining = room.pregameSelectionDeadline
    ? room.pregameSelectionDeadline - Date.now()
    : PRE_GAME_SELECTION_TIMEOUT_MS;
  const late = remaining <= (PRE_GAME_SELECTION_TIMEOUT_MS - PRE_GAME_LATE_THRESHOLD_MS);
  if (late) {
    if (!Array.isArray(room.pregameLateSelectors)) room.pregameLateSelectors = [];
    if (!room.pregameLateSelectors.includes(playerId)) room.pregameLateSelectors.push(playerId);
  }

  const counts = _readyCounts(room);
  return { ok: true, ...counts, late, allReady: counts.pendingCount === 0 };
}

/**
 * Resolve the pre_game phase: auto-assign a random pool option to any
 * alive player who didn't confirm, append every chosen card to its
 * owner's hand via the shared bonus-card mechanism, transition to
 * 'playing', and clear pre_game bookkeeping. Idempotent — a second
 * call (e.g. timer firing after an early all-ready finalise) is a
 * no-op because the phase is no longer 'pre_game'.
 */
function finalizePreGame(room) {
  if (room.phase !== 'pre_game') return { ok: false, error: 'Not in pre-game phase' };

  const alive = _alivePlayers(room);
  const autoAssigned = [];
  for (const p of alive) {
    if (room.pregameSelectionsReady?.has(p.id)) continue;
    const pool = room.pregamePools?.[p.id] || [];
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    room.pregameSelections[p.id] = pick;
    room.pregameSelectionsReady.add(p.id);
    autoAssigned.push(p.id);
  }

  // #140 — the pre-game pick decides the power slot: a player gets EITHER a
  // power card OR an extra ("Additional") shape card, never both. This
  // REPLACES the deal-time power grant (room.startGame guarantees one) so no
  // player starts with two power cards. A fresh power card is only obtainable
  // later by surviving a trigger round.
  if (!room.powerCardSlot) room.powerCardSlot = {};
  const aliveIds = alive.map(p => p.id);
  for (const [pid, card] of Object.entries(room.pregameSelections)) {
    if (card.type === 'power') {
      // The selection IS the player's start-of-game power card.
      const slotCard = { ...card, armed: false };
      if (slotCard.power === 'swap') {
        slotCard.swapPendingPlayerIds = aliveIds.filter(id => id !== pid);
      }
      room.powerCardSlot[pid] = [slotCard];
    } else {
      // "Additional Card" — the replacement penalty for forgoing a power
      // card: one extra shape card in hand and an EMPTY power slot.
      if (room.hands?.has?.(pid)) room.hands.get(pid).push(card);
      room.powerCardSlot[pid] = [];
    }
  }

  // #140 + §2.1 Rule 3 — deprioritise non-responders AND late pickers from the
  // first active turn. A player who never picked (auto-assigned) shouldn't open
  // the game and stall it; a late picker (§2.1) is mid-review-buffer and must
  // not be put on the clock for the opening turn. Seed the turn to the first
  // player in order who confirmed on time; if everyone was late/auto-assigned,
  // fall back to the existing start index.
  if (Array.isArray(room.turnOrder) && room.turnOrder.length > 0) {
    const deprioritised = new Set([
      ...autoAssigned,
      ...(Array.isArray(room.pregameLateSelectors) ? room.pregameLateSelectors : []),
    ]);
    const onTimeIdx = room.turnOrder.findIndex(
      id => id && !deprioritised.has(id) && aliveIds.includes(id),
    );
    room.currentTurnIndex = onTimeIdx === -1 ? 0 : onTimeIdx;
  }

  const assignments = { ...room.pregameSelections };

  room.phase = 'playing';
  delete room.pregamePools;
  delete room.pregameSelections;
  delete room.pregameSelectionsReady;
  delete room.pregameSelectionOpen;
  delete room.pregameSelectionDeadline;
  delete room.pregameLateSelectors;

  return { ok: true, assignments, autoAssigned };
}

module.exports = {
  generateSelectionPool,
  beginPreGame,
  startPreGameSelection,
  applyPreGameSelection,
  finalizePreGame,
};
