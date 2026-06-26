// ============================================================
// ROOM SESSION PERSISTENCE — primary + short-TTL recovery
// ============================================================
//
// Two stores, deliberately layered (issue #M4 reconnection hardening):
//
//  • PRIMARY  — sessionStorage['bluff_session']. Tab-local, matching the
//    rest of the app's "close the tab = signed out" contract (see useAuth).
//    Survives a same-tab refresh; gone when the tab closes.
//
//  • RECOVERY — localStorage['bluff_session_recovery'], stamped with `ts`
//    and honoured ONLY within RECOVERY_TTL_MS. Used purely as a fallback
//    when the primary entry is unexpectedly missing during a transient
//    drop / refresh, so a brief network blip never strands the player or
//    bounces them to the landing screen. A stale snapshot is ignored and
//    purged, so it can't silently re-drop someone into a long-dead room.
//
// Always read/write/clear through these helpers so both stores stay in
// sync — never poke sessionStorage['bluff_session'] directly.

const SESSION_KEY  = 'bluff_session';
const RECOVERY_KEY = 'bluff_session_recovery';
const RECOVERY_TTL_MS = 120_000; // 2 minutes - long enough for a reconnect, short enough to stay fresh

export function saveRoomSession(session) {
  if (typeof window === 'undefined' || !session?.roomCode) return;
  const base = {
    roomCode: session.roomCode,
    isHost: !!session.isHost,
    playerId: session.playerId ?? null,
  };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(base)); } catch (_) { /* private mode */ }
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ ...base, ts: Date.now() })); } catch (_) { /* ignore */ }
}

export function readRoomSession() {
  if (typeof window === 'undefined') return null;
  // Primary first — authoritative within the tab.
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.roomCode) return parsed;
    }
  } catch (_) { /* fall through to recovery */ }
  // Recovery fallback — only if fresh.
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (raw) {
      const snap = JSON.parse(raw);
      const fresh = snap?.roomCode
        && typeof snap.ts === 'number'
        && (Date.now() - snap.ts) < RECOVERY_TTL_MS;
      if (fresh) {
        return { roomCode: snap.roomCode, isHost: !!snap.isHost, playerId: snap.playerId ?? null };
      }
      localStorage.removeItem(RECOVERY_KEY);
    }
  } catch (_) { /* ignore */ }
  return null;
}

export function clearRoomSession() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
  try { localStorage.removeItem(RECOVERY_KEY); } catch (_) { /* ignore */ }
}
