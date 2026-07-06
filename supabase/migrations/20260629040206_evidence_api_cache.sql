-- PharmaOrb Evidence API broker cache + provenance ledger.
--
-- This is not a bulk PubMed ingest. It stores normalized paper metadata, legal
-- access decisions, source-call telemetry, and optional reusable full-text
-- chunks only when an adapter/license allows indexing.

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  doi text,
  pmid text,
  pmcid text,
  arxiv_id text,
  title text not null,
  abstract text,
  publication_year int check (
    publication_year is null
    or (publication_year >= 1800 and publication_year <= 2200)
  ),
  journal text,
  authors jsonb not null default '[]'::jsonb,
  publication_types jsonb not null default '[]'::jsonb,
  source_rank jsonb not null default '[]'::jsonb,
  source_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists papers_doi_uidx
  on public.papers (lower(doi))
  where doi is not null;
create unique index if not exists papers_pmid_uidx
  on public.papers (pmid)
  where pmid is not null;
create unique index if not exists papers_pmcid_uidx
  on public.papers (pmcid)
  where pmcid is not null;
create unique index if not exists papers_arxiv_uidx
  on public.papers (lower(arxiv_id))
  where arxiv_id is not null;
create index if not exists papers_title_trgm_idx
  on public.papers using gin (title extensions.gin_trgm_ops);
create index if not exists papers_publication_year_idx
  on public.papers (publication_year desc)
  where publication_year is not null;
create index if not exists papers_source_json_gin_idx
  on public.papers using gin (source_json);

create table if not exists public.paper_access (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  access_status text not null check (
    access_status in (
      'legal_full_text',
      'open_version',
      'preprint',
      'abstract_or_metadata_only',
      'metadata_only'
    )
  ),
  source text not null,
  full_text_url text,
  pdf_url text,
  license text,
  version text,
  can_index boolean not null default false,
  can_store_full_text boolean not null default false,
  can_show_snippets boolean not null default false,
  explanation text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists paper_access_paper_checked_idx
  on public.paper_access (paper_id, checked_at desc);
create index if not exists paper_access_source_idx
  on public.paper_access (source);
create unique index if not exists paper_access_dedupe_uidx
  on public.paper_access (
    paper_id,
    source,
    access_status,
    coalesce(full_text_url, ''),
    coalesce(pdf_url, ''),
    coalesce(license, '')
  );

create table if not exists public.source_calls (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  query text,
  request_hash text,
  status_code int,
  latency_ms int,
  cached boolean not null default false,
  result_count int,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_calls_source_created_idx
  on public.source_calls (source, created_at desc);
create index if not exists source_calls_request_hash_idx
  on public.source_calls (request_hash)
  where request_hash is not null;

create table if not exists public.legal_fulltext_chunks (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  section text,
  chunk_text text not null,
  chunk_index int not null check (chunk_index >= 0),
  embedding extensions.vector(1024),
  embedding_model text,
  source text not null,
  license text,
  source_url text,
  token_count int check (token_count is null or token_count >= 0),
  can_show_snippets boolean not null default false,
  created_at timestamptz not null default now(),
  unique (paper_id, source, chunk_index)
);

create index if not exists legal_fulltext_chunks_paper_idx
  on public.legal_fulltext_chunks (paper_id);
create index if not exists legal_fulltext_chunks_embedding_hnsw_idx
  on public.legal_fulltext_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

alter table public.papers enable row level security;
alter table public.paper_access enable row level security;
alter table public.source_calls enable row level security;
alter table public.legal_fulltext_chunks enable row level security;

drop policy if exists papers_read_authenticated on public.papers;
create policy papers_read_authenticated
  on public.papers
  for select
  to authenticated
  using (true);

drop policy if exists paper_access_read_authenticated on public.paper_access;
create policy paper_access_read_authenticated
  on public.paper_access
  for select
  to authenticated
  using (true);

-- No authenticated policies for source_calls or legal_fulltext_chunks yet:
-- source_calls may contain provider telemetry, and chunks may contain licensed
-- text. service_role bypasses RLS for broker/cache writes and future reviewed
-- snippet reads.

grant usage on schema public to authenticated, service_role;
grant select on table public.papers, public.paper_access to authenticated;
grant select, insert, update, delete on table
  public.papers,
  public.paper_access,
  public.source_calls,
  public.legal_fulltext_chunks
to service_role;

drop trigger if exists papers_updated_at_trigger on public.papers;
create trigger papers_updated_at_trigger
  before update on public.papers
  for each row execute function public.core_sources_set_updated_at();

comment on table public.papers is
  'Normalized paper metadata cache for the Evidence API broker. This is metadata/abstract provenance, not bulk full-text ingestion.';
comment on table public.paper_access is
  'Per-paper legal access resolution results: legal full text, open version, preprint, abstract-only, or metadata-only.';
comment on table public.source_calls is
  'Provider request telemetry and cache provenance for PubMed, Europe PMC, OpenAlex, Unpaywall, CORE, arXiv, and future adapters.';
comment on table public.legal_fulltext_chunks is
  'Optional reusable full-text chunks. Server-only until snippet display policies are explicitly added.';
comment on column public.paper_access.can_index is
  'True only when source/license permits indexing; false for abstract-only, metadata-only, unknown, paywalled, NC, or ND content.';
