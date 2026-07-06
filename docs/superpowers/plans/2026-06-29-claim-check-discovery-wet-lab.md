# Claim Check, Discovery Gap, and Wet Lab Draft Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next evidence-engine layer: claim checking, steelman/falsification search, literature gap discovery, and wet-lab/study-design draft outputs.

**Architecture:** Reuse the Evidence API broker as the search layer, then add structured extraction and classification on top. Store claims, evidence relations, extracted study details, gaps, and protocol drafts in Supabase so Ask, Evidence Map, Reports, API, CLI, and MCP can all use the same evidence objects.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres, existing evidence broker adapters, existing discovery tables, OpenAI/DeepSeek answer generation, optional Voyage embeddings for retrieval.

---

## Research Workflow Model

PharmaOrb should model the real research workflow:

`Question -> literature review -> hypothesis -> protocol -> experiment/study -> data -> analysis -> interpretation -> manuscript -> peer review -> publication -> replication/follow-up`

The product should not become a journal first. It should become the research operating system before publication: a private workspace that turns messy evidence, notes, protocols, datasets, and drafts into defensible research artifacts.

## Standards To Encode

- NIH emphasizes rigor, transparency, reproducibility, and data sharing.
- Human-subject research requires IRB/FWA awareness and protocol approval gates.
- Animal research requires IACUC/OLAW awareness and humane-use compliance gates.
- Clinical trial protocol drafts should align with SPIRIT-style protocol items.
- Randomized trial reporting should align with CONSORT-style items.
- Systematic review outputs should align with PRISMA-style flow and checklist fields.
- Animal/preclinical drafts should align with ARRIVE-style reporting fields.
- Protocol drafts should resemble structured protocols, not casual journal entries.

## References Researched

- NIH Data Management and Sharing Policy: scientific data sharing improves validation, reuse, rigor, and reproducibility.
  - https://grants.nih.gov/policy-and-compliance/policy-topics/sharing-policies/dms/policy-overview
- NIH rigor and reproducibility guidance: rigorous experimental design and transparency are core biomedical research expectations.
  - https://grants.nih.gov/policy-and-compliance/policy-topics/reproducibility
- HHS/OHRP human-subject protections: human research requires rights, welfare, wellbeing, IRB/FWA, and Common Rule awareness.
  - https://www.hhs.gov/ohrp/index.html
  - https://www.hhs.gov/ohrp/register-irbs-and-obtain-fwas/index.html
- NIH OLAW/PHS animal research policy: PHS-supported animal work requires assured institutions and IACUC review/approval.
  - https://olaw.nih.gov/guidance/articles/laba95.htm
- ClinicalTrials.gov PRS: clinical studies are registered and results/study documents are submitted through the protocol registration system.
  - https://clinicaltrials.gov/submit-studies
  - https://register.clinicaltrials.gov/
- CONSORT 2025: reporting guideline for randomized trials.
  - https://www.equator-network.org/reporting-guidelines/consort/
- SPIRIT 2025: minimum protocol items for randomized trial protocols.
  - https://www.consort-spirit.org/
- PRISMA 2020: checklist and flow diagram for systematic reviews and meta-analyses.
  - https://www.prisma-statement.org/prisma-2020
  - https://www.prisma-statement.org/prisma-2020-flow-diagram
- ARRIVE 2.0: checklist for transparent reporting of in vivo animal experiments.
  - https://arriveguidelines.org/
  - https://arriveguidelines.org/arrive-guidelines
- Center for Open Science preregistration and Registered Reports: preregistration defines a plan before study execution; Registered Reports review the question/methods before data collection.
  - https://www.cos.io/initiatives/prereg
  - https://www.cos.io/initiatives/registered-reports
- protocols.io: structured, versioned, reusable methods/protocol workspace.
  - https://www.protocols.io/

## File Structure

- Create: `apps/web/lib/evidence/claim-check/types.ts`
  - Claim, steelman, evidence relation, extracted study, gap, and protocol draft types.
