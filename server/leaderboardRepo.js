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

  // ─── #205 — player meta-progression (XP + cosmetics) ─────────
  // Not group-scoped: one row per signed-in player. Lives on this repo
  // (rather than a new one) so the game-over flow — which already threads
  // leaderboardRepo everywhere — can award XP without new dependencies.

  // Career stats — lifetime aggregates surfaced on the profile ledger.
  // Columns added by 20260625120000_player_progression_career_stats; older
  // rows / test stubs without them read as 0.
  function _statsFromRow(row) {
    return {
      wins: row.wins || 0,
      spinsSurvived: row.spins_survived || 0,
      correctBluffCalls: row.correct_bluff_calls || 0,
      bluffsDefended: row.bluffs_defended || 0,
      playersEliminated: row.players_eliminated || 0,
      powerCardsResolved: row.power_cards_resolved || 0,
      lastStandWins: row.last_stand_wins || 0,
    };
  }

  function _emptyStats() {
    return {
      wins: 0,
      spinsSurvived: 0,
      correctBluffCalls: 0,
      bluffsDefended: 0,
      playersEliminated: 0,
      powerCardsResolved: 0,
      lastStandWins: 0,
    };
  }

  function _mapProgressionRow(row) {
    return {
      userId: row.user_id,
      xp: row.xp || 0,
      gamesPlayed: row.games_played || 0,
      equipped: row.equipped || {},
      stats: _statsFromRow(row),
      updatedAt: row.updated_at || null,
    };
  }

  async function getProgression(userId) {
    const result = await supabase
      .from('player_progression')
      .select('user_id, xp, games_played, equipped, updated_at, wins, spins_survived, correct_bluff_calls, bluffs_defended, players_eliminated, power_cards_resolved, last_stand_wins')
      .eq('user_id', userId)
      .maybeSingle();
    const row = maybeSingle(requireData(result));
    if (!row) {
      return { userId, xp: 0, gamesPlayed: 0, equipped: {}, stats: _emptyStats(), updatedAt: null };
    }
    return _mapProgressionRow(row);
  }

  // Convenience for the tier gate at room creation: the host's current level
  // derived from their stored XP. Defaults to level 1 on any read failure.
  async function getLevel(userId) {
    const { levelForXp } = require('./engine/progression');
    try {
      const row = await getProgression(userId);
      return levelForXp(row.xp);
    } catch {
      return 1;
    }
  }

  // Credit one finished game: XP + lifetime stat increments, atomically.
  // `stats` mirrors the per-game gameStats shape we want to accumulate; any
  // field omitted counts as 0/false so callers can pass a partial object.
  async function addXp(userId, amount, stats = {}, now = new Date().toISOString()) {
    const result = await supabase.rpc('player_progression_record_game', {
      p_user_id: userId,
      p_amount: amount,
      p_won: !!stats.won,
      p_spins_survived: stats.spinsSurvived || 0,
      p_correct_bluff_calls: stats.correctBluffCalls || 0,
      p_bluffs_defended: stats.bluffsDefended || 0,
      p_players_eliminated: stats.playersEliminated || 0,
      p_power_cards_resolved: stats.powerCardsResolved || 0,
      p_last_stand_win: !!stats.lastStandWin,
      p_now: now,
    });
    const row = maybeSingle(requireData(result));
    if (!row) {
      return { userId, xp: amount, gamesPlayed: 1, equipped: {}, stats: _emptyStats(), updatedAt: now };
    }
    return _mapProgressionRow(row);
  }

  async function setEquippedCosmetics(userId, equipped, now = new Date().toISOString()) {
    const result = await supabase
      .from('player_progression')
      .upsert(
        { user_id: userId, equipped: equipped || {}, updated_at: now },
        { onConflict: 'user_id' },
      )
      .select('user_id, xp, games_played, equipped, updated_at');
    const row = maybeSingle(requireData(result));
    if (!row) {
      return { userId, xp: 0, gamesPlayed: 0, equipped: equipped || {}, stats: _emptyStats(), updatedAt: now };
    }
    return _mapProgressionRow(row);
  }

  return {
    recordGameStart,
    recordWinner,
    getLeaderboard,
    getProgression,
    getLevel,
    addXp,
    setEquippedCosmetics,
  };
}

module.exports = {
  normalizeParticipantUserIds,
  sortLeaderboardRows,
  createLeaderboardRepo,
};
