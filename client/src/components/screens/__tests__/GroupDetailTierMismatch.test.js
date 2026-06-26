import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupDetailScreen } from '../GroupDetailScreen';

const OWNER = 'owner-1';
const MATCH = 'member-match';
const BELOW = 'member-below';

function mismatchGroup() {
  return {
    id: 'g1',
    name: 'Friday Night Bluff',
    code: 'ABC234',
    role: 'host',
    ownerUserId: OWNER,
    hostUserId: OWNER,
    requiredTier: 'backroads',
    ownerTier: 'syndicate',
    ownerTierMismatch: true,
    members: [
      { userId: OWNER, username: 'Owner', tier: 'syndicate', tierMatches: false },
      { userId: MATCH, username: 'Matcher', tier: 'backroads', tierMatches: true },
      { userId: BELOW, username: 'Rookie', tier: 'streets', tierMatches: false },
    ],
    pendingInvites: [],
  };
}

describe('GroupDetailScreen - owner tier-mismatch panel (G5/G6)', () => {
  it('shows the resolution panel with re-tier (eviction count) and handover candidates to the owner', () => {
    render(
      <GroupDetailScreen
        group={mismatchGroup()}
        currentUserId={OWNER}
        onRegroupRetier={vi.fn()}
        onTransferOwnership={vi.fn()}
      />,
    );
    expect(screen.getByText(/Tier Mismatch/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-tier guild to The Syndicate/i })).toBeInTheDocument();
    // One member (Rookie) is below the new tier → eviction count of 1.
    expect(screen.getByText(/Removes 1 member below the new tier/i)).toBeInTheDocument();
    // The matching member is offered as a handover target; the below one is not.
    expect(screen.getByRole('button', { name: /Hand to Matcher/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hand to Rookie/i })).toBeNull();
  });

  it('calls onRegroupRetier when the owner re-tiers', () => {
    const onRegroupRetier = vi.fn().mockResolvedValue({ success: true });
    render(
      <GroupDetailScreen
        group={mismatchGroup()}
        currentUserId={OWNER}
        onRegroupRetier={onRegroupRetier}
        onTransferOwnership={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Re-tier guild to The Syndicate/i }));
    expect(onRegroupRetier).toHaveBeenCalled();
  });

  it('blocks a mismatched member from entering and hides owner controls', () => {
    const group = mismatchGroup();
    render(
      <GroupDetailScreen
        group={group}
        currentUserId={BELOW}
        onRegroupRetier={vi.fn()}
        onTransferOwnership={vi.fn()}
      />,
    );
    // Member view: no owner-only re-tier button.
    expect(screen.queryByRole('button', { name: /Re-tier guild/i })).toBeNull();
    // Enter button is disabled for the outgrown member.
    expect(screen.getByRole('button', { name: /Enter the Room/i })).toBeDisabled();
  });
});
