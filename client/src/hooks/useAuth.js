// ============================================================
// useAuth HOOK — Supabase auth + profile management
// ============================================================
//
// Two identity flavours, mutually exclusive within a tab:
//
// 1. Authenticated (Supabase) — magic link or Google. Profile row in
//    the `profiles` table, username editable, persists across tabs.
// 2. Guest — typed display name, no email, ephemeral. Identity is a
//    `guest:<uuid>` string the client mints client-side and stashes
//    in sessionStorage so a tab refresh keeps the same id (and the
//    server's room.players entry still matches on reconnect).
//
// Downstream code reads `user.id` and `username`. The hook returns a
// `guestUser` object shaped like the Supabase user when a guest is
// active so page.js / useGame.js don't have to branch.

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getSocket } from '../lib/socket';

// sessionStorage keys — scoped per browser tab so closing the tab
// (or opening a new one) starts fresh. Identity in this game is
// always tab-local; localStorage would surprise users who expect
// "I closed it" to mean "I'm signed out".
const GUEST_ID_KEY       = 'bluff_guest_id';
const GUEST_USERNAME_KEY = 'bluff_guest_username';

const GUEST_USERNAME_MIN = 4;
const GUEST_USERNAME_MAX = 20;

// Absolute session lifetime enforced client-side. Supabase's refresh
// token rotates silently forever by default; this cap ensures a stolen
// or shared device can't hold a valid session indefinitely.
const AUTH_LOGIN_AT_KEY = 'bluff_auth_login_at';
const MAX_SESSION_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days

// Mirrors the server-side regex (server is the authority — this is
// only a UX hint so we surface validation before round-tripping).
function isValidGuestUsername(raw) {
  const cleaned = String(raw || '').trim();
  return cleaned.length >= GUEST_USERNAME_MIN && cleaned.length <= GUEST_USERNAME_MAX;
}

// crypto.randomUUID() is available in every modern browser and Node.
// Fall back to a Math.random construction only on truly ancient
// environments — keeps the hook usable in tests without polyfills.
function generateGuestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Loose v4-shaped fallback — server validates the format and will
  // mint its own if this one is rejected.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readGuestFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(GUEST_ID_KEY);
    const username = sessionStorage.getItem(GUEST_USERNAME_KEY);
    if (id && username) return { id, username };
  } catch (_) { /* private mode etc. */ }
  return null;
}

function writeGuestToStorage(id, username) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(GUEST_ID_KEY, id);
    sessionStorage.setItem(GUEST_USERNAME_KEY, username);
  } catch (_) { /* ignore */ }
}

function clearGuestFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(GUEST_ID_KEY);
    sessionStorage.removeItem(GUEST_USERNAME_KEY);
  } catch (_) { /* ignore */ }
}

function writeLoginAt() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(AUTH_LOGIN_AT_KEY, String(Date.now())); } catch (_) {}
}

function clearLoginAt() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(AUTH_LOGIN_AT_KEY); } catch (_) {}
}

function isSessionExpired() {
  if (typeof window === 'undefined') return false;
  try {
    const loginAt = Number(localStorage.getItem(AUTH_LOGIN_AT_KEY));
    if (!loginAt) return false;
    return Date.now() - loginAt > MAX_SESSION_MS;
  } catch (_) { return false; }
}

