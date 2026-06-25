-- Admin review surface for the UAT issue log.
-- The in-app /feedback dashboard reads + triages every report using the normal
-- anon key + the admin's own session — NO service-role key in the browser. RLS
-- itself enforces who can see all reports: a single policy keyed to the admin's
-- auth uid. Everyone else keeps insert-own / select-own only.
--
-- Admin = ourgptforschool@gmail.com (auth.users id below). To add reviewers,
-- extend these policies (or swap to an app_admins table) — for the controlled
-- test a single keyed uid is enough.

alter table public.issue_reports
  add column if not exists resolved boolean not null default false;

-- Admin can read EVERY report (permissive policies OR together with the
-- existing select-own, so the admin effectively sees all).
drop policy if exists ir_select_admin on public.issue_reports;
create policy ir_select_admin on public.issue_reports
  for select to authenticated
  using (auth.uid() = 'a7a8bc22-5855-4214-9965-4136d0c3172d'::uuid);

-- Admin can triage (toggle resolved). No one else may update.
drop policy if exists ir_update_admin on public.issue_reports;
create policy ir_update_admin on public.issue_reports
  for update to authenticated
  using (auth.uid() = 'a7a8bc22-5855-4214-9965-4136d0c3172d'::uuid)
  with check (auth.uid() = 'a7a8bc22-5855-4214-9965-4136d0c3172d'::uuid);

-- Refresh the admin convenience view to carry the resolved flag. Drop first —
-- create-or-replace can't reorder/insert columns of an existing view.
drop view if exists public.issue_reports_recent;
create view public.issue_reports_recent as
  select id, created_at, resolved, category, severity, username, message, context, user_agent, user_id
  from public.issue_reports
  order by created_at desc;
