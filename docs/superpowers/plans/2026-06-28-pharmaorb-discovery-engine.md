# PharmaOrb Discovery Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Level 4 MVP: PharmaOrb turns a health research question into a persisted living research project with claim cards, evidence ratings, gap analysis, hypotheses, suggested study designs, exports, and a clear path to Level 5 monitoring updates.

**Architecture:** Do not rebuild the RAG stack. Reuse the existing `/research` engine, citations, source support, saved reports, projects, and watch substrate, then add the missing persistent claim/project layer that every answer, report, graph, and monitor can render from. Level 4 ships first as a "Discovery Report"; Level 5 adds monitored claim versions and proposed evidence updates after the claim model exists.

**Tech Stack:** Supabase Edge Functions on Deno/TypeScript, Supabase Postgres/RLS, existing `core_sources` and `core_source_chunks`, existing `research_report_runs` and `saved_reports`, shared DTOs in `packages/shared`, Next.js web app in `apps/web`, Voyage/rerank and the configured OpenAI-compatible LLM slots already used by `/ask` and `/research`.

---

## Scope

This plan intentionally implements the first serious MVP wedge, not the full mature app.

Build now:

- Discovery Report mode for Pro/Deep Research: evidence summary, claim cards, evidence meter, research gaps, hypotheses, suggested next study, and exportable report/deck.
- Persisted research projects and claims, so reports are not one-off JSON blobs.
- Evidence-to-claim links, so the evidence panel and map can show which sources support, partially support, mention, or conflict with a claim.
- A first Level 5 hook: monitoring can create proposed `evidence_updates`, but it does not silently rewrite conclusions.

Do not build now:

- Full PRISMA systematic review workflow.
- Full GRADE appraisal claims.
- Neo4j or a separate graph database.
- Public API/MCP/CLI.
- Team workspaces.
- Automatic conclusion rewriting without user review.

Honesty rules:

- Use "GRADE-inspired evidence meter," not "GRADE rating," unless a formal GRADE workflow is implemented.
- Use "structured evidence review" or "discovery report," not "systematic review," unless a real systematic-review protocol, screening, dedupe, and risk-of-bias workflow exists.
- Every clinical claim in generated prose must cite sources already in the report.
- Store unsupported or unverifiable extraction attempts for review instead of displaying them as claims.

## Existing Code This Builds On

- `supabase/functions/research/index.ts`: async Pro-gated deep research endpoint.
- `supabase/functions/ask/research/orchestrate.ts`: multi-step research engine with planning, retrieval, synthesis, safety scan, citation enforcement, gaps, and export-ready report payloads.
- `packages/shared/src/research.ts`: `ResearchReport`, `GapStatement`, `RetrievalCounts`, `SearchMethod`, and report modes.
- `packages/shared/src/answer.ts`: `Citation`, `AnswerPoint`, `ClaimSupport`, `claim_relation`, source support, and evidence metadata.
- `packages/shared/src/evidence-scoring.ts`: deterministic evidence tiering.
- `packages/shared/src/claim-relation.ts`: `supports | partial | mentions | conflicts | reviewed`.
- `supabase/migrations/20260617000000_live_monitoring_watches.sql`: `evidence_watches`, `watch_known_sources`, and `watch_events`.
- `supabase/migrations/20260623000000_projects.sql`: user-owned projects linking chats, saved reports, and watches.
- `apps/web/components/EvidencePanel.tsx`: ranked source panel and citation highlighting.
- `apps/web/lib/export/docx.ts`, `apps/web/lib/export/pptx.ts`, `apps/web/lib/export/pdf.ts`: export surfaces.

## File Structure

- Create `packages/shared/src/discovery.ts`: shared DTOs for discovery projects, claims, evidence links, gaps, hypotheses, study designs, and updates.
- Create `packages/shared/src/discovery.test.ts`: pure type and helper tests.
- Modify `packages/shared/src/research.ts`: add `ReportMode = "discovery"` and optional `discovery?: DiscoveryReport`.
- Modify `packages/shared/src/index.ts`: export discovery DTOs.
- Create a Supabase migration with `supabase migration new discovery_claims`: tables for research projects, claims, claim evidence, study characteristics, evidence ratings, gaps, hypotheses, study designs, claim versions, and evidence updates.
- Create `supabase/functions/ask/research/discovery/extract.ts`: deterministic extraction from a finished `ResearchReport` into source cards, initial claim candidates, study characteristics, and gap inputs.
- Create `supabase/functions/ask/research/discovery/extract.test.ts`: pure tests for extraction and source mapping.
- Create `supabase/functions/ask/research/discovery/grade.ts`: deterministic claim conclusion and evidence meter helpers.
- Create `supabase/functions/ask/research/discovery/grade.test.ts`: pure tests for verdict and evidence-meter behavior.
- Create `supabase/functions/ask/research/discovery/design.ts`: deterministic study-design scaffolds from gap and hypothesis objects.
- Create `supabase/functions/ask/research/discovery/design.test.ts`: pure tests for suggested study design selection.
- Create `supabase/functions/ask/research/discovery/synthesize.ts`: LLM JSON synthesis for claims, gaps, hypotheses, and study design, with strict sanitizer.
- Create `supabase/functions/ask/research/discovery/synthesize.test.ts`: sanitizer tests with invalid JSON and unsupported claims.
- Create `supabase/functions/ask/research/discovery/persist.ts`: service-role persistence for discovery projects after a report completes.
- Create `supabase/functions/ask/research/discovery/persist.test.ts`: request-shape tests using a fake fetch.
- Modify `supabase/functions/ask/research/orchestrate.ts`: produce `report.discovery` when `mode === "discovery"`.
- Modify `supabase/functions/research/index.ts`: accept `mode: "discovery"` and persist the discovery project after `saved_reports`.
- Modify `apps/web/app/app/ask/page.tsx`: expose Discovery Report as a Pro/deep research deliverable mode.
- Modify `apps/web/app/app/reports/page.tsx`: group discovery reports.
- Modify `apps/web/app/app/reports/[id]/page.tsx`: render discovery sections when `payload.discovery` exists.
- Modify `apps/web/components/EvidencePanel.tsx`: add a "Claims" or "Map" view backed by `DiscoveryReport.claims` before persisted graph work.
- Modify export files in `apps/web/lib/export/*`: include claim cards, gaps, hypotheses, and study-design sections.
- Create `scripts/diag/discovery-report-smoke.ts`: local/deployed smoke test for a Discovery Report run.
- Update `docs/EVIDENCE_OS_ROADMAP.md`: mark Level 4 Discovery Report as the next keystone.

## Task 1: Shared Discovery Contract

**Files:**

- Create: `packages/shared/src/discovery.ts`
- Create: `packages/shared/src/discovery.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/research.ts`

- [ ] **Step 1: Write the shared contract test**

Create `packages/shared/src/discovery.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimEvidenceCounts,
  discoveryTitle,
  normalizeDiscoveryClaim,
  type DiscoveryClaim,
  type DiscoveryReport,
  type SuggestedStudyDesign,
} from "./discovery.ts";

Deno.test("normalizeDiscoveryClaim is stable enough for dedupe", () => {
  assertEquals(
    normalizeDiscoveryClaim("  Creatine MAY improve cognition during sleep deprivation. "),
    "creatine may improve cognition during sleep deprivation",
  );
});

Deno.test("claimEvidenceCounts partitions relation directions", () => {
  const claim: DiscoveryClaim = {
    id: "claim-1",
    claim_text: "Creatine may support cognition under sleep deprivation.",
    normalized_claim: "creatine may support cognition under sleep deprivation",
    verdict: "likely",
    confidence: "low",
    evidence_grade: "weak",
    evidence: [
      { citation_tag: "1", source_id: "pubmed:1", relation: "supports", evidence_weight: 80 },
      { citation_tag: "2", source_id: "pubmed:2", relation: "partial", evidence_weight: 65 },
      { citation_tag: "3", source_id: "pubmed:3", relation: "conflicts", evidence_weight: 70 },
    ],
  };
  assertEquals(claimEvidenceCounts(claim), {
    supports: 1,
    partial: 1,
    mentions: 0,
    conflicts: 1,
    reviewed: 0,
  });
});

Deno.test("DiscoveryReport and SuggestedStudyDesign carry Level 4 output", () => {
  const design: SuggestedStudyDesign = {
    id: "design-1",
    design_type: "randomized_controlled_trial",
    research_question: "Does creatine preserve executive function during acute sleep deprivation?",
    hypothesis: "Creatine supplementation may preserve executive function during acute sleep deprivation by supporting brain energy metabolism.",
    population: "Adults exposed to sleep restriction.",
    intervention: "Creatine monohydrate supplementation.",
    comparator: "Placebo.",
    primary_endpoint: "Executive-function score after sleep restriction.",
    secondary_endpoints: ["Reaction time", "Working memory", "Adverse events"],
    duration: "Acute loading phase plus sleep-restriction challenge.",
    sample_size_notes: "Estimate after selecting the cognitive endpoint and minimum important difference.",
    safety_monitoring: ["GI tolerance", "Renal history screening"],
    feasibility: "moderate",
    ethics: "Sleep restriction should be time-limited and monitored.",
  };

  const report: DiscoveryReport = {
    project_title: discoveryTitle("Create a discovery report on creatine for cognition"),
    question: "Create a discovery report on creatine for cognition",
    summary: "Evidence is suggestive but limited.",
    evidence_meter: "weak",
    claims: [],
    study_characteristics: [],
    research_gaps: [],
    hypotheses: [],
    study_designs: [design],
    monitor_terms: ["creatine", "sleep deprivation", "cognition"],
    generated_at: "2026-06-28T00:00:00.000Z",
  };

  assertEquals(report.study_designs[0].design_type, "randomized_controlled_trial");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test packages/shared/src/discovery.test.ts
```

