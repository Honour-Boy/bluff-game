// ============================================================
// ENGINE — Chamber / spin-trigger system
// ============================================================
// Backend-authoritative randomness. Outcome-first, chamber-consistent
// model (issue #67) — see pullTrigger doc.

const { CHAMBER_SIZE } = require('./constants');

/**
 * Non-linear gun-chamber death curve (issue #67).
 *
 * Keyed by the number of bullets currently in the 6-slot chamber.
 * Replaces the old raw `bullets / 6` odds with a hand-tuned curve so
 * the early game is gentler and the late game spikes harder:
 *
 *   bullets │ 1   2    3    4    5    6
 *   death % │ 15  24   33   50   75   100
 *
 * 0 bullets → 0% (you cannot die from an empty chamber — chamber
 * realism is preserved; see pullTrigger). The curve only sets the
 * *probability*; pullTrigger then selects a chamber slot consistent
 * with the drawn outcome so visuals never contradict the result.
 */
const DEATH_CURVE = {
  0: 0,
  1: 0.15,
  2: 0.24,
  3: 0.33,
  4: 0.50,
  5: 0.75,
  6: 1.00,
};

/**
 * Death probability for a chamber holding `bulletCount` bullets.
 * Clamps out-of-range counts to [0, CHAMBER_SIZE].
 */
function deathProbability(bulletCount) {
  const n = Math.max(0, Math.min(CHAMBER_SIZE, Math.floor(bulletCount)));
  return DEATH_CURVE[n] ?? 0;
}

/**
 * Create a fresh chamber with `bullets` bullets at random positions.
 * Default = 1 bullet (vanilla rules). Russian Roulette risk modifier
 * (Phase E1) starts every chamber with 2 bullets — pass `bullets: 2`
 * (≈24% first-spin death on the issue #67 curve).
 */
function initChamber(bullets = 1) {
  const safe = Math.max(0, Math.min(CHAMBER_SIZE, Math.floor(bullets)));
  const chamber = new Array(CHAMBER_SIZE).fill(null);
  const slots = [];
  while (slots.length < safe) {
    const idx = Math.floor(Math.random() * CHAMBER_SIZE);
    if (!slots.includes(idx)) slots.push(idx);
  }
  for (const i of slots) chamber[i] = 'bullet';
  return chamber;
}

/**
 * Add one more bullet at a random empty slot.
 * Called after a player survives a spin.
 * If all slots are full (shouldn't happen in normal play), returns unchanged.
 */
function addBulletToChamber(chamber) {
  const empty = chamber.reduce((acc, s, i) => (s === null ? [...acc, i] : acc), []);
  if (empty.length === 0) return chamber;
  const next = [...chamber];
  next[empty[Math.floor(Math.random() * empty.length)]] = 'bullet';
  return next;
}

/**
 * Pull the trigger.
 *
 * Issue #67 — outcome-first, chamber-consistent model:
 *   1. Death is drawn from the non-linear DEATH_CURVE keyed by the
 *      *pre-spin* bullet count (NOT raw `slot has bullet`). This makes
 *      the early game gentler and the late game spike.
 *   2. The chamber visuals must never contradict the outcome, so once
 *      the outcome is decided we *select* `spinIndex` from the slots
 *      that agree with it: a bullet slot on death, an empty slot on
 *      survival. The emitted `chamber`/`chamberAfter`/`spinIndex` and
 *      `eliminated` are therefore always logically consistent —
 *      `chamber[spinIndex] === 'bullet'` iff `eliminated`.
 *   3. Chamber realism is preserved: 0 bullets ⇒ 0% (curve), so you
 *      can never "die" with no bullet; 6 bullets ⇒ 100%, so you can
 *      never "survive" a full chamber. Defensive guards keep the
 *      invariant even if a caller passes an impossible state.
 *
 * v2 Phase E1 — Risk modifiers:
 *   - doubleBarrel: two trigger pulls — eliminated if EITHER roll
 *     lands a kill against the curve.
 *   - hotPotato: on SURVIVAL, add 2 bullets instead of 1. Clamps at
 *     full chamber.
 *
 * Returns { spinIndex, eliminated, chamber, bulletCount }.
 */
function pullTrigger(chamber, modifiers = {}) {
  const bulletSlots = [];
  const emptySlots = [];
  chamber.forEach((s, i) => (s === 'bullet' ? bulletSlots : emptySlots).push(i));

  const p = deathProbability(bulletSlots.length);
  let eliminated = Math.random() < p;
  if (modifiers.doubleBarrel) {
    const second = Math.random() < p;
    eliminated = eliminated || second;
  }

  // Chamber realism / defensive consistency.
  if (eliminated && bulletSlots.length === 0) eliminated = false;
  if (!eliminated && emptySlots.length === 0) eliminated = true;

  const pool = eliminated ? bulletSlots : emptySlots;
  const spinIndex = pool[Math.floor(Math.random() * pool.length)];

  let updatedChamber = chamber;
  if (!eliminated) {
    updatedChamber = addBulletToChamber(chamber);
    if (modifiers.hotPotato) {
      updatedChamber = addBulletToChamber(updatedChamber);
    }
  }
  const bulletCount = updatedChamber.filter(s => s === 'bullet').length;
  return { spinIndex, eliminated, chamber: updatedChamber, bulletCount };
}

module.exports = {
  DEATH_CURVE,
  deathProbability,
  initChamber,
  addBulletToChamber,
  pullTrigger,
};
