// ─── tourContent — the spotlight tour script (PURE, no React) ─────────────────
// The ordered beat list for the "Show me around" spotlight tour and the helpers
// that filter it for the current player/room. Kept pure so the whole script is
// unit-testable without a DOM. Mirrors `tutorialContent.js`.
//
// Beat shape:
//   {
//     id,          // stable key
//     anchorId,    // data-tour-id of the element to spotlight (from tourIds.js)
//     part,        // 'A' (controls) | 'B' (in-game) — for the step counter / grouping
//     shape,       // 'square' | 'rect' | 'big-rect' — cutout padding around the rect
//     advance,     // 'next' | 'click-target' | 'do-action'
//     copy,        // explanation shown in the popup
//     instruction, // action-beat call to action (e.g. "Click it") — omitted for 'next'
//     waitFor,     // do-action/click-target: a symbolic effect key TourLayer watches
//     guestOnly?,  // include only for guests
//     nonGuestOnly?,// include only for signed-in (non-guest) players
//     step?,       // Part-B: the server tour scenario step this beat belongs to
//   }

import { TOUR_IDS } from './tourIds';

// Part A — the settings walk (read-mostly; runs over the real SettingsGear).
const PART_A = [
  {
    id: 'A1', part: 'A', anchorId: TOUR_IDS.settingsGear,
    shape: 'square', advance: 'click-target', waitFor: 'menu-open',
    copy: 'This is the settings button — your game settings and table controls all live here.',
    instruction: 'Click it to open the menu.',
  },
  {
    id: 'A2', part: 'A', anchorId: TOUR_IDS.settingsChat,
    shape: 'rect', advance: 'next',
    copy: 'Chat — talk to the table mid-game. Unread messages show a badge right here.',
  },
  {
    id: 'A3', part: 'A', anchorId: TOUR_IDS.settingsGameSettings,
    shape: 'rect', advance: 'next',
    copy: 'Game settings — powers, modifiers and house rules for the room. The host configures these in the lobby; everyone else sees a summary.',
  },
  {
    id: 'A4', part: 'A', anchorId: TOUR_IDS.settingsLeaderboard,
    shape: 'rect', advance: 'next',
    copy: 'Leaderboard — live standings during a group game so you always know where you sit.',
  },
  {
    id: 'A5', part: 'A', anchorId: TOUR_IDS.settingsLeave,
    shape: 'rect', advance: 'next',
    copy: 'Leave table — step away from the game. In practice, leaving ends the session.',
  },
  {
    id: 'A6', part: 'A', anchorId: TOUR_IDS.settingsProfile,
    shape: 'rect', advance: 'next', nonGuestOnly: true,
    copy: 'Edit profile — change your display name whenever you like.',
  },
  {
    id: 'A7', part: 'A', anchorId: TOUR_IDS.settingsCosmetics,
    shape: 'rect', advance: 'next', nonGuestOnly: true,
    copy: 'Cosmetics — climb the four tiers (Streets → Backroads → Syndicate → Covenant) to unlock each tier’s set: deck skins, table felts and chamber skins. Your rank, level and XP live in your profile, top-left.',
  },
  {
    id: 'A8', part: 'A', anchorId: TOUR_IDS.settingsAudio,
    shape: 'rect', advance: 'next',
    copy: 'Audio — set the music volume, skip tracks, or mute the soundtrack entirely.',
  },
];