- Create: `apps/web/lib/evidence/claim-check/steelman.ts`
  - Deterministic claim normalization and prompt builder for LLM steelman output.
- Create: `apps/web/lib/evidence/claim-check/classify.ts`
  - Evidence relation classifier: supports, contradicts, partial, mentions, irrelevant.
- Create: `apps/web/lib/evidence/claim-check/gaps.ts`
  - Gap detection from extracted studies.
- Create: `apps/web/lib/evidence/claim-check/wet-lab-draft.ts`
  - Study/protocol draft generator and compliance gate labels.
- Create: `apps/web/app/api/v1/evidence/claim-check/route.ts`
  - Endpoint for claim checking.
- Create: `apps/web/app/api/v1/evidence/gap-report/route.ts`
  - Endpoint for literature gap report.
- Create: `apps/web/app/api/v1/evidence/protocol-draft/route.ts`
  - Endpoint for wet-lab/study-design drafts.
- Create: `supabase/migrations/<timestamp>_claim_check_protocol_drafts.sql`
  - Tables for claim checks, evidence relations, extracted studies, gap reports, protocol drafts.
- Modify: `apps/web/app/app/ask/page.tsx`
  - Add claim-check and gap-report result rendering after backend endpoint exists.
- Modify: `docs/EVIDENCE_API_BROKER.md`
  - Document how broker search feeds claim checking and discovery.

## Task 1: Claim Check Data Model

**Files:**
- Create: `apps/web/lib/evidence/claim-check/types.ts`
- Test: `apps/web/lib/evidence/claim-check/types.test.ts`

- [ ] **Step 1: Write the failing type-shape test**

```ts
import assert from "node:assert/strict";
import { evidenceRelations, evidenceGrades, protocolDraftKinds } from "./types";

assert.deepEqual(evidenceRelations, [
  "supports",
  "contradicts",
  "partial",
  "mentions",
  "irrelevant",
]);

assert.ok(evidenceGrades.includes("strong"));
assert.ok(evidenceGrades.includes("insufficient"));
assert.ok(protocolDraftKinds.includes("wet_lab"));
assert.ok(protocolDraftKinds.includes("clinical_trial"));

console.log("claim-check type constants passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/types.test.ts
```

Expected: fail with `Cannot find module './types'`.

- [ ] **Step 3: Add minimal shared types**

```ts
export const evidenceRelations = [
  "supports",
  "contradicts",
  "partial",
  "mentions",
  "irrelevant",
] as const;

export type EvidenceRelation = (typeof evidenceRelations)[number];

export const evidenceGrades = [
  "strong",
  "moderate",
  "weak",
  "very_weak",
  "mixed",
  "insufficient",
  "preclinical",
] as const;

export type EvidenceGrade = (typeof evidenceGrades)[number];

export const protocolDraftKinds = [
  "wet_lab",
  "animal",
  "clinical_trial",
  "observational",
  "systematic_review",
] as const;

export type ProtocolDraftKind = (typeof protocolDraftKinds)[number];

export interface SteelmanClaim {
  original_claim: string;
  testable_claim: string;
  population: string | null;
  intervention_or_exposure: string | null;
  comparator: string | null;
  outcome: string | null;
  timeframe: string | null;
  assumptions: string[];
}

export interface ExtractedStudy {
  source_id: string;
  title: string;
  study_type: string;
  population: string | null;
  sample_size: number | null;
  intervention_or_exposure: string | null;
  comparator: string | null;
  outcomes: string[];
  effect_direction: "positive" | "negative" | "null" | "mixed" | "unclear";
  human_data: boolean;
  limitations: string[];
}

export interface LiteratureGap {
  dimension:
    | "population"
    | "sample_size"
    | "duration"
    | "comparator"
    | "outcome"
    | "dose_response"
    | "safety"
    | "mechanism"
    | "replication"
    | "publication";
  severity: "high" | "medium" | "low";
  description: string;
  why_it_matters: string;
  testable_question: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/types.test.ts
```

