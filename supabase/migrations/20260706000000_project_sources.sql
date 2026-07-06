-- 20260706 — Project sources (ChatGPT-Projects-style "give it more context"). ADDITIVE + NON-DESTRUCTIVE.
--
-- Adds a per-project source list — pasted text or small uploaded text files (.txt/.md/.csv, read
-- client-side) that the owner attaches to a workspace so every chat started in that project can draw
-- on them. Mirrors the existing `projects.instructions` pattern: content rides into the OUTGOING
-- question the frozen /ask fn sees (never the transcript), never a new engine surface. HONEST v1 —
-- no Storage bucket, no Google Drive / Slack (those stay disabled "Soon" tiles client-side); content
-- is plain text stored directly on the row. Owner-gated: this file is NOT applied by this change.

create table if not exists public.project_sources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('text', 'file')),
  name        text not null,
  content     text not null,
  bytes       int,
  created_at  timestamptz not null default now()
);

alter table public.project_sources enable row level security;

-- Owner-only, same posture as projects/conversations/evidence_watches/saved_reports: one policy covers
-- select/insert/update/delete since `for all` applies to every command.
drop policy if exists project_sources_owner on public.project_sources;
create policy project_sources_owner on public.project_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists project_sources_project_idx on public.project_sources (project_id, created_at desc);
