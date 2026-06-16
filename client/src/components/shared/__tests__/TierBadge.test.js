import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../TierBadge';
import { tierForLevel, nextTier } from '../../../lib/tiers';

describe('TierBadge', () => {
  it('renders the tier label', () => {
    render(<TierBadge tier="syndicate" />);
    expect(screen.getByText('Syndicate')).toBeInTheDocument();
  });

  it('falls back to Streets for an unknown tier', () => {
    render(<TierBadge tier="bogus" />);
    expect(screen.getByText('Streets')).toBeInTheDocument();
  });

  it('renders nothing when no tier is supplied', () => {
    const { container } = render(<TierBadge tier={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('tierForLevel', () => {
  it('maps level boundaries to the right tier', () => {
    expect(tierForLevel(1)).toBe('streets');
    expect(tierForLevel(2)).toBe('streets');
    expect(tierForLevel(3)).toBe('backroads');
    expect(tierForLevel(8)).toBe('backroads');
    expect(tierForLevel(9)).toBe('syndicate');
    expect(tierForLevel(13)).toBe('syndicate');
    expect(tierForLevel(14)).toBe('covenant');
    expect(tierForLevel(20)).toBe('covenant');
  });

  it('clamps out-of-range / bad input to a valid tier', () => {
    expect(tierForLevel(0)).toBe('streets');
    expect(tierForLevel(-5)).toBe('streets');
    expect(tierForLevel(99)).toBe('covenant');
    expect(tierForLevel(undefined)).toBe('streets');
    expect(tierForLevel(NaN)).toBe('streets');
  });
});

describe('nextTier', () => {
  it('returns the next tier up, or null at the top', () => {
    expect(nextTier('streets')).toBe('backroads');
    expect(nextTier('syndicate')).toBe('covenant');
    expect(nextTier('covenant')).toBeNull();
  });
});
