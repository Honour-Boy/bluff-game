-- UAT issue log — tester bug/feedback capture for the controlled user test.
-- Fully independent of game logic: the client writes here directly via the
-- browser Supabase session (no socket/engine coupling, no service-role key on
-- the client). RLS scopes everything to the reporter; admins read via the
-- service role (Supabase Studio). See docs/issue-log-feature.md.
--
-- Removal: drop this table (a `drop table if exists public.issue_reports;`
-- migration) — nothing in the game depends on it.

create table if not exists public.issue_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  username    text,
  category    text not null default 'bug',    -- 'bug' | 'confusing' | 'idea' | 'other'
  severity    text not null default 'normal', -- 'blocker' | 'normal' | 'minor'
  message     text not null check (char_length(message) between 1 and 4000),
  -- Auto-captured reproduction context: { screen, roomCode, phase, mode, appVersion, url }.
  context     jsonb not null default '{}'::jsonb,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.issue_reports enable row level security;

-- Testers (any signed-in user) may file reports as themselves, and read back
-- only their own. No broad SELECT policy — admin reads use the service role
-- (Studio), which bypasses RLS. Guests have no auth.uid() so they cannot
-- insert (sign-in-required, by design).
drop policy if exists ir_insert_own on public.issue_reports;
create policy ir_insert_own on public.issue_reports
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists ir_select_own on public.issue_reports;
create policy ir_select_own on public.issue_reports
  for select to authenticated
  using (auth.uid() = user_id);

-- Handy admin view of the latest reports (newest first). Owned by the
-- migration role; readable via service role / Studio only.
create or replace view public.issue_reports_recent as
  select id, created_at, category, severity, username, message, context, user_agent, user_id
  from public.issue_reports
  order by created_at desc;