Expected: FAIL because `packages/shared/src/discovery.ts` does not exist.

- [ ] **Step 3: Add the shared discovery DTOs and helpers**

Create `packages/shared/src/discovery.ts`:

```ts
import type { Citation, EvidenceGrade } from "./answer.ts";
import type { ClaimRelation } from "./claim-relation.ts";

export type ClaimVerdict = "likely" | "unlikely" | "mixed" | "unknown";
export type ClaimConfidence = "high" | "moderate" | "low" | "very_low";
export type DiscoveryGapDimension =
  | "study_design"
  | "population"
  | "outcome"
  | "comparator"
  | "duration"
  | "safety"
  | "mechanism"
  | "replication"
  | "publication";
export type DiscoveryGapSeverity = "high" | "medium" | "low";
export type StudyDesignType =
  | "randomized_controlled_trial"
  | "crossover_trial"
  | "dose_ranging_trial"
  | "prospective_cohort"
  | "retrospective_cohort"
  | "pharmacovigilance_study"
  | "mechanistic_lab_study"
  | "individual_participant_meta_analysis";

export interface DiscoveryEvidenceLink {
  citation_tag: string;
  source_id: string;
  relation: ClaimRelation;
  evidence_weight: number;
  support_quote?: string;
}

export interface DiscoveryClaim {
  id: string;
  claim_text: string;
  normalized_claim: string;
  verdict: ClaimVerdict;
  confidence: ClaimConfidence;
  evidence_grade: EvidenceGrade;
  evidence: DiscoveryEvidenceLink[];
  rationale?: string;
}

export interface StudyCharacteristic {
  citation_tag: string;
  source_id: string;
  title: string;
  study_type: string;
  population?: string;
  sample_size?: number;
  intervention?: string;
  comparator?: string;
  duration?: string;
  outcomes: string[];
  limitations: string[];
}

export interface ResearchGap {
  id: string;
  dimension: DiscoveryGapDimension;
  severity: DiscoveryGapSeverity;
  description: string;
  rationale: string;
  related_claim_ids: string[];
  source_tags: string[];
}

export interface ResearchHypothesis {
  id: string;
  gap_id?: string;
  hypothesis: string;
  why_plausible: string[];
  evidence_basis: string[];
  uncertainty: string;
  priority: DiscoveryGapSeverity;
}

export interface SuggestedStudyDesign {
  id: string;
  design_type: StudyDesignType;
  research_question: string;
  hypothesis: string;
  population: string;
  intervention: string;
  comparator: string;
  primary_endpoint: string;
  secondary_endpoints: string[];
  duration: string;
  sample_size_notes: string;
  safety_monitoring: string[];
  feasibility: "high" | "moderate" | "low";
  ethics: string;
}

export interface DiscoveryReport {
  project_title: string;
  question: string;
  summary: string;
  evidence_meter: EvidenceGrade;
  claims: DiscoveryClaim[];
  study_characteristics: StudyCharacteristic[];
  research_gaps: ResearchGap[];
  hypotheses: ResearchHypothesis[];
  study_designs: SuggestedStudyDesign[];
  monitor_terms: string[];
  generated_at: string;
}

export interface DiscoveryProjectSummary {
  id: string;
  title: string;
  question: string;
  saved_report_id: string | null;
  current_grade: EvidenceGrade;
  claim_count: number;
  gap_count: number;
  updated_at: string;
}

export interface EvidenceUpdateSummary {
  id: string;
  project_id: string;
  claim_id: string | null;
  change_type: "new_source" | "new_conflict" | "grade_change" | "verdict_change" | "trial_status_change";
  summary: string;
  review_status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function normalizeDiscoveryClaim(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!]+$/g, "");
}

export function discoveryTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, " ");
  return cleaned.length <= 90 ? cleaned : `${cleaned.slice(0, 87)}...`;
}

export function claimEvidenceCounts(claim: DiscoveryClaim): Record<ClaimRelation, number> {
  const counts: Record<ClaimRelation, number> = {
    supports: 0,
    partial: 0,
    mentions: 0,
    conflicts: 0,
    reviewed: 0,
  };
  for (const item of claim.evidence) counts[item.relation] += 1;
  return counts;
}

export function citationToEvidenceLink(c: Citation): DiscoveryEvidenceLink {
  return {
    citation_tag: c.chunk_tag,
    source_id: c.source_id,
    relation: c.claim_relation ?? "reviewed",
    evidence_weight: typeof c.evidence_weight === "number" ? c.evidence_weight : c.support_score ?? 0,
    support_quote: undefined,
  };
}
```

- [ ] **Step 4: Export the DTOs**

Modify `packages/shared/src/index.ts`:

```ts
export * from "./discovery.ts";
```

Modify `packages/shared/src/research.ts`:

```ts
import type { DiscoveryReport } from "./discovery.ts";

export interface ResearchReport {
  // keep existing fields
  discovery?: DiscoveryReport;
}

export type ReportMode = "standard" | "structured_review" | "meta" | "lab_draft" | "discovery";
```

Preserve the existing fields and comments while adding only the new optional property and union member.

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno test packages/shared/src/discovery.test.ts packages/shared/src/research-contract.test.ts
pnpm --filter @pharmaorb/web typecheck
```

Expected: PASS.

Commit:

```bash
git add packages/shared/src/discovery.ts packages/shared/src/discovery.test.ts packages/shared/src/index.ts packages/shared/src/research.ts
git commit -m "feat(discovery): add shared discovery report contract"
```

## Task 2: Discovery Schema

**Files:**

- Create with CLI: run `supabase migration new discovery_claims`, then edit the exact migration file printed by the CLI.
- Test: `scripts/diag/discovery-schema-check.ts`

Important: Do not manually invent a Supabase migration filename. The exact migration path must be produced by the CLI.

- [ ] **Step 1: Check Supabase CLI help and create the migration**

Run:

```bash
supabase migration --help
supabase migration new discovery_claims
```

Expected: the second command prints a new migration path under `supabase/migrations/`.

- [ ] **Step 2: Paste the schema into the generated migration**

Use the exact path from Step 1. The SQL should be:

```sql
create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  saved_report_id uuid references public.saved_reports(id) on delete set null,
  title text not null,
  question text not null,
  status text not null default 'active' check (status in ('active','archived')),
  current_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  claim_text text not null,
  normalized_claim text not null,
  verdict text not null check (verdict in ('likely','unlikely','mixed','unknown')),
  confidence text not null check (confidence in ('high','moderate','low','very_low')),
  evidence_grade text not null check (evidence_grade in ('very_strong','strong','moderate','weak','very_weak','unknown','not_applicable')),
  current_version int not null default 1,
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, normalized_claim)
);

create table if not exists public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  source_id text not null,
  source_type text,
  citation_tag text not null,
  relation text not null check (relation in ('supports','partial','mentions','conflicts','reviewed')),
  evidence_weight int not null default 0 check (evidence_weight >= 0 and evidence_weight <= 100),
  support_quote text,
  population text,
  outcome text,
  study_type text,
  created_at timestamptz not null default now(),
  unique (claim_id, source_id, citation_tag, relation)
);

create table if not exists public.study_characteristics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  source_id text not null,
  citation_tag text not null,
  title text not null,
  study_type text not null,
  population text,
  sample_size int check (sample_size is null or sample_size >= 0),
  intervention text,
  comparator text,
  duration text,
  outcomes jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, source_id, citation_tag)
);

create table if not exists public.evidence_ratings (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  evidence_grade text not null check (evidence_grade in ('very_strong','strong','moderate','weak','very_weak','unknown','not_applicable')),
  confidence text not null check (confidence in ('high','moderate','low','very_low')),
  verdict text not null check (verdict in ('likely','unlikely','mixed','unknown')),
  reason text not null,
  counts jsonb not null default '{}'::jsonb,
  created_by text not null default 'research_run' check (created_by in ('research_run','monitor','manual')),
  created_at timestamptz not null default now()
);

