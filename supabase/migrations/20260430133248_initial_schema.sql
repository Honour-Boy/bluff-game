-- ============================================================
-- Initial schema — baseline for the Bluff Game Supabase project.
--
-- Reconstructed from the live database state on 2026-05-01.
-- Mirrors the migration originally tracked as 20260430133248.
-- Re-running against a fresh database produces an equivalent state.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (length(username) >= 4 and length(username) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_all on public.profiles
  for select using (true);

create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- ─── rooms (provisioned for future persistence; unused today) ─
create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique check (length(code) = 6),
  host_id uuid references public.profiles(id) on delete set null,
  mode text not null check (mode in ('physical', 'online')),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'playing', 'round_end', 'spin_pending', 'bluff_resolution', 'game_over')),
  round_number int not null default 1,
  current_card_type text,
  current_turn_index int not null default 0,
  is_first_turn boolean not null default true,
  card_played_this_turn boolean not null default false,
  bluff_used_this_turn boolean not null default false,
  spin_target_id uuid,
  last_action jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy rooms_select_all on public.rooms
  for select using (true);

create policy rooms_insert_auth on public.rooms
  for insert with check (auth.role() = 'authenticated');

create policy rooms_update_host on public.rooms
  for update using (auth.uid() = host_id or host_id is null);

-- ─── room_players ────────────────────────────────────────────
create table if not exists public.room_players (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  socket_id text,
  seat_order int not null default 0,
  status text not null default 'alive' check (status in ('alive', 'eliminated')),
  chamber jsonb not null default '[null, null, null, null, null, null]'::jsonb,
  risk_level int not null default 1,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, player_id)
);

alter table public.room_players enable row level security;

create policy rp_select_all on public.room_players
  for select using (true);

create policy rp_insert_own on public.room_players
  for insert with check (auth.uid() = player_id);

create policy rp_update_own_or_host on public.room_players
  for update using (
    auth.uid() = player_id
    or exists (
      select 1 from public.rooms r
      where r.id = room_players.room_id and r.host_id = auth.uid()
    )
  );

-- ─── auth.users → profiles trigger ────────────────────────────
-- Auto-creates a profile row whenever a new auth user appears.
-- Coalesces username from: email/password signup metadata,
-- Google OAuth full_name, then email prefix as a fallback.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',   -- email/password signup
      new.raw_user_meta_data->>'full_name',  -- Google OAuth
      split_part(new.email, '@', 1)          -- fallback: email prefix
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
