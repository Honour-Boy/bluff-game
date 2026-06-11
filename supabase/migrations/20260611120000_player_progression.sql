-- #205 — XP + cosmetic unlocks (meta-progression).
-- One row per signed-in player: lifetime XP, games credited, and the
-- equipped cosmetics (validated server-side against the unlock catalog
-- before being written — the jsonb here is already sanitised).

create table if not exists public.player_progression (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp int not null default 0 check (xp >= 0),
  games_played int not null default 0 check (games_played >= 0),
  equipped jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_progression enable row level security;

-- Players may read their own progression row (the service-role server
-- bypasses RLS for writes + cross-player reads).
drop policy if exists pp_select_own on public.player_progression;
create policy pp_select_own on public.player_progression
  for select
  using (auth.uid() = user_id);

-- Atomic XP credit at game end: one upsert per player so concurrent
-- game-over awards can never lose an increment. Also bumps games_played.
create or replace function public.player_progression_add_xp(
  p_user_id uuid,
  p_amount int,
  p_now timestamptz default now()
)
returns public.player_progression
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.player_progression;
begin
  insert into public.player_progression (user_id, xp, games_played, updated_at)
  values (p_user_id, greatest(coalesce(p_amount, 0), 0), 1, p_now)
  on conflict (user_id)
  do update
    set xp = public.player_progression.xp + greatest(coalesce(p_amount, 0), 0),
        games_played = public.player_progression.games_played + 1,
        updated_at = excluded.updated_at
  returning * into updated_row;

  return updated_row;
end;
$$;

revoke all on function public.player_progression_add_xp(uuid, int, timestamptz) from public;
