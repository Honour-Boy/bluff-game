// ============================================================
// SOCKET HANDLERS — All Socket.IO event logic
// ============================================================

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { AccessToken } = require('livekit-server-sdk');
const engine = require('./gameEngine');
const bluffPipeline = require('./bluffPipeline');

// ─── Supabase admin client (server-side only) ─────────────────
// Used to verify JWT tokens and look up profiles.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Guest auth helpers ───────────────────────────────────────
// Anonymous players can join with a typed display name. Their
// `socket.userId` is `guest:<uuid>` so the prefix lets server logic
// cheaply distinguish guests from authenticated Supabase users
// (e.g. avoid profile-table writes). The UUID is supplied by the
// client (persisted in sessionStorage) so a refresh inside the same
// browser tab keeps the same identity and reconnect lookups work.
const GUEST_USER_PREFIX = 'guest:';
const GUEST_USERNAME_MIN = 4;
const GUEST_USERNAME_MAX = 20;

/**
 * Sanitise a typed guest display name.
 *  - Strips control chars / HTML / zero-width / emojis (anything
 *    outside letters / numbers / space / `_` / `.` / `-`).
 *  - Trims and clamps to GUEST_USERNAME_MAX.
 *  - Returns null if the result is shorter than GUEST_USERNAME_MIN.
 *
 * Exported for tests.
 */
function sanitizeGuestUsername(raw) {
  const cleaned = String(raw || '')
    .replace(/[^\p{L}\p{N}\s_.\-]/gu, '')
    .trim()
    .slice(0, GUEST_USERNAME_MAX);
  if (cleaned.length < GUEST_USERNAME_MIN) return null;
  return cleaned;
}

/**
 * Validate a client-supplied guestId. We don't trust raw input — a
 * malicious client could send a UUID that collides with a real
 * Supabase user id (or an existing guest's id). The check below
 * accepts only RFC-4122 hex UUIDs; anything else is rejected and
 * the server picks a fresh one.
 */