export function useAuth() {
  const [user, setUser]       = useState(null);   // auth.User | null
  const [profile, setProfile] = useState(null);   // { id, username } | null
  const [loading, setLoading] = useState(true);   // true while session is loading
  const [authError, setAuthError] = useState(null);

  // Guest user: { id: 'guest:<uuid>', username, isGuest: true } | null
  // Lives alongside `user`. Mutually exclusive — sign-in clears the
  // guest, signOutGuest() clears the guest. Authenticated user always
  // wins so a stale guest entry can't shadow a fresh sign-in.
  const [guestUser, setGuestUser] = useState(null);

  // Tracks the userId of the most recently *successfully* loaded
  // profile so `onAuthStateChange` events like TOKEN_REFRESHED (which
  // fire roughly hourly with the same user) don't re-hit Supabase.
  // Cleared on signOut and on updateUsername success so the next
  // bootstrap or refresh re-fetches the canonical row.
  const profileLoadedForRef = useRef(null);

  // ─── Load profile from DB ──────────────────────────────────
  // `force` bypasses the cache check and is used when we know the
  // row has changed (post-updateUsername) or want to recover from a
  // missing profile after sign-out → sign-in for a different user.
  const loadProfile = useCallback(async (userId, { force = false } = {}) => {
    if (!force && profileLoadedForRef.current === userId) {
      return undefined;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .single();
    setProfile(data || null);
    if (data) profileLoadedForRef.current = userId;
    return data;
  }, []);

  // ─── Session bootstrap ─────────────────────────────────────
  // Order matters: rehydrate the guest first (synchronous, cheap) so
  // the AuthScreen never flashes for a refreshing guest. The async
  // Supabase getSession resolves moments later — if it returns a real
  // user, that takes precedence and we drop the guest entry.
  useEffect(() => {
    let mounted = true;

    const stored = readGuestFromStorage();
    if (stored) {
      setGuestUser({ id: `guest:${stored.id}`, username: stored.username, isGuest: true });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;

      // Enforce absolute 30-day session cap. If the stored login
      // timestamp is absent (first-ever load) we treat the session as
      // unexpired — writeLoginAt fires on the next SIGNED_IN event.
      if (u && isSessionExpired()) {
        clearLoginAt();
        supabase.auth.signOut().finally(() => { if (mounted) setLoading(false); });
        return;
      }

      setUser(u);
      if (u) {
        // A real Supabase session shadows any stale guest entry —
        // signing in via a fresh tab while old guest data still
        // sits in storage shouldn't keep the guest alive.
        clearGuestFromStorage();
        setGuestUser(null);
        loadProfile(u.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      // Stamp the wall-clock login time on every fresh sign-in so the
      // 30-day cap is measured from the most recent authentication, not
      // the first one ever (handles sign-out → sign-in resets).
      if (_event === 'SIGNED_IN') writeLoginAt();
      const u = session?.user ?? null;
      // §M4.2 — router isolation. A transient null session (e.g. a
      // TOKEN_REFRESHED that briefly fails during a network blip) must NOT flip
      // `user` to null, because page.js would unmount the in-room view into the
      // AuthScreen — exactly the mid-game "kicked to login/landing" bounce we're
      // eliminating. Only an explicit SIGNED_OUT clears the user.
      if (!u && _event !== 'SIGNED_OUT') return;
      setUser(u);
      if (u) {
        clearGuestFromStorage();
        setGuestUser(null);
        // Cached: skips the Supabase round-trip on TOKEN_REFRESHED
        // (fires ~hourly) when the same user is already loaded.
        loadProfile(u.id);
      } else {
        profileLoadedForRef.current = null;
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line

  // ─── Send a 6-digit OTP code to the email ─────────────────
  // Replaces password signup. Supabase's signInWithOtp creates the
  // user if they don't exist (shouldCreateUser default true) and
  // emails a code. If the address is invalid, the user never
  // receives a code and the verification step fails — no more
  // false-positive "confirmation sent" claims for typo'd emails.
  //
  // emailRedirectTo: the magic link in the email is honored by
  // Supabase only if the URL is on the project's redirect allowlist.
  // Sending the current origin means staging clients get staging-
  // bound links and production clients get production-bound links,
  // even though both are served by the same Supabase project.
  const sendEmailOtp = useCallback(async ({ email }) => {
    setAuthError(null);
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });
    if (error) { setAuthError(error.message); return false; }
    return true;
  }, []);

  // ─── Google OAuth ──────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}` },
    });
    if (error) setAuthError(error.message);
  }, []);

  // ─── Sign out ──────────────────────────────────────────────
  // Clears whichever identity is currently active (Supabase OR
  // guest). The signOutGuest helper exists separately because the
  // in-lobby "Sign in to save your username" CTA needs to drop the
  // guest entry without calling supabase.auth.signOut (no Supabase
  // session exists for guests, and that call would be a no-op
  // network round-trip).
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearLoginAt();
    setUser(null);
    setProfile(null);
    profileLoadedForRef.current = null;
    clearGuestFromStorage();
    setGuestUser(null);
  }, []);

  const signOutGuest = useCallback(() => {
    clearGuestFromStorage();
    setGuestUser(null);
  }, []);

  // ─── Guest sign-in ─────────────────────────────────────────
  // Validates length client-side, mints a UUID, persists both to
  // sessionStorage so a refresh keeps the same guest identity, and
  // returns { ok, user } so the caller can decide what to do.
  // The server runs its own sanitisation on the actual authenticate
  // event — this is just for surfacing the error before the round
  // trip.
  const signInAsGuest = useCallback(({ username }) => {
    setAuthError(null);
    const trimmed = String(username || '').trim();
    if (!isValidGuestUsername(trimmed)) {
      const msg = `Display name must be ${GUEST_USERNAME_MIN}-${GUEST_USERNAME_MAX} characters`;
      setAuthError(msg);
      return { ok: false, error: msg };
    }
    const id = generateGuestId();
    writeGuestToStorage(id, trimmed);
    const next = { id: `guest:${id}`, username: trimmed, isGuest: true };
    setGuestUser(next);
    return { ok: true, user: next };
  }, []);

  // ─── Update username ───────────────────────────────────────
  // Persists to the `profiles` table THEN tells the server to
  // refresh socket.username + every room.players entry the user is
  // in. Without that second hop, the server keeps the old name
  // stamped at authenticate-time and other clients only see the
  // rename after a full reconnect.
  const updateUsername = useCallback(async (newUsername) => {
    if (!user) return { error: 'Not signed in' };
    const trimmed = newUsername.trim();
    if (trimmed.length < 4) return { error: 'Username must be at least 4 characters' };
    if (trimmed.length > 20) return { error: 'Username must be 20 characters or fewer' };

    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', user.id);

    if (error) return { error: error.message };
    setProfile(prev => ({ ...prev, username: trimmed }));
    // We just wrote a new username; clear the cache key so the next
    // auth-state event re-reads the canonical row (no-op normally,
    // since setProfile above is already authoritative).
    profileLoadedForRef.current = null;

    // Best-effort socket sync. If the socket isn't authenticated
    // (e.g. user is signed out or transport just dropped), the next
    // reconnect's `authenticate` re-reads the profile, so the rename
    // still propagates — just on the next reconnect rather than now.
    try {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('update_username', {}, () => {});
      }
    } catch (_) { /* non-fatal */ }

    return { error: null };
  }, [user]);

  // ─── Get current access token (for Socket.IO auth) ────────
  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  // Pulls the persisted guest identity directly from sessionStorage
  // so authenticate-on-reconnect always gets the fresh value (the
  // useState mirror lags one render). useGame calls this on every
  // reconnect — a brief stale read here would resolve to a different
  // guestId on the server and the room.players entry wouldn't match.
  const getGuestAuth = useCallback(() => {
    const stored = readGuestFromStorage();
    if (!stored) return null;
    return { username: stored.username, guestId: stored.id };
  }, []);

  // The unified user the rest of the app reads from. Authenticated
  // user wins; falls back to the guest user when only that exists.
  const effectiveUser = user
    ? user
    : (guestUser
      ? { id: guestUser.id, email: null, isGuest: true }
      : null);

  const effectiveUsername = profile?.username
    ?? user?.email?.split('@')[0]
    ?? guestUser?.username
    ?? null;

  return {
    user: effectiveUser,
    profile,
    guestUser,                 // explicit, for "(guest)" tags + the
                               // in-lobby "sign in to save" CTA.
    isGuest: !!guestUser && !user,
    loading,
    authError,
    setAuthError,
    sendEmailOtp,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    signOutGuest,
    updateUsername,
    getAccessToken,
    getGuestAuth,
    // convenience
    isAuthenticated: !!user,
    username: effectiveUsername,
  };
}
