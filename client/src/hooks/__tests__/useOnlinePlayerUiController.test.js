import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlinePlayerUiController } from '../useOnlinePlayerUiController';

// ─── #185 — Last Event must not reveal a spin outcome mid-animation ──────
// The controller exposes `displayedLastAction`: it mirrors roomState.lastAction
// for every action type EXCEPT a spin_result, which is withheld until the
// cylinder animation completes (spinComplete flips at 8080ms). These tests
// drive that timer with fake timers and assert the gate.

// Minimal prop bag — the controller destructures many props but only a few
// matter for the Last Event gate. Everything else is a noop / inert value.
function makeProps(lastAction) {
  return {
    roomState: { lastAction, phase: 'playing' },
    myPlayer: { id: 'me', status: 'alive' },
    myHand: [],
    isMyTurn: false,
    isPlaying: true,
    spectatePlayer: vi.fn(),
    activatePowerCard: vi.fn(),
    swapPick: vi.fn(),
    medicDecide: vi.fn(),
    sniperRedirect: vi.fn(),
    saboteurTransfer: vi.fn(),
    acknowledgeSpinResult: vi.fn(),
    spinDismissed: false,
    powerEventQueue: [],
  };
}

const SPIN_RESULT = {
  type: 'spin_result',
  spinTargetId: 'p2',
  spinTargetName: 'Bob',
  spinIndex: 2,
  chamber: [null, null, 'bullet', null, null, null],
  roll: 2,
  eliminated: true,
  riskLevelBefore: 5,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnlinePlayerUiController — Last Event spin gating (#185)', () => {
  it('withholds a spin_result until the cylinder animation completes (8080ms)', () => {
    const preSpin = { type: 'bluff_called', callerName: 'Ann' };
    const { result, rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps(preSpin) },
    );

    // The pre-spin event shows immediately.
    expect(result.current.displayedLastAction).toEqual(preSpin);

    // A spin_result arrives — the panel must NOT flip to the outcome yet.
    act(() => rerender(makeProps(SPIN_RESULT)));
    expect(result.current.spinComplete).toBe(false);
    expect(result.current.displayedLastAction).toEqual(preSpin);

    // Mid-animation: still withheld.
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.displayedLastAction).toEqual(preSpin);

    // Cylinder stops at 8080ms — outcome is revealed immediately.
    act(() => vi.advanceTimersByTime(4080));
    expect(result.current.spinComplete).toBe(true);
    expect(result.current.displayedLastAction).toEqual(SPIN_RESULT);
  });

  it('passes non-spin actions through immediately (only spin_result is gated)', () => {
    const cardPlayed = {
      type: 'card_played_online',
      playerName: 'Alice',
      card: { shape: 'circle', number: 3 },
    };
    const { result, rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps(cardPlayed) },
    );
    expect(result.current.displayedLastAction).toEqual(cardPlayed);

    const bluffResolved = {
      type: 'bluff_resolved',
      bluffCorrect: true,
      spinTargetName: 'Bob',
    };
    act(() => rerender(makeProps(bluffResolved)));
    // No timer advance — it should already be visible.
    expect(result.current.displayedLastAction).toEqual(bluffResolved);
  });

  it('reveals the outcome and then lets the next non-spin action through immediately', () => {
    const { result, rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps({ type: 'bluff_called', callerName: 'Ann' }) },
    );

    act(() => rerender(makeProps(SPIN_RESULT)));
    act(() => vi.advanceTimersByTime(8080));
    expect(result.current.displayedLastAction).toEqual(SPIN_RESULT);

    const nextCard = {
      type: 'card_played_online',
      playerName: 'Cara',
      card: { shape: 'square', number: 7 },
    };
    act(() => rerender(makeProps(nextCard)));
    expect(result.current.displayedLastAction).toEqual(nextCard);
  });
});
