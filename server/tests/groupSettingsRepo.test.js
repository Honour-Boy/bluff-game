import { describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_VERSION,
  createGroupSettingsRepo,
  isVersionedSettingsPayload,
  normalizeGroupSettingsPayload,
} from '../groupSettingsRepo.js';

function makeSupabaseMock({
  groupSettingsRow = null,
  username = 'HostUser',
  upsertUpdatedAt = '2026-05-15T19:00:00.000Z',
} = {}) {
  const calls = [];

  const from = (table) => ({
    select(columns) {
      const state = { table, columns, filters: [] };
      const chain = {
        eq(column, value) {
          state.filters.push({ column, value });
          return chain;
        },
        limit() {
          if (table === 'group_settings') {
            return Promise.resolve({ data: groupSettingsRow ? [groupSettingsRow] : [], error: null });
          }
          if (table === 'profiles') {
            return Promise.resolve({ data: username ? [{ username }] : [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return chain;
    },
    upsert(payload, options) {
      calls.push({ table, payload, options });
      return {
        select() {
          return {
            single() {
              return Promise.resolve({
                data: { updated_at: upsertUpdatedAt },
                error: null,
              });
            },
          };
        },
      };
    },
  });

  return {
    calls,
    client: { from },
  };
}

describe('groupSettingsRepo helpers', () => {
  it('normalizes a versioned payload while preserving the current shape', () => {
    const payload = normalizeGroupSettingsPayload({
      version: 1,
      powerCards: {
        enabled: { shield: true },
        copiesPerDeck: 2,
      },
      systems: { betting: true },
    });

    expect(payload.version).toBe(SETTINGS_VERSION);
    expect(payload.powerCards.enabled.shield).toBe(true);
    expect(payload.powerCards.enabled.mirror).toBe(false);
    expect(payload.powerCards.copiesPerDeck).toBe(2);
    expect(payload.systems.betting).toBe(true);
  });

  it('falls back to defaults when the payload has no usable version', () => {
    const payload = normalizeGroupSettingsPayload({
      powerCards: { enabled: { shield: true } },
    });

    expect(payload.version).toBe(SETTINGS_VERSION);
    expect(payload.powerCards.enabled.shield).toBe(false);
  });

  it('detects whether a payload is versioned for writes', () => {
    expect(isVersionedSettingsPayload({ version: 1 })).toBe(true);
    expect(isVersionedSettingsPayload({})).toBe(false);
    expect(isVersionedSettingsPayload(null)).toBe(false);
  });
});

describe('groupSettingsRepo', () => {
  it('returns null when a group has never saved settings', async () => {
    const supabase = makeSupabaseMock();
    const repo = createGroupSettingsRepo(supabase.client);

    await expect(repo.getGroupSettings('group-1')).resolves.toBeNull();
  });

  it('reads stored settings and resolves the updater username', async () => {
    const supabase = makeSupabaseMock({
      groupSettingsRow: {
        group_id: 'group-1',
        payload: {
          version: 1,
          powerCards: {
            enabled: { shield: true },
            copiesPerDeck: 1,
          },
        },
        updated_at: '2026-05-15T18:30:00.000Z',
        updated_by: '11111111-1111-1111-1111-111111111111',
      },
      username: 'SavedByHost',
    });
    const repo = createGroupSettingsRepo(supabase.client);

    await expect(repo.getGroupSettings('group-1')).resolves.toEqual({
      groupId: 'group-1',
      payload: expect.objectContaining({
        version: 1,
        powerCards: expect.objectContaining({
          enabled: expect.objectContaining({ shield: true }),
        }),
      }),
      updatedAt: '2026-05-15T18:30:00.000Z',
      updatedByUserId: '11111111-1111-1111-1111-111111111111',
      updatedByUsername: 'SavedByHost',
    });
  });

  it('requires payload.version on upsert', async () => {
    const supabase = makeSupabaseMock();
    const repo = createGroupSettingsRepo(supabase.client);

    await expect(
      repo.upsertGroupSettings('group-1', { systems: { betting: true } }, 'user-1'),
    ).rejects.toThrow(/payload\.version is required/i);
  });

  it('upserts normalized settings and returns updatedAt', async () => {
    const supabase = makeSupabaseMock({
      upsertUpdatedAt: '2026-05-15T19:15:00.000Z',
    });
    const repo = createGroupSettingsRepo(supabase.client);

    await expect(repo.upsertGroupSettings('group-1', {
      version: 1,
      powerCards: {
        enabled: { shield: true },
        copiesPerDeck: 2,
      },
    }, '22222222-2222-2222-2222-222222222222')).resolves.toEqual({
      updatedAt: '2026-05-15T19:15:00.000Z',
      payload: expect.objectContaining({
        version: 1,
        powerCards: expect.objectContaining({
          copiesPerDeck: 2,
          enabled: expect.objectContaining({ shield: true }),
        }),
      }),
      updatedByUserId: '22222222-2222-2222-2222-222222222222',
    });

    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0]).toEqual({
      table: 'group_settings',
      payload: expect.objectContaining({
        group_id: 'group-1',
        updated_by: '22222222-2222-2222-2222-222222222222',
        payload: expect.objectContaining({
          version: 1,
        }),
      }),
      options: { onConflict: 'group_id' },
    });
  });
});