function isValidGuestId(id) {
  return typeof id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * In-memory store: roomCode → roomState
 */
const rooms = new Map();

// ─── Room accessors ───────────────────────────────────────────

async function getRoom(code) {
  return rooms.get(code) || null;
}

async function saveRoom(room) {
  rooms.set(room.code, room);
}

// ─── Broadcast helpers ────────────────────────────────────────

/**
 * Fan out the bluff-pipeline's announce events to every socket in
 * the room as `power_card_triggered`. The client listens for this
 * and renders a full-screen <AnnouncementBanner /> per event.
 *
 * Each event already carries `kind` + `holderId` + `holderName` +
 * any kind-specific extras (see bluffPipeline.js docs).
 */
function emitPowerCardEvents(io, roomCode, events) {
  if (!events || events.length === 0) return;
  for (const evt of events) {
    io.to(roomCode).emit('power_card_triggered', evt);
  }
}

// ─── v2 Phase F — system timer registries ────────────────────
// 10s betting + 15s ghost-vote windows are server-side. We keep
// per-room timer handles so reconnects + disconnect cleanup can
// cancel them.
const bettingTimers = new Map();    // roomCode → setTimeout handle
const ghostVoteTimers = new Map();  // roomCode → setTimeout handle

function _clearBettingTimer(code) {
  const t = bettingTimers.get(code);
  if (t) { clearTimeout(t); bettingTimers.delete(code); }
}
function _clearGhostVoteTimer(code) {
  const t = ghostVoteTimers.get(code);
  if (t) { clearTimeout(t); ghostVoteTimers.delete(code); }
}

/**
 * Compute the alive Sniper's eligible redirect targets — every
 * alive player EXCEPT the Sniper themselves and any current Mirror
 * holder. Returns an array of player ids.
 */
function _sniperEligibleTargets(room, sniperId) {
  return room.players
    .filter(p =>
      p.status === 'alive'
      && p.id !== sniperId
      && p.armedPowerCard?.power !== 'mirror'
    )
    .map(p => p.id);
}

/**
 * If a Sniper is alive + has not used their ability, intercept the
 * spin path BEFORE it lands as `spin_pending`. Sets phase to
 * 'sniper_pending', stores the deferred outcome, emits a private
 * `sniper_redirect_pending` to the Sniper. Returns true if the
 * pause kicked in (caller should NOT continue applying the outcome).
 */
function maybeStartSniperPause(io, room, outcome) {
  if (!outcome || outcome.kind !== 'spin') return false;
  const sniper = engine.findAvailableSniper(room);
  if (!sniper) return false;

  const eligible = _sniperEligibleTargets(room, sniper.id);
  // If the only eligible "non-Mirror, non-self" target IS the
  // current target, redirect would be a no-op — skip the pause.
  if (eligible.length === 0) return false;

  const originalTarget = room.players.find(p => p.id === outcome.spinTargetId);
  room.phase = 'sniper_pending';
  room.pendingSniperRedirect = {
    sniperId: sniper.id,
    originalSpinTargetId: outcome.spinTargetId,
    originalSpinTargetName: originalTarget?.username || null,
    eligibleTargetIds: eligible,
    deferredOutcome: outcome,
  };
  room.lastAction = {
    type: 'sniper_pending',
    sniperId: sniper.id, // local reference only — never serialised
    originalSpinTargetId: outcome.spinTargetId,
    originalSpinTargetName: originalTarget?.username || null,
  };

  // Private prompt to the Sniper.
  if (sniper.socketId) {
    io.to(sniper.socketId).emit('sniper_redirect_pending', {
      originalSpinTargetId: outcome.spinTargetId,
      originalSpinTargetName: originalTarget?.username || null,
      eligibleTargetIds: eligible,
    });
  }
  return true;
}

/**
 * If a Medic can save AND the elimination came from spin/Assassin,
 * pause the elimination flow. Sets phase to 'medic_pending',
 * stores the elimination context, emits private prompt to the
 * Medic. Returns true if the pause kicked in.
 *
 * IMPORTANT: caller must NOT yet remove the player from turnOrder.
 * On Medic save, the player stays alive — turn order is intact.
 * On Medic decline, the caller's existing finalisation runs.
 */
function maybeStartMedicPause(io, room, eliminatedPlayerId, source, finaliseFn) {
  const medic = engine.findAvailableMedic(room);
  if (!medic) return false;

  const eliminated = room.players.find(p => p.id === eliminatedPlayerId);
  room.phase = 'medic_pending';
  room.pendingMedicSave = {
    medicId: medic.id,
    eliminatedPlayerId,
    eliminatedPlayerName: eliminated?.username || null,
    source,
    finaliseFn, // server-only — closure that runs the elimination on decline
  };

  if (medic.socketId) {
    io.to(medic.socketId).emit('medic_save_pending', {
      eliminatedPlayerId,
      eliminatedPlayerName: eliminated?.username || null,
      source,
    });
  }
  return true;
}

/**
 * Finalise an Assassin elimination. Extracted so the call-bluff
 * handler can defer it through Medic save and replay it later.
 */
function finaliseAssassinElimination(room, outcome) {
  const eliminatedId = outcome.eliminatedPlayerId;
  if (eliminatedId) {
    const eliminated = room.players.find(p => p.id === eliminatedId);
    if (eliminated) {
      eliminated.status = 'eliminated';
      eliminated.isSpectator = true;
    }
    engine.eliminateFromTurnOrder(room, eliminatedId);
    engine.newCardType(room);
  }
  room.phase = 'playing';
  room.spinTargetId = null;
  room.cardPlayedThisTurn = false;
  room.bluffUsedThisTurn = false;
  room.lastAction = {
    type: 'assassin_strike',
    eliminatedId,
    eliminatedName: room.players.find(p => p.id === eliminatedId)?.username || null,
    assassinHolderId: outcome.accusedId,
    assassinHolderName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
  };
  const gameOverWinner = engine.checkGameOver(room);
  if (gameOverWinner) {
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
  }
}

// ─── v2 Phase F — post-elim / post-survival hooks ────────────

/**
 * Handle Bounty placement after a survival. Returns the bounty_placed
 * banner event (or null). Caller emits.
 */
function _bountyOnSurvival(room, playerId) {
  return engine.onSurvivalForBounty(room, playerId);
}

/**
 * Handle Bounty clear on elimination. Idempotent.
 */
function _bountyOnElimination(room, playerId) {
  engine.onEliminationForBounty(room, playerId);
}

/**
 * After an elimination, decide whether DMH should fire (and whether
 * Last Stand should fire instead — Last Stand wins if alive=2).
 * Returns one of:
 *   { kind: 'last_stand' }      — caller transitions
 *   { kind: 'ghost_vote' }      — caller starts the vote
 *   null                         — nothing to do
 *
 * Last Stand takes priority if both conditions are satisfied.
 */
function _decidePostElimSystemPhase(room) {
  if (engine.shouldEnterLastStand(room)) return { kind: 'last_stand' };
  if (engine.shouldOpenGhostVote(room)) return { kind: 'ghost_vote' };
  return null;
}

/**
 * Open a 10s betting window if betting is enabled. Schedules the
 * close via setTimeout — when the timer fires, we close the window
 * and broadcast a fresh state. Eligible bettors get a private
 * `betting_pending` ping; the spin target gets a `betting_in_progress`
 * ping. Public-state version is also exposed in `room.betting` so
 * any client can render the wait UI.
 */
function _maybeOpenBetting(io, room) {
  if (!room?.config?.systems?.betting) return false;
  if (room.phase !== 'spin_pending') return false;
  const eligibleIds = engine.startBettingWindow(room);
  if (!eligibleIds || eligibleIds.length === 0) return false;
  const code = room.code;
  _clearBettingTimer(code);
  const handle = setTimeout(async () => {
    bettingTimers.delete(code);
    const r = await getRoom(code);
    if (!r || !r.betting) return;
    engine.closeBettingWindow(r);
    await saveRoom(r);
    await broadcastRoomState(io, code);
  }, engine.BETTING_WINDOW_MS);
  bettingTimers.set(code, handle);
  // Public banner for the table.
  io.to(code).emit('power_card_triggered', {
    kind: 'betting_open',
    spinTargetId: room.spinTargetId,
    spinTargetName: room.players.find(p => p.id === room.spinTargetId)?.username || null,
    closesAt: room.betting.closesAt,
  });
  return true;
}

/**
 * Open a 15s ghost vote. Living players are paused — phase moves to
 * 'ghost_vote_pending'. Eligible voters (eliminated players) get the
 * vote popup via room_state.
 */
function _openGhostVote(io, room) {
  const code = room.code;
  engine.startGhostVote(room);
  room.phase = 'ghost_vote_pending';
  room.lastAction = {
    type: 'ghost_vote_started',
    closesAt: room.ghostVote.closesAt,
  };
  _clearGhostVoteTimer(code);
  const handle = setTimeout(async () => {
    ghostVoteTimers.delete(code);
    const r = await getRoom(code);
    if (!r || !r.ghostVote) return;
    const banner = engine.resolveGhostVote(r);
    r.phase = 'playing';
    r.lastAction = {
      type: 'ghost_vote_resolved',
      winningOption: banner?.winningOption || null,
      applied: banner?.applied || 'noop',
    };
    await saveRoom(r);
    if (banner) io.to(code).emit('power_card_triggered', banner);
    await broadcastRoomState(io, code);
  }, engine.DMH_VOTE_WINDOW_MS);
  ghostVoteTimers.set(code, handle);
  io.to(code).emit('power_card_triggered', {
    kind: 'ghost_vote_started',
    closesAt: room.ghostVote.closesAt,
  });
}

/**
 * Transition the room into Last Stand. Mutates room and emits the
 * cinematic banner. Caller must broadcast room_state afterwards.
 */
function _enterLastStand(io, room) {
  const code = room.code;
  engine.enterLastStand(room);
  io.to(code).emit('power_card_triggered', {
    kind: 'last_stand_entered',
    finalistIds: room.lastStand?.finalistIds || [],
  });
}

/**
 * Apply a bluff-pipeline outcome to room state.
 * - 'blocked' → caller's bluff is wasted; advance turn normally.
 *   Returns { advanced: true } so the caller knows to broadcast.
 * - 'spin' → set phase to spin_pending, store spinTargetId + lastAction.
 *            Sniper redirect interception happens upstream (call site).
 * - 'eliminated' → kill the named player, advance turn out of them.
 *                  Medic save interception happens upstream (call site).
 * - 'swap_pending' → set phase to swap_pending, expose swapHolderId.
 *
 * Returns the same outcome object plus a `pendingTurnAdvance` flag for
 * the Mirror "accused's turn ends" path (handled after the spin in
 * spin_acknowledged).
 */
function applyBluffOutcome(room, outcome) {
  if (!outcome) return null;

  if (outcome.kind === 'blocked') {
    // Bluff was nullified by Shield. Spec: accuser loses their
    // bluff opportunity for this turn but must still play a card
    // and end normally. bluffUsedThisTurn stays true (caller set it
    // before invoking the pipeline) so the bluff button is gated.
    room.phase = 'playing';
    room.spinTargetId = null;
    room.lastAction = {
      type: 'bluff_blocked',
      shieldHolderId: outcome.accusedId,
      accuserId: outcome.accuserId,
    };
    return outcome;
  }

  if (outcome.kind === 'eliminated') {
    // Assassin path. The Medic-save interception happens at the
    // call site BEFORE applyBluffOutcome runs (call_bluff handler);
    // by the time we get here, either no Medic existed, the Medic
    // declined, or this is the post-decline finalisation path.
    finaliseAssassinElimination(room, outcome);
    return outcome;
  }

  if (outcome.kind === 'swap_pending') {
    room.phase = 'swap_pending';
    room.swapHolderId = outcome.swapHolderId;
    room.lastAction = {
      type: 'swap_pending',
      swapHolderId: outcome.swapHolderId,
      accuserId: outcome.accuserId,
      accusedId: outcome.accusedId,
    };
    return outcome;
  }

  // Default: spin
  room.phase = 'spin_pending';
  room.spinTargetId = outcome.spinTargetId;
  const target = room.players.find(p => p.id === outcome.spinTargetId);
  room.lastAction = {
    type: 'spin_pending',
    spinTargetId: outcome.spinTargetId,
    spinTargetName: target?.username || null,
    bluffCorrect: outcome.bluffIsCorrect,
    autoResolved: true,
    accuserId: outcome.accuserId,
    accuserName: room.players.find(p => p.id === outcome.accuserId)?.username || null,
    accusedId: outcome.accusedId,
    accusedName: room.players.find(p => p.id === outcome.accusedId)?.username || null,
    revealedCard: outcome.revealedCard || null,
    mirrorEndsAccusedTurn: outcome.mirrorEndsAccusedTurn || false,
    mirrorEndsAccuserTurn: outcome.mirrorEndsAccuserTurn || false,
  };
  return outcome;
}

/**
 * Trampoline: post-elimination, decide what's next on the table.
 * Order of precedence:
 *   1. game_over   — single survivor.
 *   2. last_stand  — exactly two alive (and Last Stand enabled).
 *   3. ghost_vote  — DMH threshold crossed (and DMH enabled).
 *   4. nothing     — caller continues normal flow.
 *
 * IMPORTANT: caller must NOT have set room.phase to 'game_over' yet —
 * we make that decision here so Last Stand / DMH can intercept.
 */
function applyPostElimSystemHooks(io, room) {
  const winner = engine.checkGameOver(room);
  if (winner) {
    room.phase = 'game_over';
    room.lastAction = { type: 'game_over', winnerId: winner.id, winnerName: winner.username };
    return { transitioned: 'game_over' };
  }
  const decision = _decidePostElimSystemPhase(room);
  if (!decision) return { transitioned: null };
  if (decision.kind === 'last_stand') {
    _enterLastStand(io, room);
    return { transitioned: 'last_stand' };
  }
  if (decision.kind === 'ghost_vote') {
    _openGhostVote(io, room);
    return { transitioned: 'ghost_vote_pending' };
  }
  return { transitioned: null };
}

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  if (room.mode === engine.MODES.ONLINE) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const player = room.players.find(p => p.socketId === s.id);
      const playerId = player ? player.id : null;
      s.emit('room_state', engine.serializeRoom(room, playerId));
    }
  } else {
    io.to(roomCode).emit('room_state', engine.serializeRoom(room));
  }
}

