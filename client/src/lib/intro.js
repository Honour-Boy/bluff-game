// ============================================================
// INTRO SPLASH GATING — "genuine game open" detector
// ============================================================
//
// The revolver-blast intro video (`/videos/intro.mp4`) is a brand
// splash, NOT a route transition or a data-loading spinner. It should
// fire only on a *genuine* open of the game:
//
//   • a fresh tab / first ever entry, and
//   • the next entry after the player signed out.
//
// It must NOT replay on a same-tab refresh, a socket reconnect, or any
// in-app navigation. The gate is a single sessionStorage flag:
//
//   bluff_intro_seen  — present once the intro has played in this tab.
//
// Because it lives in sessionStorage (tab-local), a refresh keeps the
// flag set → no replay on data loads / reconnects, matching the rest of
// the app's "close the tab = fresh start" contract (see useAuth). Sign-
// out calls `rearmIntro()` to drop the flag so the next entry plays it
// again ("opening the game after logout").

const INTRO_SEEN_KEY = 'bluff_intro_seen';

// True when the intro has not yet played in this browser tab session.
export function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  try {
    return !sessionStorage.getItem(INTRO_SEEN_KEY);
  } catch (_) {
    // private mode / storage disabled — never block on the splash.
    return false;
  }
}

// Mark the intro as played for the remainder of this tab session.
export function markIntroSeen() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (_) { /* ignore */ }
}

// Drop the flag so the next genuine open replays the intro. Called on
// sign-out so a fresh login is greeted by the splash again.
export function rearmIntro() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(INTRO_SEEN_KEY); } catch (_) { /* ignore */ }
}
