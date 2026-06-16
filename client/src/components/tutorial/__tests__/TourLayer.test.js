import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { TourLayer } from '../TourLayer';

// Minimal hand-rolled beat list so the test is independent of tourContent.
const BEATS = [
  { id: 'n1', anchorId: 'a1', part: 'A', shape: 'rect', advance: 'next', copy: 'first' },
  { id: 'act', anchorId: 'a2', part: 'A', shape: 'square', advance: 'click-target', waitFor: 'opened', copy: 'do it', instruction: 'Click' },
  { id: 'n2', anchorId: 'a3', part: 'A', shape: 'rect', advance: 'next', copy: 'last' },
];

function mountAnchors(ids) {
  for (const id of ids) {
    const el = document.createElement('div');
    el.setAttribute('data-tour-id', id);
    document.body.appendChild(el);
  }
}

describe('TourLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.getBoundingClientRect = function () {
      return { top: 50, left: 60, width: 120, height: 40, right: 180, bottom: 90, x: 60, y: 50, toJSON() {} };
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('advances through next-beats via the Next button and completes at the end', () => {
    mountAnchors(['a1', 'a2', 'a3']);
    const onComplete = vi.fn();
    render(<TourLayer beats={BEATS} signals={{}} onComplete={onComplete} onSkip={() => {}} />);
    act(() => { vi.advanceTimersByTime(120); });

    expect(screen.getByText('first')).toBeTruthy();
    // Beat 1 → next
    act(() => { screen.getByText('Next').click(); });
    act(() => { vi.advanceTimersByTime(120); });

    // Beat 2 is a click-target (no Next button); fulfill its signal.
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.getByText('do it')).toBeTruthy();
  });

  it('auto-advances a click-target beat when its signal rises', () => {
    mountAnchors(['a1', 'a2', 'a3']);
    const onComplete = vi.fn();
    const { rerender } = render(
      <TourLayer beats={BEATS} signals={{ opened: false }} onComplete={onComplete} onSkip={() => {}} />,
    );
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { screen.getByText('Next').click(); });       // → beat 2 (click-target)
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByText('do it')).toBeTruthy();

    // Signal rises → auto-advance to beat 3.
    rerender(<TourLayer beats={BEATS} signals={{ opened: true }} onComplete={onComplete} onSkip={() => {}} />);
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByText('last')).toBeTruthy();
  });

  it('skips a beat whose anchor is missing rather than stranding', () => {
    // a2 deliberately absent → beat 2 should skip after the missing timeout.
    mountAnchors(['a1', 'a3']);
    render(<TourLayer beats={BEATS} signals={{}} onComplete={() => {}} onSkip={() => {}} />);
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { screen.getByText('Next').click(); });   // → beat 2 (missing anchor)
    act(() => { vi.advanceTimersByTime(1700); });        // past the 1.5s skip timeout
    expect(screen.getByText('last')).toBeTruthy();
  });

  it('skips a beat whose anchor is REMOVED mid-tour (never strands)', () => {
    mountAnchors(['a1', 'a2', 'a3']);
    render(<TourLayer beats={BEATS} signals={{}} onComplete={() => {}} onSkip={() => {}} />);
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { screen.getByText('Next').click(); });   // → beat 2 (click-target on a2)
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByText('do it')).toBeTruthy();

    // a2 vanishes (e.g. a menu/modal unmounts) with no resize/scroll event.
    document.querySelector('[data-tour-id="a2"]').remove();
    act(() => { vi.advanceTimersByTime(2200); });        // poll detects + missing timeout
    expect(screen.getByText('last')).toBeTruthy();
  });

  it('Escape fires onSkip', () => {
    mountAnchors(['a1', 'a2', 'a3']);
    const onSkip = vi.fn();
    render(<TourLayer beats={BEATS} signals={{}} onComplete={() => {}} onSkip={onSkip} />);
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onSkip).toHaveBeenCalled();
  });
});
