import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  computeHole,
  computeStrips,
  computePopupPosition,
  TourSpotlight,
} from '../TourSpotlight';

const VW = 1000;
const VH = 800;

describe('computeHole', () => {
  it('inflates the rect by the shape padding and clamps to the viewport', () => {
    const rect = { top: 100, left: 100, width: 200, height: 50 };
    const hole = computeHole(rect, 'rect', VW, VH);
    expect(hole.top).toBe(94);   // 100 - 6
    expect(hole.left).toBe(94);
    expect(hole.right).toBe(306); // 300 + 6
    expect(hole.bottom).toBe(156); // 150 + 6
  });

  it('never produces negative coords at the screen edge', () => {
    const rect = { top: 0, left: 0, width: 40, height: 40 };
    const hole = computeHole(rect, 'big-rect', VW, VH);
    expect(hole.top).toBe(0);
    expect(hole.left).toBe(0);
  });
});

describe('computeStrips', () => {
  it('the four strips tile the screen around the hole', () => {
    const hole = computeHole({ top: 200, left: 300, width: 100, height: 100 }, 'rect', VW, VH);
    const s = computeStrips(hole, VW, VH);
    // Full-width top + bottom bands
    expect(s.top.width).toBe(VW);
    expect(s.bottom.width).toBe(VW);
    expect(s.top.height).toBe(hole.top);
    expect(s.bottom.top).toBe(hole.bottom);
    // Side strips only span the hole's vertical band
    expect(s.left.height).toBe(hole.height);
    expect(s.right.left).toBe(hole.right);
  });
});

describe('computePopupPosition — quadrant flip', () => {
  it('places the popup to the LEFT when the hole is in the right half', () => {
    const hole = computeHole({ top: 40, left: 850, width: 120, height: 40 }, 'square', VW, VH);
    const p = computePopupPosition(hole, VW, VH);
    expect(p.side).toBe('left');
  });

  it('places the popup to the RIGHT when the hole is in the left half', () => {
    const hole = computeHole({ top: 40, left: 40, width: 120, height: 40 }, 'square', VW, VH);
    const p = computePopupPosition(hole, VW, VH);
    expect(p.side).toBe('right');
  });

  it('falls back to below/above when neither side has room', () => {
    // A wide central hole leaves < 280px on both sides (roomLeft 244, roomRight 224).
    const hole = computeHole({ top: 40, left: 250, width: 520, height: 40 }, 'rect', VW, VH);
    const p = computePopupPosition(hole, VW, VH);
    expect(['below', 'above']).toContain(p.side);
  });

  it('always clamps fully on-screen', () => {
    const hole = computeHole({ top: 10, left: 950, width: 40, height: 20 }, 'square', VW, VH);
    const p = computePopupPosition(hole, VW, VH);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});

describe('TourSpotlight — rendering', () => {
  const rect = { top: 100, left: 100, width: 120, height: 40 };

  it('renders the hole-blocker only for read-only (non-interactive) beats', () => {
    const { rerender, container } = render(
      <TourSpotlight rect={rect} shape="rect" interactive={false} copy="hi" showNext onNext={() => {}} onSkip={() => {}} />,
    );
    expect(container.querySelector('[data-tour-hole-blocker="true"]')).toBeTruthy();

    rerender(
      <TourSpotlight rect={rect} shape="rect" interactive copy="hi" onSkip={() => {}} />,
    );
    expect(container.querySelector('[data-tour-hole-blocker="true"]')).toBeNull();
  });

  it('shows a Next button only when showNext is set, and fires onNext', () => {
    const onNext = vi.fn();
    render(<TourSpotlight rect={rect} shape="rect" copy="hi" showNext onNext={onNext} onSkip={() => {}} />);
    screen.getByText('Next').click();
    expect(onNext).toHaveBeenCalled();
  });

  it('always offers Skip tour', () => {
    const onSkip = vi.fn();
    render(<TourSpotlight rect={rect} shape="rect" copy="hi" interactive onSkip={onSkip} />);
    screen.getByText('Skip tour').click();
    expect(onSkip).toHaveBeenCalled();
  });

  it('renders nothing without a rect', () => {
    const { container } = render(<TourSpotlight rect={null} copy="hi" />);
    expect(container.firstChild).toBeNull();
  });
});
