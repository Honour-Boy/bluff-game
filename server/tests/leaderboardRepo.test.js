import { describe, expect, it, vi } from 'vitest';
import {
  createLeaderboardRepo,
  normalizeParticipantUserIds,
  sortLeaderboardRows,
} from '../leaderboardRepo.js';

function makeSupabaseForLeaderboard({
  leaderboardRows = [],
  memberRows = [],
  profileRows = [],
  rpcResult = { data: null, error: null },
} = {}) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    from(table) {
      return {
        select() {
          return {
            eq() {
              if (table === 'group_leaderboard') {
                return {
                  order() {
                    return {
                      order: async () => ({ data: leaderboardRows, error: null }),
                    };
                  },
                };
              }
              if (table === 'group_members') {
                return Promise.resolve({ data: memberRows, error: null });
              }
              throw new Error(`Unexpected eq() on table ${table}`);
            },
            in() {
              if (table === 'profiles') {
                return Promise.resolve({ data: profileRows, error: null });
              }
              throw new Error(`Unexpected in() on table ${table}`);
            },
          };
        },
      };
    },
  };
}

describe('leaderboardRepo helpers', () => {
  it('dedupes participant ids and drops falsey values', () => {
    expect(
      normalizeParticipantUserIds(['u1', 'u2', 'u1', '', null, undefined, 'u3']),
    ).toEqual(['u1', 'u2', 'u3']);
  });

  it('sorts rows by wins desc then games played asc', () => {
    const rows = sortLeaderboardRows([
      { userId: 'u1', username: 'alice', wins: 3, gamesPlayed: 7 },
      { userId: 'u2', username: 'bob', wins: 5, gamesPlayed: 12 },
      { userId: 'u3', username: 'carol', wins: 5, gamesPlayed: 9 },
    ]);

    expect(rows.map((row) => row.userId)).toEqual(['u3', 'u2', 'u1']);
  });
});

describe('leaderboardRepo', () => {
  it('uses the atomic rpc for game-start increments', async () => {
    const supabase = makeSupabaseForLeaderboard();
    const repo = createLeaderboardRepo(supabase);

    const result = await repo.recordGameStart('group-1', ['u1', 'u2', 'u1'], '2026-05-15T22:30:00.000Z');

    expect(result).toEqual({
      participantCount: 2,
      recordedAt: '2026-05-15T22:30:00.000Z',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('group_leaderboard_record_game_start', {
      p_group_id: 'group-1',
      p_participant_user_ids: ['u1', 'u2'],
      p_now: '2026-05-15T22:30:00.000Z',
    });
  });

  it('uses the atomic rpc for winner increments and returns the new totals', async () => {
    const supabase = makeSupabaseForLeaderboard({
      rpcResult: {
        data: {
          group_id: 'group-1',
          user_id: 'u2',
          wins: 4,
          games_played: 7,
          last_win_at: '2026-05-15T22:35:00.000Z',
          last_played_at: '2026-05-15T22:20:00.000Z',
        },
        error: null,
      },
    });
    const repo = createLeaderboardRepo(supabase);

    const result = await repo.recordWinner('group-1', 'u2', '2026-05-15T22:35:00.000Z');

    expect(result).toEqual({
      userId: 'u2',
      wins: 4,
      gamesPlayed: 7,
      lastWinAt: '2026-05-15T22:35:00.000Z',
      lastPlayedAt: '2026-05-15T22:20:00.000Z',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('group_leaderboard_record_winner', {
      p_group_id: 'group-1',
      p_winner_user_id: 'u2',
      p_now: '2026-05-15T22:35:00.000Z',
    });
  });

  it('filters out ex-members from leaderboard reads', async () => {
    const supabase = makeSupabaseForLeaderboard({
      leaderboardRows: [
        {
          group_id: 'group-1',
          user_id: 'u2',
          wins: 6,
          games_played: 10,
          last_win_at: '2026-05-15T22:35:00.000Z',
          last_played_at: '2026-05-15T22:35:00.000Z',
        },
        {
          group_id: 'group-1',
          user_id: 'u3',
          wins: 5,
          games_played: 8,
          last_win_at: '2026-05-15T20:00:00.000Z',
          last_played_at: '2026-05-15T21:00:00.000Z',
        },
      ],
      memberRows: [{ user_id: 'u2' }],
      profileRows: [
        { id: 'u2', username: 'bob' },
        { id: 'u3', username: 'carol' },
      ],
    });
    const repo = createLeaderboardRepo(supabase);

    const rows = await repo.getLeaderboard('group-1');

    expect(rows).toEqual([
      {
        userId: 'u2',
        username: 'bob',
        wins: 6,
        gamesPlayed: 10,
        lastWinAt: '2026-05-15T22:35:00.000Z',
        lastPlayedAt: '2026-05-15T22:35:00.000Z',
      },
    ]);
  });
});
