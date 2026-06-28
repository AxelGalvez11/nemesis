-- 20260628 — Discovery Engine graph tables.
--
-- Level 4 foundation: persist evidence-backed claims, the sources that support
-- or dispute them, research gaps, hypotheses, suggested study designs, and the
-- first Level 5 "living evidence" update ledger. This is intentionally additive:
-- the existing Ask/RAG path still writes generated_answers/saved_reports, while
-- discovery projects attach to saved reports and workspace projects when present.

alter table if exists public.research_report_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_project_id uuid references public.projects(id) on delete set null,
  saved_report_id uuid references public.saved_reports(id) on delete set null,
  research_report_run_id uuid references public.research_report_runs(id) on delete set null,
  title text not null,
  question text not null,
  topic text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  current_grade text not null default 'unknown'
    check (current_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  summary text,
  monitor_terms jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  client_claim_id text not null,
  claim_text text not null,
  normalized_claim text not null,
  verdict text not null default 'unknown'
    check (verdict in ('likely', 'unlikely', 'mixed', 'unknown')),
  confidence text not null default 'low'
    check (confidence in ('high', 'moderate', 'low', 'very_low')),
  evidence_grade text not null default 'unknown'
    check (evidence_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_claim_id)
);

create table if not exists public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  citation_tag text not null,
  source_id text not null,
  chunk_id text,
  source_chunk_id uuid references public.core_source_chunks(id) on delete set null,
  relation text not null default 'reviewed'
    check (relation in ('supports', 'partial', 'mentions', 'conflicts', 'reviewed')),
  evidence_weight numeric(5,2) not null default 0
    check (evidence_weight >= 0 and evidence_weight <= 100),
  support_quote text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (claim_id, citation_tag, source_id)
);

create table if not exists public.study_characteristics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  citation_tag text not null,
  source_id text not null,
  source_chunk_id uuid references public.core_source_chunks(id) on delete set null,
  title text not null,
  study_type text not null,
  population text,
  sample_size int check (sample_size is null or sample_size >= 0),
  intervention text,
  comparator text,
  duration text,
  outcomes jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, citation_tag)
);

create table if not exists public.evidence_ratings (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  evidence_grade text not null
    check (evidence_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  support_score int check (support_score is null or (support_score >= 0 and support_score <= 100)),
  certainty text check (certainty is null or certainty in ('high', 'moderate', 'low', 'very_low')),
  reason text,
  rating_inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  client_gap_id text not null,
  dimension text not null
    check (dimension in ('study_design', 'population', 'outcome', 'comparator', 'duration', 'safety', 'mechanism', 'replication', 'publication')),
  severity text not null
    check (severity in ('high', 'medium', 'low')),
  description text not null,
  rationale text not null,
  related_claim_ids uuid[] not null default '{}'::uuid[],
  source_tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_gap_id)
);

create table if not exists public.research_hypotheses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  gap_id uuid references public.research_gaps(id) on delete set null,
  client_hypothesis_id text not null,
  hypothesis text not null,
  why_plausible jsonb not null default '[]'::jsonb,
  evidence_basis jsonb not null default '[]'::jsonb,
  uncertainty text not null,
  priority text not null
    check (priority in ('high', 'medium', 'low')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_hypothesis_id)
);

create table if not exists public.study_designs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  hypothesis_id uuid references public.research_hypotheses(id) on delete set null,
  client_design_id text not null,
  design_type text not null
    check (design_type in (
      'randomized_controlled_trial',
      'crossover_trial',
      'dose_ranging_trial',
      'prospective_cohort',
      'retrospective_cohort',
      'pharmacovigilance_study',
      'mechanistic_lab_study',
      'individual_participant_meta_analysis'
    )),
  research_question text not null,
  hypothesis text not null,
  population text not null,
  intervention text not null,
  comparator text not null,
  primary_endpoint text not null,
  secondary_endpoints jsonb not null default '[]'::jsonb,
  duration text not null,
  sample_size_notes text not null,
  safety_monitoring jsonb not null default '[]'::jsonb,
  feasibility text not null
    check (feasibility in ('high', 'moderate', 'low')),
  ethics text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, client_design_id)
);

