// ============================================================
// Spin overlay lifecycle — the "spin hangs on every pull" regression.
//
// The completion timer used to live in an effect keyed on roomState.lastAction,
// so its cleanup cancelled the 8s timer whenever lastAction changed. In practice
// mode the bot plays its next card ~1.1s after a spin, swapping lastAction to
// `card_played` and killing the timer → spinComplete never fired → the cylinder
// span forever. The fix keys the animation on the spin IDENTITY (spinData.key),
// so a mid-spin lastAction change can't cancel completion.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlinePlayerUiController } from '../useOnlinePlayerUiController';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const baseRoom = {
  isTutorial: true,
  players: [{ id: 'me', isBot: false, status: 'alive' }, { id: 'bot:1', isBot: true, status: 'alive' }],
};

function spinResult(seq, targetId = 'me') {
  return {
    type: 'spin_result',
    spinSeq: seq,
    spinTargetId: targetId,
    spinTargetName: targetId === 'me' ? 'You' : 'Dealer Bot',
    spinIndex: 2,
    chamber: [null, null, 'bullet', null, null, null],
    chamberAfter: [null, null, 'bullet', null, 'bullet', null],
    eliminated: false,
  };
}

function makeProps(lastAction) {
  return {
    roomState: { ...baseRoom, lastAction },
    myPlayer: { id: 'me', status: 'alive' },
    myHand: [],
    isMyTurn: false,
    isPlaying: true,
    acknowledgeSpinResult: vi.fn(),
    spinDismissed: false,
  };
}

describe('spin overlay completion', () => {
  it('completes even when lastAction changes mid-animation (the bot plays)', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      (p) => useOnlinePlayerUiController(p),
      { initialProps: makeProps(spinResult(1)) },
    );
    expect(result.current.spinData).toBeTruthy();
    expect(result.current.spinComplete).toBe(false);

    // ~1.1s in, the bot plays its next card → lastAction flips to card_played.
    act(() => { vi.advanceTimersByTime(1100); });
    rerender(makeProps({ type: 'card_played_online', playerId: 'bot:1' }));

    // Past the 8080ms completion mark — completion must STILL fire.
    act(() => { vi.advanceTimersByTime(7200); });
    expect(result.current.spinComplete).toBe(true);
    expect(result.current.spinData).toBeTruthy();
  });

  it('auto-dismisses a bot spin (no Continue button) after completion', () => {
    vi.useFakeTimers();
    const props = makeProps(spinResult(5, 'bot:1'));
    const { result } = renderHook((p) => useOnlinePlayerUiController(p), { initialProps: props });
    act(() => { vi.advanceTimersByTime(8100); }); // complete
    expect(result.current.spinComplete).toBe(true);
    act(() => { vi.advanceTimersByTime(10100); }); // bot auto-ack (10s read floor)
    expect(result.current.spinData).toBeNull();    // overlay cleared
    expect(props.acknowledgeSpinResult).toHaveBeenCalled();
  });

  it('a distinct spinSeq starts a fresh overlay even with an identical chamber', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      (p) => useOnlinePlayerUiController(p),
      { initialProps: makeProps(spinResult(1, 'bot:1')) },
    );
    act(() => { vi.advanceTimersByTime(8100); });
    const first = result.current.spinData;
    expect(first.key).toBe('seq:1');
    // A second spin, same target + chamber, new seq → NOT deduped.
    rerender(makeProps(spinResult(2, 'bot:1')));
    expect(result.current.spinData.key).toBe('seq:2');
    expect(result.current.spinComplete).toBe(false);
  });
});
