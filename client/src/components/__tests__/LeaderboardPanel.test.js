import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LeaderboardPanel } from './LeaderboardPanel';

describe('LeaderboardPanel', () => {
  it('renders the empty state for a fresh group', async () => {
    const getGroupLeaderboard = vi.fn().mockResolvedValue({
      success: true,
      leaderboard: [],
    });

    render(
      <LeaderboardPanel
        groupId="group-76"
        currentUserId="u1"
        getGroupLeaderboard={getGroupLeaderboard}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No games played yet — start one to begin tracking\./i)).toBeInTheDocument();
    });
  });

  it('marks the local user and highlighted winner rows', async () => {
    const getGroupLeaderboard = vi.fn().mockResolvedValue({
      success: true,
      leaderboard: [
        { userId: 'u1', username: 'alice', wins: 5, gamesPlayed: 7 },
        { userId: 'u2', username: 'bob', wins: 3, gamesPlayed: 6 },
      ],
    });

    render(
      <LeaderboardPanel
        groupId="group-76"
        currentUserId="u2"
        highlightUserId="u1"
        getGroupLeaderboard={getGroupLeaderboard}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/@alice winner/i)).toBeInTheDocument();
      expect(screen.getByText(/@bob \(you\)/i)).toBeInTheDocument();
      expect(screen.getByText('71%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('re-fetches after a leaderboard update nonce changes', async () => {
    const getGroupLeaderboard = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        leaderboard: [{ userId: 'u1', username: 'alice', wins: 1, gamesPlayed: 1 }],
      })
      .mockResolvedValueOnce({
        success: true,
        leaderboard: [{ userId: 'u1', username: 'alice', wins: 2, gamesPlayed: 2 }],
      });

    const { rerender } = render(
      <LeaderboardPanel
        groupId="group-76"
        currentUserId="u1"
        getGroupLeaderboard={getGroupLeaderboard}
        leaderboardUpdateNonce={0}
      />,
    );

    await waitFor(() => expect(getGroupLeaderboard).toHaveBeenCalledTimes(1));

    rerender(
      <LeaderboardPanel
        groupId="group-76"
        currentUserId="u1"
        getGroupLeaderboard={getGroupLeaderboard}
        leaderboardUpdateNonce={1}
      />,
    );

    await waitFor(() => expect(getGroupLeaderboard).toHaveBeenCalledTimes(2));
  });
});
