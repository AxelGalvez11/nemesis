-- Cache for third-party source enrichment (OpenAlex retraction/cited-by, scite tallies,
-- study snapshot). Keyed by pmid:<n> or doi:<doi>; payload = SourceEnrichment JSON.
-- Service-role writes only (the enrich-source function); clients read via the function,
-- never directly — so RLS denies all direct access.
create table if not exists public.source_enrichment (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.source_enrichment enable row level security;
-- no policies on purpose: only service_role (bypasses RLS) touches this table.
