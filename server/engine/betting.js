// ============================================================
// ENGINE — v2 Phase F — Betting (per-spin window + streak reward)
// ============================================================
// When a spin enters spin_pending, a 10s betting window opens for
// every alive player except the spin target. Correct guesses bump
// consecutiveCorrectBets; at 3 the player's risk level drops by 1
// and counter resets.

const { BETTING_STREAK_REWARD, BETTING_WINDOW_MS } = require('./constants');

function startBettingWindow(room) {
  if (!room?.config?.systems?.betting) return [];
  if (!room.spinTargetId) return [];
  const eligibleIds = room.players
    .filter(p => p.status === 'alive' && p.id !== room.spinTargetId)
    .map(p => p.id);
  room.betting = {
    spinTargetId: room.spinTargetId,
    eligibleIds,
    bets: {},
    startedAt: Date.now(),
    closesAt: Date.now() + BETTING_WINDOW_MS,
    closed: false,
  };
  return eligibleIds;
}

function placeBet(room, playerId, prediction) {
  if (!room?.betting || room.betting.closed) {
    return { ok: false, error: 'No betting window open' };
  }
  if (!['survive', 'eliminated'].includes(prediction)) {
    return { ok: false, error: 'Invalid prediction' };
  }
  if (!room.betting.eligibleIds.includes(playerId)) {
    return { ok: false, error: 'Not eligible to bet' };
  }
  room.betting.bets[playerId] = prediction;
  return { ok: true };
}

function closeBettingWindow(room) {
  if (!room?.betting) return;
  room.betting.closed = true;
}

/**
 * Evaluate bets after a spin resolves. Returns array of banner events
 * for streak rewards.
 */
function evaluateBets(room, eliminated) {
  if (!room?.betting) return [];
  const events = [];
  const actual = eliminated ? 'eliminated' : 'survive';
  for (const [pid, prediction] of Object.entries(room.betting.bets)) {
    const player = room.players.find(p => p.id === pid);
    if (!player) continue;
    if (prediction === actual) {
      player.consecutiveCorrectBets = (player.consecutiveCorrectBets || 0) + 1;
      if (player.consecutiveCorrectBets >= BETTING_STREAK_REWARD) {
        const bullets = player.chamber
          .map((s, i) => (s === 'bullet' ? i : -1))
          .filter(i => i !== -1);
        if (bullets.length > 0) {
          const removeIdx = bullets[Math.floor(Math.random() * bullets.length)];
          const next = [...player.chamber];
          next[removeIdx] = null;
          player.chamber = next;
          player.riskLevel = next.filter(s => s === 'bullet').length;
        }
        player.consecutiveCorrectBets = 0;
        events.push({
          kind: 'betting_streak_reward',
          holderId: player.id,
          holderName: player.username || null,
          riskAfter: player.riskLevel,
        });
      }
    } else {
      player.consecutiveCorrectBets = 0;
    }
  }
  room.betting = null;
  return events;
}

module.exports = {
  startBettingWindow,
  placeBet,
  closeBettingWindow,
  evaluateBets,
};
