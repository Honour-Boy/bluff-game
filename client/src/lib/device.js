// ============================================================
// DEVICE IDENTITY — persistent per-browser id for single-device sessions
// ============================================================
//
// One stable id per browser INSTALL, sent with `authenticate` so the
// server can tell "the same device reconnecting" (refresh / new tab /
// network blip) from "a genuinely different device logging in".
//
// localStorage, NOT sessionStorage: tabs on the same machine must share
// it so two tabs read as ONE device — a same-device login then
// deterministically replaces its own session instead of being refused as
// "another device while in a room" (see docs/single-device-session.md §3.3).

const DEVICE_ID_KEY = 'bluff_device_id';

function mintId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Loose v4-shaped fallback for ancient environments; the server only
  // needs uuid SHAPE, and a non-uuid degrades to unique-per-connection.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Read (creating once) the persistent device id. Returns null only when
// storage is entirely unavailable (SSR / hard private mode) — the server
// then treats the login as a unique device, which is the safe default.
export function getDeviceId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = mintId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (_) {
    return null;
  }
}
