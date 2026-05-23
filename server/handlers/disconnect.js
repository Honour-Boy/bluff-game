// ============================================================
// HANDLERS — Disconnect (host grace + player elimination timer)
// ============================================================

const engine = require('../gameEngine');
const bluffPipeline = require('../bluffPipeline');
const {
  rooms,
  hostDisconnectTimers,
  playerDisconnectTimers,
  dcKey,
  _clearBettingTimer,
  _clearGhostVoteTimer,
  _clearPreGameTimer,
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
      if (room.hostSocketId === socket.id) {
        // 30s host grace.
        io.to(code).emit('host_disconnecting', { countdown: 30 });
        const timer = setTimeout(() => {
          io.to(code).emit('game_ended', { reason: 'The host left the game.' });
          _clearBettingTimer(code);
          _clearGhostVoteTimer(code);
          _clearPreGameTimer(code);
          discardLobbyIdleState(code);
          rooms.delete(code);
          hostDisconnectTimers.delete(code);
        }, 30000);
        hostDisconnectTimers.set(code, timer);
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      if (room.phase === 'lobby') {
        // 10s grace in lobby too — hitting refresh shouldn't drop you.
        const key = dcKey(code, player.id);
        const capturedSocketId = socket.id;
        const timer = setTimeout(async () => {
          const still = room.players.find(p => p.id === player.id && p.socketId === capturedSocketId);
          if (still) {
            const idx = room.players.findIndex(p => p.id === still.id);
            if (idx !== -1) room.players.splice(idx, 1);
            await saveRoom(room);
            await broadcastRoomState(io, code);
          }
          playerDisconnectTimers.delete(key);
        }, 10000);
        playerDisconnectTimers.set(key, timer);
        continue;
      }

      if (['playing', 'bluff_resolution', 'spin_pending', 'swap_pending', 'medic_pending', 'sniper_pending', 'bluff_intercept_pending', 'ghost_vote_pending', 'last_stand'].includes(room.phase)) {
        io.to(code).emit('player_disconnecting', { playerId: player.id, playerName: player.username });

        const key = dcKey(code, player.id);
        const capturedSocketId = socket.id;

        const timer = setTimeout(async () => {
          const still = room.players.find(p => p.id === player.id && p.socketId === capturedSocketId);
          if (still?.status === 'alive') {
            // v2 Phase D — auto-decline gating pauses to avoid deadlock.
            if (room.phase === 'medic_pending' && room.pendingMedicSave?.medicId === still.id) {
              const pending = room.pendingMedicSave;
              if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
              room.pendingMedicSave = null;
              if (room.phase === 'medic_pending') room.phase = 'playing';
            }
            if (room.phase === 'sniper_pending' && room.pendingSniperRedirect?.sniperId === still.id) {
              const pending = room.pendingSniperRedirect;
              const outcome = pending.deferredOutcome;
              room.pendingSniperRedirect = null;
              applyBluffOutcome(room, outcome);
            }
            // v2 Phase H — Swap holder disconnect: forfeit, fall through
            // to default spin without consuming the Swap.
            if (room.phase === 'swap_pending' && room.swapHolderId === still.id) {
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

            const eliminated = engine.handleDisconnect(room, capturedSocketId);
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
          playerDisconnectTimers.delete(key);
        }, 30000);

        playerDisconnectTimers.set(key, timer);
      }
    }
  });
}

module.exports = { register };
