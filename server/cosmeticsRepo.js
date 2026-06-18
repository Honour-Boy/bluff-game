// ============================================================
// REPO — Player cosmetics persistence (Supabase)
// ============================================================

const { DEFAULT_SELECTIONS } = require('./cosmeticsRegistry');

function createCosmeticsRepo(supabase) {
  /**
   * Cosmetic selections for a user.
   * Returns DEFAULT_SELECTIONS when no row exists yet (first login).
   */
  async function getCosmetics(userId) {
    if (!userId) return { ...DEFAULT_SELECTIONS };
    const { data, error } = await supabase
      .from('player_cosmetics')
      .select('gun_skin, card_back, table_felt')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return { ...DEFAULT_SELECTIONS };
    return {
      gunSkin:   data.gun_skin   || DEFAULT_SELECTIONS.gunSkin,
      cardBack:  data.card_back  || DEFAULT_SELECTIONS.cardBack,
      tableFelt: data.table_felt || DEFAULT_SELECTIONS.tableFelt,
    };
  }

  /**
   * Persist a single cosmetic slot change (upsert).
   * `slot` is one of 'gunSkin' | 'cardBack' | 'tableFelt'.
   */
  async function setCosmetic(userId, slot, id) {
    if (!userId || !slot || !id) throw new Error('Missing args');
    const COL_MAP = {
      gunSkin:   'gun_skin',
      cardBack:  'card_back',
      tableFelt: 'table_felt',
    };
    const col = COL_MAP[slot];
    if (!col) throw new Error(`Unknown slot: ${slot}`);
    const { error } = await supabase
      .from('player_cosmetics')
      .upsert(
        { user_id: userId, [col]: id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
  }

  return { getCosmetics, setCosmetic };
}

module.exports = { createCosmeticsRepo };
