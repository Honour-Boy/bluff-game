// ============================================================
// Tests for the guest-auth branch of the authenticate handler.
//
// We don't spin up a real socket.io server — that's overkill for a
// pure auth-handler test and would pull in Supabase. Instead we:
//   1. Mock @supabase/supabase-js so requiring socketHandlers.js
//      doesn't try to talk to a real backend.
//   2. Construct a fake `socket` object that records `.on()`
//      registrations, then call registerSocketHandlers with it to
//      capture the `authenticate` handler.
//   3. Drive that handler directly, assert it stamps the right
//      userId/username/isGuest fields and resolves the callback
//      with the right shape.
//
// Also covers the pure sanitiser + guest-id validator helpers
// exported from the module.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// socketHandlers calls `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
// at module load. We replace the SDK entirely via vi.mock below, but the
// real module is also reachable via require() inside socketHandlers (CJS).
// To stop that path from blowing up before the mock is applied we need
// non-empty env values BEFORE any import runs — vi.hoisted gives us that
// guaranteed-pre-import slot.
vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
});

// ─── Stub Supabase BEFORE requiring socketHandlers ───────────
// `createClient` is called at module load time. The stub returns an
// object with the surface socketHandlers actually touches — auth.getUser,
// the chained .from().select().eq().single() builder, etc. Tests that
// need to drive a token-path response can override these via
// `supabaseStub.auth.getUser.mockResolvedValueOnce(...)`.
const supabaseStub = vi.hoisted(() => {
  const fromBuilder = {
    select: vi.fn(function () { return this; }),
    eq:     vi.fn(function () { return this; }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'no token' } }),
    },
    from: vi.fn(() => fromBuilder),
    fromBuilder,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth:  supabaseStub.auth,
    from:  (...args) => supabaseStub.from(...args),
  }),
}));

// LiveKit isn't relevant to the auth path but the module imports it.
// Block the network-side bits with a no-op stub so loading is cheap.
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'fake-jwt'; } },
}));

// Now import — the mocks above apply.
import {
  registerSocketHandlers,
  sanitizeGuestUsername,
  isValidGuestId,
  GUEST_USER_PREFIX,
  GUEST_USERNAME_MIN,
  GUEST_USERNAME_MAX,
} from '../socketHandlers.js';

// ─── Fake socket harness ──────────────────────────────────────
// Captures handler registrations so the test can drive `authenticate`
// directly (which is what we care about — we don't want to involve
// real socket.io transport).
function makeFakeSocket() {
  const handlers = new Map();
  return {
    id: 'sock-test',
    handlers,
    on: (event, fn) => handlers.set(event, fn),
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  };
}

function makeFakeIo() {
  return { to: () => ({ emit: vi.fn() }), in: () => ({ fetchSockets: async () => [] }) };
}

// Convenience: register handlers, return the authenticate fn + the
// socket so tests can read `socket.userId` after calling it.
function setup() {
  const socket = makeFakeSocket();
  registerSocketHandlers(makeFakeIo(), socket);
  return { socket, authenticate: socket.handlers.get('authenticate') };
}

beforeEach(() => {
  supabaseStub.auth.getUser.mockReset();
  supabaseStub.fromBuilder.single.mockReset();
  supabaseStub.fromBuilder.single.mockResolvedValue({ data: null, error: null });
});

// ─── Pure helpers ────────────────────────────────────────────

describe('sanitizeGuestUsername', () => {
  it('trims and accepts a normal name', () => {
    expect(sanitizeGuestUsername('  Chris  ')).toBe('Chris');
  });

  it('rejects names below the minimum length', () => {
    expect(sanitizeGuestUsername('abc')).toBeNull();
    expect(sanitizeGuestUsername('   x ')).toBeNull();
  });

  it('clamps to the max length', () => {
    const long = 'a'.repeat(GUEST_USERNAME_MAX + 10);
    const out = sanitizeGuestUsername(long);
    expect(out.length).toBe(GUEST_USERNAME_MAX);
  });

  it('strips control chars and HTML-like markers', () => {
    expect(sanitizeGuestUsername('  Bob<script>')).toBe('Bobscript');
  });

  it('strips emojis and zero-width chars', () => {
    // 😀 = U+1F600 (Emoji_Presentation), ​ = zero-width space.
    const cleaned = sanitizeGuestUsername('Player​😀One');
    expect(cleaned).toBe('PlayerOne');
  });

  it('returns null for empty / null / non-string input', () => {
    expect(sanitizeGuestUsername(null)).toBeNull();
    expect(sanitizeGuestUsername(undefined)).toBeNull();
    expect(sanitizeGuestUsername('')).toBeNull();
    expect(sanitizeGuestUsername(123)).toBeNull(); // 3 digits → too short
  });

  it('keeps Unicode letters (accented names work)', () => {
    expect(sanitizeGuestUsername('Renée')).toBe('Renée');
    // 4-char CJK string clears the min-length floor.
    expect(sanitizeGuestUsername('玩家用户名')).toBe('玩家用户名');
  });

  it('keeps the allowed punctuation (.-_) and spaces', () => {
    expect(sanitizeGuestUsername('cool_user.42-x')).toBe('cool_user.42-x');
  });
});

