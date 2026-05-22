-- Issue #145 — temporary stand-in host.
-- `host_user_id` is the CURRENT acting host (unchanged meaning, still used by
-- every host check + room-control path). `owner_user_id` is the PERMANENT
-- owner. "Make Host" now appoints a temporary stand-in (sets host_user_id but
-- leaves owner_user_id), and host reverts to the owner when the stand-in hands
-- back, leaves, or the owner reclaims it.

alter table public.groups
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- Backfill existing groups: the current host is also the original owner.
update public.groups
  set owner_user_id = host_user_id
  where owner_user_id is null;

alter table public.groups
  alter column owner_user_id set not null;

create index if not exists groups_owner_idx
  on public.groups (owner_user_id)
  where deleted_at is null;
