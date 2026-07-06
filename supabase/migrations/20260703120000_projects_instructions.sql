-- 20260703 — Project instructions + updated_at bump. ADDITIVE + NON-DESTRUCTIVE.
--
-- Adds a per-project `instructions` field (ChatGPT-Projects-style custom context the user sets for how
-- PharmaOrb should approach questions in that workspace) and an updated_at bump trigger so editing a
-- project's name/description/instructions advances its updated_at (the base 20260623 table has the column
-- but no trigger). Reuses the shared core_sources_set_updated_at() trigger function that conversations,
-- core_sources, etc. already use, so behavior is identical across tables.

alter table public.projects add column if not exists instructions text;

-- Idempotent: drop-then-create so a re-run doesn't error on an existing trigger.
drop trigger if exists projects_updated_at_trigger on public.projects;
create trigger projects_updated_at_trigger
  before update on public.projects
  for each row execute function core_sources_set_updated_at();
