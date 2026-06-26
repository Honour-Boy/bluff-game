import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChipPopup } from '../ChipPopup';

describe('ChipPopup — contextual avatar bubble (Module 2)', () => {
  it('renders its label', () => {
    render(<ChipPopup>Their turn</ChipPopup>);
    expect(screen.getByText('Their turn')).toBeInTheDocument();
  });

  it('is click-through (pointer-events: none) for status bubbles by default', () => {
    render(<ChipPopup>On the spot</ChipPopup>);
    const root = screen.getByRole('status');
    expect(root.style.pointerEvents).toBe('none');
  });

  it('re-enables pointer events when interactive (e.g. holds a button)', () => {
    render(<ChipPopup interactive><button type="button">Pull</button></ChipPopup>);
    const root = screen.getByRole('status');
    expect(root.style.pointerEvents).toBe('auto');
    expect(screen.getByRole('button', { name: 'Pull' })).toBeInTheDocument();
  });

  it('anchors above the chip (bottom: 100% + offset)', () => {
    render(<ChipPopup>x</ChipPopup>);
    const root = screen.getByRole('status');
    expect(root.style.position).toBe('absolute');
    expect(root.style.bottom).toContain('100%');
  });
});
