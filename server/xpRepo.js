// ============================================================
// REPO — Player XP persistence (Supabase)
// ============================================================

function createXpRepo(supabase) {
  /**
   * Atomically add `amount` XP and return the new total.
   * Uses the award_player_xp RPC (upsert + increment).
   * Safe to call concurrently — DB-level conflict resolution.
   */
  async function awardXp(userId, amount) {
    if (!userId || !amount || amount <= 0) return 0;
    const { data, error } = await supabase.rpc('award_player_xp', {
      p_user_id: userId,
      p_amount: amount,
    });
    if (error) throw error;
    // RPC returns a row set; take the first row's total_xp.
    const row = Array.isArray(data) ? data[0] : data;
    return row?.total_xp ?? 0;
  }

  /**
   * Current total XP for a user. Returns 0 if the row doesn't exist yet.
   */
  async function getXp(userId) {
    if (!userId) return 0;
    const { data, error } = await supabase
      .from('player_xp')
      .select('total_xp')
      .eq('user_id', userId)
      .single();
    // PGRST116 = row not found — first game, so 0 XP.
    if (error && error.code !== 'PGRST116') throw error;
    return data?.total_xp ?? 0;
  }

  return { awardXp, getXp };
}

module.exports = { createXpRepo };
