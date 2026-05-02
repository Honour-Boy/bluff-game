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

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// sessionStorage keys — scoped per browser tab so closing the tab
// (or opening a new one) starts fresh. Identity in this game is
// always tab-local; localStorage would surprise users who expect
// "I closed it" to mean "I'm signed out".
const GUEST_ID_KEY       = 'bluff_guest_id';
const GUEST_USERNAME_KEY = 'bluff_guest_username';

const GUEST_USERNAME_MIN = 4;
const GUEST_USERNAME_MAX = 20;

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

  // ─── Load profile from DB ──────────────────────────────────
  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .single();
    setProfile(data || null);
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
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        clearGuestFromStorage();
        setGuestUser(null);
        loadProfile(u.id);
      } else {
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
    setUser(null);
    setProfile(null);
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
