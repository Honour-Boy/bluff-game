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
} = require('./constants');
const { shuffleDeck, _appendExtraCards } = require('./deck');

let _poolIdCounter = 0;
function _nextPoolId(playerId, tag) {
  return `pgsel-${playerId}-${tag}-${(_poolIdCounter++).toString(36)}`;
}

/**
 * Build ONE player's independent, non-finite selection pool: every
 * enabled-or-not power type (all 6) plus a single randomly-generated
 * normal shape card. Pools are generated per-player — duplicate picks
 * across players are expected and fine (nothing is drawn from the
 * shared deck). Returned cards are real, hand-ready card objects with
 * unique ids; the order is shuffled so the client's face-down layout
 * doesn't betray which slot holds which option.
 */
function generateSelectionPool(playerId) {
  const pool = POWER_TYPES.map(power => ({
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

  for (const p of _alivePlayers(room)) {
    room.pregamePools[p.id] = generateSelectionPool(p.id);
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

  const counts = _readyCounts(room);
  return { ok: true, ...counts, allReady: counts.pendingCount === 0 };
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

  const autoAssigned = [];
  for (const p of _alivePlayers(room)) {
    if (room.pregameSelectionsReady?.has(p.id)) continue;
    const pool = room.pregamePools?.[p.id] || [];
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    room.pregameSelections[p.id] = pick;
    room.pregameSelectionsReady.add(p.id);
    autoAssigned.push(p.id);
  }

  // Append each chosen bonus card to its owner's hand.
  if (room.hands) {
    const extraCards = {};
    for (const [pid, card] of Object.entries(room.pregameSelections)) {
      extraCards[pid] = [card];
    }
    _appendExtraCards(room.hands, extraCards);
  }

  const assignments = { ...room.pregameSelections };

  room.phase = 'playing';
  delete room.pregamePools;
  delete room.pregameSelections;
  delete room.pregameSelectionsReady;
  delete room.pregameSelectionOpen;
  delete room.pregameSelectionDeadline;

  return { ok: true, assignments, autoAssigned };
}

module.exports = {
  generateSelectionPool,
  beginPreGame,
  startPreGameSelection,
  applyPreGameSelection,
  finalizePreGame,
};