// Part B — in-game functions (real staged instances over the live table). Each
// `step` matches a server tour-scenario step (see server/engine/tourScenarios.js):
//   'play_card'        — B1..B4
//   'call_bluff_chain' — B5..B7
//   'activate_power'   — B8..B9
const PART_B = [
  {
    id: 'B1', part: 'B', step: 'play_card', anchorId: TOUR_IDS.myHandFan,
    shape: 'big-rect', advance: 'next',
    copy: 'This is your hand. Drag across it to browse — the card nearest the centre is the one in focus.',
  },
  {
    id: 'B2', part: 'B', step: 'play_card', anchorId: TOUR_IDS.myHandFan,
    shape: 'big-rect', advance: 'do-action', waitFor: 'card-pending',
    copy: 'To play a card, tap it. Pick any card from the fan now.',
    instruction: 'Tap a card.',
  },
  {
    id: 'B3', part: 'B', step: 'play_card', anchorId: TOUR_IDS.btnConfirmPlay,
    shape: 'rect', advance: 'do-action', waitFor: 'card-played',
    copy: 'A confirm pop-up appears so you never misfire a card.',
    instruction: 'Press Play to confirm.',
  },
  {
    id: 'B4', part: 'B', step: 'play_card', anchorId: TOUR_IDS.btnEndTurn,
    shape: 'rect', advance: 'do-action', waitFor: 'turn-ended',
    copy: 'Once your card is down, end your turn to pass play along.',
    instruction: 'Click End Turn.',
  },
  {
    id: 'B5', part: 'B', step: 'call_bluff_chain', anchorId: TOUR_IDS.btnCallBluff,
    shape: 'rect', advance: 'do-action', waitFor: 'bluff-called',
    copy: "Think the last player lied about their card? Call their bluff. (They were honest this time — let's see what happens when a call is wrong.)",
    instruction: 'Call the bluff.',
  },
  {
    id: 'B6', part: 'B', step: 'call_bluff_chain', anchorId: TOUR_IDS.btnPullTrigger,
    shape: 'rect', advance: 'do-action', waitFor: 'spun',
    copy: 'A wrong call means YOU face the chamber. Pull the trigger — your chamber is clear, so you’re safe this time.',
    instruction: 'Pull the trigger.',
  },
  {
    id: 'B7', part: 'B', step: 'call_bluff_chain', anchorId: TOUR_IDS.btnSpinContinue,
    shape: 'rect', advance: 'do-action', waitFor: 'spin-acknowledged',
    copy: 'You survived. After every spin, continue to carry on with the game.',
    instruction: 'Click Continue.',
  },
  {
    id: 'B8', part: 'B', step: 'activate_power', anchorId: TOUR_IDS.powerSlot,
    shape: 'rect', advance: 'do-action', waitFor: 'power-modal-open',
    copy: 'Power cards sit in their own slot. This one is a Peek. Tap it to use it.',
    instruction: 'Tap the power card.',
  },
  {
    id: 'B9', part: 'B', step: 'activate_power', anchorId: TOUR_IDS.btnActivatePower,
    shape: 'rect', advance: 'do-action', waitFor: 'power-activated',
    copy: 'Confirm to fire the power.',
    instruction: 'Press Activate.',
  },
  {
    id: 'B10', part: 'B', step: 'activate_power', anchorId: TOUR_IDS.peekResult,
    shape: 'rect', advance: 'next',
    copy: 'Peek reveals the last card played, so you can judge a bluff with confidence. That’s the whole table — you’re ready.',
  },
];

// The full ordered list before filtering.
export const ALL_TOUR_BEATS = [...PART_A, ...PART_B];

// Filter the beat list for the current context. Guests don't get profile /
// cosmetics rows; any beat whose nonGuestOnly/guestOnly flag doesn't match is
// dropped. (Anchor-missing-at-runtime is handled separately by TourLayer's
// skip-on-missing — this filter only removes beats that are *known* absent.)
export function tourBeatsFor({ isGuest = false } = {}) {
  return ALL_TOUR_BEATS.filter((b) => {
    if (b.nonGuestOnly && isGuest) return false;
    if (b.guestOnly && !isGuest) return false;
    return true;
  });
}

// Given a filtered beat list and the current index, return the next beat (or
// null when the tour is complete).
export function nextBeat(beats, index) {
  if (!Array.isArray(beats)) return null;
  return beats[index + 1] || null;
}

// Total Part-B server steps in order — the director stages these one at a time.
export const TOUR_STEPS = ['play_card', 'call_bluff_chain', 'activate_power'];