Expected: pass.

## Task 2: Steelman Claim Parser

**Files:**
- Create: `apps/web/lib/evidence/claim-check/steelman.ts`
- Test: `apps/web/lib/evidence/claim-check/steelman.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { buildSteelmanPrompt, normalizeClaimText } from "./steelman";

assert.equal(
  normalizeClaimText("  Creatine   helps cognition!! "),
  "Creatine helps cognition",
);

const prompt = buildSteelmanPrompt("Creatine helps cognition in sleep deprivation");
assert.match(prompt, /strongest testable version/i);
assert.match(prompt, /population/i);
assert.match(prompt, /outcome/i);
assert.match(prompt, /do not invent/i);

console.log("steelman tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/steelman.test.ts
```

Expected: fail with `Cannot find module './steelman'`.

- [ ] **Step 3: Implement deterministic helpers**

```ts
export function normalizeClaimText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!?.,;:]+$/g, "");
}

export function buildSteelmanPrompt(claim: string): string {
  const normalized = normalizeClaimText(claim);
  return [
    "Rewrite the user's claim into the strongest testable version without changing its meaning.",
    "Do not invent entities, outcomes, populations, or mechanisms that are not implied by the claim.",
    "Return JSON with: original_claim, testable_claim, population, intervention_or_exposure, comparator, outcome, timeframe, assumptions.",
    "If a field is missing, use null or an empty assumptions array.",
    `Claim: ${normalized}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/steelman.test.ts
```

Expected: pass.

## Task 3: Evidence Relation Classifier

**Files:**
- Create: `apps/web/lib/evidence/claim-check/classify.ts`
- Test: `apps/web/lib/evidence/claim-check/classify.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { classifyRelationFromSignals, gradeEvidenceFromStudies } from "./classify";

assert.equal(
  classifyRelationFromSignals({ sameOutcome: true, effectDirection: "positive", claimDirection: "positive" }),
  "supports",
);
assert.equal(
  classifyRelationFromSignals({ sameOutcome: true, effectDirection: "negative", claimDirection: "positive" }),
  "contradicts",
);
assert.equal(
  classifyRelationFromSignals({ sameOutcome: false, effectDirection: "positive", claimDirection: "positive" }),
  "partial",
);

assert.equal(
  gradeEvidenceFromStudies([
    { study_type: "randomized controlled trial", human_data: true, sample_size: 240 },
    { study_type: "systematic review", human_data: true, sample_size: null },
  ]),
  "strong",
);
assert.equal(
  gradeEvidenceFromStudies([
    { study_type: "in vitro", human_data: false, sample_size: null },
  ]),
  "preclinical",
);
assert.equal(gradeEvidenceFromStudies([]), "insufficient");

