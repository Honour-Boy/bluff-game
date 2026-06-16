import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TourCongrats } from '../TourCongrats';

describe('TourCongrats', () => {
  beforeEach(() => {
    try { window.localStorage.removeItem('bluff_tour_done'); } catch (_) { /* ignore */ }
  });

  it('persists the bluff_tour_done flag on mount', () => {
    render(<TourCongrats onBeginPractice={() => {}} />);
    expect(window.localStorage.getItem('bluff_tour_done')).toBe('1');
  });

  it('fires onBeginPractice when the button is clicked', () => {
    const onBeginPractice = vi.fn();
    render(<TourCongrats onBeginPractice={onBeginPractice} />);
    fireEvent.click(screen.getByText('Begin Practice'));
    expect(onBeginPractice).toHaveBeenCalledTimes(1);
  });
});
