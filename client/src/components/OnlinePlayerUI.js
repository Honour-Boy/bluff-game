// ============================================================
// ONLINE PLAYER UI - Re-export shim (issue #105 PR C)
// ============================================================
// The OnlinePlayerUI implementation now lives under
// ./OnlinePlayerUI/*. This shim keeps the historical
// import surface stable for page.js and the existing tests.

export {
  CardHand,
  distributePlayers,
  OnlinePlayerUI,
  orderClockwiseFromLocal,
} from './OnlinePlayerUI/index.js';
