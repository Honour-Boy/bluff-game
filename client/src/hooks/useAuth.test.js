import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mock the supabase singleton ────────────────────────────────
// useAuth imports `supabase` from `../lib/supabase`. We intercept
// that import so each test can stub the auth methods individually
// without touching the real Supabase client.

const supabaseMock = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  // Builder pattern that mirrors the chained .from().select().eq().single()
  // call in loadProfile.
  const fromBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  // .update().eq() resolves directly (no .single)
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };

  return {
    auth,
    fromBuilder,
    updateChain,
    from: vi.fn(() => fromBuilder),
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: supabaseMock.auth,
    from: (...args) => {
      supabaseMock.from(...args);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: () => supabaseMock.fromBuilder.single(),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: (...a) => supabaseMock.updateChain.eq(...a),
        }),
      };
    },
  },
}));

import { useAuth } from './useAuth';

beforeEach(() => {
  // Reset stubs back to default no-session, no-error state.
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabaseMock.auth.signInWithOtp.mockResolvedValue({ error: null });
  supabaseMock.auth.signInWithOAuth.mockResolvedValue({ error: null });
  supabaseMock.auth.signOut.mockResolvedValue({ error: null });
  supabaseMock.fromBuilder.single.mockResolvedValue({ data: null, error: null });
  supabaseMock.updateChain.eq.mockResolvedValue({ error: null });
});

describe('useAuth', () => {
  it('starts loading and resolves to no user when there is no session', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('hydrates from an existing session', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1', email: 'x@y.com' } } },
    });
    supabaseMock.fromBuilder.single.mockResolvedValueOnce({
      data: { id: 'u1', username: 'chris' },
      error: null,
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ id: 'u1', email: 'x@y.com' });
    expect(result.current.username).toBe('chris');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('falls back to email prefix when no profile username is set', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1', email: 'someone@y.com' } } },
    });
    supabaseMock.fromBuilder.single.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.username).toBe('someone');
  });

  it('sendEmailOtp succeeds and returns true', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok;
    await act(async () => {
      ok = await result.current.sendEmailOtp({ email: 'me@x.com' });
    });
    expect(ok).toBe(true);
    expect(supabaseMock.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'me@x.com',
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
    expect(result.current.authError).toBeNull();
  });

  it('sendEmailOtp surfaces supabase error', async () => {
    supabaseMock.auth.signInWithOtp.mockResolvedValueOnce({
      error: { message: 'Invalid email' },
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok;
    await act(async () => {
      ok = await result.current.sendEmailOtp({ email: 'bad' });
    });
    expect(ok).toBe(false);
    expect(result.current.authError).toBe('Invalid email');
  });

  it('signOut clears user and profile', async () => {
    // Start signed in, then sign out.
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1', email: 'x@y.com' } } },
    });
    supabaseMock.fromBuilder.single.mockResolvedValueOnce({
      data: { id: 'u1', username: 'chris' },
      error: null,
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    await act(async () => {
      await result.current.signOut();
    });
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('updateUsername rejects when not signed in', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.updateUsername('newname');
    });
    expect(res).toEqual({ error: 'Not signed in' });
  });

  it('updateUsername validates length', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    let tooShort;
    await act(async () => {
      tooShort = await result.current.updateUsername('abc');
    });
    expect(tooShort.error).toMatch(/at least 4/);

    let tooLong;
    await act(async () => {
      tooLong = await result.current.updateUsername('a'.repeat(25));
    });
    expect(tooLong.error).toMatch(/20 characters/);
  });

  it('updateUsername persists when valid', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    supabaseMock.fromBuilder.single.mockResolvedValueOnce({
      data: { id: 'u1', username: 'old' },
      error: null,
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('u1'));

    let res;
    await act(async () => {
      res = await result.current.updateUsername('  validname  ');
    });
    expect(res).toEqual({ error: null });
    expect(result.current.profile?.username).toBe('validname');
  });

  it('getAccessToken returns null when no session', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let token;
    await act(async () => {
      token = await result.current.getAccessToken();
    });
    expect(token).toBeNull();
  });

  it('getAccessToken returns the access_token when session exists', async () => {
    supabaseMock.auth.getSession
      // first call inside the bootstrap effect
      .mockResolvedValueOnce({ data: { session: null } })
      // second call from getAccessToken()
      .mockResolvedValueOnce({ data: { session: { access_token: 'jwt-123' } } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let token;
    await act(async () => {
      token = await result.current.getAccessToken();
    });
    expect(token).toBe('jwt-123');
  });
});