// ─── v2 Phase E2 — Speed Mode turn timer ─────────────────────
//
// Spec: when speedMode is enabled, the active player has 15 seconds
// from the start of their turn to take an action (play_card_online or
// call_bluff). On timeout they are auto-spun as penalty.
//
// Implementation:
//   - One in-flight timer per room: `speedModeTimers.set(code, ...)`.
//   - `armSpeedModeTimer(io, room)` cancels any in-flight timer and
//     arms a fresh deadline IF speedMode is on AND phase === 'playing'.
//   - `cancelSpeedModeTimer(roomCode)` cancels the timer (called when
//     the active player takes an action OR phase exits 'playing').
//   - Timer fires `engine.spinGun` on the active player as penalty.
//     Result broadcasts as a regular spin_result lastAction tagged
//     with `speedModePenalty: true`.
//
// Timer storage is keyed by roomCode so reconnects / re-registrations
// don't double-arm.
const SPEED_MODE_DURATION_MS = 15_000;
const speedModeTimers = new Map(); // roomCode → { timeout, deadline }

function cancelSpeedModeTimer(roomCode) {
  const entry = speedModeTimers.get(roomCode);
  if (entry) {
    clearTimeout(entry.timeout);
    speedModeTimers.delete(roomCode);
  }
}

function armSpeedModeTimer(io, room) {
  if (!room) return;
  const code = room.code;
  cancelSpeedModeTimer(code);
  if (!room.config?.roomModifiers?.speedMode) {
    delete room.speedModeDeadline;
    return;
  }
  if (room.mode !== engine.MODES.ONLINE) return;
  if (room.phase !== 'playing') {
    delete room.speedModeDeadline;
    return;
  }
  const currentPlayerId = room.turnOrder[room.currentTurnIndex];
  if (!currentPlayerId) return;

  const deadline = Date.now() + SPEED_MODE_DURATION_MS;
  room.speedModeDeadline = deadline;

  const timeout = setTimeout(async () => {
    try {
      const live = await getRoom(code);
      if (!live) return;
      // If anything moved on (phase change, eliminations, etc.) the
      // arm cycle gets re-run elsewhere — bail if the active player
      // is no longer who we thought.
      if (live.phase !== 'playing') return;
      const stillActive = live.turnOrder[live.currentTurnIndex];
      if (stillActive !== currentPlayerId) return;
      const player = live.players.find(p => p.id === currentPlayerId);
      if (!player || player.status !== 'alive') return;

      speedModeTimers.delete(code);
      delete live.speedModeDeadline;

      // Auto-spin penalty: same engine.spinGun + downstream pipeline
      // as a manual player_spin. Mirror Match queueing applies normally.
      const riskLevelBefore = player.riskLevel;
      const chamberBefore = [...player.chamber];
      const spinResult = engine.spinGun(player, engine.getSpinModifiers(live));

      if (
        live.mirrorMatchActive
        && !live._mirrorMatchInFlight
        && live.mode === engine.MODES.ONLINE
      ) {
        const oppositeId = engine.getMirrorMatchOpposite(live, player.id);
        if (oppositeId && oppositeId !== player.id) {
          live.pendingMirrorMatchSpin = { targetId: oppositeId, triggeredBy: player.id };
        }
      }

      let medicPaused = false;
      if (spinResult.eliminated) {
        const finalise = () => {
          engine.eliminateFromTurnOrder(live, player.id);
          engine.newCardType(live);
          if (live.mode === engine.MODES.ONLINE) {
            const cur = live.turnOrder[live.currentTurnIndex];
            if (cur) engine.drawCardForPlayer(live, cur);
          }
          const gameOverWinner = engine.checkGameOver(live);
          if (gameOverWinner) {
            live.pendingGameOver = { id: gameOverWinner.id, name: gameOverWinner.username };
          }
        };
        medicPaused = maybeStartMedicPause(io, live, player.id, 'spin', finalise);
        if (!medicPaused) finalise();
      } else if (live.mode === engine.MODES.ONLINE) {
        engine.resetHandOnSurvival(live, player.id, 6);
      }

      if (!medicPaused) live.phase = 'playing';
      live.spinTargetId = null;
      live.cardPlayedThisTurn = false;
      live.bluffUsedThisTurn = true;

      live.lastAction = {
        type: 'spin_result',
        spinTargetId: player.id,
        spinTargetName: player.username,
        spinIndex: spinResult.spinIndex,
        chamber: chamberBefore,
        chamberAfter: spinResult.chamber,
        roll: spinResult.spinIndex,
        eliminated: spinResult.eliminated,
        riskLevel: spinResult.riskLevel,
        riskLevelBefore,
        medicPending: medicPaused,
        speedModePenalty: true,
        ...(spinResult.eliminated && !medicPaused ? { newCardType: live.currentCardType } : {}),
      };

      await saveRoom(live);
      await broadcastRoomState(io, code);
    } catch (err) {
      console.error('[speedModeTimer]', err);
    }
  }, SPEED_MODE_DURATION_MS);

  speedModeTimers.set(code, { timeout, deadline });
}

// ─── v2 Phase E2 — Mirror Match second-spin runner ───────────
//
// Called from spin_acknowledged after the primary spin's overlay is
// dismissed. Runs an additional engine.spinGun against the queued
// opposite-player target, broadcasts a spin_result lastAction, and
// handles game-over hold-back identically to the primary path.
//
// We set `room._mirrorMatchInFlight = true` for the duration so the
// player_spin handler's mirror-match queue logic doesn't re-trigger
// recursively (the second spin is itself a "spin" but should not
// spawn a third).
async function runMirrorMatchSpin(io, room, pending) {
  if (!room || !pending?.targetId) return;
  const code = room.code;
  const target = room.players.find(p => p.id === pending.targetId);
  if (!target || target.status !== 'alive') {
    // Target is no longer alive (got eliminated mid-flow) — skip.
    await broadcastRoomState(io, code);
    return;
  }

  room._mirrorMatchInFlight = true;
  try {
    const riskLevelBefore = target.riskLevel;
    const chamberBefore = [...target.chamber];
    const spinResult = engine.spinGun(target, engine.getSpinModifiers(room));

    let medicPaused = false;
    if (spinResult.eliminated) {
      const finalise = () => {
        engine.eliminateFromTurnOrder(room, target.id);
        engine.newCardType(room);
        if (room.mode === engine.MODES.ONLINE) {
          const currentPlayerId = room.turnOrder[room.currentTurnIndex];
          if (currentPlayerId) engine.drawCardForPlayer(room, currentPlayerId);
        }
        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.pendingGameOver = { id: gameOverWinner.id, name: gameOverWinner.username };
        }
      };

      medicPaused = maybeStartMedicPause(io, room, target.id, 'spin', finalise);
      if (!medicPaused) finalise();
    } else if (room.mode === engine.MODES.ONLINE) {
      // Survivors of a Mirror Match spin still get the standard hand
      // reset (Section 7) — same as a normal survival.
      engine.resetHandOnSurvival(room, target.id, 6);
    }

    if (!medicPaused) room.phase = 'playing';
    room.spinTargetId = null;

    room.lastAction = {
      type: 'spin_result',
      spinTargetId: target.id,
      spinTargetName: target.username,
      spinIndex: spinResult.spinIndex,
      chamber: chamberBefore,
      chamberAfter: spinResult.chamber,
      roll: spinResult.spinIndex,
      eliminated: spinResult.eliminated,
      riskLevel: spinResult.riskLevel,
      riskLevelBefore,
      medicPending: medicPaused,
      mirrorMatch: true,
      mirrorMatchTriggeredBy: pending.triggeredBy,
      ...(spinResult.eliminated && !medicPaused ? { newCardType: room.currentCardType } : {}),
    };

    await saveRoom(room);
    await broadcastRoomState(io, code);
  } finally {
    delete room._mirrorMatchInFlight;
  }
}

// ─── Register all handlers ────────────────────────────────────

const hostDisconnectTimers = new Map();

// Player disconnect timers must be visible across socket connections —
// reconnect arrives on a NEW socket and needs to cancel the OLD socket's
// elimination timer. Key: `${roomCode}:${playerId}`.
const playerDisconnectTimers = new Map();
const dcKey = (code, playerId) => `${code}:${playerId}`;

