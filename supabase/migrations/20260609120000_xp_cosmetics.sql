-- ============================================================
-- MIGRATION — Per-player XP and cosmetics (PR #205)
-- ============================================================
-- Adds two tables and a server-side RPC for atomic XP awarding.

-- ─── player_xp ──────────────────────────────────────────────
-- Global XP total per authenticated user. Grows monotonically.
create table if not exists player_xp (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  total_xp   integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ─── player_cosmetics ───────────────────────────────────────
-- Active cosmetic selections per user. Defaults to the free
-- items so rows only need to exist when the user has changed
-- something. Created on first set_cosmetic call (upsert).
create table if not exists player_cosmetics (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  gun_skin   text not null default 'gun_default',
  card_back  text not null default 'card_default',
  table_felt text not null default 'felt_default',
  updated_at timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────
alter table player_xp         enable row level security;
alter table player_cosmetics  enable row level security;

-- Users can read their own rows (the server uses the service role
-- and bypasses RLS, so these policies protect direct client access).
create policy "player_xp: owner read"
  on player_xp for select
  using (auth.uid() = user_id);

create policy "player_cosmetics: owner read"
  on player_cosmetics for select
  using (auth.uid() = user_id);

create policy "player_cosmetics: owner update"
  on player_cosmetics for update
  using (auth.uid() = user_id);

-- ─── award_player_xp RPC ────────────────────────────────────
-- Atomically increments XP (upsert + update) and returns the
-- new total. Called server-side with the service role.
create or replace function award_player_xp(
  p_user_id uuid,
  p_amount   integer
)
returns table(total_xp integer)
language plpgsql
security definer
as $$
begin
  insert into player_xp (user_id, total_xp, updated_at)
    values (p_user_id, p_amount, now())
  on conflict (user_id) do update
    set total_xp   = player_xp.total_xp + excluded.total_xp,
        updated_at = now();

  return query
    select player_xp.total_xp
      from player_xp
     where player_xp.user_id = p_user_id;
end;
$$;
