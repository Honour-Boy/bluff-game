// ============================================================
// ENGINE — Player lifecycle + turn rotation
// ============================================================
// createPlayer, turn-order helpers, elimination + reconnect bookkeeping.

const { ROLES } = require('./constants');
const { initChamber } = require('./chamber');
const { _creditSwapTurnFor, _removePlayerFromSwapSnapshots } = require('./powerCards');

/**
 * Create a new player.
 * chamber is always initialised here (backend only — never on client).
 */
function createPlayer(id, username, socketId) {
  return {
    id,
    username,
    socketId,
    status: 'alive',
    chamber: initChamber(),
    riskLevel: 1,
    isSpectator: false,
    connectedAt: Date.now(),
    armedPowerCard: null,
    // v2 Phase D — Secret roles.
    role: ROLES.BAREHAND,
    // v2 #120 — Medic revives are capped per game (MEDIC_MAX_SAVES).
    // Track a running count instead of a one-shot boolean.
    medicSavesUsed: 0,
    saboteurAbilityAvailable: true,
    sniperAbilityAvailable: true,
    // v2 Phase F — Bounty system.
    consecutiveSurvivedSpins: 0,
    hasBounty: false,
    // v2 Phase F — Betting system.
    consecutiveCorrectBets: 0,
  };
}

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
// skipped one inherits room.bluffBlockedThisTurn = true.

function advanceTurn(room) {
  if (!room.turnOrder.length) return room;

  const finishingPlayerId = room.turnOrder[room.currentTurnIndex] || null;
  if (finishingPlayerId) _creditSwapTurnFor(room, finishingPlayerId);

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.lastAction = null;
  room.phase = 'playing';
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.isFirstTurn = false;
  room.bluffBlockedThisTurn = false;

  if (room.skipNextPlayer) {
    const skippedPlayerId = room.turnOrder[room.currentTurnIndex] || null;
    if (skippedPlayerId) _creditSwapTurnFor(room, skippedPlayerId);
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    room.skipNextPlayer = false;
    room.bluffBlockedThisTurn = true;
  }

  _sweepStaleArmedPowerCards(room);
  return room;
}

// #163 + playtest §1.4 — sweep stale armed power cards on every turn advance.
//
// A holder can only ever be bluffed by the player immediately AFTER them
// (`call_bluff` always targets the previous player), so an armed Shield /
// Mirror / Assassin is "live" ONLY while its holder is the immediately-
// previous player to the current turn. The instant the turn rotates past
// that one-step window the armed flag is dead weight: it can no longer fire
// for the play it was armed for, yet it would otherwise linger and auto-fire
// on an unintended later play (the reported bug) and keep the client lock
// badge stuck on.
//
// We therefore sweep EVERY player each advance and un-arm anyone who is no
// longer the immediately-previous player. This is stricter (and more robust
// against eliminations / freeze-skips shuffling the order) than only checking
// the incoming player: a card armed by p0 is cleared the moment the turn moves
// from p1 to p2, not a full rotation later. The card itself stays in the slot,
// ready to be re-armed on the holder's next turn.
//
// Excluded:
//   • Freeze — consumed at end_turn via consumeFreezeOnTurnEnd, never survives.
//   • Swap   — armed early but only becomes activatable after a full turn
//              cycle (swapPendingPlayerIds), so it MUST persist across turns.
function _sweepStaleArmedPowerCards(room) {
  if (!Array.isArray(room.turnOrder) || room.turnOrder.length === 0) return;
  const len = room.turnOrder.length;
  const prevId = room.turnOrder[(room.currentTurnIndex - 1 + len) % len] || null;

  for (const player of room.players) {
    const armed = player?.armedPowerCard;
    if (!armed || armed.power === 'freeze' || armed.power === 'swap') continue;
    // The immediately-previous player is still inside their live bluff window.
    if (player.id === prevId) continue;

    const slot = room.powerCardSlot?.[player.id];
    if (Array.isArray(slot)) {
      const card = slot.find(c => c?.id === armed.cardId);
      if (card) card.armed = false;
    }
    player.armedPowerCard = null;
  }
}

function eliminateFromTurnOrder(room, playerId) {
  const idx = room.turnOrder.indexOf(playerId);
  if (idx === -1) return;
  room.turnOrder.splice(idx, 1);
  if (idx < room.currentTurnIndex) {
    room.currentTurnIndex--;
  }
  if (room.turnOrder.length > 0) {
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
  }
  // Eliminations remove from Swap pending sets WITHOUT crediting.
  _removePlayerFromSwapSnapshots(room, playerId);
  // v2 Phase E2 — Sudden Death: any elimination resets the streak
  // counter to 0. Done inline here to avoid pulling in modifiers.js
  // just for one field reset.
  if (room) room.suddenDeathCounter = 0;
}

// Eliminate a player by id (set status, drop them into spectator, and pull
// them out of the turn order). Shared by the disconnect timeout and the
// group-removal eviction (#156) so both paths behave identically.
function eliminatePlayer(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.status === 'eliminated') return null;
  player.status = 'eliminated';
  player.isSpectator = true;
  eliminateFromTurnOrder(room, player.id);
  return player;
}

function handleDisconnect(room, socketId) {
  const player = room.players.find(p => p.socketId === socketId);
  if (!player) return null;
  return eliminatePlayer(room, player.id);
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

// Playtest §2.2 — when the acting host leaves a live game, hand the in-room
// host seat to a random still-present alive player. In a 2-player game the
// lone survivor is BOTH the winner and the new host. Returns the chosen
// player, or null if nobody is left to take over (the room is being torn down).
// For persistent group rooms the ORIGINAL owner reclaims on rejoin — join_room
// re-stamps room.hostUserId from group.host_user_id — so this only governs the
// temporary in-room host while the owner is away.
function pickReplacementHost(room, leavingPlayerId) {
  const candidates = room.players.filter(
    p => p.id !== leavingPlayerId && p.status === 'alive',
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

module.exports = {
  createPlayer,
  getCurrentPlayer,
  advanceTurn,
  eliminateFromTurnOrder,
  eliminatePlayer,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
  pickReplacementHost,
};
