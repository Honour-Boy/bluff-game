import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { XpSummary } from '../XpSummary';

const baseAward = {
  gained: 405,
  guest: false,
  totalXp: 1200,
  level: 5,
  leveledUp: false,
  levelFloorXp: 1050,
  nextLevelXp: 1550,
  previousLevel: 5,
  newLevel: 5,
  previousTier: 'backroads',
  newTier: 'backroads',
  breakdown: {
    win: 150,
    spinsSurvived: 100,
    correctBluffCalls: 60,
    bluffDefended: 40,
    playersEliminated: 35,
    powerCardsResolved: 20,
    lastStandWin: 0,
    participation: 20,
  },
};

describe('XpSummary (#307)', () => {
  it('renders all non-zero breakdown rows with the new labels', () => {
    render(<XpSummary xpAward={baseAward} />);
    expect(screen.getByText(/Victory \+150/)).toBeInTheDocument();
    expect(screen.getByText(/Bluffs defended \+40/)).toBeInTheDocument();
    expect(screen.getByText(/Players eliminated \+35/)).toBeInTheDocument();
    expect(screen.getByText(/Power cards resolved \+20/)).toBeInTheDocument();
    // Zero rows are omitted.
    expect(screen.queryByText(/Last Stand win/)).toBeNull();
  });

  it('shows a level-up line using newLevel', () => {
    render(<XpSummary xpAward={{ ...baseAward, leveledUp: true, level: 6, newLevel: 6 }} />);
    expect(screen.getByText(/Level up! → Level 6/)).toBeInTheDocument();
  });

  it('shows a tier-promotion banner when the award crosses a tier boundary', () => {
    render(<XpSummary xpAward={{
      ...baseAward,
      leveledUp: true,
      level: 9,
      newLevel: 9,
      previousTier: 'backroads',
      newTier: 'syndicate',
    }} />);
    expect(screen.getByText(/Welcome to The Syndicate!/)).toBeInTheDocument();
  });

  it('does not show a tier banner when the tier is unchanged', () => {
    render(<XpSummary xpAward={baseAward} />);
    expect(screen.queryByText(/Welcome to/)).toBeNull();
  });

  it('renders nothing without an award', () => {
    const { container } = render(<XpSummary xpAward={null} />);
    expect(container.firstChild).toBeNull();
  });
});
