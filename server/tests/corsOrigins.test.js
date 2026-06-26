// ============================================================
// CORS origin matching - exact allow-list + preview regex.
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseExactOrigins, makeOriginAllow } from '../lib/corsOrigins.js';

// The real staging values: stable alias is exact, previews match the regex.
const STAGING = 'https://bluff-game-staging.vercel.app';
const PREVIEW_RX = '^https://bluff-game-[a-z0-9-]+-honour-boys-projects\\.vercel\\.app$';
const PREVIEW = 'https://bluff-game-ospb35d14-honour-boys-projects.vercel.app';
const BRANCH_PREVIEW = 'https://bluff-game-git-staging-honour-boys-projects.vercel.app';

describe('parseExactOrigins', () => {
  it('splits a comma-separated list and trims', () => {
    expect(parseExactOrigins('https://a.com, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
  });
  it('returns null for "*" or empty', () => {
    expect(parseExactOrigins('*')).toBeNull();
    expect(parseExactOrigins('')).toBeNull();
    expect(parseExactOrigins(undefined)).toBeNull();
  });
});

describe('makeOriginAllow - exact list', () => {
  const allow = makeOriginAllow({ clientUrl: STAGING });

  it('allows the exact configured origin', () => {
    expect(allow(STAGING)).toBe(true);
  });
  it('rejects a different origin', () => {
    expect(allow('https://evil.example.com')).toBe(false);
  });
  it('rejects a preview URL when no regex is configured', () => {
    expect(allow(PREVIEW)).toBe(false);
  });
  it('allows requests with no Origin header (curl / health / server-to-server)', () => {
    expect(allow(undefined)).toBe(true);
    expect(allow('')).toBe(true);
  });
});

describe('makeOriginAllow - exact list + preview regex', () => {
  const allow = makeOriginAllow({ clientUrl: STAGING, previewRegex: PREVIEW_RX });

  it('still allows the stable staging alias', () => {
    expect(allow(STAGING)).toBe(true);
  });
  it('allows a dynamic deploy-hash preview', () => {
    expect(allow(PREVIEW)).toBe(true);
  });
  it('allows a branch-alias preview', () => {
    expect(allow(BRANCH_PREVIEW)).toBe(true);
  });
  it('rejects a vercel.app project NOT in our scope', () => {
    expect(allow('https://someone-else-abc-other-scope.vercel.app')).toBe(false);
    expect(allow('https://bluff-game-evil.vercel.app')).toBe(false);
  });
  it('accepts a precompiled RegExp too', () => {
    const allowRx = makeOriginAllow({ clientUrl: STAGING, previewRegex: new RegExp(PREVIEW_RX) });
    expect(allowRx(PREVIEW)).toBe(true);
  });
  it('ignores an invalid regex string instead of throwing', () => {
    const allowBad = makeOriginAllow({ clientUrl: STAGING, previewRegex: '(' });
    expect(allowBad(STAGING)).toBe(true);
    expect(allowBad(PREVIEW)).toBe(false);
  });
});

describe('makeOriginAllow - wildcard (dev)', () => {
  const allow = makeOriginAllow({ clientUrl: '*' });
  it('allows everything', () => {
    expect(allow('https://anything.example.com')).toBe(true);
    expect(allow(PREVIEW)).toBe(true);
  });
});