create table if not exists public.research_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  claim_id uuid references public.research_claims(id) on delete set null,
  dimension text not null check (dimension in ('study_design','population','outcome','comparator','duration','safety','mechanism','replication','publication')),
  severity text not null check (severity in ('high','medium','low')),
  description text not null,
  rationale text not null,
  source_tags jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','addressed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_hypotheses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  gap_id uuid references public.research_gaps(id) on delete set null,
  hypothesis text not null,
  why_plausible jsonb not null default '[]'::jsonb,
  evidence_basis jsonb not null default '[]'::jsonb,
  uncertainty text not null,
  priority text not null check (priority in ('high','medium','low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_designs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  hypothesis_id uuid references public.research_hypotheses(id) on delete set null,
  design_type text not null check (design_type in ('randomized_controlled_trial','crossover_trial','dose_ranging_trial','prospective_cohort','retrospective_cohort','pharmacovigilance_study','mechanistic_lab_study','individual_participant_meta_analysis')),
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
  feasibility text not null check (feasibility in ('high','moderate','low')),
  ethics text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.claim_versions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  version_number int not null,
  verdict text not null check (verdict in ('likely','unlikely','mixed','unknown')),
  evidence_grade text not null check (evidence_grade in ('very_strong','strong','moderate','weak','very_weak','unknown','not_applicable')),
  confidence text not null check (confidence in ('high','moderate','low','very_low')),
  reason_for_change text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (claim_id, version_number)
);

create table if not exists public.evidence_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  claim_id uuid references public.research_claims(id) on delete set null,
  watch_event_id uuid references public.watch_events(id) on delete set null,
  change_type text not null check (change_type in ('new_source','new_conflict','grade_change','verdict_change','trial_status_change')),
  old_grade text,
  new_grade text,
  old_verdict text,
  new_verdict text,
  summary text not null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists research_projects_user_updated_idx on public.research_projects(user_id, updated_at desc);
create index if not exists research_projects_saved_report_idx on public.research_projects(saved_report_id) where saved_report_id is not null;
create index if not exists research_claims_project_idx on public.research_claims(project_id, created_at);
create index if not exists claim_evidence_claim_idx on public.claim_evidence(claim_id, relation);
create index if not exists claim_evidence_source_idx on public.claim_evidence(source_id);
create index if not exists study_characteristics_project_idx on public.study_characteristics(project_id, citation_tag);
create index if not exists evidence_ratings_claim_created_idx on public.evidence_ratings(claim_id, created_at desc);
create index if not exists research_gaps_project_idx on public.research_gaps(project_id, severity);
create index if not exists research_hypotheses_project_idx on public.research_hypotheses(project_id, priority);
create index if not exists study_designs_project_idx on public.study_designs(project_id, design_type);
create index if not exists claim_versions_claim_version_idx on public.claim_versions(claim_id, version_number desc);
create index if not exists evidence_updates_project_status_idx on public.evidence_updates(project_id, review_status, created_at desc);

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
  using (exists (
    select 1 from public.research_projects p
    where p.id = research_claims.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists claim_evidence_owner_read on public.claim_evidence;
create policy claim_evidence_owner_read on public.claim_evidence
  for select to authenticated
  using (exists (
    select 1
    from public.research_claims c
    join public.research_projects p on p.id = c.project_id
    where c.id = claim_evidence.claim_id and p.user_id = (select auth.uid())
  ));

drop policy if exists study_characteristics_owner_read on public.study_characteristics;
create policy study_characteristics_owner_read on public.study_characteristics
  for select to authenticated
  using (exists (
    select 1 from public.research_projects p
    where p.id = study_characteristics.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists evidence_ratings_owner_read on public.evidence_ratings;
create policy evidence_ratings_owner_read on public.evidence_ratings
  for select to authenticated
  using (exists (
    select 1
    from public.research_claims c
    join public.research_projects p on p.id = c.project_id
    where c.id = evidence_ratings.claim_id and p.user_id = (select auth.uid())
  ));

drop policy if exists research_gaps_owner_read on public.research_gaps;
create policy research_gaps_owner_read on public.research_gaps
  for select to authenticated
  using (exists (
    select 1 from public.research_projects p
    where p.id = research_gaps.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists research_hypotheses_owner_read on public.research_hypotheses;
create policy research_hypotheses_owner_read on public.research_hypotheses
  for select to authenticated
  using (exists (
    select 1 from public.research_projects p
    where p.id = research_hypotheses.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists study_designs_owner_read on public.study_designs;
create policy study_designs_owner_read on public.study_designs
  for select to authenticated
  using (exists (
    select 1 from public.research_projects p
    where p.id = study_designs.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists claim_versions_owner_read on public.claim_versions;
create policy claim_versions_owner_read on public.claim_versions
  for select to authenticated
  using (exists (
    select 1
    from public.research_claims c
    join public.research_projects p on p.id = c.project_id
    where c.id = claim_versions.claim_id and p.user_id = (select auth.uid())
  ));

drop policy if exists evidence_updates_owner_read on public.evidence_updates;
create policy evidence_updates_owner_read on public.evidence_updates
  for select to authenticated
  using (exists (
    select 1 from public.research_projects p
    where p.id = evidence_updates.project_id and p.user_id = (select auth.uid())
  ));

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

comment on table public.research_projects is 'Living discovery projects generated from evidence reports.';
comment on table public.research_claims is 'Persisted claim cards with directional verdict and evidence grade.';
comment on table public.claim_evidence is 'Claim-to-source relation edges for evidence maps and source ranking.';
comment on table public.evidence_updates is 'Level 5 proposed updates from watch events; never auto-applied without review.';
```

- [ ] **Step 3: Add a schema smoke script**

Create `scripts/diag/discovery-schema-check.ts`:

```ts
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !key) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const tables = [
  "research_projects",
  "research_claims",
  "claim_evidence",
  "study_characteristics",
  "evidence_ratings",
  "research_gaps",
  "research_hypotheses",
  "study_designs",
  "claim_versions",
  "evidence_updates",
];

for (const table of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${table} not reachable: ${res.status} ${await res.text()}`);
  console.log(`${table}: ok`);
}
```

- [ ] **Step 4: Verify locally**

Run:

```bash
supabase db reset
deno run --allow-env --allow-net scripts/diag/discovery-schema-check.ts
```

Expected: every table prints `ok`.

- [ ] **Step 5: Run advisors and commit**

Run:

```bash
supabase db advisors
```

Expected: no new critical RLS or security-definer warnings from this migration.

Commit:

```bash
git add supabase/migrations scripts/diag/discovery-schema-check.ts
git commit -m "feat(discovery): add research project claim schema"
```

## Task 3: Deterministic Discovery Extraction

**Files:**

- Create: `supabase/functions/ask/research/discovery/extract.ts`
- Create: `supabase/functions/ask/research/discovery/extract.test.ts`

- [ ] **Step 1: Write extraction tests**

Create `supabase/functions/ask/research/discovery/extract.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ResearchReport } from "../../../../../packages/shared/src/research.ts";
import { buildMonitorTerms, citationToStudyCharacteristic, sectionPointsToClaimSeeds } from "./extract.ts";

const report: ResearchReport = {
  question: "Creatine for cognition in sleep-deprived adults",
  summary: "Evidence is limited.",
  sub_questions: ["What human trials exist?"],
  sections: [{
    heading: "Human evidence",
    points: [{ text: "Small human trials suggest possible cognitive benefit under sleep deprivation.", citation_ids: ["1"] }],
  }],
  uncertainties: [{ text: "The evidence is limited by small samples.", citation_ids: ["1"] }],
  safety_notes: [],
  citations: [{
    chunk_tag: "1",
    source_id: "pubmed:123",
    source_type: "pubmed_oa",
    title: "Creatine and cognition",
    section: "abstract",
    url: "https://pubmed.ncbi.nlm.nih.gov/123/",
    license: "public",
    published_date: "2024-01-01",
    retrieved_at: "2026-06-28T00:00:00Z",
    publication_types: ["Randomized Controlled Trial"],
  }],
  evidence_grade: "weak",
  safety_flags: [],
  claims_verified: true,
  gaps: [],
  counts: {
    per_provider: { pubmed_oa: 1 },
    total_retrieved: 1,
    n_searches: 1,
    per_search_cap: 6,
    retrieved_at: "2026-06-28T00:00:00Z",
  },
};

Deno.test("sectionPointsToClaimSeeds keeps cited load-bearing points", () => {
  const seeds = sectionPointsToClaimSeeds(report);
  assertEquals(seeds.length, 1);
  assertEquals(seeds[0].text, "Small human trials suggest possible cognitive benefit under sleep deprivation.");
  assertEquals(seeds[0].citation_tags, ["1"]);
});

Deno.test("citationToStudyCharacteristic maps citation metadata", () => {
  const study = citationToStudyCharacteristic(report.citations[0]);
  assertEquals(study.source_id, "pubmed:123");
  assertEquals(study.study_type, "Randomized controlled trial");
  assertEquals(study.outcomes, []);
});

Deno.test("buildMonitorTerms extracts simple durable watch terms", () => {
  assertEquals(buildMonitorTerms("Creatine for cognition in sleep-deprived adults"), [
    "creatine",
    "cognition",
    "sleep-deprived adults",
  ]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/ask/research/discovery/extract.test.ts
```

Expected: FAIL because `extract.ts` does not exist.

- [ ] **Step 3: Implement deterministic extraction**

Create `supabase/functions/ask/research/discovery/extract.ts`:

```ts
import { studyTypeLabel } from "../../../../../packages/shared/src/study-type.ts";
import type { Citation } from "../../../../../packages/shared/src/answer.ts";
import type { ResearchReport } from "../../../../../packages/shared/src/research.ts";
import type { StudyCharacteristic } from "../../../../../packages/shared/src/discovery.ts";

export interface ClaimSeed {
  text: string;
  citation_tags: string[];
  section: string;
}

export function sectionPointsToClaimSeeds(report: ResearchReport): ClaimSeed[] {
  return report.sections.flatMap((section) =>
    section.points
      .filter((p) => p.text.trim().length > 0 && p.citation_ids.length > 0)
      .map((p) => ({
        text: p.text.trim(),
        citation_tags: p.citation_ids,
        section: section.heading,
      }))
  );
}

export function citationToStudyCharacteristic(c: Citation): StudyCharacteristic {
  return {
    citation_tag: c.chunk_tag,
    source_id: c.source_id,
    title: c.title ?? c.source_type,
    study_type: studyTypeLabel(c) ?? c.evidence_role?.replace(/_/g, " ") ?? c.source_type.replace(/_/g, " "),
    outcomes: [],
    limitations: [],
  };
}

export function citationsToStudyCharacteristics(citations: Citation[]): StudyCharacteristic[] {
  return citations.map(citationToStudyCharacteristic);
}

export function buildMonitorTerms(question: string): string[] {
  const q = question.toLowerCase();
  const terms: string[] = [];
  for (const token of ["creatine", "berberine", "semaglutide", "tirzepatide", "retatrutide", "metformin"]) {
    if (q.includes(token)) terms.push(token);
  }
  if (q.includes("cognition")) terms.push("cognition");
  if (q.includes("sleep-deprived") || q.includes("sleep deprived")) terms.push("sleep-deprived adults");
  return [...new Set(terms.length ? terms : q.split(/\s+/).filter((t) => t.length > 4).slice(0, 4))];
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno test supabase/functions/ask/research/discovery/extract.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/ask/research/discovery/extract.ts supabase/functions/ask/research/discovery/extract.test.ts
git commit -m "feat(discovery): extract claim seeds from research reports"
```

## Task 4: Claim Conclusion and Evidence Meter

**Files:**

- Create: `supabase/functions/ask/research/discovery/grade.ts`
- Create: `supabase/functions/ask/research/discovery/grade.test.ts`

- [ ] **Step 1: Write grading tests**

Create `supabase/functions/ask/research/discovery/grade.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { concludeClaim, highestEvidenceGrade, relationCounts } from "./grade.ts";

Deno.test("relationCounts partitions evidence relation edges", () => {
  assertEquals(relationCounts([
    { relation: "supports", weight: 90 },
    { relation: "partial", weight: 70 },
    { relation: "conflicts", weight: 85 },
  ]), { supports: 1, partial: 1, mentions: 0, conflicts: 1, reviewed: 0 });
});

Deno.test("concludeClaim marks mixed when strong support and conflict coexist", () => {
  const conclusion = concludeClaim([
    { relation: "supports", weight: 90 },
    { relation: "conflicts", weight: 85 },
  ]);
  assertEquals(conclusion.verdict, "mixed");
  assertEquals(conclusion.confidence, "low");
});

Deno.test("highestEvidenceGrade returns the strongest report grade", () => {
  assertEquals(highestEvidenceGrade(["weak", "strong", "moderate"]), "strong");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/ask/research/discovery/grade.test.ts
```

Expected: FAIL because `grade.ts` does not exist.

- [ ] **Step 3: Implement grading helpers**

Create `supabase/functions/ask/research/discovery/grade.ts`:

```ts
import type { ClaimRelation } from "../../../../../packages/shared/src/claim-relation.ts";
import type { ClaimConfidence, ClaimVerdict } from "../../../../../packages/shared/src/discovery.ts";
import type { EvidenceGrade } from "../../../../../packages/shared/src/answer.ts";

export interface RelationWeight {
  relation: ClaimRelation;
  weight: number;
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  not_applicable: -2,
  unknown: -1,
  very_weak: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
  very_strong: 4,
};

export function relationCounts(items: RelationWeight[]): Record<ClaimRelation, number> {
  const counts: Record<ClaimRelation, number> = {
    supports: 0,
    partial: 0,
    mentions: 0,
    conflicts: 0,
    reviewed: 0,
  };
  for (const item of items) counts[item.relation] += 1;
  return counts;
}

export function concludeClaim(items: RelationWeight[]): { verdict: ClaimVerdict; confidence: ClaimConfidence } {
  const counts = relationCounts(items);
  const supportWeight = items.filter((i) => i.relation === "supports" || i.relation === "partial").reduce((sum, i) => sum + i.weight, 0);
  const conflictWeight = items.filter((i) => i.relation === "conflicts").reduce((sum, i) => sum + i.weight, 0);

  if (supportWeight === 0 && conflictWeight === 0) return { verdict: "unknown", confidence: "very_low" };
  if (supportWeight > 0 && conflictWeight > 0) return { verdict: "mixed", confidence: counts.supports >= 2 && counts.conflicts >= 2 ? "moderate" : "low" };
  if (conflictWeight > supportWeight) return { verdict: "unlikely", confidence: conflictWeight >= 160 ? "moderate" : "low" };
  return { verdict: "likely", confidence: supportWeight >= 180 ? "moderate" : "low" };
}

export function highestEvidenceGrade(grades: EvidenceGrade[]): EvidenceGrade {
  return grades.reduce<EvidenceGrade>((best, grade) => GRADE_RANK[grade] > GRADE_RANK[best] ? grade : best, "unknown");
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno test supabase/functions/ask/research/discovery/grade.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/ask/research/discovery/grade.ts supabase/functions/ask/research/discovery/grade.test.ts
git commit -m "feat(discovery): add claim conclusion helpers"
```

## Task 5: Gap to Study Design Scaffolds

**Files:**

- Create: `supabase/functions/ask/research/discovery/design.ts`
- Create: `supabase/functions/ask/research/discovery/design.test.ts`

- [ ] **Step 1: Write study-design tests**

Create `supabase/functions/ask/research/discovery/design.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ResearchGap, ResearchHypothesis } from "../../../../../packages/shared/src/discovery.ts";
import { designTypeForGap, scaffoldStudyDesign } from "./design.ts";

const gap: ResearchGap = {
  id: "gap-1",
  dimension: "study_design",
  severity: "high",
  description: "Few randomized trials directly test the question.",
  rationale: "The retrieved studies are mostly small or indirect.",
  related_claim_ids: [],
  source_tags: ["1", "2"],
};

const hypothesis: ResearchHypothesis = {
  id: "hyp-1",
  gap_id: "gap-1",
  hypothesis: "Creatine may preserve executive function during acute sleep deprivation.",
  why_plausible: ["Brain phosphocreatine may support ATP buffering."],
  evidence_basis: ["Small human studies suggest possible benefit."],
  uncertainty: "Human evidence is sparse.",
  priority: "high",
};

Deno.test("designTypeForGap maps efficacy gaps to RCT", () => {
  assertEquals(designTypeForGap(gap), "randomized_controlled_trial");
});

Deno.test("scaffoldStudyDesign returns a concrete draft design", () => {
  const design = scaffoldStudyDesign(gap, hypothesis, "Creatine for cognition in sleep-deprived adults");
  assertEquals(design.design_type, "randomized_controlled_trial");
  assertEquals(design.hypothesis, hypothesis.hypothesis);
  assertEquals(design.feasibility, "moderate");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/ask/research/discovery/design.test.ts
```

Expected: FAIL because `design.ts` does not exist.

- [ ] **Step 3: Implement study design scaffolds**

Create `supabase/functions/ask/research/discovery/design.ts`:

```ts
import type {
  ResearchGap,
  ResearchHypothesis,
  StudyDesignType,
  SuggestedStudyDesign,
} from "../../../../../packages/shared/src/discovery.ts";

export function designTypeForGap(gap: ResearchGap): StudyDesignType {
  if (gap.dimension === "safety") return "pharmacovigilance_study";
  if (gap.dimension === "mechanism") return "mechanistic_lab_study";
  if (gap.dimension === "duration") return "prospective_cohort";
  if (gap.dimension === "comparator") return "randomized_controlled_trial";
  if (gap.dimension === "replication") return "randomized_controlled_trial";
  if (gap.dimension === "study_design") return "randomized_controlled_trial";
  return "prospective_cohort";
}

export function scaffoldStudyDesign(gap: ResearchGap, hypothesis: ResearchHypothesis, question: string): SuggestedStudyDesign {
  const designType = designTypeForGap(gap);
  return {
    id: crypto.randomUUID(),
    design_type: designType,
    research_question: question.endsWith("?") ? question : `${question}?`,
    hypothesis: hypothesis.hypothesis,
    population: "Define the population that matches the claim and avoids extrapolating from indirect evidence.",
    intervention: "Use the exposure or intervention named in the research question.",
    comparator: designType === "pharmacovigilance_study" ? "Matched non-exposed comparator or expected background rate." : "Placebo, standard care, or active comparator matched to the research question.",
    primary_endpoint: "Select the endpoint that directly resolves the evidence gap.",
    secondary_endpoints: ["Safety outcomes", "Subgroup response", "Adherence or exposure fidelity"],
    duration: gap.dimension === "duration" ? "Long enough to answer the long-term outcome gap." : "Matched to the biological mechanism and outcome timing.",
    sample_size_notes: "Estimate after selecting the primary endpoint, expected effect size, alpha, power, and attrition assumptions.",
    safety_monitoring: ["Adverse events", "Intervention-specific stopping rules", "Protocol review before implementation"],
    feasibility: gap.severity === "high" ? "moderate" : "high",
    ethics: "Requires protocol review and risk minimization before any real-world study.",
  };
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno test supabase/functions/ask/research/discovery/design.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/ask/research/discovery/design.ts supabase/functions/ask/research/discovery/design.test.ts
git commit -m "feat(discovery): scaffold next-study designs"
```

## Task 6: LLM JSON Synthesis With Sanitizer

**Files:**

- Create: `supabase/functions/ask/research/discovery/synthesize.ts`
- Create: `supabase/functions/ask/research/discovery/synthesize.test.ts`

- [ ] **Step 1: Write sanitizer tests**

Create `supabase/functions/ask/research/discovery/synthesize.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeDiscoveryDraft } from "./synthesize.ts";

Deno.test("sanitizeDiscoveryDraft removes claims without evidence", () => {
  const draft = sanitizeDiscoveryDraft({
    summary: "Suggestive evidence.",
    claims: [
      {
        claim_text: "Supported claim",
        citation_tags: ["1"],
        relation_by_tag: { "1": "supports" },
        rationale: "Source 1 supports it.",
      },
      {
        claim_text: "Unsupported claim",
        citation_tags: [],
        relation_by_tag: {},
        rationale: "No citations.",
      },
    ],
    research_gaps: [],
    hypotheses: [],
  }, new Set(["1"]));
  assertEquals(draft.claims.length, 1);
  assertEquals(draft.claims[0].claim_text, "Supported claim");
});

Deno.test("sanitizeDiscoveryDraft drops invalid citation tags", () => {
  const draft = sanitizeDiscoveryDraft({
    summary: "Suggestive evidence.",
    claims: [{
      claim_text: "Partly supported claim",
      citation_tags: ["1", "9"],
      relation_by_tag: { "1": "partial", "9": "supports" },
      rationale: "Only source 1 exists.",
    }],
    research_gaps: [],
    hypotheses: [],
  }, new Set(["1"]));
  assertEquals(draft.claims[0].citation_tags, ["1"]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/ask/research/discovery/synthesize.test.ts
```

Expected: FAIL because `synthesize.ts` does not exist.

- [ ] **Step 3: Implement sanitizer and prompt builder**

Create `supabase/functions/ask/research/discovery/synthesize.ts`:

```ts
import type { ClaimRelation } from "../../../../../packages/shared/src/claim-relation.ts";
import type { ClaimSeed } from "./extract.ts";

export interface DiscoveryDraftClaim {
  claim_text: string;
  citation_tags: string[];
  relation_by_tag: Record<string, ClaimRelation>;
  rationale: string;
}

export interface DiscoveryDraftGap {
  dimension: string;
  severity: string;
  description: string;
  rationale: string;
  source_tags: string[];
}

export interface DiscoveryDraftHypothesis {
  hypothesis: string;
  why_plausible: string[];
  evidence_basis: string[];
  uncertainty: string;
  priority: string;
}

export interface DiscoveryDraft {
  summary: string;
  claims: DiscoveryDraftClaim[];
  research_gaps: DiscoveryDraftGap[];
  hypotheses: DiscoveryDraftHypothesis[];
}

const VALID_RELATIONS = new Set<ClaimRelation>(["supports", "partial", "mentions", "conflicts", "reviewed"]);

export function discoveryPrompt(args: { question: string; seeds: ClaimSeed[] }): string {
  return [
    "You extract a PharmaOrb Discovery Report from already-cited evidence.",
    "Return strict JSON only.",
    "Do not add a clinical claim unless it has at least one citation tag from the provided list.",
    "Do not claim PRISMA, GRADE, systematic-review compliance, diagnosis, or treatment advice.",
    "Classify each source relation as supports, partial, mentions, or conflicts.",
    "",
    `Question: ${args.question}`,
    "Cited claim seeds:",
    JSON.stringify(args.seeds, null, 2),
  ].join("\n");
}

export function sanitizeDiscoveryDraft(raw: unknown, allowedTags: Set<string>): DiscoveryDraft {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const claimsRaw = Array.isArray(obj.claims) ? obj.claims : [];
  const gapsRaw = Array.isArray(obj.research_gaps) ? obj.research_gaps : [];
  const hypRaw = Array.isArray(obj.hypotheses) ? obj.hypotheses : [];

  const claims: DiscoveryDraftClaim[] = claimsRaw.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const rec = c as Record<string, unknown>;
    const text = typeof rec.claim_text === "string" ? rec.claim_text.trim() : "";
    const tags = Array.isArray(rec.citation_tags)
      ? rec.citation_tags.map(String).filter((t) => allowedTags.has(t))
      : [];
    if (!text || tags.length === 0) return [];
    const relationInput = rec.relation_by_tag && typeof rec.relation_by_tag === "object"
      ? rec.relation_by_tag as Record<string, unknown>
      : {};
    const relation_by_tag: Record<string, ClaimRelation> = {};
    for (const tag of tags) {
      const rel = relationInput[tag];
      relation_by_tag[tag] = typeof rel === "string" && VALID_RELATIONS.has(rel as ClaimRelation)
        ? rel as ClaimRelation
        : "mentions";
    }
    return [{
      claim_text: text,
      citation_tags: tags,
      relation_by_tag,
      rationale: typeof rec.rationale === "string" ? rec.rationale.trim() : "",
    }];
  });

  return {
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
    claims,
    research_gaps: gapsRaw.filter((g): g is DiscoveryDraftGap => !!g && typeof g === "object") as DiscoveryDraftGap[],
    hypotheses: hypRaw.filter((h): h is DiscoveryDraftHypothesis => !!h && typeof h === "object") as DiscoveryDraftHypothesis[],
  };
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno test supabase/functions/ask/research/discovery/synthesize.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/ask/research/discovery/synthesize.ts supabase/functions/ask/research/discovery/synthesize.test.ts
git commit -m "feat(discovery): sanitize discovery synthesis"
```

## Task 7: Discovery Mode in Research Engine

**Files:**

- Modify: `supabase/functions/ask/research/orchestrate.ts`
- Modify: `supabase/functions/research/index.ts`
- Modify: `packages/shared/src/research-contract.test.ts`

- [ ] **Step 1: Extend the contract test for discovery mode**

Add this test to `packages/shared/src/research-contract.test.ts`:

```ts
Deno.test("ResearchReport accepts discovery mode and discovery payload", () => {
  const mode: ReportMode = "discovery";
  const partial: Pick<ResearchReport, "mode" | "discovery"> = {
    mode,
    discovery: {
      project_title: "Creatine cognition discovery",
      question: "Creatine for cognition",
      summary: "Evidence is suggestive.",
      evidence_meter: "weak",
      claims: [],
      study_characteristics: [],
      research_gaps: [],
      hypotheses: [],
      study_designs: [],
      monitor_terms: ["creatine", "cognition"],
      generated_at: "2026-06-28T00:00:00.000Z",
    },
  };
  assertEquals(partial.mode, "discovery");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test packages/shared/src/research-contract.test.ts
```

Expected: FAIL until Task 1's `ReportMode` and optional `discovery` payload are added.

- [ ] **Step 3: Add discovery assembly in the orchestrator**

In `supabase/functions/ask/research/orchestrate.ts`, after the existing `assembleReport(...)` call and before returning the report, add logic equivalent to:

```ts
import {
  discoveryTitle,
  normalizeDiscoveryClaim,
  type DiscoveryClaim,
  type DiscoveryReport,
  type ResearchGap,
  type ResearchHypothesis,
} from "../../../../packages/shared/src/discovery.ts";
import { citationsToStudyCharacteristics, sectionPointsToClaimSeeds, buildMonitorTerms } from "./discovery/extract.ts";
import { concludeClaim, highestEvidenceGrade } from "./discovery/grade.ts";
import { scaffoldStudyDesign } from "./discovery/design.ts";

function buildDiscoveryReport(report: ResearchReport, nowIso: string): DiscoveryReport {
  const seeds = sectionPointsToClaimSeeds(report);
  const claims: DiscoveryClaim[] = seeds.slice(0, 8).map((seed) => {
    const evidence = seed.citation_tags.map((tag) => {
      const c = report.citations.find((x) => x.chunk_tag === tag);
      return {
        citation_tag: tag,
        source_id: c?.source_id ?? tag,
        relation: c?.claim_relation ?? "partial",
        evidence_weight: c?.evidence_weight ?? c?.support_score ?? 50,
        support_quote: c?.support_reason,
      };
    });
    const conclusion = concludeClaim(evidence.map((e) => ({ relation: e.relation, weight: e.evidence_weight })));
    return {
      id: crypto.randomUUID(),
      claim_text: seed.text,
      normalized_claim: normalizeDiscoveryClaim(seed.text),
      verdict: conclusion.verdict,
      confidence: conclusion.confidence,
      evidence_grade: report.evidence_grade,
      evidence,
      rationale: `Derived from ${seed.citation_tags.length} cited source${seed.citation_tags.length === 1 ? "" : "s"}.`,
    };
  });

  const researchGaps: ResearchGap[] = (report.gaps ?? []).slice(0, 8).map((gap) => ({
    id: crypto.randomUUID(),
    dimension: gap.dimension === "long_term" ? "duration" : gap.dimension,
    severity: gap.type === "no_rct" || gap.type === "no_human_trial" ? "high" : "medium",
    description: gap.text,
    rationale: `Scoped to ${gap.denominator.n_sources} sources retrieved by this run.`,
    related_claim_ids: [],
    source_tags: [],
  }));

  const hypotheses: ResearchHypothesis[] = researchGaps.slice(0, 3).map((gap) => ({
    id: crypto.randomUUID(),
    gap_id: gap.id,
    hypothesis: `A focused study could resolve this gap: ${gap.description}`,
    why_plausible: claims.slice(0, 2).map((c) => c.claim_text),
    evidence_basis: gap.source_tags,
    uncertainty: gap.rationale,
    priority: gap.severity,
  }));

  return {
    project_title: discoveryTitle(report.question),
    question: report.question,
    summary: report.summary,
    evidence_meter: highestEvidenceGrade([report.evidence_grade]),
    claims,
    study_characteristics: citationsToStudyCharacteristics(report.citations),
    research_gaps: researchGaps,
    hypotheses,
    study_designs: hypotheses.map((h) => scaffoldStudyDesign(researchGaps.find((g) => g.id === h.gap_id) ?? researchGaps[0], h, report.question)),
    monitor_terms: buildMonitorTerms(report.question),
    generated_at: nowIso,
  };
}
```

Then attach it only in discovery mode:

```ts
if (args.mode === "discovery") {
  report.discovery = buildDiscoveryReport(report, new Date().toISOString());
}
```

Keep this first pass deterministic. The LLM JSON synthesis from Task 6 can be swapped in after this is green.

- [ ] **Step 4: Accept discovery mode at the HTTP boundary**

In `supabase/functions/research/index.ts`, change the mode parser:

```ts
const mode: ReportMode = body.mode === "meta"
  ? "meta"
  : body.mode === "structured_review"
  ? "structured_review"
  : body.mode === "lab_draft"
  ? "lab_draft"
  : body.mode === "discovery"
  ? "discovery"
  : "standard";
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno test packages/shared/src/research-contract.test.ts \
  supabase/functions/ask/research/discovery/extract.test.ts \
  supabase/functions/ask/research/discovery/grade.test.ts \
  supabase/functions/ask/research/discovery/design.test.ts
pnpm --filter @pharmaorb/web typecheck
```

Expected: PASS.

Commit:

```bash
git add packages/shared/src/research-contract.test.ts supabase/functions/ask/research/orchestrate.ts supabase/functions/research/index.ts
git commit -m "feat(discovery): add discovery research mode"
```

## Task 8: Persist Discovery Projects

**Files:**

- Create: `supabase/functions/ask/research/discovery/persist.ts`
- Create: `supabase/functions/ask/research/discovery/persist.test.ts`
- Modify: `supabase/functions/research/index.ts`

- [ ] **Step 1: Write persistence request tests**

Create `supabase/functions/ask/research/discovery/persist.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { DiscoveryReport } from "../../../../../packages/shared/src/discovery.ts";
import {
  buildClaimEvidenceRows,
  buildClaimInsertRows,
  buildClaimVersionRows,
  buildEvidenceRatingRows,
  buildGapRows,
  buildHypothesisRows,
  buildProjectInsert,
  buildStudyDesignRows,
  buildStudyRows,
} from "./persist.ts";

const discovery: DiscoveryReport = {
  project_title: "Creatine cognition",
  question: "Creatine for cognition",
  summary: "Suggestive.",
  evidence_meter: "weak",
  claims: [{
    id: "claim-1",
    claim_text: "Creatine may help cognition under sleep deprivation.",
    normalized_claim: "creatine may help cognition under sleep deprivation",
    verdict: "likely",
    confidence: "low",
    evidence_grade: "weak",
    evidence: [{ citation_tag: "1", source_id: "pubmed:123", relation: "supports", evidence_weight: 80, support_quote: "A small trial reported benefit." }],
  }],
  study_characteristics: [{
    citation_tag: "1",
    source_id: "pubmed:123",
    title: "Creatine and cognition",
    study_type: "Randomized controlled trial",
    population: "Sleep-deprived adults",
    sample_size: 24,
    outcomes: ["Executive function"],
    limitations: ["Small sample"],
  }],
  research_gaps: [{
    id: "gap-1",
    dimension: "study_design",
    severity: "high",
    description: "Few large RCTs.",
    rationale: "Retrieved trials were small.",
    related_claim_ids: ["claim-1"],
    source_tags: ["1"],
  }],
  hypotheses: [{
    id: "hyp-1",
    gap_id: "gap-1",
    hypothesis: "Creatine may preserve executive function during acute sleep deprivation.",
    why_plausible: ["Brain energy buffering"],
    evidence_basis: ["1"],
    uncertainty: "Small samples.",
    priority: "high",
  }],
  study_designs: [{
    id: "design-1",
    design_type: "randomized_controlled_trial",
    research_question: "Does creatine preserve executive function during acute sleep deprivation?",
    hypothesis: "Creatine may preserve executive function during acute sleep deprivation.",
    population: "Sleep-deprived adults.",
    intervention: "Creatine monohydrate.",
    comparator: "Placebo.",
    primary_endpoint: "Executive function.",
    secondary_endpoints: ["Reaction time"],
    duration: "Acute sleep restriction challenge.",
    sample_size_notes: "Power after endpoint selection.",
    safety_monitoring: ["Adverse events"],
    feasibility: "moderate",
    ethics: "Sleep restriction should be monitored.",
  }],
  monitor_terms: ["creatine", "cognition"],
  generated_at: "2026-06-28T00:00:00Z",
};

Deno.test("buildProjectInsert scopes project to user and saved report", () => {
  assertEquals(buildProjectInsert("user-1", "report-1", discovery), {
    user_id: "user-1",
    saved_report_id: "report-1",
    title: "Creatine cognition",
    question: "Creatine for cognition",
    current_snapshot: discovery,
  });
});

Deno.test("buildClaimInsertRows maps claim payloads", () => {
  const rows = buildClaimInsertRows("project-1", discovery);
  assertEquals(rows[0].project_id, "project-1");
  assertEquals(rows[0].verdict, "likely");
});

Deno.test("child row builders map full discovery payload", () => {
  const claimIds = new Map([["creatine may help cognition under sleep deprivation", "claim-db-1"]]);
  const gapIds = new Map([["gap-1", "gap-db-1"]]);
  const hypothesisIds = new Map([["hyp-1", "hyp-db-1"]]);
  assertEquals(buildClaimEvidenceRows(claimIds, discovery)[0].claim_id, "claim-db-1");
  assertEquals(buildStudyRows("project-1", discovery)[0].source_id, "pubmed:123");
  assertEquals(buildEvidenceRatingRows(claimIds, discovery)[0].created_by, "research_run");
  assertEquals(buildClaimVersionRows(claimIds, discovery)[0].version_number, 1);
  assertEquals(buildGapRows("project-1", claimIds, discovery)[0].claim_id, "claim-db-1");
  assertEquals(buildHypothesisRows("project-1", gapIds, discovery)[0].gap_id, "gap-db-1");
  assertEquals(buildStudyDesignRows("project-1", hypothesisIds, discovery)[0].hypothesis_id, "hyp-db-1");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/ask/research/discovery/persist.test.ts
```

Expected: FAIL because `persist.ts` does not exist.

- [ ] **Step 3: Implement persistence helpers and service writes**

Create `supabase/functions/ask/research/discovery/persist.ts`:

```ts
import type { DiscoveryReport } from "../../../../../packages/shared/src/discovery.ts";

type ClaimIdMap = Map<string, string>;
type GapIdMap = Map<string, string>;
type HypothesisIdMap = Map<string, string>;

export function buildProjectInsert(userId: string, savedReportId: string | null, discovery: DiscoveryReport) {
  return {
    user_id: userId,
    saved_report_id: savedReportId,
    title: discovery.project_title,
    question: discovery.question,
    current_snapshot: discovery,
  };
}

export function buildClaimInsertRows(projectId: string, discovery: DiscoveryReport) {
  return discovery.claims.map((claim) => ({
    project_id: projectId,
    claim_text: claim.claim_text,
    normalized_claim: claim.normalized_claim,
    verdict: claim.verdict,
    confidence: claim.confidence,
    evidence_grade: claim.evidence_grade,
    rationale: claim.rationale ?? null,
  }));
}

export function buildClaimEvidenceRows(claimIds: ClaimIdMap, discovery: DiscoveryReport) {
  return discovery.claims.flatMap((claim) => {
    const claimId = claimIds.get(claim.normalized_claim);
    if (!claimId) return [];
    return claim.evidence.map((e) => ({
      claim_id: claimId,
      source_id: e.source_id,
      source_type: e.source_id.split(":")[0] || null,
      citation_tag: e.citation_tag,
      relation: e.relation,
      evidence_weight: e.evidence_weight,
      support_quote: e.support_quote ?? null,
    }));
  });
}

export function buildStudyRows(projectId: string, discovery: DiscoveryReport) {
  return discovery.study_characteristics.map((s) => ({
    project_id: projectId,
    source_id: s.source_id,
    citation_tag: s.citation_tag,
    title: s.title,
    study_type: s.study_type,
    population: s.population ?? null,
    sample_size: s.sample_size ?? null,
    intervention: s.intervention ?? null,
    comparator: s.comparator ?? null,
    duration: s.duration ?? null,
    outcomes: s.outcomes,
    limitations: s.limitations,
  }));
}

export function buildEvidenceRatingRows(claimIds: ClaimIdMap, discovery: DiscoveryReport) {
  return discovery.claims.flatMap((claim) => {
    const claimId = claimIds.get(claim.normalized_claim);
    if (!claimId) return [];
    return [{
      claim_id: claimId,
      evidence_grade: claim.evidence_grade,
      confidence: claim.confidence,
      verdict: claim.verdict,
      reason: claim.rationale ?? "Initial discovery report rating.",
      counts: {
        total: claim.evidence.length,
        supports: claim.evidence.filter((e) => e.relation === "supports").length,
        partial: claim.evidence.filter((e) => e.relation === "partial").length,
        conflicts: claim.evidence.filter((e) => e.relation === "conflicts").length,
      },
      created_by: "research_run",
    }];
  });
}

export function buildClaimVersionRows(claimIds: ClaimIdMap, discovery: DiscoveryReport) {
  return discovery.claims.flatMap((claim) => {
    const claimId = claimIds.get(claim.normalized_claim);
    if (!claimId) return [];
    return [{
      claim_id: claimId,
      version_number: 1,
      verdict: claim.verdict,
      evidence_grade: claim.evidence_grade,
      confidence: claim.confidence,
      reason_for_change: "Initial discovery report.",
      snapshot: claim,
    }];
  });
}

export function buildGapRows(projectId: string, claimIds: ClaimIdMap, discovery: DiscoveryReport) {
  return discovery.research_gaps.map((gap) => {
    const claim_id = gap.related_claim_ids
      .map((id) => {
        const byDirectKey = claimIds.get(id);
        if (byDirectKey) return byDirectKey;
        const byClientId = discovery.claims.find((c) => c.id === id);
        return byClientId ? claimIds.get(byClientId.normalized_claim) : undefined;
      })
      .find(Boolean) ?? null;
    return {
      project_id: projectId,
      claim_id,
      dimension: gap.dimension,
      severity: gap.severity,
      description: gap.description,
      rationale: gap.rationale,
      source_tags: gap.source_tags,
    };
  });
}

export function buildHypothesisRows(projectId: string, gapIds: GapIdMap, discovery: DiscoveryReport) {
  return discovery.hypotheses.map((h) => ({
    project_id: projectId,
    gap_id: h.gap_id ? gapIds.get(h.gap_id) ?? null : null,
    hypothesis: h.hypothesis,
    why_plausible: h.why_plausible,
    evidence_basis: h.evidence_basis,
    uncertainty: h.uncertainty,
    priority: h.priority,
  }));
}

export function buildStudyDesignRows(projectId: string, hypothesisIds: HypothesisIdMap, discovery: DiscoveryReport) {
  return discovery.study_designs.map((d) => {
    const matchedHypothesis = discovery.hypotheses.find((h) => h.hypothesis === d.hypothesis);
    return {
      project_id: projectId,
      hypothesis_id: matchedHypothesis ? hypothesisIds.get(matchedHypothesis.id) ?? null : null,
      design_type: d.design_type,
      research_question: d.research_question,
      hypothesis: d.hypothesis,
      population: d.population,
      intervention: d.intervention,
      comparator: d.comparator,
      primary_endpoint: d.primary_endpoint,
      secondary_endpoints: d.secondary_endpoints,
      duration: d.duration,
      sample_size_notes: d.sample_size_notes,
      safety_monitoring: d.safety_monitoring,
      feasibility: d.feasibility,
      ethics: d.ethics,
    };
  });
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
}

async function insertRows<T extends Record<string, unknown>, R extends Record<string, unknown>>(
  sbUrl: string,
  serviceKey: string,
  table: string,
  rows: T[],
): Promise<R[]> {
  if (rows.length === 0) return [];
  const res = await fetch(`${sbUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json() as R[];
}

export async function persistDiscoveryProject(args: {
  sbUrl: string;
  serviceKey: string;
  userId: string;
  savedReportId: string | null;
  discovery?: DiscoveryReport;
}): Promise<string | null> {
  if (!args.discovery) return null;
  const projectRes = await fetch(`${args.sbUrl}/rest/v1/research_projects`, {
    method: "POST",
    headers: serviceHeaders(args.serviceKey),
    body: JSON.stringify(buildProjectInsert(args.userId, args.savedReportId, args.discovery)),
  });
  if (!projectRes.ok) throw new Error(`insert research project failed: ${projectRes.status} ${await projectRes.text()}`);
  const projectRows = await projectRes.json() as Array<{ id: string }>;
  const projectId = projectRows[0]?.id;
  if (!projectId) throw new Error("insert research project returned no id");

  const claimInsertRows = buildClaimInsertRows(projectId, args.discovery);
  const claimRows = await insertRows<typeof claimInsertRows[number], { id: string; normalized_claim: string }>(
    args.sbUrl,
    args.serviceKey,
    "research_claims",
    claimInsertRows,
  );
  const claimIds = new Map(claimRows.map((r) => [r.normalized_claim, r.id]));

  await insertRows(args.sbUrl, args.serviceKey, "claim_evidence", buildClaimEvidenceRows(claimIds, args.discovery));
  await insertRows(args.sbUrl, args.serviceKey, "study_characteristics", buildStudyRows(projectId, args.discovery));
  await insertRows(args.sbUrl, args.serviceKey, "evidence_ratings", buildEvidenceRatingRows(claimIds, args.discovery));
  await insertRows(args.sbUrl, args.serviceKey, "claim_versions", buildClaimVersionRows(claimIds, args.discovery));

  const gapRows = await insertRows<ReturnType<typeof buildGapRows>[number], { id: string; description: string }>(
    args.sbUrl,
    args.serviceKey,
    "research_gaps",
    buildGapRows(projectId, claimIds, args.discovery),
  );
  const gapIds = new Map(args.discovery.research_gaps.map((gap, idx) => [gap.id, gapRows[idx]?.id]).filter((entry): entry is [string, string] => Boolean(entry[1])));

  const hypothesisRows = await insertRows<ReturnType<typeof buildHypothesisRows>[number], { id: string; hypothesis: string }>(
    args.sbUrl,
    args.serviceKey,
    "research_hypotheses",
    buildHypothesisRows(projectId, gapIds, args.discovery),
  );
  const hypothesisIds = new Map(args.discovery.hypotheses.map((h, idx) => [h.id, hypothesisRows[idx]?.id]).filter((entry): entry is [string, string] => Boolean(entry[1])));
  await insertRows(args.sbUrl, args.serviceKey, "study_designs", buildStudyDesignRows(projectId, hypothesisIds, args.discovery));

  return projectId;
}
```

- [ ] **Step 4: Call persistence after saved report insert**

In `supabase/functions/research/index.ts`, import:

```ts
import { persistDiscoveryProject } from "../ask/research/discovery/persist.ts";
```

Then after `const savedReportId = await insertSavedReport(userId, question, report);`, add:

```ts
const discoveryProjectId = await persistDiscoveryProject({
  sbUrl: SB_URL,
  serviceKey: SERVICE_KEY,
  userId,
  savedReportId,
  discovery: report.discovery,
});
```

Patch the run metadata so the client can link to it later:

```ts
await patchRun(runId, userId, {
  status: "completed",
  progress: steps,
  saved_report_id: savedReportId,
  source_ids: report.citations.map((c) => c.source_id),
  completed_at: new Date().toISOString(),
  metadata: discoveryProjectId ? { discovery_project_id: discoveryProjectId } : undefined,
});
```

If `research_report_runs` does not have a `metadata` column, add a small migration in this task:

```sql
alter table public.research_report_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno test supabase/functions/ask/research/discovery/persist.test.ts
pnpm --filter @pharmaorb/web typecheck
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/ask/research/discovery/persist.ts supabase/functions/ask/research/discovery/persist.test.ts supabase/functions/research/index.ts supabase/migrations
git commit -m "feat(discovery): persist discovery projects from research runs"
```

## Task 9: Web Surfaces

**Files:**

- Modify: `apps/web/app/app/ask/page.tsx`
- Modify: `apps/web/app/app/reports/page.tsx`
- Modify: `apps/web/app/app/reports/[id]/page.tsx`
- Modify: `apps/web/components/EvidencePanel.tsx`
- Modify: `apps/web/lib/export/docx.ts`
- Modify: `apps/web/lib/export/pptx.ts`
- Modify: `apps/web/lib/export/pdf.ts`
- Create: `apps/web/lib/discovery-format.ts`
- Create: `apps/web/lib/discovery-format.test.ts`

- [ ] **Step 1: Write formatting tests**

Create `apps/web/lib/discovery-format.test.ts`:

```ts
import { strict as assert } from "node:assert";
import type { DiscoveryReport } from "@pharmabro/shared";
import { discoverySummaryLine, studyDesignLabel } from "./discovery-format";

const report: DiscoveryReport = {
  project_title: "Creatine cognition",
  question: "Creatine for cognition",
  summary: "Suggestive.",
  evidence_meter: "weak",
  claims: [{ id: "c1", claim_text: "Claim", normalized_claim: "claim", verdict: "likely", confidence: "low", evidence_grade: "weak", evidence: [] }],
  study_characteristics: [],
  research_gaps: [{ id: "g1", dimension: "study_design", severity: "high", description: "Few RCTs.", rationale: "Sparse evidence.", related_claim_ids: [], source_tags: [] }],
  hypotheses: [],
  study_designs: [],
  monitor_terms: [],
  generated_at: "2026-06-28T00:00:00Z",
};

assert.equal(discoverySummaryLine(report), "1 claim - 1 gap - weak evidence");
assert.equal(studyDesignLabel("randomized_controlled_trial"), "Randomized controlled trial");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @pharmaorb/web exec tsx apps/web/lib/discovery-format.test.ts
```

Expected: FAIL because `discovery-format.ts` does not exist.

- [ ] **Step 3: Implement format helpers**

Create `apps/web/lib/discovery-format.ts`:

```ts
import type { DiscoveryReport, StudyDesignType } from "@pharmabro/shared";

const DESIGN_LABEL: Record<StudyDesignType, string> = {
  randomized_controlled_trial: "Randomized controlled trial",
  crossover_trial: "Crossover trial",
  dose_ranging_trial: "Dose-ranging trial",
  prospective_cohort: "Prospective cohort",
  retrospective_cohort: "Retrospective cohort",
  pharmacovigilance_study: "Pharmacovigilance study",
  mechanistic_lab_study: "Mechanistic lab study",
  individual_participant_meta_analysis: "Individual participant meta-analysis",
};

export function studyDesignLabel(type: StudyDesignType): string {
  return DESIGN_LABEL[type];
}

export function discoverySummaryLine(report: DiscoveryReport): string {
  const claim = `${report.claims.length} claim${report.claims.length === 1 ? "" : "s"}`;
  const gap = `${report.research_gaps.length} gap${report.research_gaps.length === 1 ? "" : "s"}`;
  return `${claim} - ${gap} - ${report.evidence_meter.replace(/_/g, " ")} evidence`;
}
```

- [ ] **Step 4: Wire the Ask mode**

In `apps/web/app/app/ask/page.tsx`, add "Discovery report" to the deep-research/report mode selector. It should call the existing research endpoint with:

```ts
{ question, mode: "discovery" }
```

Keep Fast/Thorough Ask separate. Discovery is a report deliverable, not the default chat answer.

- [ ] **Step 5: Render discovery reports**

In `apps/web/app/app/reports/page.tsx`, extend `MODE_LABEL`:

```ts
discovery: "Discovery reports",
```

Add `"discovery"` to `MODE_ORDER` before `lab_draft`.

In `apps/web/app/app/reports/[id]/page.tsx`, when `report.payload.discovery` exists, render sections in this order:

1. Evidence meter and summary.
2. Claim cards with verdict, confidence, evidence grade, relation counts, and source tags.
3. Study characteristics table.
4. Research gaps.
5. Hypotheses.
6. Suggested study design.
7. Monitor terms and "Watch this topic" call to action.

Use existing report typography and avoid a separate landing/marketing page.

- [ ] **Step 6: Extend exports**

In each export helper, insert discovery sections after the summary and before references:

```ts
if (report.discovery) {
  // Evidence meter
  // Claim cards
  // Research gaps
  // Hypotheses
  // Suggested study designs
}
```

Use the exact `report.discovery` payload, not a second generated summary. Exported Word/PDF/PPT should match the screen.

- [ ] **Step 7: Verify and commit**

Run:

```bash
pnpm --filter @pharmaorb/web exec tsx apps/web/lib/discovery-format.test.ts
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
```

Expected: PASS.

Commit:

```bash
git add apps/web/app/app/ask/page.tsx apps/web/app/app/reports/page.tsx apps/web/app/app/reports/[id]/page.tsx apps/web/components/EvidencePanel.tsx apps/web/lib/export apps/web/lib/discovery-format.ts apps/web/lib/discovery-format.test.ts
git commit -m "feat(web): render discovery reports"
```

## Task 10: Level 5 Update Hook

**Files:**

- Modify: `supabase/functions/watch/index.ts`
- Modify: `supabase/functions/watch/watch-cycle.ts`
- Create: `supabase/functions/watch/discovery-updates.ts`
- Create: `supabase/functions/watch/discovery-updates.test.ts`

- [ ] **Step 1: Write proposed-update tests**

Create `supabase/functions/watch/discovery-updates.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proposedUpdateForAlert } from "./discovery-updates.ts";

Deno.test("new high-tier source creates pending update, not auto-applied conclusion", () => {
  const update = proposedUpdateForAlert({
    project_id: "project-1",
    claim_id: "claim-1",
    watch_event_id: "event-1",
    alert_reason: "new_high_tier_study",
    title: "New randomized trial",
  });
  assertEquals(update.review_status, "pending");
  assertEquals(update.change_type, "new_source");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
deno test supabase/functions/watch/discovery-updates.test.ts
```

Expected: FAIL because `discovery-updates.ts` does not exist.

- [ ] **Step 3: Implement pending update builder**

Create `supabase/functions/watch/discovery-updates.ts`:

```ts
export interface AlertForDiscoveryUpdate {
  project_id: string;
  claim_id: string | null;
  watch_event_id: string;
  alert_reason: "new_high_tier_study" | "retraction";
  title: string;
}

export function proposedUpdateForAlert(alert: AlertForDiscoveryUpdate) {
  return {
    project_id: alert.project_id,
    claim_id: alert.claim_id,
    watch_event_id: alert.watch_event_id,
    change_type: alert.alert_reason === "retraction" ? "new_conflict" : "new_source",
    summary: alert.alert_reason === "retraction"
      ? `A retraction-related source may weaken or conflict with a saved claim: ${alert.title}`
      : `A new high-tier source may change the evidence map: ${alert.title}`,
    review_status: "pending",
  };
}
```

- [ ] **Step 4: Integrate after watch event creation**

In `supabase/functions/watch/index.ts`, after inserting a `watch_events` row with `is_alert = true`, check whether the watch is linked to a saved report that has a `research_projects.saved_report_id`. If found, insert one `evidence_updates` row using `proposedUpdateForAlert`.

Query shape:

```ts
const projectRes = await fetch(`${SB_URL}/rest/v1/research_projects?select=id&saved_report_id=eq.${savedReportId}&limit=1`, {
  headers: serviceHeaders(SERVICE_KEY),
});
```

Insert shape:

```ts
await fetch(`${SB_URL}/rest/v1/evidence_updates`, {
  method: "POST",
  headers: serviceHeaders(SERVICE_KEY),
  body: JSON.stringify(update),
});
```

Do not update `research_claims.verdict`, `evidence_grade`, or `current_version` in this task. Level 5 starts with pending updates that the user can review.

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno test supabase/functions/watch/discovery-updates.test.ts supabase/functions/watch/watch-cycle.test.ts
```

Expected: PASS.

Commit:

```bash
git add supabase/functions/watch/discovery-updates.ts supabase/functions/watch/discovery-updates.test.ts supabase/functions/watch/index.ts supabase/functions/watch/watch-cycle.ts
git commit -m "feat(discovery): create pending updates from watch alerts"
```

## Task 11: Smoke Tests and Launch Gate

**Files:**

- Create: `scripts/diag/discovery-report-smoke.ts`
- Update: `docs/EVIDENCE_OS_ROADMAP.md`

- [ ] **Step 1: Add smoke script**

Create `scripts/diag/discovery-report-smoke.ts`:

```ts
const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const jwt = Deno.env.get("TEST_USER_JWT");

if (!url || !anon || !jwt) {
  throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_USER_JWT.");
}

const res = await fetch(`${url}/functions/v1/research`, {
  method: "POST",
  headers: {
    apikey: anon,
    authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    question: "Create a discovery report on creatine for cognition in sleep-deprived adults.",
    mode: "discovery",
  }),
});

const json = await res.json();
if (res.status !== 202) {
  throw new Error(`research did not start: ${res.status} ${JSON.stringify(json)}`);
}

console.log(JSON.stringify(json, null, 2));
```

- [ ] **Step 2: Run the local verification pack**

Run:

```bash
deno test packages/shared/src/discovery.test.ts \
  packages/shared/src/research-contract.test.ts \
  supabase/functions/ask/research/discovery/extract.test.ts \
  supabase/functions/ask/research/discovery/grade.test.ts \
  supabase/functions/ask/research/discovery/design.test.ts \
  supabase/functions/ask/research/discovery/synthesize.test.ts \
  supabase/functions/ask/research/discovery/persist.test.ts \
  supabase/functions/watch/discovery-updates.test.ts
pnpm --filter @pharmaorb/web exec tsx apps/web/lib/discovery-format.test.ts
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Run the deployed smoke only after env is configured**

Run:

```bash
deno run --allow-env --allow-net scripts/diag/discovery-report-smoke.ts
```

Expected: `202` with `{ "run_id": "...", "status": "running" }`.

- [ ] **Step 4: Update roadmap**

In `docs/EVIDENCE_OS_ROADMAP.md`, add this status under Phase 0:

```md
- [~] **Discovery Report / Level 4 MVP** - persisted project + claim cards + gap analysis + study designer. Level 5 monitoring creates pending evidence updates, but does not auto-rewrite conclusions.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/diag/discovery-report-smoke.ts docs/EVIDENCE_OS_ROADMAP.md
git commit -m "chore(discovery): add launch gate and roadmap note"
```

## Acceptance Criteria

The MVP is ready when all of these are true:

- A Pro user can start a Discovery Report from Ask.
- The research endpoint accepts `mode: "discovery"`.
- The finished saved report payload includes `discovery`.
- The report screen shows evidence meter, claim cards, study table, gaps, hypotheses, and suggested study design.
- Word/PDF/PPT exports include the same discovery sections.
- A `research_projects` row is created for the saved report.
- At least one `research_claims` row is created for a report with cited claims.
- Authenticated users can read only their own research projects and child rows.
- Service role can persist discovery child rows.
- Watch alerts create pending `evidence_updates` when a discovery project exists.
- No code says "PRISMA-compliant," "GRADE rating," or "systematic review" for this feature.

## Test Plan

Local:

```bash
deno test packages/shared/src/discovery.test.ts \
  packages/shared/src/research-contract.test.ts \
  supabase/functions/ask/research/discovery/extract.test.ts \
  supabase/functions/ask/research/discovery/grade.test.ts \
  supabase/functions/ask/research/discovery/design.test.ts \
  supabase/functions/ask/research/discovery/synthesize.test.ts \
  supabase/functions/ask/research/discovery/persist.test.ts \
  supabase/functions/watch/discovery-updates.test.ts
pnpm --filter @pharmaorb/web exec tsx apps/web/lib/discovery-format.test.ts
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
supabase db reset
git diff --check
```

Deployed smoke:

```bash
deno run --allow-env --allow-net scripts/diag/discovery-schema-check.ts
deno run --allow-env --allow-net scripts/diag/discovery-report-smoke.ts
```

Manual browser QA:

- Start a Discovery Report from Ask.
- Confirm the report progresses through planning, gathering, writing, checking.
- Open the finished report.
- Confirm claim cards cite numbered sources.
- Confirm source panel opens supporting citations.
- Export Word, PDF, and PowerPoint.
- Follow/watch the project topic.
- Confirm a pending update appears when a test watch alert is inserted.

## Level 5 Follow-Up Plan

After this MVP is shipped and verified, write a separate plan for:

1. Recompute a claim from the accumulated source set when a pending update lands.
2. Compare old and new claim snapshots.
3. Create `claim_versions` only after user approval.
4. Show "evidence changed from weak to moderate" in the project timeline.
5. Revise hypotheses and study designs when the gap has changed.
6. Add email digest copy for living project updates.

Keep this separate because it changes user trust semantics: Level 5 is not just display, it modifies a living conclusion.

## Self-Review

- Spec coverage: covers Level 4 discovery engine, claim cards, evidence rating, gap analysis, hypothesis suggestions, study design, watchlist connection, and Level 5 pending updates.
- Placeholder scan: migration filename is intentionally CLI-generated per Supabase guidance; every other file path is exact.
- Type consistency: `DiscoveryReport`, `DiscoveryClaim`, `ResearchGap`, `ResearchHypothesis`, and `SuggestedStudyDesign` are defined in Task 1 and reused throughout.
- Safety: no formal PRISMA/GRADE claims, no automatic medical advice, no silent conclusion rewrites.
