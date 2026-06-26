create table if not exists public.group_leaderboard (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wins int not null default 0 check (wins >= 0),
  games_played int not null default 0 check (games_played >= 0),
  last_win_at timestamptz,
  last_played_at timestamptz,
  primary key (group_id, user_id)
);

create index if not exists group_leaderboard_group_idx
  on public.group_leaderboard (group_id, wins desc, games_played asc);

alter table public.group_leaderboard enable row level security;

drop policy if exists gl_select on public.group_leaderboard;
create policy gl_select on public.group_leaderboard
  for select
  using (
    exists (
      select 1
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = group_leaderboard.group_id
        and gm.user_id = auth.uid()
        and g.deleted_at is null
    )
  );

create or replace function public.group_leaderboard_record_game_start(
  p_group_id uuid,
  p_participant_user_ids uuid[],
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(array_length(p_participant_user_ids, 1), 0) = 0 then
    return;
  end if;

  insert into public.group_leaderboard (
    group_id,
    user_id,
    wins,
    games_played,
    last_win_at,
    last_played_at
  )
  select
    p_group_id,
    participant_user_id,
    0,
    1,
    null,
    p_now
  from unnest(p_participant_user_ids) as participant_user_id
  on conflict (group_id, user_id)
  do update
    set games_played = public.group_leaderboard.games_played + 1,
        last_played_at = excluded.last_played_at;
end;
$$;

create or replace function public.group_leaderboard_record_winner(
  p_group_id uuid,
  p_winner_user_id uuid,
  p_now timestamptz default now()
)
returns public.group_leaderboard
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.group_leaderboard;
begin
  insert into public.group_leaderboard (
    group_id,
    user_id,
    wins,
    games_played,
    last_win_at,
    last_played_at
  )
  values (
    p_group_id,
    p_winner_user_id,
    1,
    1,
    p_now,
    p_now
  )
  on conflict (group_id, user_id)
  do update
    set wins = public.group_leaderboard.wins + 1,
        last_win_at = excluded.last_win_at
  returning * into updated_row;

  return updated_row;
end;
$$;

revoke all on function public.group_leaderboard_record_game_start(uuid, uuid[], timestamptz) from public;
revoke all on function public.group_leaderboard_record_winner(uuid, uuid, timestamptz) from public;