console.log("classifier tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/classify.test.ts
```

Expected: fail with `Cannot find module './classify'`.

- [ ] **Step 3: Implement minimal deterministic classifier**

```ts
import type { EvidenceGrade, EvidenceRelation } from "./types";

export function classifyRelationFromSignals(input: {
  sameOutcome: boolean;
  effectDirection: "positive" | "negative" | "null" | "mixed" | "unclear";
  claimDirection: "positive" | "negative";
}): EvidenceRelation {
  if (!input.sameOutcome) return "partial";
  if (input.effectDirection === "mixed" || input.effectDirection === "unclear") return "mentions";
  if (input.effectDirection === "null") return "contradicts";
  return input.effectDirection === input.claimDirection ? "supports" : "contradicts";
}

export function gradeEvidenceFromStudies(
  studies: Array<{ study_type: string; human_data: boolean; sample_size: number | null }>,
): EvidenceGrade {
  if (!studies.length) return "insufficient";
  const human = studies.filter((study) => study.human_data);
  if (!human.length) return "preclinical";
  const text = human.map((study) => study.study_type.toLowerCase()).join(" ");
  const hasReview = /systematic|meta/.test(text);
  const hasLargeRct = human.some(
    (study) => /random/.test(study.study_type.toLowerCase()) && (study.sample_size ?? 0) >= 100,
  );
  const hasAnyRct = human.some((study) => /random/.test(study.study_type.toLowerCase()));
  if (hasReview && hasLargeRct) return "strong";
  if (hasReview || hasLargeRct || hasAnyRct) return "moderate";
  return "weak";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/classify.test.ts
```

Expected: pass.

## Task 4: Literature Gap Detector

**Files:**
- Create: `apps/web/lib/evidence/claim-check/gaps.ts`
- Test: `apps/web/lib/evidence/claim-check/gaps.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { detectLiteratureGaps } from "./gaps";

const gaps = detectLiteratureGaps([
  {
    source_id: "pmid:1",
    title: "Small short trial",
    study_type: "randomized controlled trial",
    population: "healthy adults",
    sample_size: 18,
    intervention_or_exposure: "creatine",
    comparator: "placebo",
    outcomes: ["reaction time"],
    effect_direction: "positive",
    human_data: true,
    limitations: ["short duration"],
  },
]);

assert.ok(gaps.some((gap) => gap.dimension === "sample_size"));
assert.ok(gaps.some((gap) => gap.dimension === "duration"));
assert.ok(gaps.every((gap) => gap.testable_question.length > 10));

console.log("gap detector tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/gaps.test.ts
```

Expected: fail with `Cannot find module './gaps'`.

- [ ] **Step 3: Implement first deterministic gap rules**

```ts
import type { ExtractedStudy, LiteratureGap } from "./types";

export function detectLiteratureGaps(studies: ExtractedStudy[]): LiteratureGap[] {
  const gaps: LiteratureGap[] = [];
  const humanStudies = studies.filter((study) => study.human_data);

  if (!humanStudies.length) {
    gaps.push({
      dimension: "population",
      severity: "high",
      description: "No human studies were identified.",
      why_it_matters: "Human evidence is needed before making strong claims about real-world effects.",
      testable_question: "Does this intervention or exposure produce the claimed outcome in humans?",
    });
  }

  if (humanStudies.some((study) => (study.sample_size ?? 0) > 0 && (study.sample_size ?? 0) < 50)) {
    gaps.push({
      dimension: "sample_size",
      severity: "high",
      description: "Existing human studies appear underpowered or very small.",
      why_it_matters: "Small samples can overestimate effects and miss safety signals.",
      testable_question: "Would the effect persist in a larger adequately powered human study?",
    });
  }

  if (studies.some((study) => study.limitations.some((item) => /short|acute/i.test(item)))) {
    gaps.push({
      dimension: "duration",
      severity: "medium",
      description: "Existing studies appear short-term or acute.",
      why_it_matters: "Short studies may not capture durability, adaptation, or delayed adverse effects.",
      testable_question: "Does the claimed effect persist over a longer follow-up period?",
    });
  }

  return gaps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/gaps.test.ts
```

Expected: pass.

## Task 5: Wet Lab / Study Draft Generator

**Files:**
- Create: `apps/web/lib/evidence/claim-check/wet-lab-draft.ts`
- Test: `apps/web/lib/evidence/claim-check/wet-lab-draft.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { draftProtocolFromGap } from "./wet-lab-draft";

const draft = draftProtocolFromGap({
  dimension: "mechanism",
  severity: "high",
  description: "Mechanism is plausible but untested.",
  why_it_matters: "Mechanistic work can explain whether the observed association is causal.",
  testable_question: "Does creatine alter neuronal energy markers under sleep deprivation?",
});

assert.equal(draft.kind, "wet_lab");
assert.match(draft.ethics_gate, /institutional/i);
assert.ok(draft.controls.length > 0);
assert.ok(draft.reproducibility_checklist.includes("pre-specify primary endpoint"));

console.log("wet lab draft tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/wet-lab-draft.test.ts
```

Expected: fail with `Cannot find module './wet-lab-draft'`.

- [ ] **Step 3: Implement safe draft generator**

```ts
import type { LiteratureGap, ProtocolDraftKind } from "./types";

export interface ProtocolDraft {
  kind: ProtocolDraftKind;
  research_question: string;
  hypothesis: string;
  model_or_population: string;
  controls: string[];
  endpoints: string[];
  analysis_plan: string[];
  reproducibility_checklist: string[];
  ethics_gate: string;
  safety_note: string;
}

export function draftProtocolFromGap(gap: LiteratureGap): ProtocolDraft {
  return {
    kind: gap.dimension === "mechanism" ? "wet_lab" : "clinical_trial",
    research_question: gap.testable_question,
    hypothesis: `A targeted study can test whether: ${gap.testable_question}`,
    model_or_population:
      gap.dimension === "mechanism"
        ? "Appropriate validated cell, tissue, organoid, animal, or ex vivo model selected by domain experts."
        : "Human population matching the claim, with inclusion/exclusion criteria defined before recruitment.",
    controls: [
      "negative control",
      "positive control when available",
      "vehicle/placebo or comparator group",
      "batch/randomization control",
    ],
    endpoints: [
      "pre-specified primary endpoint",
      "secondary mechanistic or safety endpoints",
      "quality-control and exclusion criteria",
    ],
    analysis_plan: [
      "pre-specify primary comparison",
      "define missing-data handling",
      "estimate sample size or power assumptions",
      "separate exploratory from confirmatory analyses",
    ],
    reproducibility_checklist: [
      "pre-specify primary endpoint",
      "record materials and reagent identifiers",
      "document randomization and blinding where possible",
      "record protocol version",
      "share data/code when legally and ethically possible",
    ],
    ethics_gate:
      "Draft only. Requires institutional review, biosafety review, IRB/IACUC review where applicable, and domain expert validation before execution.",
    safety_note:
      "This is a planning artifact, not operational lab instructions or approval to run an experiment.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
pnpm exec tsx lib/evidence/claim-check/wet-lab-draft.test.ts
```

Expected: pass.

## Task 6: Supabase Persistence

**Files:**
- Create: `supabase/migrations/<timestamp>_claim_check_protocol_drafts.sql`

- [ ] **Step 1: Create migration**

Run:

```bash
pnpm supabase migration new claim_check_protocol_drafts
```

Expected: new migration under `supabase/migrations/`.

- [ ] **Step 2: Add tables and RLS**

Use this SQL in the generated migration:

```sql
create table if not exists public.claim_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  original_claim text not null,
  testable_claim text not null,
  verdict text not null check (verdict in ('supported', 'weakly_supported', 'mixed', 'unsupported', 'insufficient_evidence')),
  evidence_grade text not null,
  plain_english_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_check_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_check_id uuid not null references public.claim_checks(id) on delete cascade,
  paper_id uuid references public.papers(id) on delete set null,
  relation text not null check (relation in ('supports', 'contradicts', 'partial', 'mentions', 'irrelevant')),
  evidence_grade text not null,
  quote_or_snippet text,
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.protocol_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  claim_check_id uuid references public.claim_checks(id) on delete set null,
  draft_kind text not null check (draft_kind in ('wet_lab', 'animal', 'clinical_trial', 'observational', 'systematic_review')),
  research_question text not null,
  draft jsonb not null,
  ethics_gate text not null,
  created_at timestamptz not null default now()
);

alter table public.claim_checks enable row level security;
alter table public.claim_check_evidence enable row level security;
alter table public.protocol_drafts enable row level security;

create policy claim_checks_owner on public.claim_checks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy claim_check_evidence_owner_read on public.claim_check_evidence
  for select to authenticated
  using (
    exists (
      select 1 from public.claim_checks cc
      where cc.id = claim_check_id and cc.user_id = (select auth.uid())
    )
  );

create policy protocol_drafts_owner on public.protocol_drafts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.claim_checks, public.protocol_drafts to authenticated;
grant select on table public.claim_check_evidence to authenticated;
grant select, insert, update, delete on table public.claim_checks, public.claim_check_evidence, public.protocol_drafts to service_role;
```

- [ ] **Step 3: Run migration verification**

Run:

```bash
pnpm supabase db lint --local --fail-on error
```

Expected: pass when local Supabase is running. If local DB is not running, record the connection error and test SQL in a linked preview database before deployment.

## Task 7: API Routes

**Files:**
- Create: `apps/web/app/api/v1/evidence/claim-check/route.ts`
- Create: `apps/web/app/api/v1/evidence/gap-report/route.ts`
- Create: `apps/web/app/api/v1/evidence/protocol-draft/route.ts`

- [ ] **Step 1: Add claim-check route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { searchEvidence } from "@/lib/evidence/search";
import { gradeEvidenceFromStudies } from "@/lib/evidence/claim-check/classify";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { claim?: string };
  const claim = body.claim?.trim();
  if (!claim) {
    return NextResponse.json({ error: "missing_claim" }, { status: 400 });
  }

  const search = await searchEvidence(claim, { limit: 20 });
  const grade = gradeEvidenceFromStudies([]);

  return NextResponse.json({
    claim,
    verdict: search.count ? "insufficient_evidence" : "insufficient_evidence",
    evidence_grade: grade,
    sources: search.results,
    warnings: search.warnings,
  });
}
```

- [ ] **Step 2: Add gap-report route after Task 4**

Return `{ gaps, studies, summary }`, using `detectLiteratureGaps(extractedStudies)`.

- [ ] **Step 3: Add protocol-draft route after Task 5**

Return `{ draft, ethics_gate, safety_note }`, using `draftProtocolFromGap(gap)`.

- [ ] **Step 4: Run route compile check**

Run:

```bash
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
```

Expected: both pass.

## Task 8: Ask UI Rendering

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx`

- [ ] **Step 1: Add result panels**

Render claim-check answers with:

- plain-English verdict
- supporting evidence
- contradicting evidence
- limited/no-human-data banner
- gap cards
- protocol draft button
- visual summary area

- [ ] **Step 2: Keep default answer plain English**

The top answer should be short, conversational, and research-framed. Put technical extraction, PICO fields, and protocol details behind expanders or the right evidence panel.

- [ ] **Step 3: Verify UI manually**

Run:

```bash
pnpm --filter @pharmaorb/web dev
```

Open:

```text
http://localhost:3100/app/ask
```

Test prompts:

```text
Claim check: creatine improves cognition during sleep deprivation
Find gaps: berberine for glycemic control in type 2 diabetes
Draft a study to test GLP-1 muscle loss prevention with resistance training
```

Expected: answer stays plain English, evidence panel shows support/contradiction/gaps, protocol draft is clearly marked as a planning artifact.

## Task 9: Documentation

**Files:**
- Modify: `docs/EVIDENCE_API_BROKER.md`
- Modify: `docs/PHARMAORB_TODO.md`

- [ ] **Step 1: Document workflow**

Add:

```md
Evidence broker -> claim extraction -> support/contradiction classifier -> study extraction -> gap detector -> study/protocol draft -> living monitor.
```

- [ ] **Step 2: Document safety boundaries**

Add:

```md
Wet Lab Draft Mode generates planning drafts only. It must not provide operational instructions for unsafe work, bypass ethics review, or imply institutional approval.
```

- [ ] **Step 3: Document references**

List NIH rigor/reproducibility, NIH human-subject protections, OLAW animal welfare, PRISMA, CONSORT/SPIRIT, ARRIVE, and protocols.io as design references.

## Verification Checklist

- [ ] Broker search still passes.
- [ ] Claim-check tests pass.
- [ ] Gap detector tests pass.
- [ ] Protocol draft tests pass.
- [ ] Web typecheck passes.
- [ ] Web build passes.
- [ ] Supabase migration lint passes or the local DB connection blocker is recorded.
- [ ] Ask UI tested with claim-check, gap-report, and study-draft prompts.
