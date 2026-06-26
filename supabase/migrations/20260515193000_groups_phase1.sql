create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) = 6),
  name text not null check (char_length(name) between 1 and 64),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists groups_code_active_unique_idx
  on public.groups (code)
  where deleted_at is null;

create index if not exists groups_host_idx
  on public.groups (host_user_id)
  where deleted_at is null;

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('host', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx
  on public.group_members (user_id);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint group_invites_group_invitee_status_unique
    unique (group_id, invitee_user_id, status)
    deferrable initially deferred
);

create index if not exists group_invites_invitee_pending_idx
  on public.group_invites (invitee_user_id)
  where status = 'pending';

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
        and g.deleted_at is null
    )
  );

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert
  with check (host_user_id = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update
  using (host_user_id = auth.uid())
  with check (true);

drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members
  for select
  using (
    exists (
      select 1
      from public.group_members me
      join public.groups g on g.id = me.group_id
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and g.deleted_at is null
    )
  );

drop policy if exists gm_host_insert on public.group_members;
create policy gm_host_insert on public.group_members
  for insert
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.host_user_id = auth.uid()
        and g.deleted_at is null
    )
  );

drop policy if exists gm_host_update on public.group_members;
create policy gm_host_update on public.group_members
  for update
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.host_user_id = auth.uid()
        and g.deleted_at is null
    )
  )
  with check (true);

drop policy if exists gm_host_delete on public.group_members;
create policy gm_host_delete on public.group_members
  for delete
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.host_user_id = auth.uid()
        and g.deleted_at is null
    )
  );

drop policy if exists gi_select on public.group_invites;
create policy gi_select on public.group_invites
  for select
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_invites.group_id
        and g.deleted_at is null
        and (
          g.host_user_id = auth.uid()
          or group_invites.invitee_user_id = auth.uid()
        )
    )
  );

drop policy if exists gi_host_insert on public.group_invites;
create policy gi_host_insert on public.group_invites
  for insert
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_invites.group_id
        and g.host_user_id = auth.uid()
        and g.deleted_at is null
    )
  );

drop policy if exists gi_update on public.group_invites;
create policy gi_update on public.group_invites
  for update
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_invites.group_id
        and g.deleted_at is null
        and (
          g.host_user_id = auth.uid()
          or group_invites.invitee_user_id = auth.uid()
        )
    )
  )
  with check (true);
