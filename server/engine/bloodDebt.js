// ============================================================
// ENGINE — Blood Debt (Covenant-exclusive mechanic)
// ============================================================
// Pure helpers only — no I/O, no socket access. Orchestration (the
// assignment prompt + the queued debt spin) lives in the handler/lib layer;
// this module just owns the player-flag transitions.
//
// Blood Debt: when a player is eliminated by a CORRECT bluff call's spin in a
// Covenant room, they name one alive player to carry a "blood debt". The next
// time that player calls a bluff, an extra "debt spin" fires on them after the
// primary resolution — the dead reaching back to take someone with them. The
// flag is consumed (one-shot) when the debt spin is queued.

// Mark `debtTargetId` as carrying a blood debt. No-op if the player isn't
// found or already carries one (a player can hold at most one debt at a time).
function assignBloodDebt(room, debtTargetId) {
  const p = room?.players?.find(pl => pl.id === debtTargetId);
  if (!p || p.hasBloodDebt) return { ok: false };
  p.hasBloodDebt = true;
  return { ok: true };
}

// True iff `callerId` currently carries a blood debt.
function checkCallerHasBloodDebt(room, callerId) {
  return room?.players?.find(p => p.id === callerId)?.hasBloodDebt === true;
}

// Clear the debt flag (consumed exactly once when the debt spin is queued).
function consumeBloodDebt(room, callerId) {
  const p = room?.players?.find(pl => pl.id === callerId);
  if (!p) return { ok: false };
  p.hasBloodDebt = false;
  return { ok: true };
}

module.exports = {
  assignBloodDebt,
  checkCallerHasBloodDebt,
  consumeBloodDebt,
};