function registerSocketHandlers(io, socket) {

  // ─── AUTHENTICATE socket with Supabase JWT or guest ──────
  // Must be called once after connecting, before any game events.
  // Two payload shapes:
  //   { token } — verify a Supabase JWT, stamp the real user id.
  //   { guest: { username, guestId? } } — anonymous play. Client may
  //     supply a previously-issued guestId from sessionStorage so a
  //     refresh keeps the same identity (and reconnect lookups work);
  //     otherwise the server mints a fresh UUID and returns it so the
  //     client can persist it.
  socket.on('authenticate', async ({ token, guest } = {}, callback) => {
    // Guest path — typed username, no Supabase verification.
    if (!token && guest && typeof guest === 'object') {
      const cleanUsername = sanitizeGuestUsername(guest.username);
      if (!cleanUsername) {
        return callback?.({
          success: false,
          error: `Display name must be ${GUEST_USERNAME_MIN}-${GUEST_USERNAME_MAX} characters`,
        });
      }

      const guestId = isValidGuestId(guest.guestId)
        ? guest.guestId
        : crypto.randomUUID();

      socket.userId   = `${GUEST_USER_PREFIX}${guestId}`;
      socket.username = cleanUsername;
      socket.isGuest  = true;

      return callback?.({
        success: true,
        guest: true,
        guestId,
        username: cleanUsername,
      });
    }

    if (!token) return callback?.({ success: false, error: 'No token provided' });

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return callback?.({ success: false, error: 'Invalid or expired token' });
      }

      // Fetch display username from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();

      socket.userId   = data.user.id;
      socket.isGuest  = false;
      socket.username = profile?.username
        || data.user.user_metadata?.username
        || data.user.user_metadata?.full_name
        || data.user.email?.split('@')[0]
        || 'Player';

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: 'Authentication failed' });
    }
  });

  // ─── HOST: Create a new room ─────────────────────────────
  socket.on('create_room', async ({ mode, config } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const roomMode = mode === engine.MODES.ONLINE ? engine.MODES.ONLINE : engine.MODES.PHYSICAL;
      // engine.createRoom normalises the config; safe defaults when omitted.
      const room = engine.createRoom(socket.id, roomMode, config || null);
      room.hostUserId = socket.userId;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      await saveRoom(room);

      socket.join(room.code);
      console.log(`[Room ${room.code}] Created by ${socket.username} (mode: ${roomMode})`);

      // In online mode, auto-join host as a player
      if (roomMode === engine.MODES.ONLINE) {
        const player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        await saveRoom(room);
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode, playerId: socket.userId });
      } else {
        callback({ success: true, roomCode: room.code, isHost: true, mode: roomMode });
      }

      await broadcastRoomState(io, room.code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Join an existing room ──────────────────────
  socket.on('join_room', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'lobby') return callback({ success: false, error: 'Game already started' });
      if (room.players.length >= engine.MAX_PLAYERS) return callback({ success: false, error: 'Room is full' });

      // Reconnect if already in room
      let player = room.players.find(p => p.id === socket.userId);
      if (player) {
        engine.reconnectPlayer(room, player.id, socket.id);
        console.log(`[Room ${code}] Reconnected: ${player.username}`);
      } else {
        // Duplicate name check (case-insensitive)
        const nameTaken = room.players.some(
          p => p.username.toLowerCase() === socket.username.toLowerCase()
        );
        if (nameTaken) {
          return callback({ success: false, error: 'That name is already taken in this room.' });
        }
        player = engine.createPlayer(socket.userId, socket.username, socket.id);
        room.players.push(player);
        console.log(`[Room ${code}] Joined: ${player.username}`);
      }

      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, roomCode: code, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Reconnect after refresh ──────────────────────
  socket.on('host_reconnect', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      // Only the original host may reseize the host seat. Without
      // this check, anyone with the 6-char room code could call
      // host_reconnect and gain host-only privileges (start_game,
      // resolve_bluff, spectate_player, ...).
      if (room.hostUserId && room.hostUserId !== socket.userId) {
        return callback({ success: false, error: 'Not the host of this room' });
      }

      if (hostDisconnectTimers.has(code)) {
        clearTimeout(hostDisconnectTimers.get(code));
        hostDisconnectTimers.delete(code);
      }

      room.hostSocketId = socket.id;
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, isHost: true, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Reconnect mid-game ──────────────────────────
  socket.on('player_reconnect', async ({ roomCode } = {}, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'Not authenticated' });

    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const player = room.players.find(p => p.id === socket.userId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const key = dcKey(code, socket.userId);
      if (playerDisconnectTimers.has(key)) {
        clearTimeout(playerDisconnectTimers.get(key));
        playerDisconnectTimers.delete(key);
      }

      engine.reconnectPlayer(room, socket.userId, socket.id);
      await saveRoom(room);
      socket.join(code);
      callback({ success: true, playerId: player.id, mode: room.mode });
      await broadcastRoomState(io, code);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start the game ─────────────────────────────────
  socket.on('start_game', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      // v2 Phase E2 — Mirror Match validation. Spec: only selectable
      // when alive count is even AT GAME START. Refuse the start
      // rather than silently disabling the modifier.
      if (
        room.mode === engine.MODES.ONLINE
        && room.config?.roomModifiers?.mirrorMatch
        && !engine.isMirrorMatchEligibleAtStart(room)
      ) {
        return callback({
          success: false,
          error: 'Mirror Match requires an even player count. Adjust the table or disable Mirror Match.',
        });
      }

      engine.startGame(room);
      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);

      // v2 Phase E2 — Speed Mode: arm the 15s timer for the first
      // active player IF the modifier is on. No-op otherwise.
      armSpeedModeTimer(io, room);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Next turn (physical) ──────────────────────────
  socket.on('next_turn', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      // Physical-mode only: online uses end_turn / start_next_round
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use end_turn / start_next_round in online mode' });
      // Only valid from these phases — playing or round_end
      if (!['playing', 'round_end'].includes(room.phase)) {
        return callback({ success: false, error: `Cannot advance turn from phase '${room.phase}'` });
      }

      engine.advanceTurn(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Resolve bluff (physical) ─────────────────────
  socket.on('resolve_bluff', async ({ roomCode, bluffIsCorrect } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      const currentPlayer = room.players.find(p => p.id === currentPlayerId);

      const prevIdx = (room.currentTurnIndex - 1 + room.turnOrder.length) % room.turnOrder.length;
      const prevPlayer = room.players.find(p => p.id === room.turnOrder[prevIdx]);

      const spinTarget = bluffIsCorrect ? prevPlayer : currentPlayer;

      room.phase = 'spin_pending';
      room.spinTargetId = spinTarget.id;
      room.lastAction = {
        type: 'spin_pending',
        spinTargetId: spinTarget.id,
        spinTargetName: spinTarget.username,
        bluffCorrect: bluffIsCorrect,
      };

      await saveRoom(room);
      await broadcastRoomState(io, roomCode);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Pull the trigger ────────────────────────────
  socket.on('player_spin', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'spin_pending') return callback({ success: false, error: 'No spin pending' });
      if (room.spinTargetId !== playerId) return callback({ success: false, error: 'Not your spin' });
      // v2 Phase F — Betting window: spin target must wait until the
      // 10s window closes (or every eligible bettor has placed a bet).
      if (room.betting && !room.betting.closed) {
        // Allow spin if every eligible bettor has placed a bet (early
        // close) — otherwise wait for the timer.
        const everyoneBet = room.betting.eligibleIds.every(
          id => room.betting.bets[id]
        );
        if (!everyoneBet) {
          return callback({ success: false, error: 'Betting window still open' });
        }
        engine.closeBettingWindow(room);
        _clearBettingTimer(code);
      }

      const player = room.players.find(p => p.id === playerId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const riskLevelBefore = player.riskLevel;
      const chamberBefore = [...player.chamber]; // snapshot BEFORE spin mutates it
      // v2 Phase E1 — Risk modifiers (Double Barrel / Hot Potato) plug
      // in via getSpinModifiers; pullTrigger reads them.
      const spinResult = engine.spinGun(player, engine.getSpinModifiers(room));

      // v2 Phase E2 — Mirror Match: queue an opposite-player spin to
      // run after the primary spin's overlay dismisses. We DO NOT
      // recurse / run it here — `spin_acknowledged` is the trigger.
      // Skip the queue if THIS spin is itself a mirror-match spin
      // (no infinite loop) or the primary player is the only one
      // alive after this spin resolves.
      if (
        room.mirrorMatchActive
        && !room._mirrorMatchInFlight
        && room.mode === engine.MODES.ONLINE
      ) {
        const oppositeId = engine.getMirrorMatchOpposite(room, player.id);
        if (oppositeId && oppositeId !== player.id) {
          // Defer until the primary spin's UI overlay is acknowledged
          // by clients. spin_acknowledged dequeues this and starts
          // the second spin via a fresh spin_pending phase.
          room.pendingMirrorMatchSpin = {
            targetId: oppositeId,
            triggeredBy: player.id,
          };
        }
      }

      // v2 Phase F — Bounty + Betting evaluation. Bounty placement
      // happens on survival; clearing on elimination. Bets evaluate
      // immediately against the just-resolved outcome.
      const bountyEvents = [];
      if (spinResult.eliminated) {
        _bountyOnElimination(room, player.id);
      } else {
        const placed = _bountyOnSurvival(room, player.id);
        if (placed) bountyEvents.push(placed);
      }
      const betEvents = engine.evaluateBets(room, spinResult.eliminated);
      _clearBettingTimer(code);

      // v2 Phase D — Medic interception for spin elimination.
      // engine.spinGun has already mutated player.status if eliminated,
      // but elimination from turn order + game-over haven't happened
      // yet. If a Medic can save (alive Medic with hand-room), defer
      // the post-elim cleanup. The spin_result lastAction still
      // broadcasts so clients see the spin animation play out — the
      // Medic prompt then fires AFTER the spin overlay clears (the
      // client gates the prompt on `pendingMedicSave` in room_state).
      let medicPaused = false;
      let postElimSystemPhase = null;
      if (spinResult.eliminated) {
        // Don't yet remove from turnOrder — Medic save needs the
        // player to still be in their seat for revival.
        const finalise = () => {
          engine.eliminateFromTurnOrder(room, player.id);
          engine.newCardType(room);
          if (room.mode === engine.MODES.ONLINE) {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId) engine.drawCardForPlayer(room, currentPlayerId);
          }
          const gameOverWinner = engine.checkGameOver(room);
          if (gameOverWinner) {
            room.pendingGameOver = { id: gameOverWinner.id, name: gameOverWinner.username };
          }
        };

        medicPaused = maybeStartMedicPause(io, room, player.id, 'spin', finalise);
        if (!medicPaused) finalise();
      } else if (room.mode === engine.MODES.ONLINE) {
        // v2 Section 7: surviving a spin in online mode discards the
        // hand and deals 6 fresh cards. Redemption Spin survivors get
        // 3 instead — that path will plug in here in Phase E1.
        engine.resetHandOnSurvival(room, player.id, 6);
      }

      // If a Medic save is pending, leave phase as 'medic_pending'
      // (set by maybeStartMedicPause). Otherwise return to playing.
      if (!medicPaused) {
        room.phase = 'playing';
        // v2 Phase F — post-elim system check. Last Stand takes
        // priority over DMH; both are evaluated here so the elim
        // animation finishes first then we transition.
        if (spinResult.eliminated && room.mode === engine.MODES.ONLINE) {
          if (engine.shouldEnterLastStand(room)) {
            postElimSystemPhase = 'last_stand';
            _enterLastStand(io, room);
          } else if (engine.shouldOpenGhostVote(room)) {
            postElimSystemPhase = 'ghost_vote_pending';
            _openGhostVote(io, room);
          }
        }
      }
      room.spinTargetId = null;
      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = true;

      // spinIndex + chamber are now the authoritative result — no frontend randomness
      room.lastAction = {
        type: 'spin_result',
        spinTargetId: player.id,
        spinTargetName: player.username,
        spinIndex: spinResult.spinIndex,
        chamber: chamberBefore,        // ← pre-spin chamber for animation
        chamberAfter: spinResult.chamber, // ← post-spin chamber (has new bullet on survival)
        roll: spinResult.spinIndex,
        eliminated: spinResult.eliminated,
        riskLevel: spinResult.riskLevel,
        riskLevelBefore,
        // Tag medic-pending state on the action so the elim popup
        // on clients can hold off and show the Medic UI instead.
        medicPending: medicPaused,
        ...(spinResult.eliminated && !medicPaused ? { newCardType: room.currentCardType } : {}),
      };

      await saveRoom(room);
      console.log(`[Room ${code}] ${player.username} spun slot ${spinResult.spinIndex} → ${spinResult.eliminated ? (medicPaused ? 'ELIM (Medic deciding)' : 'ELIMINATED') : 'survived'}`);
      await broadcastRoomState(io, code);
      // v2 Phase F — post-spin banners (bounty + betting streak).
      // Emitted AFTER broadcastRoomState so clients already have
      // updated chamber/riskLevel when the banner fires.
      for (const ev of bountyEvents) io.to(code).emit('power_card_triggered', ev);
      for (const ev of betEvents) io.to(code).emit('power_card_triggered', ev);
      callback({ success: true, spinResult });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Declare round winner (physical) ───────────────
  socket.on('round_win', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const winner = engine.declareRoundWinner(room, playerId);
      if (!winner) return callback({ success: false, error: 'Player not found' });

      await saveRoom(room);
      callback({ success: true });
      await broadcastRoomState(io, roomCode);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Call bluff ──────────────────────────────────
  // Online mode runs through the bluff-resolution PIPELINE (see
  // server/bluffPipeline.js). The pipeline returns:
  //   - events: [...] of power_card_triggered banner payloads
  //   - outcome: { kind: 'spin' | 'blocked' | 'eliminated' | 'swap_pending', ... }
  // We translate the outcome into room state via applyBluffOutcome,
  // then fan out the events to every socket and broadcast a fresh
  // room_state.
  socket.on('call_bluff', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Not in playing phase' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
      if (room.bluffUsedThisTurn) return callback({ success: false, error: 'Bluff already called this turn' });
      if (room.isFirstTurn) return callback({ success: false, error: 'Cannot call bluff on the first turn' });
      // Phase C — Freeze: the previous "turn" was skipped, so there's
      // no card on the table to challenge. Set in advanceTurn after a
      // freeze fires; cleared on the next end_turn (when this turn's
      // own advanceTurn resets the flag).
      if (room.bluffBlockedThisTurn) {
        return callback({ success: false, error: 'No card to challenge — last turn was frozen' });
      }

      room.bluffUsedThisTurn = true;
      const callerPlayer = room.players.find(p => p.id === playerId);

      // v2 Phase E2 — Speed Mode: bluff call counts as the player's
      // action. Cancel any pending 15s timer.
      cancelSpeedModeTimer(code);
      delete room.speedModeDeadline;

      if (room.mode === engine.MODES.ONLINE) {
        const { events, outcome } = bluffPipeline.resolveBluff(room, playerId);

        // v2 Phase D — Sniper interception: redirect the spin BEFORE
        // it lands as `spin_pending`. If a Sniper is alive + still has
        // the ability + has at least one eligible target (alive,
        // non-self, non-Mirror), pause here. Sniper resumes via
        // `sniper_redirect`. Banner events still fire so the table
        // sees Shield/Mirror/Swap activations even mid-pause.
        if (outcome.kind === 'spin' && maybeStartSniperPause(io, room, outcome)) {
          await saveRoom(room);
          emitPowerCardEvents(io, code, events);
          await broadcastRoomState(io, code);
          return callback({ success: true });
        }

        // v2 Phase D — Medic interception (Assassin path). Defer
        // the elimination through a Medic save prompt. Closure
        // captures the outcome for replay on decline.
        if (
          outcome.kind === 'eliminated'
          && maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
            // Decline → finalise elimination as if no Medic existed.
            finaliseAssassinElimination(room, outcome);
            // After Assassin finalisation, check for Last Stand / DMH.
            applyPostElimSystemHooks(io, room);
          })
        ) {
          await saveRoom(room);
          emitPowerCardEvents(io, code, events);
          await broadcastRoomState(io, code);
          return callback({ success: true });
        }

        applyBluffOutcome(room, outcome);

        // v2 Phase F — post-elim systems (Assassin path with no Medic).
        if (outcome.kind === 'eliminated') {
          // outcome.eliminatedPlayerId already removed; clear bounty.
          if (outcome.eliminatedPlayerId) {
            _bountyOnElimination(room, outcome.eliminatedPlayerId);
          }
          applyPostElimSystemHooks(io, room);
        }

        // v2 Phase F — open betting window when entering spin_pending.
        if (room.phase === 'spin_pending') {
          _maybeOpenBetting(io, room);
        }

        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback({ success: true });
      }

      // Physical mode unchanged.
      room.phase = 'bluff_resolution';
      room.lastAction = {
        type: 'bluff_called',
        callerId: playerId,
        callerName: callerPlayer?.username || null,
      };

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Swap pick (v2 Phase C) ──────────────────────
  // Resumes a paused bluff resolution after the Swap holder picks
  // an anonymous card from the played-pile preview. Re-runs the
  // bluff-correctness + Mirror + default-spin stages on the post-
  // swap world. See bluffPipeline.resumeAfterSwap for details.
  socket.on('swap_pick', async ({ roomCode, cardId } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (room.phase !== 'swap_pending') return callback?.({ success: false, error: 'No Swap pending' });
      if (room.swapHolderId !== socket.userId) return callback?.({ success: false, error: 'Not the Swap holder' });
      if (!cardId) return callback?.({ success: false, error: 'No card picked' });

      // Reconstruct the original accuser id from lastAction (stamped
      // by applyBluffOutcome when entering swap_pending).
      const accuserId = room.lastAction?.accuserId;
      if (!accuserId) return callback?.({ success: false, error: 'Lost bluff context' });

      const { events, outcome } = bluffPipeline.resumeAfterSwap(room, accuserId, cardId);
      if (outcome?.kind === 'error') {
        return callback?.({ success: false, error: outcome.error });
      }

      // Clear the swap pause AFTER the pipeline runs but BEFORE
      // applyBluffOutcome (which sets the new phase based on outcome).
      room.swapHolderId = null;

      // v2 Phase D — same Sniper / Medic interceptions as call_bluff,
      // applied to the post-swap world.
      if (outcome.kind === 'spin' && maybeStartSniperPause(io, room, outcome)) {
        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback?.({ success: true });
      }
      if (
        outcome.kind === 'eliminated'
        && maybeStartMedicPause(io, room, outcome.eliminatedPlayerId, 'assassin', () => {
          finaliseAssassinElimination(room, outcome);
          applyPostElimSystemHooks(io, room);
        })
      ) {
        await saveRoom(room);
        emitPowerCardEvents(io, code, events);
        await broadcastRoomState(io, code);
        return callback?.({ success: true });
      }

      applyBluffOutcome(room, outcome);

      if (outcome.kind === 'eliminated') {
        if (outcome.eliminatedPlayerId) {
          _bountyOnElimination(room, outcome.eliminatedPlayerId);
        }
        applyPostElimSystemHooks(io, room);
      }

      if (room.phase === 'spin_pending') {
        _maybeOpenBetting(io, room);
      }

      await saveRoom(room);
      emitPowerCardEvents(io, code, events);
      await broadcastRoomState(io, code);
      callback?.({ success: true });
    } catch (err) {
      console.error('[swap_pick]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play card face-down (physical) ──────────────
  socket.on('play_card', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });
      if (room.mode !== engine.MODES.PHYSICAL) return callback({ success: false, error: 'Use play_card_online' });

      const physPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = { type: 'card_played', playerId, playerName: physPlayer?.username || null };
      room.cardPlayedThisTurn = true;

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Play specific card (online) ─────────────────
  socket.on('play_card_online', async ({ roomCode, playerId, cardId, nominatedShape } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Online mode only' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (room.phase !== 'playing') return callback({ success: false, error: 'Cannot play card now' });

      // Whot is wild — caller MUST nominate a valid shape. Without
      // this, currentCardType silently held the previous shape and
      // the next player's hand was misvalidated.
      const cardPreview = room.hands?.get(playerId)?.find(c => c.id === cardId);
      if (cardPreview?.shape === 'whot') {
        if (!nominatedShape || !engine.SHAPES.includes(nominatedShape)) {
          return callback({ success: false, error: 'Whot card must nominate a shape' });
        }
      }

      const result = engine.validateAndPlayCard(room, playerId, cardId);
      if (!result.ok) return callback({ success: false, error: result.error });

      if (result.card.shape === 'whot') {
        room.currentCardType = nominatedShape;
      }

      const actingPlayer = room.players.find(p => p.id === playerId);
      room.lastAction = {
        type: 'card_played_online',
        playerId,
        playerName: actingPlayer?.username || null,
      };

      // v2 Phase E2 — Speed Mode: player took an action, cancel the
      // 15s deadline. (end_turn re-arms it for the next active player.)
      cancelSpeedModeTimer(code);
      delete room.speedModeDeadline;

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback({ success: true, card: result.card });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Activate a power card (v2 Phase B) ──────────
  // Activation happens at TURN START — before any card play or
  // bluff call. Most powers ARM (effect resolves later, Phase C);
  // Peek is consumed-on-use and reveals the lastPlayedCard privately
  // to the activator.
  socket.on('activate_power_card', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const result = engine.activatePowerCard(room, socket.userId);
      if (!result.ok) return callback?.({ success: false, error: result.error });

      // v2 Phase E2 — Speed Mode: activating a power IS the player's
      // action for the turn (they still need to play a card / call
      // bluff afterwards, but the 15s pressure releases here so they
      // aren't punished for thinking). Re-arming on follow-up actions
      // would be defensible too, but spec wording is "take their
      // action" — activation counts.
      cancelSpeedModeTimer(code);
      delete room.speedModeDeadline;

      await saveRoom(room);
      await broadcastRoomState(io, code);

      // Peek is the only power that returns a private payload right
      // now — the peeked card. Other powers respond success-only and
      // the holder's UI flips to "armed" via the room_state update.
      if (result.power === 'peek') {
        return callback?.({
          success: true,
          power: 'peek',
          consumed: true,
          peekedCard: result.peekedCard || null,
          cardId: result.cardId,
        });
      }

      return callback?.({
        success: true,
        power: result.power,
        consumed: false,
        cardId: result.cardId,
      });
    } catch (err) {
      console.error('[activate_power_card]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Assassin re-arm decision (v2 Phase C) ───────
  // Spec: if no bluff was called on the Assassin holder before their
  // NEXT activation prompt, they decide whether to re-arm. If they
  // re-arm, the card stays armed (no-op). If they decline, the card
  // is consumed AND they take +4 shape cards as penalty.
  // Holder can also choose never to activate it at all — for that
  // path, this handler is never called and no penalty applies.
  socket.on('assassin_decision', async ({ roomCode, rearm } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.mode !== engine.MODES.ONLINE) return callback?.({ success: false, error: 'Online mode only' });
      if (room.phase !== 'playing') return callback?.({ success: false, error: 'Wrong phase' });

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      if (currentPlayerId !== socket.userId) return callback?.({ success: false, error: 'Not your turn' });

      const player = room.players.find(p => p.id === socket.userId);
      if (!player?.armedPowerCard || player.armedPowerCard.power !== 'assassin') {
        return callback?.({ success: false, error: 'No armed Assassin' });
      }

      if (rearm) {
        // Re-arm = stamp the activation timer on the new turn so the
        // prompt won't re-fire instantly next loop. Card stays armed.
        player.armedPowerCard.activatedAtTurn = room.currentTurnIndex;
        player.armedPowerCard.activatedAtRound = room.roundNumber;
        await saveRoom(room);
        await broadcastRoomState(io, code);
        return callback?.({ success: true, rearmed: true });
      }

      // Decline → consume + +4 shape penalty.
      const res = engine.applyAssassinDeclinePenalty(room, socket.userId);
      if (!res.ok) return callback?.({ success: false, error: res.error });
      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true, rearmed: false, penaltyDealt: res.dealt.length });
    } catch (err) {
      console.error('[assassin_decision]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Medic decision (v2 Phase D) ─────────────────
  // While room.phase === 'medic_pending', the Medic chooses save
  // or decline. On save: revert the elimination + 2 cards to Medic.
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

      if (save) {
        const res = engine.applyMedicSave(room, pending.eliminatedPlayerId, pending.source);
        if (!res.ok) {
          // e.g. 6+ cards now — finalise instead.
          if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
          room.pendingMedicSave = null;
          if (room.phase === 'medic_pending') room.phase = 'playing';
          await saveRoom(room);
          await broadcastRoomState(io, code);
          return callback?.({ success: false, error: res.error });
        }

        // Medic save banner — public.
        io.to(code).emit('power_card_triggered', {
          kind: 'medic_save',
          holderId: res.medicId,
          // Medic identity is intentionally exposed in this banner
          // — the spec says role activation is public when it fires.
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

      // Decline → run the deferred finalisation closure (which
      // applies the eliminate-from-turn-order + game_over check).
      if (typeof pending.finaliseFn === 'function') pending.finaliseFn();
      room.pendingMedicSave = null;
      if (room.phase === 'medic_pending') room.phase = 'playing';
      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true, saved: false });
    } catch (err) {
      console.error('[medic_decide]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Saboteur transfer (v2 Phase D) ──────────────
  // Once-per-game silent move of one random card from the holder's
  // hand into the target's. No banner — only handSize updates.
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

  // ─── PLAYER: Sniper redirect (v2 Phase D) ────────────────
  // Resumes a paused bluff resolution where the spin target was
  // about to be locked in. Sniper picks a new alive target (not
  // self, not Mirror holder) — or passes by sending newTargetId=null.
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
        // Eligibility check — re-validate (alive list could have
        // shifted between prompt and decision in pathological cases).
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
          // Public role-reveal moment — Sniper identity surfaces.
          fromId: oldTarget?.id || null,
          fromName: oldTarget?.username || null,
          toId: newTarget?.id || null,
          toName: newTarget?.username || null,
        };
      }

      // Clear the pause and apply the (possibly modified) outcome.
      room.pendingSniperRedirect = null;
      applyBluffOutcome(room, outcome);

      if (room.phase === 'spin_pending') {
        _maybeOpenBetting(io, room);
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

  // ─── PLAYER: End turn ────────────────────────────────────
  socket.on('end_turn', async ({ roomCode, playerId } = {}, callback) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.turnOrder[room.currentTurnIndex] !== playerId) return callback({ success: false, error: 'Not your turn' });
      if (!room.cardPlayedThisTurn) return callback({ success: false, error: 'Play a card first' });

      if (room.mode === engine.MODES.ONLINE) {
        const hand = room.hands?.get(playerId);
        if (hand && hand.length === 0) {
          engine.declareRoundWinner(room, playerId);
          await saveRoom(room);
          await broadcastRoomState(io, code);
          return callback({ success: true, roundWin: true });
        }
      }

      // ─── v2 Phase C — Freeze trigger ────────────────────
      // Fire BEFORE advanceTurn so the engine sees the armed freeze
      // and can stamp room.skipNextPlayer = true. advanceTurn then
      // burns the extra step and sets bluffBlockedThisTurn for the
      // player who actually inherits the next turn.
      let freezeTrigger = null;
      if (room.mode === engine.MODES.ONLINE) {
        freezeTrigger = engine.consumeFreezeOnTurnEnd(room, playerId);
      }

      room.cardPlayedThisTurn = false;
      room.bluffUsedThisTurn = false;
      engine.advanceTurn(room);

      // v2 Phase E2 — Sudden Death tick. Each advanceTurn that did
      // NOT come on the heels of an elimination counts toward the
      // 4-turn streak. eliminateFromTurnOrder already resets the
      // counter when someone dies. tickSuddenDeath returns a banner
      // payload only when the threshold was just reached this tick.
      const suddenDeathBanner = engine.tickSuddenDeath(room);

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);

      // Announce the freeze AFTER the room_state broadcast so clients
      // already see the new currentPlayerId when the banner fires.
      if (freezeTrigger) {
        io.to(code).emit('power_card_triggered', freezeTrigger);
      }
      if (suddenDeathBanner) {
        io.to(code).emit('power_card_triggered', suddenDeathBanner);
      }

      // v2 Phase E2 — Speed Mode: reset the per-turn timer for the
      // new active player. Cancels any in-flight timer for the prior
      // turn (idempotent) and arms a fresh 15s deadline.
      armSpeedModeTimer(io, room);

      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Start next round (online) ─────────────────────
  socket.on('start_next_round', async ({ roomCode } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });
      if (room.mode !== engine.MODES.ONLINE) return callback({ success: false, error: 'Online mode only' });
      if (room.phase !== 'round_end') return callback({ success: false, error: 'Not in round_end phase' });

      // v2 Phase E1 — Redemption Spin candidates are picked BEFORE
      // resetRoundOnline so we know who got the second-chance shot
      // for this round. The spins themselves run AFTER reset so
      // survivors get their 3-card fresh hand from the freshly-built
      // deck (resetRoundOnline rebuilds the deck and deals only to
      // alive players; redemption survivors revive into the alive set
      // afterwards and get their own 3-card deal).
      const redemptionCandidateIds = engine.pickRedemptionCandidates(room);

      engine.resetRoundOnline(room);

      const redemptionResults = [];
      for (const playerId of redemptionCandidateIds) {
        // Re-validate at run time — game-over could've been triggered
        // by something between pick + run. (In this handler that's
        // not really possible, but defensive.)
        const winnerYet = engine.checkGameOver(room);
        if (winnerYet) break;
        const result = engine.runRedemptionSpin(room, playerId);
        if (result) redemptionResults.push(result);
      }

      const gameOverWinner = engine.checkGameOver(room);
      if (gameOverWinner) {
        room.phase = 'game_over';
        room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
      }

      await saveRoom(room);
      callback({ success: true, redemptionResults });
      await broadcastRoomState(io, roomCode);

      // Emit one redemption_spin event per spin so clients can replay
      // each one with the existing spin animation.
      for (const r of redemptionResults) {
        const player = room.players.find(p => p.id === r.playerId);
        io.to(roomCode).emit('redemption_spin', {
          playerId: r.playerId,
          playerName: player?.username || null,
          eliminated: r.eliminated,
          spinIndex: r.spinIndex,
          chamber: r.chamber,
          chamberAfter: r.chamberAfter,
          riskLevel: r.riskLevel,
        });
      }

      // v2 Phase E2 — Speed Mode: arm timer for round 2's first player.
      armSpeedModeTimer(io, room);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── HOST: Spectate a player's hand ─────────────────────
  socket.on('spectate_player', async ({ roomCode, targetPlayerId } = {}, callback) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });
      if (room.hostSocketId !== socket.id) return callback({ success: false, error: 'Not the host' });

      const hand = room.hands?.get(targetPlayerId);
      if (!hand) return callback({ success: false, error: 'Player has no hand' });
      callback({ success: true, hand });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── Spin result acknowledgement (synced overlay dismiss) ─
  // Also where a game-ending spin transitions into the game_over
  // phase — we hold that transition in player_spin so clients get
  // to see the eliminating spin animation first.
  socket.on('spin_acknowledged', async ({ roomCode } = {}) => {
    const code = roomCode?.toUpperCase();
    if (!code) return;

    const room = await getRoom(code);
    if (room?.pendingGameOver) {
      const { id, name } = room.pendingGameOver;
      room.phase = 'game_over';
      room.lastAction = { type: 'game_over', winnerId: id, winnerName: name };
      delete room.pendingGameOver;
      // A pending Mirror Match spin would be moot if the game just
      // ended — discard it.
      delete room.pendingMirrorMatchSpin;
      await saveRoom(room);
      io.to(code).emit('spin_acknowledged');
      await broadcastRoomState(io, code);
      return;
    }

    // v2 Phase E2 — Mirror Match: if a follow-up spin was queued by
    // the previous spin handler, dispatch it now (after the primary
    // spin overlay has been dismissed). We run it server-side using
    // the same engine.spinGun call as a regular spin, then broadcast
    // the result as a fresh spin_result lastAction. Game-over / Medic
    // interception runs against the second spin's result too.
    if (room?.pendingMirrorMatchSpin) {
      const pending = room.pendingMirrorMatchSpin;
      delete room.pendingMirrorMatchSpin;
      await runMirrorMatchSpin(io, room, pending);
      // runMirrorMatchSpin handles its own broadcasts. Still emit the
      // ack so clients tear down their existing overlay.
      io.to(code).emit('spin_acknowledged');
      return;
    }

    io.to(code).emit('spin_acknowledged');
  });

  // ─── Chat: send a message ────────────────────────────────
  // Rate-limited to 5 messages / 3s per socket. Stored in
  // room.chatLog (capped at 50, broadcast in room_state for
  // reconnect history) and emitted live via 'chat_message'.
  socket.on('send_chat_message', async ({ roomCode, text } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const isMember = room.players.some(p => p.id === socket.userId) || room.hostUserId === socket.userId;
      if (!isMember) return callback?.({ success: false, error: 'Not a member of this room' });

      // Rate limit: rolling 3-second window, max 5 messages
      const now = Date.now();
      socket.chatTimestamps = (socket.chatTimestamps || []).filter(t => now - t < 3000);
      if (socket.chatTimestamps.length >= 5) {
        return callback?.({ success: false, error: 'Sending too fast — slow down' });
      }
      socket.chatTimestamps.push(now);

      const msg = engine.appendChatMessage(room, {
        userId: socket.userId,
        username: socket.username || 'Player',
        text,
      });
      if (!msg) return callback?.({ success: false, error: 'Empty message' });

      await saveRoom(room);
      io.to(code).emit('chat_message', msg);
      callback?.({ success: true, message: msg });
    } catch (err) {
      console.error('[send_chat_message]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Voice: mint a LiveKit access token ──────────────────
  // Returns a JWT scoped to the LiveKit room `bluff:<roomCode>`.
  // The caller must already be authenticated AND a member of the
  // game room — we don't allow speculative voice access.
  socket.on('request_voice_token', async ({ roomCode } = {}, callback) => {
    try {
      if (!socket.userId) return callback?.({ success: false, error: 'Not authenticated' });

      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        return callback?.({ success: false, error: 'Voice not configured on server' });
      }

      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      const isPlayer = room.players.some(p => p.id === socket.userId);
      const isHost = room.hostUserId === socket.userId;
      if (!isPlayer && !isHost) {
        return callback?.({ success: false, error: 'Not a member of this room' });
      }

      const livekitRoom = `bluff:${code}`;
      const at = new AccessToken(apiKey, apiSecret, {
        identity: socket.userId,
        name: socket.username || 'Player',
        ttl: 60 * 60, // 1 hour — room sessions are short
      });
      at.addGrant({
        room: livekitRoom,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });

      const token = await at.toJwt();
      callback?.({ success: true, token, livekitRoom });
    } catch (err) {
      console.error('[request_voice_token]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── Intentional leave ───────────────────────────────────
  socket.on('leave_room', async ({ roomCode, playerId } = {}) => {
    try {
      const code = roomCode?.toUpperCase();
      const room = await getRoom(code);
      if (!room) return;

      if (playerId) {
        const key = dcKey(code, playerId);
        if (playerDisconnectTimers.has(key)) {
          clearTimeout(playerDisconnectTimers.get(key));
          playerDisconnectTimers.delete(key);
        }
      }

      const idx = room.players.findIndex(p => p.id === playerId);
      if (idx !== -1) {
        const player = room.players[idx];
        room.players.splice(idx, 1);
        engine.eliminateFromTurnOrder(room, playerId);
        console.log(`[Room ${code}] ${player.username} left`);

        const gameOverWinner = engine.checkGameOver(room);
        if (gameOverWinner) {
          room.phase = 'game_over';
          room.lastAction = { type: 'game_over', winnerId: gameOverWinner.id, winnerName: gameOverWinner.username };
        }

        await saveRoom(room);
        socket.leave(code);
        await broadcastRoomState(io, code);
      }
    } catch (err) {
      console.error('[leave_room]', err.message);
    }
  });

  // ─── PLAYER: Place a bet (v2 Phase F) ────────────────────
  // While the betting window is open, every alive player except the
  // spin target can submit `prediction: 'survive' | 'eliminated'`.
  // First-bet wins for now — a later edit replaces it. Skipped bets
  // are no-ops (no streak change).
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

  // ─── PLAYER: Ghost vote (v2 Phase F — DMH) ───────────────
  // Eligible voters are eliminated players. Vote option ids are
  // [1, 2] always; [3] is added if any risk modifier is enabled in
  // room.config.
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

  // ─── PLAYER: Last Stand spin (v2 Phase F) ────────────────
  // The active finalist pulls the trigger. Survival → opponent's
  // turn. Elimination → game_over with the other finalist as winner.
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
          room.pendingGameOver = { id: winner.id, name: winner.username };
        }
      }

      await saveRoom(room);
      await broadcastRoomState(io, code);
      callback?.({ success: true, ...res });
    } catch (err) {
      console.error('[last_stand_spin]', err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ─── PLAYER: Last Stand end turn (v2 Phase F) ────────────
  // Pass the gun to the opponent finalist after a survival.
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

  // ─── Disconnect ──────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        // 30s host grace — was 10s, but a normal browser refresh
        // (page load + JS + socket connect + auth + host_reconnect)
        // can take 5–8s on a cold cache, and 10s killed real games
        // when the host just hit refresh. Matches the player timer.
        io.to(code).emit('host_disconnecting', { countdown: 30 });
        const timer = setTimeout(() => {
          io.to(code).emit('game_ended', { reason: 'The host left the game.' });
          // v2 Phase F — clear any open Phase F timers tied to this room.
          _clearBettingTimer(code);
          _clearGhostVoteTimer(code);
          // v2 Phase E2 — clear any in-flight Speed Mode timer when
          // the room is torn down so a stale timeout doesn't fire
          // against a deleted room.
          cancelSpeedModeTimer(code);
          rooms.delete(code);
          hostDisconnectTimers.delete(code);
        }, 30000);
        hostDisconnectTimers.set(code, timer);
        continue;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.status === 'eliminated') continue;

      if (room.phase === 'lobby') {
        // 10s grace in lobby too — hitting refresh in the lobby used
        // to drop you instantly and risk a "name taken" race if
        // someone else joined fast. Same per-(roomCode,playerId)
        // timer mechanism as the in-game grace.
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

      if (['playing', 'bluff_resolution', 'spin_pending', 'swap_pending', 'medic_pending', 'sniper_pending', 'ghost_vote_pending', 'last_stand'].includes(room.phase)) {
        io.to(code).emit('player_disconnecting', { playerId: player.id, playerName: player.username });

        const key = dcKey(code, player.id);
        const capturedSocketId = socket.id;

        const timer = setTimeout(async () => {
          // Re-check against the captured socket id — if the player
          // reconnected on a new socket, room.players[i].socketId will
          // have changed and we should NOT eliminate.
          const still = room.players.find(p => p.id === player.id && p.socketId === capturedSocketId);
          if (still?.status === 'alive') {
            // v2 Phase D — if this player was holding the room hostage
            // mid-Medic/Sniper pause, auto-decline first so the game
            // doesn't deadlock.
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
            // v2 Phase H — Swap holder disconnect: the room is paused
            // on swap_pending waiting for them to pick a played-pile
            // card. Treat their disconnect as forfeit — the original
            // played card stays on top, the bluff resolves against it
            // (i.e. fall through to default spin without consuming the
            // Swap). We replicate the resumeAfterSwap "no-op swap"
            // branch by clearing the pause and re-running the post-swap
            // stages with the picked card == the original card.
            if (room.phase === 'swap_pending' && room.swapHolderId === still.id) {
              const accuserId = room.lastAction?.accuserId;
              const top = room.playedPile?.[room.playedPile.length - 1];
              if (accuserId && top?.id) {
                const { events: swapEvents, outcome: swapOutcome } =
                  bluffPipeline.resumeAfterSwap(room, accuserId, top.id);
                room.swapHolderId = null;
                if (swapOutcome && swapOutcome.kind !== 'error') {
                  applyBluffOutcome(room, swapOutcome);
                }
                emitPowerCardEvents(io, code, swapEvents);
              } else {
                // Couldn't reconstruct context — just unfreeze the room.
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

module.exports = {
  registerSocketHandlers,
  rooms,
  // Exposed for unit tests + clarity. Treat as internal.
  sanitizeGuestUsername,
  isValidGuestId,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
};
