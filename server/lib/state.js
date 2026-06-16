// ============================================================
// SOCKET LIB — Shared in-memory state singletons
// ============================================================
// `rooms` is the single source of truth; every other lib/handler
// module gets the same Map instance by `require('./state').rooms`.
// Timer registries live here too so cleanup paths (disconnect,
// inactivity sweep, idle dismiss) can clear them from anywhere.

const rooms = new Map();

// v2 Phase F — system timer registries.
// 10s betting + 15s ghost-vote windows are server-side.
const bettingTimers = new Map();    // roomCode → setTimeout handle
const ghostVoteTimers = new Map();  // roomCode → setTimeout handle

// v2 Phase G — pre-game selection (#116). One handle per room covers
// the role-reveal delay then the 15s selection auto-resolve (only one
// is ever pending at a time). Cleared early when all players confirm.
const pregameTimers = new Map();    // roomCode → setTimeout handle

// §1.1 — bluff interception window. One 8s handle per room while an accused
// decides whether to arm a defensive card in response to a bluff; on expiry
// the bluff resolves with no interception. Cleared early on arm/pass/leave.
const bluffInterceptTimers = new Map();  // roomCode → setTimeout handle

// Spin state-machine safety timers (anti-hang). One handle per room.
//   spinPendingTimers — auto-resolves a spin the target never performs
//                       (engine.spinGun is server-authoritative either way).
//   gameOverTimers    — finalises a pendingGameOver the client never
//                       acknowledges, so a decided match can't strand the room
//                       in 'playing'. See engine/constants timeout values.
const spinPendingTimers = new Map();  // roomCode → setTimeout handle
const gameOverTimers = new Map();     // roomCode → setTimeout handle

// Redemption Spin safety timer — auto-runs the offered redemption spin if the
// eliminated player never takes it, so the room can't park in
// redemption_pending. One handle per room.
const redemptionTimers = new Map();   // roomCode → setTimeout handle

// Covenant — Blood Debt assignment window. Armed when a correct-bluff spin
// eliminates a player in a Covenant room; on expiry the debt defaults to the
// bluff caller. One handle per room.
const bloodDebtTimers = new Map();    // roomCode → setTimeout handle

// Covenant — The Pact volunteer-pull window. Armed when a spin would fall on one
// pact partner; on expiry the original target spins. One handle per room.
const pactVolunteerTimers = new Map(); // roomCode → setTimeout handle

// Speed Mode — one per-turn countdown handle per room. Stamped when a new
// player's turn opens (online + roomModifiers.speedMode); on expiry the server
// auto-ends that player's turn. Re-armed on every turn change, paused whenever
// the room leaves the `playing` phase (spins / resolution), cleared on teardown.
const speedModeTimers = new Map();    // roomCode → setTimeout handle

// #239 — Idle-turn safety net. One per-turn handle per room while a turn is open
// and Speed Mode is OFF. On expiry the server auto-resolves the AFK player's turn
// (auto-play a sensible card + end the turn) so an idle player can't stall the
// table. Re-armed on every turn change, paused outside the `playing` phase, and
// cleared on teardown — exactly the Speed Mode lifecycle, just a separate handle.
const idleTurnTimers = new Map();     // roomCode → setTimeout handle

// Tutorial / Practice — bot turn driver. One short per-beat handle per room
// while a seated bot owes an action (play a card, end its turn, or take a spin
// it's the target of). Armed at the end of broadcastRoomState (next to the idle
// timer) and re-armed each broadcast as the bot's beats progress. Bot rooms are
// always online + isTutorial; the handle is .unref()'d and the expiry re-checks
// room state defensively, so a stale fire after teardown is a harmless no-op
// (no separate teardown-clear is wired, unlike the longer-lived timers above).
const botTimers = new Map();          // roomCode → setTimeout handle

// Tutorial / Practice — guided progression director (lib/tutorialDirector.js).
// One short handle per room while the director owes a staged step: the Basics→
// Powers hand-off, or advancing to the next scripted Power-Clinic drill. Armed at
// the end of broadcastRoomState (next to the bot timer); .unref()'d and the expiry
// re-validates room state, so a stale fire after teardown is a harmless no-op.
const tutorialTimers = new Map();     // roomCode → setTimeout handle

// Host / player disconnect grace timers.
const hostDisconnectTimers = new Map();
// Player disconnect timers must be visible across socket connections —
// reconnect arrives on a NEW socket and needs to cancel the OLD socket's
// elimination timer. Key: `${roomCode}:${playerId}`.
const playerDisconnectTimers = new Map();
const dcKey = (code, playerId) => `${code}:${playerId}`;

