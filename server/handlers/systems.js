// ============================================================
// HANDLERS - v2 Phase F systems (betting, ghost vote, Last Stand)
// ============================================================

const engine = require('../gameEngine');
const { getRoom, saveRoom, _clearGhostVoteTimer } = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const { _stampPendingGameOver } = require('../lib/orchestration');

function register(io, socket, deps = {}) {
  const { leaderboardRepo } = deps;
  // ─── PLAYER: Place a bet ────────────────────────────────
  // While the betting window is open, every alive player except the
  // spin target can submit `prediction: 'survive' | 'eliminated'`.
  socket.on('place_bet', async ({ roomCode, prediction } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      const res = engine.placeBet(room, socket.userId, prediction);
      if (!res.ok) return callback?.({ success: false, error: res.error });
      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[place_bet]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Ghost vote (DMH) ───────────────────────────
  socket.on('ghost_vote', async ({ roomCode, option } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.phase !== 'ghost_vote_pending') return callback?.({ success: false, error: 'No ghost vote open' });
      const res = engine.castGhostVote(room, socket.userId, Number(option));
      if (!res.ok) return callback?.({ success: false, error: res.error });
      await saveRoom(room);
      await broadcastRoomState(io, code);

      // Early-resolve: every eligible voter has voted → tally now.
      if (room.ghostVote) {
        const everyoneVoted = room.ghostVote.eligibleVoterIds.every(
          id => room.ghostVote.votes[id] !== undefined
        );
        if (everyoneVoted) {
          _clearGhostVoteTimer(code);
          const banner = engine.resolveGhostVote(room);
          room.phase = 'playing';
          room.lastAction = {
            type: 'ghost_vote_resolved',
            winningOption: banner?.winningOption || null,
            applied: banner?.applied || 'noop',
          };
          await saveRoom(room);
          if (banner) io.to(code).emit('power_card_triggered', banner);
          await broadcastRoomState(io, code);
        }
      }
      callback?.({ success: true });
    } catch (err) {
      console.error('[ghost_vote]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Last Stand spin ────────────────────────────
  socket.on('last_stand_spin', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.phase !== 'last_stand') return callback?.({ success: false, error: 'Not in Last Stand' });

      const player = room.players.find(p => p.id === socket.userId);
      const chamberBefore = player ? [...player.chamber] : null;
      const res = engine.lastStandSpin(room, socket.userId);
      if (!res.ok) return callback?.({ success: false, error: res.error });

      room.lastAction = {
        type: 'last_stand_spin_result',
        spinTargetId: socket.userId,
        spinTargetName: player?.username || null,
        spinIndex: res.spinIndex,
        chamber: chamberBefore,
        chamberAfter: res.chamberAfter,
        eliminated: res.eliminated,
        riskLevel: res.riskLevel,
      };

      if (res.eliminated) {
        engine.eliminateFromTurnOrder(room, socket.userId);
        const winner = engine.checkGameOver(room);
        if (winner) {
          // Defer the reveal to spin_acknowledged AND arm the safety timer so a
          // missing ack can't strand a decided Last Stand (Issue 2).
          _stampPendingGameOver(io, room, winner, leaderboardRepo);
        }
      } else {
        // Auto-pass on survive (#69).
        engine.lastStandEndTurn(room, socket.userId);
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true, ...res });
    } catch (err) {
      console.error('[last_stand_spin]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Last Stand end turn ────────────────────────
  socket.on('last_stand_end_turn', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.phase !== 'last_stand') return callback?.({ success: false, error: 'Not in Last Stand' });

      const res = engine.lastStandEndTurn(room, socket.userId);
      if (!res.ok) return callback?.({ success: false, error: res.error });

      const next = room.players.find(p => p.id === res.nextActiveId);
      room.lastAction = {
        type: 'last_stand_turn_passed',
        activeFinalistId: res.nextActiveId,
        activeFinalistName: next?.username || null,
      };

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[last_stand_end_turn]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
