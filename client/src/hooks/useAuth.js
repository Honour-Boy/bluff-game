// ============================================================
// useAuth HOOK — Supabase auth + profile management
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser]       = useState(null);   // auth.User | null
  const [profile, setProfile] = useState(null);   // { id, username } | null
  const [loading, setLoading] = useState(true);   // true while session is loading
  const [authError, setAuthError] = useState(null);

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
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line

  // ─── Sign up ───────────────────────────────────────────────
  const signUp = useCallback(async ({ email, password, username }) => {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    if (error) { setAuthError(error.message); return false; }
    return true; // user needs to verify email
  }, []);

  // ─── Sign in ───────────────────────────────────────────────
  const signIn = useCallback(async ({ email, password }) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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

  // ─── Update password ───────────────────────────────────────
  const updatePassword = useCallback(async (newPassword) => {
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  }, [user]);

  // ─── Get current access token (for Socket.IO auth) ────────
  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  return {
    user,
    profile,
    loading,
    authError,
    setAuthError,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateUsername,
    updatePassword,
    getAccessToken,
    // convenience
    isAuthenticated: !!user,
    username: profile?.username ?? user?.email?.split('@')[0] ?? null,
  };
}
