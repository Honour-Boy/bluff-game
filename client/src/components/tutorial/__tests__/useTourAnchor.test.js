import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useTourAnchor } from '../useTourAnchor';

function Probe({ anchorId, onState }) {
  const { rect, missing } = useTourAnchor(anchorId, anchorId, { missingTimeoutMs: 1500 });
  onState({ rect, missing });
  return null;
}

describe('useTourAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom getBoundingClientRect returns zeros by default; stub a real size.
    Element.prototype.getBoundingClientRect = function () {
      return { top: 50, left: 60, width: 120, height: 40, right: 180, bottom: 90, x: 60, y: 50, toJSON() {} };
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reports missing:true after the timeout when the anchor is absent', () => {
    const states = [];
    render(<Probe anchorId="nope" onState={(s) => states.push(s)} />);
    act(() => { vi.advanceTimersByTime(1600); });
    const last = states[states.length - 1];
    expect(last.missing).toBe(true);
    expect(last.rect).toBeNull();
  });

  it('measures a present anchor and does not report missing', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tour-id', 'here');
    document.body.appendChild(el);

    const states = [];
    render(<Probe anchorId="here" onState={(s) => states.push(s)} />);
    act(() => { vi.advanceTimersByTime(300); });
    const last = states[states.length - 1];
    expect(last.missing).toBe(false);
    expect(last.rect).toMatchObject({ top: 50, left: 60, width: 120, height: 40 });
  });
});
