// ─── Tour anchor ids ──────────────────────────────────────────────────────────
// Single source of truth for every `data-tour-id` string the spotlight tour
// points at. Imported by BOTH the components that stamp the attribute AND the
// pure `tourContent.js` beat list, so an id can never drift between the two
// (a beat's anchorId is guaranteed to match the attribute a component renders).
//
// Keep these stable — they are the tour's contract with the live UI.

export const TOUR_IDS = {
  // Part A — the settings walk (over the real SettingsGear).
  settingsGear: 'settings-gear',
  settingsChat: 'settings-chat',
  settingsGameSettings: 'settings-game-settings',
  settingsLeaderboard: 'settings-leaderboard',
  settingsLeave: 'settings-leave',
  settingsProfile: 'settings-profile',
  settingsCosmetics: 'settings-cosmetics',
  settingsAudio: 'settings-audio',

  // Part B — in-game functions (over the live table).
  myHand: 'my-hand',            // already stamped in BottomSeat.js
  myHandFan: 'my-hand-fan',     // already stamped in CardHand.js
  btnConfirmPlay: 'btn-confirm-play',
  btnEndTurn: 'btn-end-turn',
  btnCallBluff: 'btn-call-bluff',
  btnPullTrigger: 'btn-pull-trigger',
  btnSpinContinue: 'btn-spin-continue',
  powerSlot: 'power-slot',
  btnActivatePower: 'btn-activate-power',
  peekResult: 'peek-result',
};
