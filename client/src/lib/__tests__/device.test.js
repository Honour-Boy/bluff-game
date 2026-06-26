import { describe, it, expect, beforeEach } from 'vitest';
import { getDeviceId } from '../device';

const DEVICE_ID_KEY = 'bluff_device_id';

beforeEach(() => {
  localStorage.clear();
});

describe('getDeviceId - persistent per-browser device id', () => {
  it('mints a UUID-shaped id and persists it to localStorage', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(id);
  });

  it('returns the SAME id across calls (survives a reload)', () => {
    const first = getDeviceId();
    // A reload re-reads localStorage; getDeviceId should not re-mint.
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it('reuses an id already present in storage', () => {
    const preset = '11111111-1111-4111-8111-111111111111';
    localStorage.setItem(DEVICE_ID_KEY, preset);
    expect(getDeviceId()).toBe(preset);
  });
});
