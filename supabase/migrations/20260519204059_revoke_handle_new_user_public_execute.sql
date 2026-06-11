-- Recovered from the live database's migration history (this migration was
-- applied directly to production but its file was never committed; recovered
-- 2026-06-11 while reconciling history for #205).

-- handle_new_user is a trigger function — it is invoked by the auth.users
-- INSERT trigger, not via REST RPC. Revoking PUBLIC execute closes the
-- /rest/v1/rpc/handle_new_user endpoint for all unauthenticated and
-- authenticated callers without affecting the trigger itself.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
