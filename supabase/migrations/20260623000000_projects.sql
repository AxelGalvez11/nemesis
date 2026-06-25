-- 20260623 — Projects (workspaces). A project groups a user's chats + saved reports + evidence watches
-- into one named workspace. Owner-approved scope: "folders + shared reports/watches".
--
-- ADDITIVE + NON-DESTRUCTIVE: creates one table and adds NULLABLE project_id links to the three existing
-- owner-scoped tables (+ a backfilled `mode` column on saved_reports so the Reports list can group by
-- sub-type without reading each JSON payload). Nothing is dropped or altered destructively. Deleting a
-- project SETs NULL on its items (orphans them back to "no project") — it NEVER deletes a chat/report/watch.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Owner-only, same posture as conversations/evidence_watches/saved_reports.
drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists projects_user_idx on public.projects (user_id, created_at desc);

-- Nullable workspace links. ON DELETE SET NULL so a deleted project never cascades into user content.
alter table public.conversations   add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.evidence_watches add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.saved_reports    add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists conversations_project_idx   on public.conversations (project_id) where project_id is not null;
create index if not exists evidence_watches_project_idx on public.evidence_watches (project_id) where project_id is not null;
create index if not exists saved_reports_project_idx    on public.saved_reports (project_id) where project_id is not null;

-- Reports-by-kind: surface the report sub-type (Standard / Meta-analysis / Structured review / Lab draft)
-- as a queryable column, backfilled from the existing payload JSON. The research edge fn writes it going
-- forward. Default 'standard' so older/answer rows group sensibly.
alter table public.saved_reports add column if not exists mode text not null default 'standard';
update public.saved_reports
  set mode = coalesce(nullif(payload->>'mode', ''), 'standard')
  where mode = 'standard' and payload ? 'mode';
