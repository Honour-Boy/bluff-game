// ============================================================
// HANDLERS - Role abilities (v2 Phase D)
// ============================================================
// Covers: medic_decide, saboteur_transfer, sniper_redirect.

const engine = require('../gameEngine');
const { getRoom, saveRoom } = require('../lib/state');
const { broadcastRoomState } = require('../lib/broadcast');
const { maybeRecordGroupWinner } = require('../lib/roomBuilders');
const { applyBluffOutcome, _maybeOpenBetting, _scheduleSpinPendingTimeout, applySpinAndBroadcast } = require('../lib/orchestration');

function register(io, socket, deps) {
  const { leaderboardRepo } = deps;

  // ─── PLAYER: Medic decision ─────────────────────────────
  // While room.phase === 'medic_pending', the Medic chooses save or
  // decline. On save: revert the elimination + 2 cards to Medic.
  // On decline: replay the deferred finalisation closure.
  socket.on('medic_decide', async ({ roomCode, save } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (room.phase !== 'medic_pending') return callback?.({ success: false, error: 'No Medic save pending' });

      const pending = room.pendingMedicSave;
      if (!pending) return callback?.({ success: false, error: 'Lost Medic context' });
      if (pending.medicId !== socket.userId) return callback?.({ success: false, error: 'Not the Medic' });

      // #121 - once the elimination is final (Medic declines or the save
      // fails), release the death announcement that was suppressed while
      // the room was paused. The Assassin path defers a specific
      // assassin_strike banner; every other path gets the generic
      // medic_skipped notice.
      const releaseDeath = () => {
        const deferred = Array.isArray(pending.deferredBanners) ? pending.deferredBanners : [];
        if (deferred.length > 0) {
          for (const b of deferred) io.to(code).emit('power_card_triggered', b);
        } else {
          io.to(code).emit('power_card_triggered', {
            kind: 'medic_skipped',
            medicId: pending.medicId,
            eliminatedPlayerId: pending.eliminatedPlayerId,
            eliminatedPlayerName: pending.eliminatedPlayerName,
          });
        }
      };

      if (save) {
        // applyMedicSave enforces the rules a save can fail on - hand at
        // the save-hand cap (MEDIC_SAVE_HAND_CAP), or the Medic's
        // MEDIC_MAX_SAVES budget spent (#120, error 'Save limit reached').
        // On any failure we finalise
        // the elimination instead and surface the error to the caller.
        const res = engine.applyMedicSave(room, pending.eliminatedPlayerId, pending.source);
        if (!res.ok) {
          // Save rejected (hand full / save limit reached) - finalise.
          if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
          room.pendingMedicSave = null;
          if (room.phase === 'medic_pending') room.phase = 'playing';
          await maybeRecordGroupWinner(io, room, leaderboardRepo);
          await saveRoom(room);
          await broadcastRoomState(io, code);
          releaseDeath();
          return callback?.({ success: false, error: res.error });
        }

        // Medic save banner - public.
        io.to(code).emit('power_card_triggered', {
          kind: 'medic_saved',
          holderId: res.medicId,
          revivedPlayerId: res.revivedPlayerId,
          revivedPlayerName: pending.eliminatedPlayerName,
        });

        room.lastAction = {
          type: 'medic_save',
          revivedPlayerId: res.revivedPlayerId,
          revivedPlayerName: pending.eliminatedPlayerName,
        };
        room.pendingMedicSave = null;
        room.phase = 'playing';
        await saveRoom(room);
        await broadcastRoomState(io, code);
        return callback?.({ success: true, saved: true, dealt: res.dealt.length });
      }

      // Decline → run the deferred finalisation closure.
      if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
      room.pendingMedicSave = null;
      if (room.phase === 'medic_pending') room.phase = 'playing';
      await maybeRecordGroupWinner(io, room, leaderboardRepo);
      await saveRoom(room);
      await broadcastRoomState(io, code);
      releaseDeath();
      callback?.({ success: true, saved: false });
    } catch (err) {
      console.error('[medic_decide]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Saboteur transfer ──────────────────────────
  // Once-per-game silent move of one random card from the holder's
  // hand into the target's. No banner - only handSize updates.
  socket.on('saboteur_transfer', async ({ roomCode, targetPlayerId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (!['playing', 'spin_pending', 'bluff_resolution'].includes(room.phase)) {
        return callback?.({ success: false, error: `Cannot use ability in phase ${room.phase}` });
      }

      const res = engine.applySaboteurTransfer(room, socket.userId, targetPlayerId);
      if (!res.ok) return callback?.({ success: false, error: res.error });

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[saboteur_transfer]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Sniper redirect ────────────────────────────
  // Resumes a paused bluff resolution where the spin target was about
  // to be locked in. Sniper picks a new alive target (not self, not
  // Mirror holder) - or passes by sending newTargetId=null.
  socket.on('sniper_redirect', async ({ roomCode, newTargetId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (room.phase !== 'sniper_pending') return callback?.({ success: false, error: 'No Sniper redirect pending' });

      const pending = room.pendingSniperRedirect;
      if (!pending) return callback?.({ success: false, error: 'Lost Sniper context' });
      if (pending.sniperId !== socket.userId) return callback?.({ success: false, error: 'Not the Sniper' });

      const outcome = pending.deferredOutcome;
      let banner = null;

      if (newTargetId) {
        if (!pending.eligibleTargetIds.includes(newTargetId)) {
          return callback?.({ success: false, error: 'Target not eligible' });
        }
        const res = engine.applySniperRedirect(room, socket.userId, newTargetId);
        if (!res.ok) return callback?.({ success: false, error: res.error });

        outcome.spinTargetId = res.newSpinTargetId;
        const newTarget = room.players.find(p => p.id === res.newSpinTargetId);
        const oldTarget = room.players.find(p => p.id === pending.originalSpinTargetId);
        banner = {
          kind: 'sniper_redirect',
          holderId: socket.userId,
          fromId: oldTarget?.id || null,
          fromName: oldTarget?.username || null,
          toId: newTarget?.id || null,
          toName: newTarget?.username || null,
        };
      }

      room.pendingSniperRedirect = null;
      applyBluffOutcome(room, outcome);

      // Russian Roulette - the (re-targeted) failed bluff fires an immediate
      // spin: no manual pull / betting pause.
      if (engine.shouldImmediateSpin(room)) {
        const target = room.players.find(p => p.id === room.spinTargetId);
        await saveRoom(room);
        if (banner) io.to(code).emit('power_card_triggered', banner);
        await applySpinAndBroadcast(io, code, room, target, leaderboardRepo);
        return callback?.({ success: true, redirected: !!newTargetId });
      }

      if (room.phase === 'spin_pending') {
        _maybeOpenBetting(io, room);
        // Issue 1 - guard against a spin that never gets performed.
        _scheduleSpinPendingTimeout(io, room.code, leaderboardRepo);
      }

      await saveRoom(room);
      if (banner) io.to(code).emit('power_card_triggered', banner);
      await broadcastRoomState(io, code);
      callback?.({ success: true, redirected: !!newTargetId });
    } catch (err) {
      console.error('[sniper_redirect]', err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { register };
