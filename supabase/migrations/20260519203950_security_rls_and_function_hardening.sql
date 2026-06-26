-- Recovered from the live database's migration history (this migration was
-- applied directly to production but its file was never committed; recovered
-- 2026-06-11 while reconciling history for #205).

-- ── C1: Replace WITH CHECK (true) on 3 UPDATE policies ───────────────────
-- Previously any column could be written to any value once the USING clause
-- passed. These constraints restrict what the NEW row is allowed to look like.

-- groups: host can only write rows where they remain the host (prevents
-- ownership transfer and code/id tampering via this policy).
ALTER POLICY groups_update ON public.groups
  WITH CHECK (host_user_id = auth.uid());

-- group_members: host can only write member rows that still belong to a
-- group they own (prevents reassigning members across groups).
ALTER POLICY gm_host_update ON public.group_members
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND g.host_user_id = auth.uid()
        AND g.deleted_at IS NULL
    )
  );

-- group_invites: status must be a valid terminal value; group relationship
-- must still hold after the update (prevents arbitrary status writes).
ALTER POLICY gi_update ON public.group_invites
  WITH CHECK (
    status IN ('accepted', 'declined', 'revoked')
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_invites.group_id
        AND g.deleted_at IS NULL
        AND (
          g.host_user_id = auth.uid()
          OR group_invites.invitee_user_id = auth.uid()
        )
    )
  );

-- ── C2: Revoke EXECUTE from anon + authenticated on SECURITY DEFINER fns ──
-- These functions are server-only (called via service-role key). Exposing
-- them to anon/authenticated via /rest/v1/rpc/ allows unauthenticated users
-- to create fake game records or assign wins to arbitrary user IDs.

REVOKE EXECUTE ON FUNCTION public.group_leaderboard_record_game_start(uuid, uuid[], timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.group_leaderboard_record_winner(uuid, uuid, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ── C3: Pin set_updated_at search_path ───────────────────────────────────
-- Without a fixed search_path an attacker who can create objects in an
-- earlier schema could shadow functions this trigger calls.
ALTER FUNCTION public.set_updated_at() SET search_path = public;
