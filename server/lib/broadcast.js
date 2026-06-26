// ============================================================
// SOCKET LIB - Room broadcasting + power-card event fanout
// ============================================================

const engine = require('../gameEngine');
const { getRoom } = require('./state');
const { armSpeedModeTimer } = require('./speedMode');
const { armIdleTurnTimer } = require('./idleTurn');
const { armBotTurn } = require('./bots');
const { armTutorialDirector } = require('./tutorialDirector');

/**
 * Fan out the bluff-pipeline's announce events to every socket in
 * the room as `power_card_triggered`. The client listens for this
 * and renders a full-screen <AnnouncementBanner /> per event.
 */
function emitPowerCardEvents(io, roomCode, events) {
  if (!events || events.length === 0) return;
  for (const evt of events) {
    io.to(roomCode).emit('power_card_triggered', evt);
  }
}

/**
 * Tell every player in the room that the acting host changed - a group
 * stand-in was appointed (`reason: 'standin'`) or host was reclaimed /
 * handed back to the owner (`reason: 'reclaimed'`). Host *controls* still
 * follow room_state's `amHost`; this event only drives the toast (#183).
 */
function emitHostChanged(io, roomCode, { hostId, hostName, reason } = {}) {
  if (!roomCode || !hostId || !hostName) return;
  io.to(roomCode).emit('host_changed', { hostId, hostName, reason });
}

// Covenant - The Pact offer. Once play has begun (phase 'playing') and a pact
// has been set up (selector + target) but not yet offered, privately offer the
// bond to the target. Deferred one turn when the target is the very first player
// on the clock so the modal doesn't cover their opening turn. One-shot, guarded
// by room flags so it never re-fires across broadcasts.
function maybePactOffer(io, room) {
  if (room.mode !== engine.MODES.ONLINE) return;
  if (room.phase !== 'playing') return;
  if (room.pact) return;                                   // already accepted/denied
  if (room.pactOfferSent) return;                          // already offered once
  if (!room.pactSelectorId || !room.pactTargetId) return;  // no pact set up

  const firstTurnPlayerId = room.turnOrder?.[room.currentTurnIndex] || null;
  if (room.isFirstTurn && room.pactTargetId === firstTurnPlayerId) {
    room.pactOfferDeferred = true; // wait until the turn rotates off the target
    return;
  }

  room.pactOfferSent = true;
  room.pactOfferDeferred = false;
  room.pactOfferPending = true;
  const target = room.players.find(p => p.id === room.pactTargetId);
  const selector = room.players.find(p => p.id === room.pactSelectorId);
  if (target?.socketId) {
    io.to(target.socketId).emit('pact_offer', {
      selectorId: room.pactSelectorId,
      selectorName: selector?.username || null,
    });
  }
}

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  // Covenant - offer the Pact once play begins (mutates room flags BEFORE the
  // serialize below so `pactOfferPending` ships in this same push).
  maybePactOffer(io, room);

  // Speed Mode (online) - arm / re-arm the per-turn countdown BEFORE serializing
  // so a turn change's freshly-stamped `room.speedModeDeadline` ships in THIS
  // push (serialize.js exposes `speedModeMsRemaining`). Torn down when the
  // modifier isn't in force or the room leaves the playing phase. On expiry the
  // timer auto-ends the active player's turn (no auto-spin - #79).
  armSpeedModeTimer(io, room);
  // #239 - and the idle-turn safety net (mutually exclusive with Speed Mode:
  // _idleTurnActive requires speedMode OFF, so only one ever arms per turn).
  armIdleTurnTimer(io, room);
  // Tutorial / Practice - drive any seated bot's next beat (play / end / spin).
  // No-op for rooms without bots, so production rooms are untouched. Armed here
  // so a bot's move ships from the same authoritative push as everything else.
  armBotTurn(io, room);
  // Tutorial / Practice - advance the guided lesson (Basics→clinic hand-off and
  // the scripted Power-Clinic drills). No-op for non-tutorial rooms.
  armTutorialDirector(io, room);

  // §3.3 - push live pre-room occupancy to anyone watching this group's
  // directory (members are subscribed to `group:<id>` via list_my_groups /
  // get_group). Compact payload - no hands, just who's gathered and the phase.
  if (room.groupId) {
    const players = Array.isArray(room.players) ? room.players : [];
    io.to(`group:${room.groupId}`).emit('group_room_status', {
      groupId: room.groupId,
      code: room.code,
      playerCount: players.length,
      phase: room.phase,
      inLobby: room.phase === 'lobby',
      players: players.map(p => ({ id: p.id, username: p.username, status: p.status })),
    });
  }

  if (room.mode === engine.MODES.ONLINE) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const player = room.players.find(p => p.socketId === s.id);
      const playerId = player ? player.id : null;
      // Issue #81 - pass the per-socket spectator target so the
      // engine can attach `spectatedHand` + `currentPromptTarget`
      // gated to spectator callers only.
      const spectatingTargetId = s.data?.spectatingTargetId || null;
      s.emit('room_state', engine.serializeRoom(room, playerId, { spectatingTargetId }));
    }
  } else {
    io.to(roomCode).emit('room_state', engine.serializeRoom(room));
  }
}

module.exports = {
  emitPowerCardEvents,
  emitHostChanged,
  broadcastRoomState,
};
