const engine = require('./gameEngine');

const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = engine.defaultRoomConfig();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

function normalizeGroupSettingsPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return buildDefaultSettings();
  }

  const version = Number(payload.version);
  if (!Number.isFinite(version) || version < 1) {
    return buildDefaultSettings();
  }

  const normalized = engine.normalizeRoomConfig(payload);
  normalized.version = SETTINGS_VERSION;
  return normalized;
}

function isVersionedSettingsPayload(payload) {
  return !!payload && typeof payload === 'object' && Number(payload.version) >= 1;
}

function createGroupSettingsRepo(supabase) {
  async function lookupUsername(userId) {
    if (!userId) return null;
    const result = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .limit(1);

    if (result.error) throw result.error;
    return result.data?.[0]?.username || null;
  }

  async function getGroupSettings(groupId) {
    const result = await supabase
      .from('group_settings')
      .select('group_id, payload, updated_at, updated_by')
      .eq('group_id', groupId)
      .limit(1);

    if (result.error) throw result.error;
    const row = result.data?.[0] || null;
    if (!row) return null;

    const normalizedPayload = normalizeGroupSettingsPayload(row.payload);
    const updatedByUsername = await lookupUsername(row.updated_by);

    return {
      groupId: row.group_id,
      payload: normalizedPayload,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by,
      updatedByUsername,
    };
  }

  async function upsertGroupSettings(groupId, payload, updatedByUserId) {
    if (!isVersionedSettingsPayload(payload)) {
      throw new Error('Group settings payload.version is required');
    }

    const normalizedPayload = normalizeGroupSettingsPayload(payload);
    const now = new Date().toISOString();
    const result = await supabase
      .from('group_settings')
      .upsert({
        group_id: groupId,
        payload: normalizedPayload,
        updated_at: now,
        updated_by: updatedByUserId,
      }, {
        onConflict: 'group_id',
      })
      .select('updated_at')
      .single();

    if (result.error) throw result.error;

    return {
      updatedAt: result.data?.updated_at || now,
      payload: normalizedPayload,
      updatedByUserId,
    };
  }

  return {
    SETTINGS_VERSION,
    DEFAULT_SETTINGS: buildDefaultSettings(),
    getGroupSettings,
    upsertGroupSettings,
  };
}

module.exports = {
  SETTINGS_VERSION,
  DEFAULT_SETTINGS,
  normalizeGroupSettingsPayload,
  isVersionedSettingsPayload,
  createGroupSettingsRepo,
};
