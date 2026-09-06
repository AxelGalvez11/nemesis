-- Support reports sent from the in-app "Report a problem" dialog.
-- Each row carries the context a learner would otherwise have to type out by hand:
-- who they are, the page they were on, the last error the browser saw, the canvas id.
-- Learners can only add rows. Nobody reads them through the API; the service role does.

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  message text not null,
  path text,
  user_agent text,
  last_error text,
  canvas_id text,
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.support_reports enable row level security;

drop policy if exists "support_reports_insert_own" on public.support_reports;
create policy "support_reports_insert_own"
  on public.support_reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- No select policy on purpose: a learner never needs to read reports back.
