import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BluffRevealCard } from '../BluffRevealCard';

describe('BluffRevealCard - 3D flip (Module 3)', () => {
  it('renders the played card face (number + shape label)', () => {
    render(<BluffRevealCard card={{ shape: 'circle', number: 7 }} revealed />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('circle')).toBeInTheDocument();
  });

  it('flips face-up shortly after mount when revealed', async () => {
    const { container } = render(<BluffRevealCard card={{ shape: 'square', number: 3 }} revealed />);
    const inner = container.querySelector('.reveal-card-3d');
    expect(inner).not.toBeNull();
    await waitFor(() => expect(inner.className).toContain('flipped'));
  });

  it('stays face-down (no flipped class) when not revealed', async () => {
    const { container } = render(<BluffRevealCard card={{ shape: 'square', number: 3 }} revealed={false} />);
    const inner = container.querySelector('.reveal-card-3d');
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the rAF run
    expect(inner.className).not.toContain('flipped');
  });

  it('shows a "No card" state when no card was played', () => {
    render(<BluffRevealCard card={null} revealed />);
    expect(screen.getByText(/No card/i)).toBeInTheDocument();
  });
});
