-- ============================================================
-- Drop unused rooms + room_players tables.
--
-- Provisioned in the initial schema for a never-shipped "persist
-- room state across server restarts" feature. The actual code in
-- server/socketHandlers.js stores all room state in an in-memory
-- Map; the tables have always had 0 rows.
--
-- room_players references rooms (FK ON DELETE CASCADE) and
-- profiles (FK ON DELETE CASCADE) — drop the dependent table
-- first.
--
-- If persistence ever ships, re-introduce via a fresh migration
-- with whatever shape we need at that time.
-- ============================================================

drop table if exists public.room_players;
drop table if exists public.rooms;
