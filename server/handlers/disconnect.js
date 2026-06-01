// ============================================================
// HANDLERS — Disconnect (immediate removal, no reconnection grace)
// ============================================================
// Product decision: a disconnect for ANY reason (refresh, tab close, sign-out,
// or a network drop) removes the participant from the game right away — even
// the host. There is no grace period and no auto-rejoin; the matching client
// no longer emits host_reconnect / player_reconnect.

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const {
  rooms,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
  _clearSpinPendingTimer,
  _clearGameOverTimer,
  _clearRedemptionTimer,
  _clearSpeedModeTimer,
  _clearIdleTurnTimer,
  logRoomDeletion,
  saveRoom,
} = require('../lib/state');
const { broadcastRoomState, emitPowerCardEvents } = require('../lib/broadcast');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { applyBluffOutcome } = require('../lib/orchestration');
const { discardLobbyIdleState } = require('../lib/idleSweep');

function register(io, socket, deps) {
  const { leaderboardRepo } = deps;

  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    for (const [code, room] of rooms.entries()) {
      // ── Host dropped → end the room immediately (no grace). ──
      if (room.hostSocketId === socket.id) {
        logRoomDeletion(code, 'host_disconnected', { phase: room.phase, groupId: room.groupId || undefined });
        io.to(code).emit('game_ended', { reason: 'The host left the game.' });
        io.in(code).socketsLeave(code);
        _clearBettingTimer(code);
        _clearGhostVoteTimer(code);
        _clearPreGameTimer(code);
        _clearSpinPendingTimer(code);
        _clearGameOverTimer(code);
        _clearRedemptionTimer(code);
        _clearSpeedModeTimer(code);
        _clearIdleTurnTimer(code);
        discardLobbyIdleState(code);
        rooms.delete(code);
        console.log(`[Room ${code}] host disconnected — room ended immediately.`);
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      // ── Lobby: drop the player from the room immediately. ──
      if (room.phase === 'lobby') {
        const idx = room.players.findIndex(p => p.id === player.id);
        if (idx !== -1) room.players.splice(idx, 1);
        await saveRoom(room);
        await broadcastRoomState(io, code);
        continue;
      }

      // ── Mid-game: eliminate immediately, resolving any pending pause first
      //    so the table never deadlocks waiting on a player who's now gone. ──
      if (['playing', 'bluff_resolution', 'spin_pending', 'swap_pending', 'medic_pending', 'sniper_pending', 'bluff_intercept_pending', 'ghost_vote_pending', 'last_stand'].includes(room.phase)) {
        // v2 Phase D — auto-decline gating pauses to avoid deadlock.
        if (room.phase === 'medic_pending' && room.pendingMedicSave?.medicId === player.id) {
          const pending = room.pendingMedicSave;
          if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
          room.pendingMedicSave = null;
          if (room.phase === 'medic_pending') room.phase = 'playing';
        }
        if (room.phase === 'sniper_pending' && room.pendingSniperRedirect?.sniperId === player.id) {
          const pending = room.pendingSniperRedirect;
          const outcome = pending.deferredOutcome;
          room.pendingSniperRedirect = null;
          applyBluffOutcome(room, outcome);
        }
        // v2 Phase H — Swap holder disconnect: forfeit, fall through to a
        // default spin without consuming the Swap.
        if (room.phase === 'swap_pending' && room.swapHolderId === player.id) {
          const accuserId = room.lastAction?.accuserId;
          const top = room.playedPile?.[room.playedPile.length - 1];
          if (accuserId && top?.id) {
            const { events: swapEvents, outcome: swapOutcome } =
              bluffPipeline.resumeAfterSwap(room, accuserId, top.id);
            room.swapHolderId = null;
            if (swapOutcome && swapOutcome.type !== engine.GAME_EVENT_TYPES.BLUFF_ERROR) {
              applyBluffOutcome(room, swapOutcome);
            }
            emitPowerCardEvents(io, code, swapEvents);
          } else {
            room.swapHolderId = null;
            room.phase = 'playing';
          }
        }

        const eliminated = engine.handleDisconnect(room, socket.id);
        if (eliminated) {
          room.lastAction = { type: 'disconnected', playerId: eliminated.id, playerName: eliminated.username };
          const winner = engine.checkGameOver(room);
          if (winner) {
            room.phase = 'game_over';
            room.lastAction = { type: 'game_over', winnerId: winner.id, winnerName: winner.username };
            await maybeRecordGroupWinner(io, room, leaderboardRepo);
          }
          await saveRoom(room);
          await broadcastRoomState(io, code);
        }
      }
    }
  });
}

module.exports = { register };