create table if not exists public.claim_versions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  version_no int not null check (version_no > 0),
  verdict text not null
    check (verdict in ('likely', 'unlikely', 'mixed', 'unknown')),
  confidence text not null
    check (confidence in ('high', 'moderate', 'low', 'very_low')),
  evidence_grade text not null
    check (evidence_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  support_score int check (support_score is null or (support_score >= 0 and support_score <= 100)),
  change_reason text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (claim_id, version_no)
);

create table if not exists public.evidence_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  claim_id uuid references public.research_claims(id) on delete set null,
  change_type text not null
    check (change_type in ('new_source', 'new_conflict', 'grade_change', 'verdict_change', 'trial_status_change')),
  summary text not null,
  old_grade text check (old_grade is null or old_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  new_grade text check (new_grade is null or new_grade in ('very_strong', 'strong', 'moderate', 'weak', 'very_weak', 'unknown', 'not_applicable')),
  source_id text,
  source_url text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists research_projects_saved_report_uidx
  on public.research_projects (saved_report_id)
  where saved_report_id is not null;
create index if not exists research_projects_user_updated_idx
  on public.research_projects (user_id, updated_at desc);
create index if not exists research_projects_workspace_idx
  on public.research_projects (workspace_project_id)
  where workspace_project_id is not null;
create index if not exists research_projects_run_idx
  on public.research_projects (research_report_run_id)
  where research_report_run_id is not null;

create index if not exists research_claims_project_idx
  on public.research_claims (project_id);
create index if not exists research_claims_normalized_idx
  on public.research_claims (project_id, normalized_claim);

create index if not exists claim_evidence_claim_idx
  on public.claim_evidence (claim_id);
create index if not exists claim_evidence_source_idx
  on public.claim_evidence (source_id);
create index if not exists claim_evidence_source_chunk_idx
  on public.claim_evidence (source_chunk_id)
  where source_chunk_id is not null;

create index if not exists study_characteristics_project_idx
  on public.study_characteristics (project_id);
create index if not exists study_characteristics_source_chunk_idx
  on public.study_characteristics (source_chunk_id)
  where source_chunk_id is not null;

create index if not exists evidence_ratings_claim_created_idx
  on public.evidence_ratings (claim_id, created_at desc);
create index if not exists research_gaps_project_idx
  on public.research_gaps (project_id);
create index if not exists research_hypotheses_project_idx
  on public.research_hypotheses (project_id);
create index if not exists research_hypotheses_gap_idx
  on public.research_hypotheses (gap_id)
  where gap_id is not null;
create index if not exists study_designs_project_idx
  on public.study_designs (project_id);
create index if not exists study_designs_hypothesis_idx
  on public.study_designs (hypothesis_id)
  where hypothesis_id is not null;
create index if not exists claim_versions_claim_version_idx
  on public.claim_versions (claim_id, version_no desc);
create index if not exists evidence_updates_project_status_idx
  on public.evidence_updates (project_id, review_status, created_at desc);
create index if not exists evidence_updates_claim_idx
  on public.evidence_updates (claim_id)
  where claim_id is not null;

alter table public.research_projects enable row level security;
alter table public.research_claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.study_characteristics enable row level security;
alter table public.evidence_ratings enable row level security;
alter table public.research_gaps enable row level security;
alter table public.research_hypotheses enable row level security;
alter table public.study_designs enable row level security;
alter table public.claim_versions enable row level security;
alter table public.evidence_updates enable row level security;

drop policy if exists research_projects_owner on public.research_projects;
create policy research_projects_owner on public.research_projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists research_claims_owner_read on public.research_claims;
create policy research_claims_owner_read on public.research_claims
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists claim_evidence_owner_read on public.claim_evidence;
create policy claim_evidence_owner_read on public.claim_evidence
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_claims c
      join public.research_projects p on p.id = c.project_id
      where c.id = claim_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists study_characteristics_owner_read on public.study_characteristics;
create policy study_characteristics_owner_read on public.study_characteristics
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists evidence_ratings_owner_read on public.evidence_ratings;
create policy evidence_ratings_owner_read on public.evidence_ratings
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_claims c
      join public.research_projects p on p.id = c.project_id
      where c.id = claim_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists research_gaps_owner_read on public.research_gaps;
create policy research_gaps_owner_read on public.research_gaps
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists research_hypotheses_owner_read on public.research_hypotheses;
create policy research_hypotheses_owner_read on public.research_hypotheses
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists study_designs_owner_read on public.study_designs;
create policy study_designs_owner_read on public.study_designs
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists claim_versions_owner_read on public.claim_versions;
create policy claim_versions_owner_read on public.claim_versions
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_claims c
      join public.research_projects p on p.id = c.project_id
      where c.id = claim_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists evidence_updates_owner_read on public.evidence_updates;
create policy evidence_updates_owner_read on public.evidence_updates
  for select to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists evidence_updates_owner_review on public.evidence_updates;
create policy evidence_updates_owner_review on public.evidence_updates
  for update to authenticated
  using (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.research_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.research_projects to authenticated;
grant select on table
  public.research_claims,
  public.claim_evidence,
  public.study_characteristics,
  public.evidence_ratings,
  public.research_gaps,
  public.research_hypotheses,
  public.study_designs,
  public.claim_versions,
  public.evidence_updates
to authenticated;
grant update (review_status, reviewed_at) on table public.evidence_updates to authenticated;
grant select, insert, update, delete on table
  public.research_projects,
  public.research_claims,
  public.claim_evidence,
  public.study_characteristics,
  public.evidence_ratings,
  public.research_gaps,
  public.research_hypotheses,
  public.study_designs,
  public.claim_versions,
  public.evidence_updates
to service_role;

drop trigger if exists research_projects_updated_at_trigger on public.research_projects;
create trigger research_projects_updated_at_trigger
  before update on public.research_projects
  for each row execute function public.core_sources_set_updated_at();

drop trigger if exists research_claims_updated_at_trigger on public.research_claims;
create trigger research_claims_updated_at_trigger
  before update on public.research_claims
  for each row execute function public.core_sources_set_updated_at();

drop trigger if exists research_gaps_updated_at_trigger on public.research_gaps;
create trigger research_gaps_updated_at_trigger
  before update on public.research_gaps
  for each row execute function public.core_sources_set_updated_at();

drop trigger if exists research_hypotheses_updated_at_trigger on public.research_hypotheses;
create trigger research_hypotheses_updated_at_trigger
  before update on public.research_hypotheses
  for each row execute function public.core_sources_set_updated_at();

drop trigger if exists study_designs_updated_at_trigger on public.study_designs;
create trigger study_designs_updated_at_trigger
  before update on public.study_designs
  for each row execute function public.core_sources_set_updated_at();

comment on table public.research_projects is
  'User-owned Level 4 discovery projects generated from evidence reports. Stores the current evidence meter and links to saved reports/workspaces.';
comment on table public.research_claims is
  'Structured claim cards extracted from a discovery report. Child writes are server-side; users read through owning research_projects.';
comment on table public.claim_evidence is
  'Per-claim source links with support/conflict/mention relation and support quote when available.';
comment on table public.research_gaps is
  'Research gaps detected from current evidence: missing populations, outcomes, comparators, duration, safety, mechanism, replication, or publication.';
comment on table public.research_hypotheses is
  'Hypothesis suggestions derived from research gaps and existing evidence.';
comment on table public.study_designs is
  'Suggested next-study designs for Level 4 discovery reports.';
comment on table public.evidence_updates is
  'Level 5 update ledger: new evidence, contradictions, trial status changes, and claim/evidence-meter changes awaiting review.';
comment on column public.research_report_runs.metadata is
  'Optional report-mode metadata such as persisted discovery_project_id and export/deliverable links.';
