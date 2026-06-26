// ============================================================
// Tutorial idle "tap a card" nudge - anchoring.
//
// The nudge used to sit at a FIXED bottom offset, which drifted off the hand on
// wide screens. It now measures the real hand element ([data-tour-id="my-hand"])
// and centres over it. These tests lock that anchoring (and the fixed fallback
// when the hand isn't mounted yet) deterministically, without needing the live
// app - a Playwright pass against the running app still needs Supabase env.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { TutorialLayer } from '../TutorialLayer';

afterEach(() => { vi.useRealTimers(); cleanup(); });

function roomState() {
  return {
    phase: 'playing',
    isFirstTurn: false,
    cardPlayedThisTurn: false,
    bluffUsedThisTurn: false,
    bluffBlockedThisTurn: false,
    tutorialScenario: null,
    tutorialLesson: 'basics',
    currentPlayerId: 'me',
    players: [{ id: 'me', status: 'alive' }],
  };
}

it('aligns the idle nudge horizontally to the real hand element', () => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

  const { container } = render(
    <div>
      <div data-tour-id="my-hand" />
      <TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile startGame={() => {}} />
    </div>,
  );

  // Hand fan occupies x∈[400,700].
  const hand = container.querySelector('[data-tour-id="my-hand"]');
  hand.getBoundingClientRect = () => ({
    left: 400, width: 300, top: 600, height: 84, right: 700, bottom: 684, x: 400, y: 600,
  });

  act(() => { vi.advanceTimersByTime(3600); }); // idle → nudge mounts + measures

  // The `.fade-in` now sits on an INNER wrapper (its keyframes animate transform
  // and would clobber the centring translateX); the positioned wrapper that
  // carries left/bottom is its parent.
  const outer = screen.getByText(/Tap a card/i).closest('.fade-in')?.parentElement;
  expect(outer).toBeTruthy();
  // centreX = 400 + 300/2 = 550 (horizontal alignment to the fan).
  expect(outer.style.left).toBe('550px');
  expect(outer.style.transform).toContain('translateX(-50%)');
  // The nudge is now pinned to the VERY BOTTOM of the seat (a fixed bottom offset),
  // not anchored above the cards.
  expect(outer.style.bottom).toContain('safe-area-inset-bottom');
});

it('falls back to a fixed offset when the hand is not mounted', () => {
  vi.useFakeTimers();
  render(<TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile startGame={() => {}} />);
  act(() => { vi.advanceTimersByTime(3600); });

  const outer = screen.getByText(/Tap a card/i).closest('.fade-in')?.parentElement;
  expect(outer.style.left).toBe('50%'); // centred fallback, not an anchored px value
});

// The nudge now anchors to the real hand element on every width (the measure
// adapts its own width to fit centred), so it is shown on desktop too.
it('shows the idle nudge on large screens (desktop), anchored to the hand', () => {
  vi.useFakeTimers();
  render(
    <div>
      <div data-tour-id="my-hand" />
      <TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile={false} startGame={() => {}} />
    </div>,
  );
  act(() => { vi.advanceTimersByTime(3600); });
  expect(screen.queryByText(/Tap a card/i)).toBeTruthy();
});

it('does NOT show the idle nudge during a clinic drill (the coach guides instead)', () => {
  vi.useFakeTimers();
  const rs = { ...roomState(), tutorialLesson: 'powers', tutorialScenario: { power: 'freeze', actor: 'player', step: 'intro', index: 1, total: 7, lockBluff: true } };
  render(<TutorialLayer roomState={rs} myPlayerId="me" isMyTurn startGame={() => {}} />);
  act(() => { vi.advanceTimersByTime(3600); });
  expect(screen.queryByText(/Tap a card/i)).toBeNull();
});
