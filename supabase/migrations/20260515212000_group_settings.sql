create table public.group_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint group_settings_payload_version_check
    check (
      jsonb_typeof(payload) = 'object'
      and payload ? 'version'
      and jsonb_typeof(payload->'version') = 'number'
    )
);

create index group_settings_updated_idx
  on public.group_settings (updated_at desc);

alter table public.group_settings enable row level security;

create policy gs_select
  on public.group_settings
  for select
  using (
    exists (
      select 1
      from public.group_members gm
      where gm.group_id = group_settings.group_id
        and gm.user_id = auth.uid()
    )
  );

create policy gs_host_upsert
  on public.group_settings
  for all
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_settings.group_id
        and g.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.groups g
      where g.id = group_settings.group_id
        and g.host_user_id = auth.uid()
    )
  );