describe('isValidGuestId', () => {
  it('accepts RFC-4122 v4 hex UUIDs', () => {
    expect(isValidGuestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isValidGuestId('not-a-uuid')).toBe(false);
    expect(isValidGuestId('')).toBe(false);
    expect(isValidGuestId(null)).toBe(false);
    expect(isValidGuestId(123)).toBe(false);
    // Wrong group sizes
    expect(isValidGuestId('550e8400-e29b-41d4-a716-44665544')).toBe(false);
  });
});

// ─── authenticate handler — guest branch ──────────────────────

describe('authenticate handler — guest branch', () => {
  it('rejects when no token AND no guest payload', async () => {
    const { authenticate } = setup();
    const cb = vi.fn();
    await authenticate({}, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'No token provided' });
  });

  it('rejects when guest username is too short after sanitisation', async () => {
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    await authenticate({ guest: { username: 'ab' } }, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].success).toBe(false);
    expect(cb.mock.calls[0][0].error).toMatch(/Display name/);
    // Failure should NOT stamp the socket.
    expect(socket.userId).toBeUndefined();
    expect(socket.isGuest).toBeUndefined();
  });

  it('rejects when guest username is empty / missing', async () => {
    const { authenticate } = setup();
    const cb = vi.fn();
    await authenticate({ guest: {} }, cb);
    expect(cb.mock.calls[0][0].success).toBe(false);
  });

  it('stamps socket fields and returns guestId on success', async () => {
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    await authenticate({ guest: { username: 'GuestPlayer' } }, cb);

    const reply = cb.mock.calls[0][0];
    expect(reply.success).toBe(true);
    expect(reply.guest).toBe(true);
    expect(reply.username).toBe('GuestPlayer');
    expect(typeof reply.guestId).toBe('string');
    expect(isValidGuestId(reply.guestId)).toBe(true);

    expect(socket.userId).toBe(`${GUEST_USER_PREFIX}${reply.guestId}`);
    expect(socket.username).toBe('GuestPlayer');
    expect(socket.isGuest).toBe(true);
  });

  it('reuses a client-supplied valid guestId verbatim', async () => {
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    const persisted = '550e8400-e29b-41d4-a716-446655440000';
    await authenticate({ guest: { username: 'StableName', guestId: persisted } }, cb);

    expect(cb.mock.calls[0][0].guestId).toBe(persisted);
    expect(socket.userId).toBe(`${GUEST_USER_PREFIX}${persisted}`);
  });

  it('mints a fresh guestId when the client supplies a malformed one', async () => {
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    await authenticate({ guest: { username: 'AnotherName', guestId: 'not-a-uuid' } }, cb);

    const issued = cb.mock.calls[0][0].guestId;
    expect(issued).not.toBe('not-a-uuid');
    expect(isValidGuestId(issued)).toBe(true);
    expect(socket.userId).toBe(`${GUEST_USER_PREFIX}${issued}`);
  });

  it('sanitises the username before stamping it on the socket', async () => {
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    await authenticate({ guest: { username: '  Cool<Player> ' } }, cb);

    expect(socket.username).toBe('CoolPlayer');
    expect(cb.mock.calls[0][0].username).toBe('CoolPlayer');
  });

  it('does NOT call the Supabase profiles table for guests', async () => {
    const { authenticate } = setup();
    const cb = vi.fn();
    await authenticate({ guest: { username: 'NoProfileLookup' } }, cb);

    expect(supabaseStub.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseStub.from).not.toHaveBeenCalled();
  });

  it('falls through to the token branch when no guest payload is given', async () => {
    // We don't fully exercise Supabase here — that path is intercepted
    // by the live createClient at module-load time and is harder to
    // mock cleanly across CJS/ESM boundaries. What we DO need to lock
    // in is that an empty payload still errors with the historical
    // "No token provided" message, so the existing magic-link / Google
    // sign-in flows on the client keep getting that copy back.
    const { authenticate, socket } = setup();
    const cb = vi.fn();
    await authenticate({}, cb);
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'No token provided' });
    expect(socket.userId).toBeUndefined();
    expect(socket.isGuest).toBeUndefined();
  });
});
