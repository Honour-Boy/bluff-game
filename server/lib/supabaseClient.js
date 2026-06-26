// ============================================================
// SOCKET LIB - Supabase admin client + default repo singletons
// ============================================================
// Used to verify JWT tokens, look up profiles, and seed the default
// repo dependencies. Tests inject mock repos via the `deps` argument
// of registerSocketHandlers, so these singletons are only the
// production fallback.

const { createClient } = require('@supabase/supabase-js');
const { createGroupsRepo } = require('../groupsRepo');
const { createGroupSettingsRepo } = require('../groupSettingsRepo');
const { createLeaderboardRepo } = require('../leaderboardRepo');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const defaultGroupsRepo = createGroupsRepo(supabase);
const defaultGroupSettingsRepo = createGroupSettingsRepo(supabase);
const defaultLeaderboardRepo = createLeaderboardRepo(supabase);

module.exports = {
  supabase,
  defaultGroupsRepo,
  defaultGroupSettingsRepo,
  defaultLeaderboardRepo,
};
