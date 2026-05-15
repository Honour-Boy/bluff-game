function maybeSingle(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

function requireData(result) {
  if (result.error) throw result.error;
  return result.data ?? null;
}

function normalizeParticipantUserIds(userIds) {
  return [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .filter((userId) => typeof userId === 'string' && userId.trim().length > 0),
  )];
}

function sortLeaderboardRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    return (a.username || '').localeCompare(b.username || '');
  });
}

function createLeaderboardRepo(supabase) {
  async function recordGameStart(groupId, participantUserIds, now = new Date().toISOString()) {
    const participantIds = normalizeParticipantUserIds(participantUserIds);
    if (participantIds.length === 0) return { participantCount: 0 };

    const result = await supabase.rpc('group_leaderboard_record_game_start', {
      p_group_id: groupId,
      p_participant_user_ids: participantIds,
      p_now: now,
    });
    requireData(result);

    return {
      participantCount: participantIds.length,
      recordedAt: now,
    };
  }

  async function recordWinner(groupId, winnerUserId, now = new Date().toISOString()) {
    const result = await supabase.rpc('group_leaderboard_record_winner', {
      p_group_id: groupId,
      p_winner_user_id: winnerUserId,
      p_now: now,
    });
    const row = maybeSingle(requireData(result));
    if (!row) {
      return {
        userId: winnerUserId,
        wins: 1,
        gamesPlayed: 1,
        lastWinAt: now,
        lastPlayedAt: now,
      };
    }

    return {
      userId: row.user_id,
      wins: row.wins,
      gamesPlayed: row.games_played,
      lastWinAt: row.last_win_at,
      lastPlayedAt: row.last_played_at,
    };
  }

  async function getLeaderboard(groupId) {
    const rowsResult = await supabase
      .from('group_leaderboard')
      .select('group_id, user_id, wins, games_played, last_win_at, last_played_at')
      .eq('group_id', groupId)
      .order('wins', { ascending: false })
      .order('games_played', { ascending: true });
    const rows = requireData(rowsResult) || [];
    if (rows.length === 0) return [];

    const memberRowsResult = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    const memberRows = requireData(memberRowsResult) || [];
    const activeMemberIds = new Set(memberRows.map((row) => row.user_id));
    if (activeMemberIds.size === 0) return [];

    const visibleRows = rows.filter((row) => activeMemberIds.has(row.user_id));
    if (visibleRows.length === 0) return [];

    const profileIds = visibleRows.map((row) => row.user_id);
    const profilesResult = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', profileIds);
    const profiles = requireData(profilesResult) || [];
    const usernameById = new Map(profiles.map((profile) => [profile.id, profile.username]));

    return sortLeaderboardRows(visibleRows.map((row) => ({
      userId: row.user_id,
      username: usernameById.get(row.user_id) || 'Player',
      wins: row.wins,
      gamesPlayed: row.games_played,
      lastWinAt: row.last_win_at,
      lastPlayedAt: row.last_played_at,
    })));
  }

  return {
    recordGameStart,
    recordWinner,
    getLeaderboard,
  };
}

module.exports = {
  normalizeParticipantUserIds,
  sortLeaderboardRows,
  createLeaderboardRepo,
};
