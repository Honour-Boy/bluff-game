// ============================================================
// ENGINE — Player lifecycle + turn rotation
// ============================================================
// createPlayer, turn-order helpers, elimination + reconnect bookkeeping.

const { ROLES, MODES } = require('./constants');
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
    // Covenant — Blood Debt. Set true on a player named as the revenge target
    // by someone eliminated via a correct-bluff spin; consumed on their next
    // call_bluff (an extra debt spin fires). Covenant rooms only.
    hasBloodDebt: false,
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

// ─── Roulette Rotation — spontaneous turn order (online) ───────
//
// Each "cycle" is a fresh random permutation of the alive players: everyone
// takes exactly one turn before anyone repeats, and the first player of a new
// cycle differs from the last player of the finished one so nobody plays twice
// back-to-back across the boundary. With exactly two alive players this forces
// strict alternation (the only repeat-free order possible) — intended.
function _buildRouletteCycle(room, avoidFirstId) {
  const ids = room.players.filter(p => p.status === 'alive').map(p => p.id);
  // Fisher-Yates.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length >= 2 && ids[0] === avoidFirstId) {
    // avoidFirstId occurs exactly once, so swapping slot 0 with any later slot
    // is guaranteed to seat a different player first.
    const swapWith = 1 + Math.floor(Math.random() * (ids.length - 1));
    [ids[0], ids[swapWith]] = [ids[swapWith], ids[0]];
  }
  return ids;
}

// Advance the turn pointer one step. Normal mode walks the fixed order with a
// wrap. Roulette Rotation (online) regenerates a brand-new random cycle the
// instant the current one is exhausted, so the order is re-rolled every cycle.
function _advanceTurnIndex(room) {
  const len = room.turnOrder.length;
  if (len === 0) return;

  const rouletteOn =
    room.mode === MODES.ONLINE && !!room.config?.roomModifiers?.rouletteRotation;

  if (rouletteOn && room.currentTurnIndex >= len - 1) {
    const lastId = room.turnOrder[room.currentTurnIndex] || null;
    room.turnOrder = _buildRouletteCycle(room, lastId);
    room.currentTurnIndex = 0;
    return;
  }
  room.currentTurnIndex = (room.currentTurnIndex + 1) % len;
}

function advanceTurn(room) {
  if (!room.turnOrder.length) return room;

  const finishingPlayerId = room.turnOrder[room.currentTurnIndex] || null;
  if (finishingPlayerId) _creditSwapTurnFor(room, finishingPlayerId);

  // Snapshot the card the finishing player played as the "card under
  // accusation" for the incoming player. Frozen at this turn boundary so the
  // incoming player's OWN same-turn play (turn actions are order-free) can no
  // longer overwrite what a call_bluff / Peek resolves against — the bug where
  // playing first made the bluff judge your own card instead of the previous
  // player's. `lastPlayedCard` keeps tracking the live most-recent play so the
  // next boundary captures this player's card in turn.
  room.challengeableCard = room.lastPlayedCard || null;
  room.challengeableCardType = room.currentCardType ?? null;

  // The bluff accuses whoever took the immediately-previous turn. Stamp it
  // explicitly: under Roulette Rotation the order reshuffles at the cycle
  // boundary, so `turnOrder[currentTurnIndex - 1]` would name the wrong player
  // on the first turn of a new cycle. See getPreviousTurnPlayerId.
  room.prevTurnPlayerId = finishingPlayerId;

  _advanceTurnIndex(room);
  room.lastAction = null;
  room.phase = 'playing';
  // §1.1 — the turn-action ledger. advanceTurn is the SINGLE authoritative
  // reset point for a genuine turn change: each of the three once-per-turn
  // actions (card play / bluff call / power activation) re-opens here and
  // nowhere else. Mid-turn resolutions (bluff/spin/assassin) must NOT clear
  // these or the on-turn player would get a second play (the post-bluff
  // double-play exploit).
  room.bluffUsedThisTurn = false;
  room.cardPlayedThisTurn = false;
  room.powerActivatedThisTurn = false;
  room.isFirstTurn = false;
  room.bluffBlockedThisTurn = false;

  if (room.skipNextPlayer) {
    const skippedPlayerId = room.turnOrder[room.currentTurnIndex] || null;
    if (skippedPlayerId) _creditSwapTurnFor(room, skippedPlayerId);
    // The skipped (frozen) player is now the immediate predecessor.
    room.prevTurnPlayerId = skippedPlayerId;
    _advanceTurnIndex(room);
    room.skipNextPlayer = false;
    room.bluffBlockedThisTurn = true;
    // The skipped (frozen) player played nothing — nothing to challenge or peek.
    room.challengeableCard = null;
    room.challengeableCardType = null;
  }

  _sweepStaleArmedPowerCards(room);
  return room;
}

// The player who took the immediately-previous turn — i.e. the player a bluff
// call accuses / Peek reveals. Prefers the explicit `prevTurnPlayerId` stamped
// by advanceTurn (correct across Roulette Rotation cycle boundaries) and falls
// back to fixed turn-order arithmetic for callers/tests that build a room
// without ever advancing.
function getPreviousTurnPlayerId(room) {
  if (room?.prevTurnPlayerId != null) return room.prevTurnPlayerId;
  const len = room?.turnOrder?.length || 0;
  if (!len) return null;
  return room.turnOrder[(room.currentTurnIndex - 1 + len) % len] || null;
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
  // Use the explicitly-tracked previous turn-taker so Roulette Rotation's
  // reshuffled boundary keeps the right player's bluff window live.
  const prevId = getPreviousTurnPlayerId(room);

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
  // #205 — stamp the elimination order for end-of-game placement XP. Every
  // real elimination funnels through here (spin death, assassin strike,
  // leave/disconnect, kick), so it's the single reliable stamp point. A
  // redemption rejoin clears the stamp (engine/modifiers.js).
  const stamped = (room.players || []).find(p => p.id === playerId);
  if (stamped && stamped.eliminatedSeq == null) {
    room.eliminationSeq = (room.eliminationSeq || 0) + 1;
    stamped.eliminatedSeq = room.eliminationSeq;
  }

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
    // A bot can never hold the host seat — it has no socket to run host controls.
    // (In a tutorial room the bot is the only other seat, so this returns null
    // and the caller tears the room down instead of migrating.)
    p => p.id !== leavingPlayerId && p.status === 'alive' && !p.isBot,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Keep `room.hostSocketId` in lock-step with `room.hostUserId`: the host socket
// is the seated host-of-record's live socket, or null if they aren't seated.
// This is the single invariant that stops the client's `amHost` (derived from
// hostUserId) and the server's host-action gate (hostSocketId) from pointing at
// different people after a stand-in / reclaim / hand-back. Group rooms are
// always online, so the host is always a seated player. Returns the room.
function reconcileHostSocket(room) {
  if (!room) return room;
  const hostPlayer = room.hostUserId
    ? room.players.find(p => p.id === room.hostUserId)
    : null;
  room.hostSocketId = hostPlayer ? (hostPlayer.socketId || null) : null;
  return room;
}

module.exports = {
  createPlayer,
  getCurrentPlayer,
  advanceTurn,
  getPreviousTurnPlayerId,
  eliminateFromTurnOrder,
  eliminatePlayer,
  handleDisconnect,
  checkGameOver,
  declareRoundWinner,
  reconnectPlayer,
  pickReplacementHost,
  reconcileHostSocket,
};
