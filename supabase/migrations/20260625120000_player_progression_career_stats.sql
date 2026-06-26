-- Career stats - surface what's carrying a player toward their XP.
-- The XP system (#205) computed per-game stats at game_over, turned them into
-- XP, then discarded the raw counts. This adds LIFETIME aggregates so the
-- client can show wins, spins survived, bluffs called right, etc. on the
-- profile ledger. Counts are incremented atomically at game_over by the new
-- player_progression_record_game RPC (replaces player_progression_add_xp).

-- ─── Lifetime stat columns (all non-negative, default 0) ──────
alter table public.player_progression
  add column if not exists wins                int not null default 0 check (wins >= 0),
  add column if not exists spins_survived      int not null default 0 check (spins_survived >= 0),
  add column if not exists correct_bluff_calls int not null default 0 check (correct_bluff_calls >= 0),
  add column if not exists bluffs_defended     int not null default 0 check (bluffs_defended >= 0),
  add column if not exists players_eliminated  int not null default 0 check (players_eliminated >= 0),
  add column if not exists power_cards_resolved int not null default 0 check (power_cards_resolved >= 0),
  add column if not exists last_stand_wins     int not null default 0 check (last_stand_wins >= 0);

-- ─── New game-record RPC: XP credit + lifetime stat increment ──
-- Supersedes player_progression_add_xp. One atomic upsert per player so
-- concurrent game-over awards can never lose an increment. Bumps games_played,
-- adds XP, and folds the finished game's per-game stats into the lifetime
-- totals. p_won / p_last_stand_win are booleans (a single game contributes at
-- most 1 to wins / last_stand_wins).
drop function if exists public.player_progression_add_xp(uuid, int, timestamptz);

create or replace function public.player_progression_record_game(
  p_user_id uuid,
  p_amount int,
  p_won boolean default false,
  p_spins_survived int default 0,
  p_correct_bluff_calls int default 0,
  p_bluffs_defended int default 0,
  p_players_eliminated int default 0,
  p_power_cards_resolved int default 0,
  p_last_stand_win boolean default false,
  p_now timestamptz default now()
)
returns public.player_progression
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.player_progression;
  v_amount int := greatest(coalesce(p_amount, 0), 0);
  v_win int := case when p_won then 1 else 0 end;
  v_spins int := greatest(coalesce(p_spins_survived, 0), 0);
  v_correct int := greatest(coalesce(p_correct_bluff_calls, 0), 0);
  v_defended int := greatest(coalesce(p_bluffs_defended, 0), 0);
  v_elims int := greatest(coalesce(p_players_eliminated, 0), 0);
  v_powers int := greatest(coalesce(p_power_cards_resolved, 0), 0);
  v_laststand int := case when p_last_stand_win then 1 else 0 end;
begin
  insert into public.player_progression (
    user_id, xp, games_played, wins, spins_survived, correct_bluff_calls,
    bluffs_defended, players_eliminated, power_cards_resolved, last_stand_wins, updated_at
  )
  values (
    p_user_id, v_amount, 1, v_win, v_spins, v_correct,
    v_defended, v_elims, v_powers, v_laststand, p_now
  )
  on conflict (user_id)
  do update
    set xp = public.player_progression.xp + v_amount,
        games_played = public.player_progression.games_played + 1,
        wins = public.player_progression.wins + v_win,
        spins_survived = public.player_progression.spins_survived + v_spins,
        correct_bluff_calls = public.player_progression.correct_bluff_calls + v_correct,
        bluffs_defended = public.player_progression.bluffs_defended + v_defended,
        players_eliminated = public.player_progression.players_eliminated + v_elims,
        power_cards_resolved = public.player_progression.power_cards_resolved + v_powers,
        last_stand_wins = public.player_progression.last_stand_wins + v_laststand,
        updated_at = excluded.updated_at
  returning * into updated_row;

  return updated_row;
end;
$$;

-- Server-only (service-role key). Same hardening as player_progression_add_xp:
-- anon + authenticated must be revoked explicitly or Supabase's default grants
-- leave /rest/v1/rpc/ open, letting any client mint its own XP/stats.
revoke execute on function public.player_progression_record_game(
  uuid, int, boolean, int, int, int, int, int, boolean, timestamptz
) from public, anon, authenticated;
