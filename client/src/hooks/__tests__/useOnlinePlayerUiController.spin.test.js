import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Isolate the spin-animation logic from the browser-facing sub-hooks: the
// media query and the speech-synthesis announcer are irrelevant here and would
// only add JSDOM noise.
vi.mock('../useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../useAnnouncementSpeech', () => ({
  useAnnouncementSpeech: () => {},
  loadSpeechEnabled: () => true,
  saveSpeechEnabled: () => {},
  SPEECH_STORAGE_KEY: 'bluff_speech_enabled',
}));

import { useOnlinePlayerUiController } from '../useOnlinePlayerUiController';

// Animation timings mirror the controller: cylinder starts at 80ms, the result
// (`spinComplete`) lands at 8080ms, and the target auto-acknowledges 15s later.
const SPIN_COMPLETE_MS = 8080;
const AUTO_ACK_MS = 15000;

// A `spin_result` lastAction as the server emits it. The same spin re-broadcasts
// on every room_state push, so each call yields a *new object* with the *same*
// `actionId` — exactly what an incidental rebroadcast (reconnect/join) looks like.
function spinResultAction({ actionId = 1, eliminated = false } = {}) {
  return {
    type: 'spin_result',
    spinTargetId: 'p1',
    spinTargetName: 'Alice',
    spinIndex: 3,
    chamber: [null, null, null, 'bullet', null, null],
    chamberAfter: [null, null, null, 'bullet', null, 'bullet'],
    roll: 3,
    eliminated,
    riskLevel: eliminated ? 2 : 1,
    actionId,
  };
}

function makeProps({ roomState, myPlayerId = 'p2', acknowledgeSpinResult = vi.fn() }) {
  return {
    roomState,
    myPlayer: { id: myPlayerId, status: 'alive' },
    myHand: [],
    isMyTurn: false,
    isPlaying: true,
    spectatePlayer: vi.fn(),
    activatePowerCard: vi.fn(),
    swapPick: vi.fn(),
    medicDecide: vi.fn(),
    sniperRedirect: vi.fn(),
    saboteurTransfer: vi.fn(),
    acknowledgeSpinResult,
    spinDismissed: false,
    powerEventQueue: [],
  };
}

describe('useOnlinePlayerUiController — spin animation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('still completes the spin when an unrelated room_state rebroadcast lands mid-animation', () => {
    // Regression: a reconnect/join elsewhere used to rebuild lastAction (new
    // object ref, same spin), re-run the object-keyed effect, and have its
    // cleanup cancel the completion timer without re-arming it — leaving the
    // full-screen overlay hung forever.
    const roomState = { phase: 'playing', lastAction: spinResultAction({ actionId: 7 }) };
    const { result, rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps({ roomState }) },
    );

    expect(result.current.spinData).toBeTruthy();
    expect(result.current.spinComplete).toBe(false);

    // 2s into the 8s spin, a fresh room_state push arrives for the SAME spin.
    act(() => { vi.advanceTimersByTime(2000); });
    const rebroadcast = { phase: 'playing', lastAction: spinResultAction({ actionId: 7 }) };
    act(() => { rerender(makeProps({ roomState: rebroadcast })); });

    // Let the animation window elapse.
    act(() => { vi.advanceTimersByTime(SPIN_COMPLETE_MS - 2000 + 100); });

    expect(result.current.spinComplete).toBe(true);
  });

  it('auto-acknowledges for the spin target after a mid-animation rebroadcast, so a finished spin can never hang', () => {
    // The game-over transition is gated on the target's spin_acknowledged. If
    // the completion timer is lost, the auto-ack never fires and the winner is
    // stranded. With the fix the target completes and auto-acks on schedule.
    const acknowledgeSpinResult = vi.fn();
    const roomState = { phase: 'playing', lastAction: spinResultAction({ actionId: 11, eliminated: true }) };
    const { rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps({ roomState, myPlayerId: 'p1', acknowledgeSpinResult }) },
    );

    act(() => { vi.advanceTimersByTime(1500); });
    const rebroadcast = { phase: 'playing', lastAction: spinResultAction({ actionId: 11, eliminated: true }) };
    act(() => { rerender(makeProps({ roomState: rebroadcast, myPlayerId: 'p1', acknowledgeSpinResult })); });

    // Stage 1: finish the animation so `spinComplete` flips and the auto-ack
    // effect schedules its fallback timer.
    act(() => { vi.advanceTimersByTime(SPIN_COMPLETE_MS - 1500 + 100); });
    expect(acknowledgeSpinResult).not.toHaveBeenCalled();

    // Stage 2: the auto-ack fallback fires — the target acknowledges without
    // any manual click, so a finished spin (incl. a game-ending one) resolves.
    act(() => { vi.advanceTimersByTime(AUTO_ACK_MS + 100); });
    expect(acknowledgeSpinResult).toHaveBeenCalledTimes(1);
  });

  it('re-arms the animation for a genuinely new spin', () => {
    // Guard against over-fixing: a distinct spin (new actionId) must reset and
    // replay, not get suppressed as a duplicate.
    const first = { phase: 'playing', lastAction: spinResultAction({ actionId: 1 }) };
    const { result, rerender } = renderHook(
      (props) => useOnlinePlayerUiController(props),
      { initialProps: makeProps({ roomState: first }) },
    );

    act(() => { vi.advanceTimersByTime(SPIN_COMPLETE_MS + 100); });
    expect(result.current.spinComplete).toBe(true);

    const second = { phase: 'playing', lastAction: spinResultAction({ actionId: 2 }) };
    act(() => { rerender(makeProps({ roomState: second })); });
    expect(result.current.spinComplete).toBe(false);

    act(() => { vi.advanceTimersByTime(SPIN_COMPLETE_MS + 100); });
    expect(result.current.spinComplete).toBe(true);
  });
});