function _clearBettingTimer(code) {
  const t = bettingTimers.get(code);
  if (t) { clearTimeout(t); bettingTimers.delete(code); }
}
function _clearGhostVoteTimer(code) {
  const t = ghostVoteTimers.get(code);
  if (t) { clearTimeout(t); ghostVoteTimers.delete(code); }
}
function _clearPreGameTimer(code) {
  const t = pregameTimers.get(code);
  if (t) { clearTimeout(t); pregameTimers.delete(code); }
}
function _clearBluffInterceptTimer(code) {
  const t = bluffInterceptTimers.get(code);
  if (t) { clearTimeout(t); bluffInterceptTimers.delete(code); }
}
function _clearSpinPendingTimer(code) {
  const t = spinPendingTimers.get(code);
  if (t) { clearTimeout(t); spinPendingTimers.delete(code); }
}
function _clearGameOverTimer(code) {
  const t = gameOverTimers.get(code);
  if (t) { clearTimeout(t); gameOverTimers.delete(code); }
}
function _clearRedemptionTimer(code) {
  const t = redemptionTimers.get(code);
  if (t) { clearTimeout(t); redemptionTimers.delete(code); }
}
function _clearBloodDebtTimer(code) {
  const t = bloodDebtTimers.get(code);
  if (t) { clearTimeout(t); bloodDebtTimers.delete(code); }
}
function _clearPactVolunteerTimer(code) {
  const t = pactVolunteerTimers.get(code);
  if (t) { clearTimeout(t); pactVolunteerTimers.delete(code); }
}
function _clearSpeedModeTimer(code) {
  const t = speedModeTimers.get(code);
  if (t) { clearTimeout(t); speedModeTimers.delete(code); }
}
function _clearIdleTurnTimer(code) {
  const t = idleTurnTimers.get(code);
  if (t) { clearTimeout(t); idleTurnTimers.delete(code); }
}
function _clearBotTimer(code) {
  const t = botTimers.get(code);
  if (t) { clearTimeout(t); botTimers.delete(code); }
}
function _clearTutorialTimer(code) {
  const t = tutorialTimers.get(code);
  if (t) { clearTimeout(t); tutorialTimers.delete(code); }
}

// §2.1 — verbose, single-line structured logging for every room teardown so
// "Room not found" reports can be traced to an explicit cause (cleanup sweep,
// host-grace expiry, last participant out, idle dismiss). `reason` is a stable
// code; `detail` carries context (phase, player counts, idle ms).
function logRoomDeletion(code, reason, detail = {}) {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[room-gc] DELETE ${code} reason=${reason}${parts ? ' ' + parts : ''}`);
}

// §5 — verbose turn-action state-machine telemetry. One structured line per
// accepted turn action so a play-test trace shows exactly how the per-turn
// ledger evolved: card / bluff / power are each capped at once-per-turn, and
// `locked` flags the Absolute Lockout (both a card played AND a bluff resolved
// this turn ⇒ only End Turn / post-resolution power remain). Temporary debug
// aid — pairs with logRoomDeletion + the diagnostics interval in index.js.
function logTurnState(code, playerId, action, room, extra = {}) {
  const card = !!room?.cardPlayedThisTurn;
  const bluff = !!room?.bluffUsedThisTurn;
  const power = !!room?.powerActivatedThisTurn;
  const locked = card && bluff;
  const ctx = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(
    `[turn-state] ${code} player=${playerId} action=${action} `
    + `ledger={card:${card},bluff:${bluff},power:${power}} locked=${locked} `
    + `phase=${room?.phase} turnIdx=${room?.currentTurnIndex}${ctx ? ' ' + ctx : ''}`,
  );
}

async function getRoom(code) {
  return rooms.get(code) || null;
}

async function saveRoom(room) {
  // Stamp every accepted mutation so the inactivity sweep can tell
  // a live room from a zombie.
  room.lastActivityAt = Date.now();
  rooms.set(room.code, room);
}

module.exports = {
  rooms,
  bettingTimers,
  ghostVoteTimers,
  pregameTimers,
  bluffInterceptTimers,
  spinPendingTimers,
  gameOverTimers,
  redemptionTimers,
  bloodDebtTimers,
  pactVolunteerTimers,
  speedModeTimers,
  idleTurnTimers,
  botTimers,
  tutorialTimers,
  hostDisconnectTimers,
  playerDisconnectTimers,
  dcKey,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
  _clearBluffInterceptTimer,
  _clearSpinPendingTimer,
  _clearGameOverTimer,
  _clearRedemptionTimer,
  _clearBloodDebtTimer,
  _clearPactVolunteerTimer,
  _clearSpeedModeTimer,
  _clearIdleTurnTimer,
  _clearBotTimer,
  _clearTutorialTimer,
  logRoomDeletion,
  logTurnState,
  getRoom,
  saveRoom,
};
