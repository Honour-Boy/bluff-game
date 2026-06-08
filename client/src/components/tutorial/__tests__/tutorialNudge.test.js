// ============================================================
// Tutorial idle "tap a card" nudge — anchoring.
//
// The nudge used to sit at a FIXED bottom offset, which drifted off the hand on
// wide screens. It now measures the real hand element ([data-tour-id="my-hand"])
// and centres over it. These tests lock that anchoring (and the fixed fallback
// when the hand isn't mounted yet) deterministically, without needing the live
// app — a Playwright pass against the running app still needs Supabase env.
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

it('centres the idle nudge over the real hand element', () => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

  const { container } = render(
    <div>
      <div data-tour-id="my-hand" />
      <TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile startGame={() => {}} />
    </div>,
  );

  // Hand fan occupies x∈[400,700] with its top at y=600.
  const hand = container.querySelector('[data-tour-id="my-hand"]');
  hand.getBoundingClientRect = () => ({
    left: 400, width: 300, top: 600, height: 84, right: 700, bottom: 684, x: 400, y: 600,
  });

  act(() => { vi.advanceTimersByTime(3600); }); // idle → nudge mounts + measures

  const outer = screen.getByText(/Tap a card/i).closest('.fade-in');
  expect(outer).toBeTruthy();
  // centreX = 400 + 300/2 = 550; bottom = innerHeight - top + 8 = 800 - 600 + 8.
  expect(outer.style.left).toBe('550px');
  expect(outer.style.bottom).toBe('208px');
  expect(outer.style.transform).toContain('translateX(-50%)');
});

it('falls back to a fixed offset when the hand is not mounted', () => {
  vi.useFakeTimers();
  render(<TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile startGame={() => {}} />);
  act(() => { vi.advanceTimersByTime(3600); });

  const outer = screen.getByText(/Tap a card/i).closest('.fade-in');
  expect(outer.style.left).toBe('50%'); // centred fallback, not an anchored px value
});

// The nudge is MOBILE-ONLY: on large screens its fixed anchor drifts off the
// hand, so it is suppressed there (mobile keeps it).
it('does NOT show the idle nudge on large screens (desktop)', () => {
  vi.useFakeTimers();
  render(
    <div>
      <div data-tour-id="my-hand" />
      <TutorialLayer roomState={roomState()} myPlayerId="me" isMyTurn isMobile={false} startGame={() => {}} />
    </div>,
  );
  act(() => { vi.advanceTimersByTime(3600); });
  expect(screen.queryByText(/Tap a card/i)).toBeNull();
});

it('does NOT show the idle nudge during a clinic drill (the coach guides instead)', () => {
  vi.useFakeTimers();
  const rs = { ...roomState(), tutorialLesson: 'powers', tutorialScenario: { power: 'freeze', actor: 'player', step: 'intro', index: 1, total: 7, lockBluff: true } };
  render(<TutorialLayer roomState={rs} myPlayerId="me" isMyTurn startGame={() => {}} />);
  act(() => { vi.advanceTimersByTime(3600); });
  expect(screen.queryByText(/Tap a card/i)).toBeNull();
});
