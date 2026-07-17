# Phase 3 — Journal Club Appraisal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload a research paper (PDF) and get a structured critical appraisal — design, population, endpoints, statistical validity, risk-of-bias flags, verdicts grounded in verbatim quotes — plus discussion questions, rendered as a saved cited report with PDF/Word/PowerPoint deck exports, filed in the Library, with the same live-progress feel as an existing deep-research run.

**Architecture:** A new Next.js API route extracts text from the uploaded PDF (Node runtime, `unpdf`). The extracted text rides the request to the existing `research` edge function under a new `mode: "appraisal"`, which runs a paper-profile → grounded-appraisal LLM pipeline (reusing the FROZEN `ask/safety.ts` deterministic layer as-is) and shapes the result into the existing `ResearchReport` contract (so the Library, report view, and all three exports work unchanged). A new additive field `appraisal_questions?: string[]` carries the discussion questions and gets a small render/slide/section. The composer gains an active "Journal club" entry that opens an upload sheet, extracts, then launches the run.

**Tech Stack:** TypeScript. Deno edge functions (`supabase/functions/research`, `supabase/functions/ask/**` — `ask/**` is FROZEN and reused verbatim, never edited). Next.js 16 App Router web app (`apps/web`, React 19). Shared contract package `@nemesis/shared` (plain `.ts`, `deno test packages/shared/`). New dep: `unpdf` (MIT, pure-JS PDF text extraction, Node runtime). Report exports reuse `docx` v9.7.1 / `pptxgenjs` v4.0.1 / the hand-rolled `pdf.ts`.

## Global Constraints

- **FROZEN layer — never edit:** `supabase/functions/ask/**` (especially `ask/safety.ts`). It is imported and reused verbatim. This plan touches `supabase/functions/research/**` (NOT frozen), `apps/web/**`, and `packages/shared/**` only.
- **`ask` guardrail suite is NOT touched by this work** — the `ask` edge function is unchanged, so `deno run --allow-net --allow-env scripts/guardrail-suite.ts` neither needs a re-run for correctness nor can regress from these changes. State this in the PR.
- **No new migration.** Verified against `origin/main`: `saved_reports.mode` is `text not null default 'standard'` with **no CHECK** (`supabase/migrations/20260623000000_projects.sql:39`); `saved_reports.kind` already allows `'deep_research'` (`0123_evidence_reports_entitlements.sql:50-58`); `research_report_runs.report_kind` already allows `'deep_research'` (`0123...:87`). The reports Library groups by `mode`, not `kind`. So an appraisal run writes `kind='deep_research'` + `mode='appraisal'` with zero schema change.
- **No new storage bucket / no new table.** The extracted paper text (capped) rides the request and is captured (as verbatim quotes + a synthetic citation) inside the saved report payload. Tradeoff: the original PDF is not re-downloadable later; acceptable for v1.
- **Quota:** an appraisal run consumes one `deep_research_daily` unit via the existing `consume_usage` path (Pro-gated, `deep_research_daily_limit` is 0 for free/plus, 3 for pro) — identical to a Deep research run. No new counter.
- **Deploy order is binding (PR #90 pattern):** the `research` edge function MUST be deployed (owner-gated) BEFORE the web change merges. If web ships first, a `mode:"appraisal"` request would hit the old fn — Task 3 adds a boundary guard so the old fn can't silently degrade an appraisal into a standard run (it 400s on unknown behavior), but the correct order is fn-first.
- **No fake UI states.** Every disabled/coming-soon affordance stays honest; the new upload path either works or shows a specific honest error (too big, not a PDF, empty extraction, scanned image with no text layer).
- **Conventional commits.** `feat:` / `test:` / `chore:` prefixes.
- **Tests:** shared pure modules → `deno test packages/shared/`. Research edge modules → `deno test --allow-env supabase/functions/ask/` (the research fn's pure modules live alongside and are picked up by the same runner via relative imports; new pure appraisal modules under `supabase/functions/research/` are tested with an explicit path). Web pure logic → `node:assert` + `npx tsx <file>.test.ts` (apps/web has **no** component runner — React wiring is verified by build + manual, not a component test). Web gate → `npm run build` (turbo).

## PR #98 robustness note

PR #98 ("Skills in the composer + voice dictation") is OPEN on `origin/main` as of 2026-07-04 (not merged). Base `origin/main` therefore has **no** "Journal club — Soon" entry and **no** Skills section — the composer's only file/upload affordance is the disabled `Add photos & files` stub in the `+` tools menu (`apps/web/app/app/ask/page.tsx`, the two `<button ... disabled>` lines rendering "Add photos & files"/"Soon"). Task 5 is written against that real base. It includes a one-line conditional instruction: if #98 has merged by execution time (a Skills section with a "Journal club — Soon" entry exists), activate/relocate that existing entry instead of adding a new tools-menu item — same handler, different anchor.

## File Structure

**Shared (`packages/shared/src/`)**
- `research.ts` (modify): add `"appraisal"` to `ReportMode`; add optional `appraisal_questions?: string[]` and `paper_meta?: PaperMeta` to `ResearchReport`; add the `AppraisalInput` / `AppraisalDimension` / `PaperMeta` types.
- `appraisal-report.ts` (create): PURE shaper — turns a structured `AppraisalInput` into a `ResearchReport` (dimension → sections, verdicts → points, limitations → uncertainties, questions → `appraisal_questions`, the paper → citation `[1]`).
- `appraisal-report.test.ts` (create): Deno tests for the shaper.
- `index.ts` (modify): the barrel already does `export * from "./research.ts"`; add `export * from "./appraisal-report.ts"`.

**Extraction route (`apps/web/`)**
- `lib/pdf/extract.ts` (create): PURE-ish wrapper around `unpdf` returning `{ text, meta }`, with the text cap + truncation flag.
- `lib/pdf/extract.test.ts` (create): `node:assert` + `tsx` unit test for the cap/truncation/empty logic (no real PDF needed — tests the pure helpers).
- `app/api/v1/papers/extract/route.ts` (create): auth + rate-limit + size guard, calls the wrapper, returns JSON.
- `package.json` (modify): add `unpdf` dependency.

**Research edge function (`supabase/functions/research/`)**
- `appraise.ts` (create): the appraisal pipeline — profile the paper, run the grounded appraisal LLM pass, verify quotes verbatim, produce an `AppraisalInput`.
- `appraise.test.ts` (create): Deno tests for the pure verbatim-quote verification + input normalization.
- `index.ts` (modify): parse `mode:"appraisal"`, accept `paper_text`/`paper_meta`, guard, run `runAppraisal`, persist as `kind='deep_research'`/`mode='appraisal'`.

**Exports (`apps/web/lib/export/`)**
- `pptx.ts`, `docx.ts`, `pdf.ts` (modify): render `appraisal_questions` when present (one slide / one section).

**Composer + Library (`apps/web/`)**
- `app/app/ask/page.tsx` (modify): active "Journal club" entry → `PaperUploadSheet` → extract → `startAppraisal`; `ResearchRunCard` mode label gains "Journal club appraisal".
- `components/PaperUploadSheet.tsx` (create): drag/drop + file input, PDF-only, 15MB cap, honest errors.
- `lib/api.ts` (modify): add `extractPaper()` and `startAppraisal()` client helpers; extend `ResearchReportSummary.mode` comment.
- `app/app/reports/page.tsx` (modify): `MODE_LABEL`/`MODE_ORDER` gain `"appraisal"`.
- `components/ResearchReportView.tsx` (modify): render `appraisal_questions` (a "Discussion questions" block) + a small `paper_meta` header line.

---

## Task 1: Shared types + PURE appraisal-report shaper

**Files:**
- Modify: `packages/shared/src/research.ts`
- Create: `packages/shared/src/appraisal-report.ts`
- Create: `packages/shared/src/appraisal-report.test.ts`
- Modify: `packages/shared/src/index.ts:40` (add one export line after the research.ts export)

**Interfaces:**
- Consumes: `AnswerPoint`, `Citation`, `EvidenceGrade`, `SafetyFlag` from `./answer.ts`; `ResearchReport`, `ReportMode`, `ResearchSection` from `./research.ts`.
- Produces:
  - `ReportMode` now includes `"appraisal"`.
  - `ResearchReport` now has optional `appraisal_questions?: string[]` and `paper_meta?: PaperMeta`.
  - `interface PaperMeta { title: string | null; pages: number; truncated: boolean }`
  - `interface AppraisalDimension { key: AppraisalDimensionKey; heading: string; verdict: AppraisalVerdict; points: AppraisalPoint[] }`
  - `type AppraisalDimensionKey = "design" | "population" | "endpoints" | "statistics" | "risk_of_bias" | "applicability"`
  - `type AppraisalVerdict = "strong" | "adequate" | "weak" | "unclear"`
  - `interface AppraisalPoint { text: string; quote: string | null }`
  - `interface AppraisalInput { paper_meta: PaperMeta; bottom_line: string; dimensions: AppraisalDimension[]; limitations: string[]; questions: string[]; evidence_grade: EvidenceGrade; safety_flags: SafetyFlag[]; claims_verified: boolean }`
  - `function shapeAppraisalReport(input: AppraisalInput): ResearchReport`

- [ ] **Step 1: Add `"appraisal"` to `ReportMode` and the two optional `ResearchReport` fields**

In `packages/shared/src/research.ts`, change the `ReportMode` union (currently ends `... | "discovery"`):

```typescript
export type ReportMode = "standard" | "structured_review" | "meta" | "lab_draft" | "discovery" | "appraisal";
```

Then, inside `export interface ResearchReport { ... }`, immediately AFTER the `discovery?: DiscoveryReport;` line (the last field), add:

```typescript
  /** Journal-club appraisal (mode 'appraisal' only): open discussion questions generated from the
   *  appraised paper. Additive/optional — absent on every other report kind and on older saved reports;
   *  the UI and exports render a "Discussion questions" block only when present. */
  appraisal_questions?: string[];
  /** Journal-club appraisal (mode 'appraisal' only): light metadata about the uploaded paper the
   *  appraisal was built from (title if detected, page count, whether the extracted text was capped).
   *  Additive/optional; the UI shows a one-line paper header when present. */
  paper_meta?: PaperMeta;
```

- [ ] **Step 2: Add the appraisal contract types at the end of `research.ts`**

Append to the END of `packages/shared/src/research.ts`:

```typescript
// ── Journal-club appraisal (mode 'appraisal') ───────────────────────────────
// A structured critical appraisal of ONE uploaded paper. The pipeline (research edge fn) produces an
// AppraisalInput; the PURE shaper in ./appraisal-report.ts turns it into a ResearchReport so the whole
// Library / report-view / export stack renders it unchanged. Every appraisal claim is grounded in a
// verbatim quote from the paper (or carries no quote and is surfaced as a lower-confidence statement).

/** Light metadata about the uploaded paper (never trusted as evidence — descriptive only). */
export interface PaperMeta {
  /** First plausible title line the extractor found, or null if none was confidently detected. */
  title: string | null;
  /** Page count reported by the PDF extractor (0 if unknown). */
  pages: number;
  /** True when the extracted text was capped (the appraisal saw a prefix of a very long paper). */
  truncated: boolean;
}

/** The six appraisal dimensions, in fixed display order. */
export type AppraisalDimensionKey =
  | "design"
  | "population"
  | "endpoints"
  | "statistics"
  | "risk_of_bias"
  | "applicability";

/** A per-dimension verdict. 'unclear' = the paper did not report enough to judge (never invented). */
export type AppraisalVerdict = "strong" | "adequate" | "weak" | "unclear";

/** One appraisal finding, grounded in a verbatim paper quote when one supports it. */
export interface AppraisalPoint {
  text: string;
  /** A verbatim substring of the paper's extracted text, or null when no supporting quote survived
   *  the verbatim check. A null quote means the point is shown as a lower-confidence observation. */
  quote: string | null;
}

/** One appraised dimension: its verdict and the grounded findings behind it. */
export interface AppraisalDimension {
  key: AppraisalDimensionKey;
  heading: string;
  verdict: AppraisalVerdict;
  points: AppraisalPoint[];
}

/** The structured appraisal the pipeline produces, before it is shaped into a ResearchReport. */
export interface AppraisalInput {
  paper_meta: PaperMeta;
  /** Plain-English bottom line (becomes the report summary). */
  bottom_line: string;
  dimensions: AppraisalDimension[];
  /** Honest limitations of the paper (become the report's "Still uncertain" block). */
  limitations: string[];
  /** Open discussion questions for the journal club (become appraisal_questions). */
  questions: string[];
  evidence_grade: EvidenceGrade;
  safety_flags: SafetyFlag[];
  /** True when every load-bearing appraisal point carried a verbatim quote that verified. */
  claims_verified: boolean;
}
```

- [ ] **Step 3: Write the failing test for the shaper**

Create `packages/shared/src/appraisal-report.test.ts`:

```typescript
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shapeAppraisalReport } from "./appraisal-report.ts";
import type { AppraisalInput } from "./research.ts";

function baseInput(overrides: Partial<AppraisalInput> = {}): AppraisalInput {
  return {
    paper_meta: { title: "A Randomized Trial of Drug X", pages: 12, truncated: false },
    bottom_line: "A well-powered RCT with a modest but consistent benefit.",
    dimensions: [
      {
        key: "design",
        heading: "Study design",
        verdict: "strong",
        points: [{ text: "Double-blind, placebo-controlled RCT.", quote: "This was a double-blind, placebo-controlled trial." }],
      },
      {
        key: "statistics",
        heading: "Statistical validity",
        verdict: "adequate",
        points: [{ text: "Primary analysis was intention-to-treat.", quote: null }],
      },
    ],
    limitations: ["Single-center; results may not generalize."],
    questions: ["Would the effect hold in an outpatient population?"],
    evidence_grade: "strong",
    safety_flags: [],
    claims_verified: true,
    ...overrides,
  };
}

Deno.test("shapeAppraisalReport maps dimensions to sections and preserves order", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.mode, "appraisal");
  assertEquals(report.sections.length, 2);
  assertEquals(report.sections[0].heading, "Study design — strong");
  assertEquals(report.sections[1].heading, "Statistical validity — adequate");
  assertEquals(report.summary, "A well-powered RCT with a modest but consistent benefit.");
});

Deno.test("shapeAppraisalReport carries questions, limitations, and paper_meta", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.appraisal_questions, ["Would the effect hold in an outpatient population?"]);
  assertEquals(report.uncertainties.map((u) => u.text), ["Single-center; results may not generalize."]);
  assertEquals(report.paper_meta?.title, "A Randomized Trial of Drug X");
});

Deno.test("shapeAppraisalReport puts the paper in as citation [1] with support quotes", () => {
  const report = shapeAppraisalReport(baseInput());
  assertEquals(report.citations.length, 1);
  assertEquals(report.citations[0].chunk_tag, "1");
  assertEquals(report.citations[0].source_type, "uploaded_paper");
  assertEquals(report.citations[0].title, "A Randomized Trial of Drug X");
  // The design point had a quote → it is cited [1] and carries the verbatim quote as support.
  const designPoint = report.sections[0].points[0];
  assertEquals(designPoint.citation_ids, ["1"]);
  assert(designPoint.support && designPoint.support[0].citation_tag === "1");
  assert(designPoint.support[0].quote.includes("double-blind"));
  // The stats point had no quote → no citation, no support.
  const statsPoint = report.sections[1].points[0];
  assertEquals(statsPoint.citation_ids, []);
});

Deno.test("shapeAppraisalReport with an untitled paper still produces a non-empty question and a citation", () => {
  const report = shapeAppraisalReport(baseInput({ paper_meta: { title: null, pages: 0, truncated: true } }));
  assertEquals(report.citations.length, 1);
  assertEquals(report.citations[0].title, "Uploaded paper");
  assertEquals(report.question, "Appraisal of the uploaded paper");
});

Deno.test("shapeAppraisalReport with unverified claims appends the not-fully-verified caution", () => {
  const report = shapeAppraisalReport(baseInput({ claims_verified: false }));
  assertEquals(report.claims_verified, false);
  assert(report.uncertainties.some((u) => u.text.toLowerCase().includes("not")));
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `deno test packages/shared/src/appraisal-report.test.ts`
Expected: FAIL — `Module not found "file:///.../appraisal-report.ts"` (the module does not exist yet).

- [ ] **Step 5: Implement the PURE shaper**

Create `packages/shared/src/appraisal-report.ts`:

```typescript
// PURE shaper: turn a structured journal-club AppraisalInput into a ResearchReport, so the Library,
// the ResearchReportView, and all three exports render an appraisal with ZERO new plumbing. No I/O.
//
// Mapping:
//   bottom_line          -> report.summary
//   each dimension       -> a ResearchSection ("Heading — verdict"), its points -> AnswerPoint[]
//   a point WITH a quote -> cites [1] and carries the verbatim quote as ClaimSupport
//   a point WITHOUT      -> no citation (shown as a lower-confidence observation)
//   limitations          -> report.uncertainties
//   questions            -> report.appraisal_questions
//   the paper itself     -> citation [1] (synthetic source_type "uploaded_paper")
//
// The paper is the ONLY citation: an appraisal is grounded in the uploaded document, not the live web.

import type { AnswerPoint, Citation, ClaimSupport } from "./answer.ts";
import type { AppraisalInput, ResearchReport, ResearchSection } from "./research.ts";

/** Appended (like the deep-research UNVERIFIED_NOTE) when the verbatim-quote check could not confirm
 *  every load-bearing point, so an appraisal is never presented as fully verified when it is not. */
const UNVERIFIED_NOTE = "Not fully verified: some appraisal points could not be matched to a verbatim quote in the paper — treat those with extra caution.";

const PAPER_TAG = "1";

/** Build the single synthetic citation representing the uploaded paper. */
function paperCitation(title: string | null): Citation {
  return {
    chunk_tag: PAPER_TAG,
    source_id: "uploaded-paper",
    source_type: "uploaded_paper",
    title: title ?? "Uploaded paper",
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
  };
}

/** One appraisal point -> one AnswerPoint. A quote grounds it (cite [1] + support); no quote = no cite.
 *  Note: ClaimSupport's tag field is `citation_tag` (verified against answer.ts), not `chunk_tag`. */
function toAnswerPoint(text: string, quote: string | null): AnswerPoint {
  if (!quote) return { text, citation_ids: [] };
  const support: ClaimSupport = { citation_tag: PAPER_TAG, quote };
  return { text, citation_ids: [PAPER_TAG], support: [support] };
}

export function shapeAppraisalReport(input: AppraisalInput): ResearchReport {
  const title = input.paper_meta.title;
  const question = title ? `Appraisal of "${title}"` : "Appraisal of the uploaded paper";

  const sections: ResearchSection[] = input.dimensions.map((d) => ({
    heading: `${d.heading} — ${d.verdict}`,
    points: d.points.map((p) => toAnswerPoint(p.text, p.quote)),
  }));

  const uncertainties: AnswerPoint[] = input.limitations.map((text) => ({ text, citation_ids: [] }));
  if (!input.claims_verified) uncertainties.push({ text: UNVERIFIED_NOTE, citation_ids: [] });

  return {
    question,
    summary: input.bottom_line,
    // The dimension headings double as the "what was appraised" list.
    sub_questions: input.dimensions.map((d) => d.heading),
    sections,
    uncertainties,
    safety_notes: [],
    citations: [paperCitation(title)],
    evidence_grade: input.evidence_grade,
    safety_flags: input.safety_flags,
    claims_verified: input.claims_verified,
    mode: "appraisal",
    citation_style: "vancouver",
    appraisal_questions: input.questions,
    paper_meta: input.paper_meta,
  };
}
```

- [ ] **Step 6: Confirm `ClaimSupport` field names before trusting the shaper**

Run: `git show HEAD:packages/shared/src/answer.ts | grep -n "interface ClaimSupport" -A 6`
Expected (verified on `origin/main`): `ClaimSupport` carries **`citation_tag: string`** and **`quote: string`** (NOT `chunk_tag`). The shaper above already uses `citation_tag` — this step is a guard against drift. If the field name has changed, update `toAnswerPoint` and the test's `support[0].citation_tag` assertion to match.

- [ ] **Step 7: Run the test to verify it passes**

Run: `deno test packages/shared/src/appraisal-report.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Add the barrel export**

In `packages/shared/src/index.ts`, find the line `export * from "./research.ts";` (near line 40) and add immediately after it:

```typescript
// Journal-club appraisal: PURE shaper turning a structured appraisal into a ResearchReport.
export * from "./appraisal-report.ts";
```

- [ ] **Step 9: Run the full shared suite to confirm no regressions**

Run: `deno test packages/shared/`
Expected: PASS (all existing shared tests + the 5 new ones).

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/research.ts packages/shared/src/appraisal-report.ts packages/shared/src/appraisal-report.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): appraisal report contract + pure shaper for journal-club mode"
```

---

## Task 2: PDF text-extraction Next route

**Files:**
- Modify: `apps/web/package.json` (add `unpdf`)
- Create: `apps/web/lib/pdf/extract.ts`
- Create: `apps/web/lib/pdf/extract.test.ts`
- Create: `apps/web/app/api/v1/papers/extract/route.ts`

**Interfaces:**
- Consumes: `verifyBearer` from `@/lib/server` (verified signature: `verifyBearer(req: Request): Promise<{ id: string; email: string | null } | null>`).
- Produces:
  - `interface ExtractResult { text: string; meta: { title: string | null; pages: number; truncated: boolean } }`
  - `function capText(raw: string, cap: number): { text: string; truncated: boolean }`
  - `function guessTitle(text: string): string | null`
  - `async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult>`
  - `POST /api/v1/papers/extract` → `200 { text, meta }` | `401` | `400` | `413` | `422` | `429`.

**Why a Next route (nodejs), not the Deno edge fn:** PDF text extraction needs an npm parser (`unpdf`). Adding it to `apps/web` (where npm deps are first-class and this route already sits beside `api/v1/evidence/search`) means no edge-function dependency wrangling and no extra edge deploy for the extraction step. The route mirrors the exact auth + per-instance rate-limit posture already used by `apps/web/app/api/v1/evidence/search/route.ts`.

- [ ] **Step 1: Add the `unpdf` dependency**

In `apps/web/package.json`, in the `"dependencies"` object, add `unpdf` (keep alphabetical-ish ordering — place after `"stripe"`):

```json
    "stripe": "^20.1.0",
    "tailwind-merge": "^3.6.0",
    "unpdf": "^0.12.1"
```

(`unpdf` is MIT, pure-JS, ships a serverless-friendly build of PDF.js; `extractText` returns `{ totalPages, text }`.)

Then install:

```bash
cd apps/web && pnpm install
```

Expected: `unpdf` resolves and lands in the workspace lockfile.

- [ ] **Step 2: Write the failing test for the pure helpers**

Create `apps/web/lib/pdf/extract.test.ts`:

```typescript
import assert from "node:assert/strict";
import { capText, guessTitle } from "./extract";

// capText: caps at the limit and reports truncation honestly.
{
  const short = capText("hello world", 100);
  assert.equal(short.text, "hello world");
  assert.equal(short.truncated, false);
}
{
  const long = capText("abcdefghij", 5);
  assert.equal(long.text, "abcde");
  assert.equal(long.truncated, true);
}
{
  // Exactly at the cap is NOT truncated.
  const exact = capText("abcde", 5);
  assert.equal(exact.truncated, false);
}

// guessTitle: first non-trivial line, trimmed; null when nothing plausible.
{
  const t = guessTitle("  \n\nEffect of Drug X on Mortality: A Randomized Trial\nAuthors et al.\nAbstract...");
  assert.equal(t, "Effect of Drug X on Mortality: A Randomized Trial");
}
{
  // A very short first line (page header noise) is skipped in favor of the next plausible line.
  const t = guessTitle("1\nPMID: 12345\nA Well-Formed Study Title That Is Clearly The Paper Name\n");
  assert.equal(t, "A Well-Formed Study Title That Is Clearly The Paper Name");
}
{
  assert.equal(guessTitle("   \n \n "), null);
}

console.log("extract.test.ts: all assertions passed");
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx tsx lib/pdf/extract.test.ts`
Expected: FAIL — `Cannot find module './extract'` (module not created yet).

- [ ] **Step 4: Implement the extraction wrapper**

Create `apps/web/lib/pdf/extract.ts`:

```typescript
// PDF text extraction for journal-club paper uploads. Runs in the Node.js route runtime (unpdf ships a
// serverless PDF.js build). Pure helpers (capText, guessTitle) are unit-tested; extractPdfText does the
// I/O-free-but-async parse. No filesystem writes — bytes in, text out.
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractResult {
  text: string;
  meta: { title: string | null; pages: number; truncated: boolean };
}

/** Hard cap on extracted text handed downstream (~200KB of characters). Keeps the request body and the
 *  saved-report payload bounded; a longer paper is appraised from this leading prefix (truncated=true). */
export const TEXT_CAP = 200_000;

/** Cap `raw` to `cap` characters, reporting whether anything was dropped. PURE. */
export function capText(raw: string, cap: number): { text: string; truncated: boolean } {
  if (raw.length <= cap) return { text: raw, truncated: false };
  return { text: raw.slice(0, cap), truncated: true };
}

/** Best-effort paper title: the first line long enough to be a real title (>= 12 chars, has a space),
 *  skipping page numbers / PMID / DOI header noise. Returns null when nothing plausible is found. PURE. */
export function guessTitle(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 15)) {
    if (line.length < 12) continue;
    if (!line.includes(" ")) continue;
    if (/^(pmid|doi|https?:|www\.|copyright|©)\b/i.test(line)) continue;
    return line.slice(0, 300);
  }
  return null;
}

/** Extract text from PDF bytes. Joins per-page text with newlines, caps it, and derives light metadata.
 *  Throws only on a genuinely unreadable/corrupt PDF; a valid-but-image-only PDF returns empty text (the
 *  route turns that into a specific "no text layer" error). */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  const normalized = joined.replace(/ /g, "").trim();
  const { text: capped, truncated } = capText(normalized, TEXT_CAP);
  return {
    text: capped,
    meta: { title: guessTitle(capped), pages: totalPages ?? 0, truncated },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx tsx lib/pdf/extract.test.ts`
Expected: PASS — prints `extract.test.ts: all assertions passed`.

- [ ] **Step 6: Implement the route**

Create `apps/web/app/api/v1/papers/extract/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

import { extractPdfText } from "@/lib/pdf/extract";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// This route accepts an uploaded PDF and runs a CPU-bound parse, so it is not a public open door. Two
// guards mirror api/v1/evidence/search: (1) require a signed-in user; (2) a per-instance sliding-window
// rate cap. Plus a hard byte cap so a huge upload can't exhaust memory before we even parse.
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — matches the composer upload sheet's client-side cap
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20; // extractions per window per instance — a backstop, not the primary gate (auth is)
let hits: number[] = [];
function rateLimited(now: number): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

/** Read the PDF bytes from either a multipart form (field "file") or a raw application/pdf body. */
async function readPdfBytes(req: NextRequest): Promise<{ bytes: Uint8Array } | { error: string; status: number }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Attach a PDF file in the 'file' field.", status: 400 };
    if (file.size > MAX_BYTES) return { error: "That PDF is over the 15 MB limit.", status: 413 };
    if (file.type && file.type !== "application/pdf") return { error: "Only PDF files are supported.", status: 415 };
    return { bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  if (contentType.includes("application/pdf")) {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { error: "That PDF is over the 15 MB limit.", status: 413 };
    return { bytes: new Uint8Array(buf) };
  }
  return { error: "Send a PDF as multipart/form-data (field 'file') or as an application/pdf body.", status: 400 };
}

/** True when the bytes start with the PDF magic number "%PDF-". */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export async function POST(req: NextRequest) {
  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized", message: "Sign in to upload a paper." }, { status: 401 });
  }
  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: "rate_limited", message: "Too many uploads right now — try again shortly." }, { status: 429 });
  }

  const read = await readPdfBytes(req);
  if ("error" in read) {
    return NextResponse.json({ error: "bad_upload", message: read.error }, { status: read.status });
  }
  if (!looksLikePdf(read.bytes)) {
    return NextResponse.json({ error: "not_a_pdf", message: "That file is not a PDF." }, { status: 415 });
  }

  try {
    const result = await extractPdfText(read.bytes);
    if (!result.text) {
      return NextResponse.json(
        { error: "no_text_layer", message: "No selectable text found — this looks like a scanned image PDF. Journal-club appraisal needs a text-based PDF." },
        { status: 422 },
      );
    }
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "extract_failed", message: "That PDF could not be read. It may be corrupt or password-protected." },
      { status: 422 },
    );
  }
}
```

- [ ] **Step 7: Typecheck + build the web app**

Run: `cd apps/web && npm run build`
Expected: build succeeds; the new route compiles (Node runtime). If `unpdf` triggers a bundling warning about `pdfjs`, confirm the route file has `export const runtime = "nodejs"` (it does) — that keeps it off the Edge runtime where `unpdf`'s Node build would fail.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/lib/pdf/extract.ts apps/web/lib/pdf/extract.test.ts apps/web/app/api/v1/papers/extract/route.ts
git commit -m "feat(web): PDF text-extraction route for journal-club uploads"
```

(If the lockfile updates live at the repo root — `pnpm-lock.yaml` at `/` rather than `apps/web/` — add that path instead; run `git status` to see which moved.)

---

## Task 3: research fn `mode: "appraisal"` + the appraisal pipeline

**Files:**
- Create: `supabase/functions/research/appraise.ts`
- Create: `supabase/functions/research/appraise.test.ts`
- Modify: `supabase/functions/research/index.ts`

**Interfaces:**
- Consumes:
  - `preScreen(question: string): { flags: SafetyFlag[]; shortCircuit: "emergency_routing" | "sourcing_refusal" | null }` and `detectViolations(answerText: string): { rule: string; snippet: string }[]` from `../ask/safety.ts` (FROZEN — imported, never edited).
  - `callTool<T>(params, toolName, apiKey)` and `type Tool` from `../ask/llm.ts`.
  - `modelFor(slot)` from `../ask/model-router.ts`.
  - `shapeAppraisalReport`, `type AppraisalInput`, `type PaperMeta`, `type AppraisalDimension` from `../../../packages/shared/src/appraisal-report.ts` / `research.ts`.
- Produces:
  - `function verbatimQuote(quote: string, paperText: string): string | null` (PURE — returns the quote iff it is a verbatim substring of the paper, else null).
  - `function normalizeAppraisal(raw: unknown, meta: PaperMeta, paperText: string): AppraisalInput` (PURE — clamps the LLM output to the contract, verbatim-checks every quote, computes `claims_verified`).
  - `async function runAppraisal(paperText: string, meta: PaperMeta, apiKey: string): Promise<ResearchReport>`.
  - `index.ts`: `mode:"appraisal"` accepted; body gains optional `paper_text: string`, `paper_meta: PaperMeta`; a boundary guard 400s when `mode==="appraisal"` without usable `paper_text`.

**Safety interpretation (load-bearing — read before implementing):** The FROZEN `preScreen` is built for a short distress-channel QUESTION, not academic prose. Running it on 200KB of paper body would misfire: its `OVERDOSE`/`SELF_HARM`/`SOURCING` alternations match ordinary words (`overdose`, `suicid`, `black market`, `without a prescription`) that appear legitimately in toxicology / psychiatry / drug-policy papers, and a match short-circuits the whole run into an emergency template. So:
- Run `preScreen` on the **derived title/question only** (a short line), never on the paper body.
- Reuse `detectViolations` on the **assembled appraisal prose** (the same load-bearing check the deep-research path runs on synthesized output) — that is where the frozen safety layer does its real work here.

This keeps `ask/safety.ts` frozen and used exactly as designed.

- [ ] **Step 1: Write the failing test for the pure verbatim + normalize helpers**

Create `supabase/functions/research/appraise.test.ts`:

```typescript
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAppraisal, verbatimQuote } from "./appraise.ts";
import type { PaperMeta } from "../../../packages/shared/src/research.ts";

const PAPER = "This was a double-blind, placebo-controlled randomized trial. The primary endpoint was all-cause mortality at 12 months. 402 patients were enrolled.";
const META: PaperMeta = { title: "A Trial", pages: 10, truncated: false };

Deno.test("verbatimQuote accepts a verbatim substring and rejects a paraphrase", () => {
  assertEquals(verbatimQuote("double-blind, placebo-controlled randomized trial", PAPER), "double-blind, placebo-controlled randomized trial");
  // A model paraphrase that is NOT literally in the paper is rejected.
  assertEquals(verbatimQuote("the study used a double blind design", PAPER), null);
});

Deno.test("verbatimQuote is whitespace-tolerant and trims model-added punctuation", () => {
  // Collapsed internal whitespace + a trailing period the model added still matches.
  assertEquals(
    verbatimQuote("The  primary   endpoint was all-cause mortality at 12 months.", PAPER),
    "The primary endpoint was all-cause mortality at 12 months",
  );
});

Deno.test("normalizeAppraisal keeps points whose quote verifies, drops the quote on ones that don't", () => {
  const raw = {
    bottom_line: "Solid RCT.",
    evidence_grade: "strong",
    dimensions: [
      {
        key: "design",
        heading: "Study design",
        verdict: "strong",
        points: [
          { text: "Double-blind placebo-controlled RCT.", quote: "double-blind, placebo-controlled randomized trial" },
          { text: "Adequately powered.", quote: "we invented this sentence" },
        ],
      },
    ],
    limitations: ["Single center."],
    questions: ["Does it generalize?"],
  };
  const input = normalizeAppraisal(raw, META, PAPER);
  const pts = input.dimensions[0].points;
  assert(pts[0].quote && pts[0].quote.includes("double-blind"));
  assertEquals(pts[1].quote, null); // fabricated quote stripped
  // At least one load-bearing point lost its quote -> not fully verified.
  assertEquals(input.claims_verified, false);
});

Deno.test("normalizeAppraisal clamps garbage to a safe empty-ish appraisal (never throws)", () => {
  const input = normalizeAppraisal({}, META, PAPER);
  assertEquals(input.dimensions.length, 0);
  assertEquals(input.questions.length, 0);
  assertEquals(input.evidence_grade, "unknown");
  assertEquals(input.claims_verified, true); // no load-bearing points => nothing failed verification
  assertEquals(input.paper_meta.title, "A Trial");
});

Deno.test("normalizeAppraisal only accepts the six known dimension keys and four verdicts", () => {
  const raw = {
    dimensions: [
      { key: "design", heading: "Design", verdict: "strong", points: [] },
      { key: "made_up_dimension", heading: "X", verdict: "strong", points: [] },
      { key: "statistics", heading: "Stats", verdict: "not_a_verdict", points: [] },
    ],
  };
  const input = normalizeAppraisal(raw, META, PAPER);
  assertEquals(input.dimensions.map((d) => d.key), ["design", "statistics"]);
  assertEquals(input.dimensions[1].verdict, "unclear"); // bad verdict clamped to unclear
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-env supabase/functions/research/appraise.test.ts`
Expected: FAIL — `Module not found ".../appraise.ts"`.

- [ ] **Step 3: Implement the appraisal pipeline**

Create `supabase/functions/research/appraise.ts`:

```typescript
// Journal-club appraisal pipeline (research edge fn, mode "appraisal"). Grounds a structured critical
// appraisal of ONE uploaded paper in verbatim quotes, then shapes it into a ResearchReport.
//
// Safety posture (see plan §Task 3): preScreen runs on the SHORT derived title only (never the 200KB
// body — its distress-channel patterns misfire on academic prose); detectViolations runs on the
// ASSEMBLED appraisal prose (the same load-bearing check the deep-research synthesis path uses). Both
// come from the FROZEN ../ask/safety.ts, imported verbatim.
import { callTool, type Tool } from "../ask/llm.ts";
import { modelFor } from "../ask/model-router.ts";
import { detectViolations, preScreen } from "../ask/safety.ts";
import { shapeAppraisalReport } from "../../../packages/shared/src/appraisal-report.ts";
import type {
  AppraisalDimension,
  AppraisalDimensionKey,
  AppraisalInput,
  AppraisalVerdict,
  PaperMeta,
  ResearchReport,
} from "../../../packages/shared/src/research.ts";
import type { EvidenceGrade } from "../../../packages/shared/src/answer.ts";

const DIMENSION_KEYS: readonly AppraisalDimensionKey[] = [
  "design", "population", "endpoints", "statistics", "risk_of_bias", "applicability",
];
const VERDICTS: readonly AppraisalVerdict[] = ["strong", "adequate", "weak", "unclear"];
const GRADES: readonly EvidenceGrade[] = [
  "very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable",
];

// How much of the paper the model sees. Kept under a comfortable context budget; the extractor already
// caps at 200KB, and the report's paper_meta.truncated tells the reader when the paper was longer.
const APPRAISAL_TEXT_BUDGET = 120_000;

const APPRAISAL_TOOL: Tool = {
  name: "record_appraisal",
  description:
    "Record a structured critical appraisal of the paper: a plain-English bottom line, per-dimension " +
    "verdicts with grounded findings, the paper's own limitations, and open discussion questions.",
  parameters: {
    type: "object",
    properties: {
      bottom_line: { type: "string", description: "One-paragraph plain-English verdict a clinician could read aloud." },
      evidence_grade: { type: "string", enum: [...GRADES], description: "Overall strength of the paper's evidence." },
      dimensions: {
        type: "array",
        description: "One entry per appraisal dimension you can judge. Omit a dimension entirely if the paper says nothing about it.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: [...DIMENSION_KEYS] },
            heading: { type: "string", description: "Human heading, e.g. 'Study design' or 'Statistical validity'." },
            verdict: { type: "string", enum: [...VERDICTS] },
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "The finding, in your own words." },
                  quote: { type: "string", description: "A VERBATIM sentence copied from the paper that supports the finding. Copy exactly; leave empty if none applies." },
                },
                required: ["text"],
              },
            },
          },
          required: ["key", "heading", "verdict"],
        },
      },
      limitations: { type: "array", items: { type: "string" }, description: "Honest limitations of the paper." },
      questions: { type: "array", items: { type: "string" }, description: "Open discussion questions for a journal club." },
    },
    required: ["bottom_line", "evidence_grade", "dimensions"],
  },
};

const APPRAISAL_SYSTEM = [
  "You are the critical-appraisal step of a conservative, source-grounded medical research tool.",
  "You appraise ONE paper for a journal club. You do NOT give clinical advice.",
  "",
  "Rules:",
  "- Judge the paper across: design, population, endpoints, statistics, risk_of_bias, applicability.",
  "- For EVERY finding, copy a VERBATIM sentence from the paper into `quote`. Copy it exactly, letter",
  "  for letter. If no sentence in the paper supports a finding, leave `quote` empty — never invent one.",
  "- If the paper does not report something, mark that dimension's verdict `unclear`. Never guess.",
  "- Limitations must be the PAPER's limitations, not generic caveats.",
  "- Questions should be substantive things a journal club would debate.",
  "- Record everything with record_appraisal.",
].join("\n");

/** NFKC + lowercase + whitespace-collapse for the substring check (mirrors ground.ts's `norm`). */
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Trim leading/trailing whitespace + punctuation so a model-added period doesn't defeat the check;
 *  interior text is untouched, so this can only make the needle SHORTER — never match a fabrication. */
function trimEnds(s: string): string {
  return s.replace(/^[\s"'([{.,;:]+/, "").replace(/[\s"')\]}.,;:]+$/, "");
}

/**
 * Return the quote iff (after trimming model-added edge punctuation) it is a VERBATIM substring of the
 * paper under NFKC + whitespace-normalization. Returns the trimmed quote on success, null on failure.
 * PURE + deterministic — unit-tested. A too-short quote (< 12 chars) is rejected to avoid trivial matches.
 */
export function verbatimQuote(quote: string, paperText: string): string | null {
  const trimmed = trimEnds(typeof quote === "string" ? quote : "");
  if (trimmed.length < 12) return null;
  const hay = norm(paperText);
  const needle = norm(trimmed);
  return hay.includes(needle) ? trimmed : null;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStrArray(v: unknown, cap: number): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, cap)
    : [];
}

/**
 * Clamp raw LLM output to the AppraisalInput contract. Verbatim-checks every quote (a failed quote
 * becomes null, and any load-bearing point that loses its quote flips claims_verified to false). Only
 * the six known dimension keys and four verdicts survive. PURE — never throws, never calls out.
 */
export function normalizeAppraisal(raw: unknown, meta: PaperMeta, paperText: string): AppraisalInput {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const grade = GRADES.includes(asStr(obj.evidence_grade) as EvidenceGrade)
    ? (asStr(obj.evidence_grade) as EvidenceGrade)
    : "unknown";

  let anyUnverified = false;
  const rawDims = Array.isArray(obj.dimensions) ? obj.dimensions : [];
  const dimensions: AppraisalDimension[] = [];
  const seen = new Set<AppraisalDimensionKey>();
  for (const d of rawDims) {
    if (!d || typeof d !== "object") continue;
    const dd = d as Record<string, unknown>;
    const key = asStr(dd.key) as AppraisalDimensionKey;
    if (!DIMENSION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const verdict = VERDICTS.includes(asStr(dd.verdict) as AppraisalVerdict)
      ? (asStr(dd.verdict) as AppraisalVerdict)
      : "unclear";
    const heading = asStr(dd.heading) || key;
    const rawPoints = Array.isArray(dd.points) ? dd.points : [];
    const points = rawPoints
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => {
        const text = asStr(p.text);
        const quote = verbatimQuote(asStr(p.quote), paperText);
        if (asStr(p.quote) && !quote) anyUnverified = true; // model offered a quote that didn't verify
        return { text, quote };
      })
      .filter((p) => p.text.length > 0)
      .slice(0, 8);
    dimensions.push({ key, heading, verdict, points });
  }
  // Order dimensions canonically so the report reads the same every time.
  dimensions.sort((a, b) => DIMENSION_KEYS.indexOf(a.key) - DIMENSION_KEYS.indexOf(b.key));

  return {
    paper_meta: meta,
    bottom_line: asStr(obj.bottom_line),
    dimensions,
    limitations: asStrArray(obj.limitations, 10),
    questions: asStrArray(obj.questions, 10),
    evidence_grade: grade,
    safety_flags: [],
    claims_verified: !anyUnverified,
  };
}

/** Concatenate the appraisal's user-visible prose so detectViolations can scan it in one pass. */
function appraisalProse(input: AppraisalInput): string {
  const parts: string[] = [input.bottom_line, ...input.limitations, ...input.questions];
  for (const d of input.dimensions) for (const p of d.points) parts.push(p.text);
  return parts.join("\n");
}

/**
 * Run the appraisal: preScreen the SHORT derived title (frozen safety, used as designed), one grounded
 * LLM appraisal pass, normalize + verbatim-check, then detectViolations on the ASSEMBLED prose. On a
 * safety violation the appraisal is discarded and a conservative report is returned (no fabricated body).
 */
export async function runAppraisal(paperText: string, meta: PaperMeta, apiKey: string): Promise<ResearchReport> {
  const title = meta.title ?? "the uploaded paper";

  // Frozen safety on the SHORT line only. If the title itself trips the deterministic gate, refuse.
  const screen = preScreen(title);
  if (screen.shortCircuit) {
    return shapeAppraisalReport({
      paper_meta: meta,
      bottom_line: "This upload could not be appraised.",
      dimensions: [],
      limitations: ["The paper's title triggered a safety route; upload a research paper for appraisal."],
      questions: [],
      evidence_grade: "not_applicable",
      safety_flags: screen.flags,
      claims_verified: true,
    });
  }

  const budget = paperText.slice(0, APPRAISAL_TEXT_BUDGET);
  const { input: raw } = await callTool<unknown>(
    {
      model: modelFor("research"),
      max_tokens: 4096,
      temperature: 0,
      system: APPRAISAL_SYSTEM,
      tools: [APPRAISAL_TOOL],
      messages: [{ role: "user", content: `Paper text:\n\n${budget}\n\nAppraise it with record_appraisal.` }],
    },
    "record_appraisal",
    apiKey,
  );

  const input = normalizeAppraisal(raw, meta, budget);

  // Load-bearing frozen-safety check on the ASSEMBLED prose (same posture as deep-research synthesis).
  const violations = detectViolations(appraisalProse(input));
  if (violations.length > 0) {
    return shapeAppraisalReport({
      paper_meta: meta,
      bottom_line: "The appraisal was withheld because it contained unsafe wording.",
      dimensions: [],
      limitations: ["The generated appraisal did not clear the safety check and was discarded."],
      questions: [],
      evidence_grade: "not_applicable",
      safety_flags: [],
      claims_verified: false,
    });
  }

  return shapeAppraisalReport(input);
}
```

- [ ] **Step 4: Run the appraise test to verify it passes**

Run: `deno test --allow-env supabase/functions/research/appraise.test.ts`
Expected: PASS (5 tests). (`callTool`/`runAppraisal` are not exercised here — only the PURE `verbatimQuote`/`normalizeAppraisal` are tested, which need no network or key.)

- [ ] **Step 5: Wire `mode: "appraisal"` into `index.ts` — parse + guard the body**

In `supabase/functions/research/index.ts`, the body type and mode parse need to accept the appraisal fields. Find the body declaration:

```typescript
  let body: { question?: string; mode?: string; action?: string; mission_id?: string; sub_questions?: unknown };
```

Replace it with:

```typescript
  let body: { question?: string; mode?: string; action?: string; mission_id?: string; sub_questions?: unknown; paper_text?: unknown; paper_meta?: unknown };
```

Then find the mode parse block:

```typescript
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

Replace it with (adds the `"appraisal"` branch):

```typescript
  const mode: ReportMode = body.mode === "meta"
    ? "meta"
    : body.mode === "structured_review"
    ? "structured_review"
    : body.mode === "lab_draft"
    ? "lab_draft"
    : body.mode === "discovery"
    ? "discovery"
    : body.mode === "appraisal"
    ? "appraisal"
    : "standard";
```

- [ ] **Step 6: Add the appraisal boundary guard + branch, before the standard quota/run path**

Locate, in `index.ts`, the point AFTER the `action:"plan"` block and BEFORE the `// ---- Pro gate + daily limit (one call)` comment. Insert this block there:

```typescript
  // ---- Journal-club appraisal: a whole different input (an uploaded paper's text, not a live web
  // search). Requires paper_text (the extraction route produced it). The guard makes version skew SAFE:
  // if an older web client somehow sends mode:"appraisal" without paper_text, we 400 rather than silently
  // running a live-source "standard" research on the derived title. Quota + async lifecycle are identical
  // to a deep-research run (kind stays 'deep_research'; mode 'appraisal' distinguishes it downstream). ----
  if (mode === "appraisal") {
    const paperText = typeof body.paper_text === "string" ? body.paper_text.trim() : "";
    if (paperText.length < 200) {
      return json({ error: "paper_text required", message: "Upload a text-based PDF to appraise." }, 400, req);
    }
    const paperMeta = normalizePaperMeta(body.paper_meta);
    const quota = await consumeQuota(userId);
    if (!quota.allowed) {
      return json({
        error: "quota_exceeded",
        counter_key: "deep_research_daily",
        reason: quota.reason,
        used: quota.used,
        limit: quota.limit,
        plan: quota.plan,
      }, 429, req);
    }
    // The run's "question" is the appraisal title — bounded to satisfy the same validation + saved_reports title.
    const appraisalQuestion = (paperMeta.title
      ? `Appraisal of "${paperMeta.title}"`
      : "Appraisal of the uploaded paper").slice(0, 300);
    let apRunId: string;
    try {
      apRunId = await insertRun(userId, appraisalQuestion, quota.plan);
    } catch {
      try {
        apRunId = await insertRun(userId, appraisalQuestion, quota.plan);
      } catch (e) {
        console.error("appraisal insertRun failed after retry:", (e as Error).message);
        return json({ error: "could not start appraisal" }, 500, req);
      }
    }
    const apJob = executeAppraisalRun(apRunId, userId, appraisalQuestion, paperText, paperMeta);
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(apJob);
    else void apJob;
    return json({ run_id: apRunId, status: "running" }, 202, req);
  }
```

- [ ] **Step 7: Add the `executeAppraisalRun` background worker + `normalizePaperMeta` helper + the import**

At the top of `index.ts`, add the `runAppraisal` import alongside the other research-fn imports:

```typescript
import { runAppraisal } from "./appraise.ts";
```

`PaperMeta` is a type from the shared research module, which is ALREADY imported at `index.ts:23`. Extend that existing line rather than adding a second import from the same path. Change:

```typescript
import type { ReportMode, ResearchProgressStep, ResearchReport } from "../../../packages/shared/src/research.ts";
```

to:

```typescript
import type { PaperMeta, ReportMode, ResearchProgressStep, ResearchReport } from "../../../packages/shared/src/research.ts";
```

Then, immediately AFTER the existing `executeRun(...)` function definition (the one that ends by patching the run to completed/failed), add:

```typescript
/** PURE: clamp an untrusted paper_meta from the request body to the PaperMeta contract. */
function normalizePaperMeta(raw: unknown): PaperMeta {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 300) : null;
  const pages = typeof o.pages === "number" && Number.isFinite(o.pages) && o.pages >= 0 ? Math.floor(o.pages) : 0;
  const truncated = o.truncated === true;
  return { title, pages, truncated };
}

/** Appraisal background worker: mirrors executeRun (stream a couple of progress steps to the run row,
 *  build the ResearchReport via runAppraisal, save it, flip the run to completed). Never rejects. The
 *  progress steps reuse the fixed ResearchProgressStep union (planning/writing/checking/done) so the
 *  existing ResearchRunCard renders live progress with zero client change. */
async function executeAppraisalRun(
  runId: string,
  userId: string,
  question: string,
  paperText: string,
  paperMeta: PaperMeta,
): Promise<void> {
  const steps: ResearchProgressStep[] = [];
  const push = (step: ResearchProgressStep["step"], detail: string) => {
    steps.push({ step, detail, at: new Date().toISOString() });
    void patchRun(runId, userId, { progress: steps }).catch((e) =>
      console.error("appraisal progress patch failed:", (e as Error).message)
    );
  };
  try {
    push("planning", "Reading the paper");
    push("writing", "Appraising design, endpoints, statistics, and bias");
    const report = await runAppraisal(paperText, paperMeta, llmApiKey());
    push("checking", "Grounding each verdict in a verbatim quote");
    const savedReportId = await insertSavedReport(userId, question, report);
    push("done", "Appraisal ready");
    await patchRun(runId, userId, {
      status: "completed",
      progress: steps,
      saved_report_id: savedReportId,
      source_ids: report.citations.map((c) => c.source_id),
      metadata: { report_mode: "appraisal" },
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("appraisal run failed (detail):", (e as Error).message);
    await patchRun(runId, userId, {
      status: "failed",
      progress: steps,
      error: "The appraisal could not be completed. Please try again.",
      completed_at: new Date().toISOString(),
    }).catch(() => {});
  }
}
```

Note: `insertSavedReport` already writes `mode: report.mode ?? "standard"`, and `report.mode` is `"appraisal"` (from the shaper), so the saved row lands with `kind='deep_research'`, `mode='appraisal'` — no migration, no other change. `ResearchProgressStep`, `patchRun`, `insertRun`, `insertSavedReport`, `consumeQuota`, `llmApiKey` are all already imported/defined in `index.ts`.

- [ ] **Step 8: Typecheck the research function**

Run: `deno test --allow-env supabase/functions/ask/`
Expected: PASS — all existing `ask/**` tests still green (frozen layer untouched). This run also type-checks the shared modules the research fn imports. Then explicitly type-check the research entrypoint:

Run: `deno check supabase/functions/research/index.ts`
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/research/appraise.ts supabase/functions/research/appraise.test.ts supabase/functions/research/index.ts
git commit -m "feat(research): mode appraisal — grounded journal-club critical appraisal pipeline"
```

---

## Task 4: Render `appraisal_questions` in the three exports

**Files:**
- Modify: `apps/web/lib/export/pptx.ts`
- Modify: `apps/web/lib/export/docx.ts`
- Modify: `apps/web/lib/export/pdf.ts`

**Interfaces:**
- Consumes: `ResearchReport.appraisal_questions?: string[]` (from Task 1). These editors add a "Discussion questions" slide/section rendered only when the field is present + non-empty, so every existing report kind is unaffected.
- Produces: no new exported symbols.

- [ ] **Step 1: Add the discussion-questions slide to `pptx.ts`**

In `apps/web/lib/export/pptx.ts`, find the gaps slide block inside `reportToPptx`:

```typescript
  if (report.gaps?.length) {
    contentSlide(pptx, "Evidence gaps", report.gaps.map((g) => ({
      text: g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : ""),
      options: { bullet: true, breakLine: true },
    })));
  }
```

Immediately AFTER that block, add:

```typescript
  if (report.appraisal_questions?.length) {
    contentSlide(pptx, "Discussion questions", report.appraisal_questions.map((q) => ({
      text: q, options: { bullet: true, breakLine: true },
    })));
  }
```

- [ ] **Step 2: Add the discussion-questions section to `docx.ts`**

In `apps/web/lib/export/docx.ts`, find the gaps section block inside `reportToDocx`:

```typescript
  if (report.gaps?.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Evidence gaps")] }));
    children.push(...report.gaps.map((g) =>
      bullet(g.text + (g.corroborating_trials.length ? ` An answer may be coming: ${g.corroborating_trials.join(", ")}.` : ""))
    ));
  }
```

Immediately AFTER that block, add:

```typescript
  if (report.appraisal_questions?.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Discussion questions")] }));
    children.push(...report.appraisal_questions.map((q) => bullet(q)));
  }
```

- [ ] **Step 3: Add the discussion-questions section to `pdf.ts`**

In `apps/web/lib/export/pdf.ts`, find the gaps block inside `buildLines`:

```typescript
  if (report.gaps?.length) {
    section(lines, "Evidence gaps", report.gaps.map((g) =>
```

That block is followed by the `if (report.uncertainties.length)` line. Immediately BEFORE the `if (report.uncertainties.length)` line, add:

```typescript
  if (report.appraisal_questions?.length) {
    section(lines, "Discussion questions", report.appraisal_questions);
  }
```

(`section(out, title, items: string[])` takes plain strings — the questions are already strings.)

- [ ] **Step 4: Run the export smoke test**

Run: `cd apps/web && npm run smoke:export`
Expected: PASS — the docx/pptx smoke formatter runs without throwing. (If `smoke:export` fixtures don't include an appraisal report, that's fine — this step confirms the added branches don't break existing reports; the appraisal branch is exercised end-to-end in Task 7.)

- [ ] **Step 5: Build the web app**

Run: `cd apps/web && npm run build`
Expected: build succeeds (the three export modules type-check against the new optional field).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/export/pptx.ts apps/web/lib/export/docx.ts apps/web/lib/export/pdf.ts
git commit -m "feat(web): render appraisal discussion questions in pptx/docx/pdf exports"
```

---

## Task 5: Composer — Journal club entry + upload sheet + launch

**Files:**
- Create: `apps/web/components/PaperUploadSheet.tsx`
- Modify: `apps/web/lib/api.ts` (add `extractPaper` + `startAppraisal`)
- Modify: `apps/web/app/app/ask/page.tsx` (menu entry + sheet wiring + run-card label)

**Interfaces:**
- Consumes: `startResearch`'s pattern from `lib/api.ts` (verified: it POSTs `${supabaseUrl}/functions/v1/research` with `apikey`, `Authorization: Bearer <session token>`, `Content-Type`); `supabase.auth.getSession()`; the `ResearchRunCard`/`ResearchCard` machinery already in `ask/page.tsx` (a card with `{ runId, mode, title, error, completed }` drives polling).
- Produces:
  - `async function extractPaper(file: File): Promise<{ text: string; meta: PaperMeta }>` in `lib/api.ts`.
  - `async function startAppraisal(paperText: string, paperMeta: PaperMeta): Promise<string>` in `lib/api.ts` (returns the run id, same shape as `startResearch`).
  - `PaperUploadSheet` component: props `{ onClose: () => void; onLaunch: (runId: string, title: string) => void }`.

**PR #98 anchor note:** On base `origin/main` there is no Skills section — add the Journal club entry to the `+` tools menu. If #98 has merged (a "Journal club — Soon" entry exists in a Skills section), instead activate that existing entry (remove `disabled` + `Soon`, add the same `onClick`) rather than adding a new tools-menu item. The handler (`setJournalOpen(true)`) is identical either way.

- [ ] **Step 1: Add the two client helpers to `lib/api.ts`**

In `apps/web/lib/api.ts`, first ensure `PaperMeta` is imported from the shared package. Find the existing `@nemesis/shared` type import group near the top (it already imports research types such as `ReportMode`, `ResearchReport`) and add `PaperMeta` to it. Then, immediately AFTER the `startResearch` function, add:

```typescript
/** Extract text from a PDF via the Node route (auth + rate-limit + size guard live server-side). Throws
 *  a message-bearing Error on any non-2xx so the upload sheet can show the specific reason. */
export async function extractPaper(file: File): Promise<{ text: string; meta: PaperMeta }> {
  if (isPreviewMode) throw new Error("Uploading a paper needs a live connection (not available in preview).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to appraise a paper");

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/v1/papers/extract", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !isObj(body) || typeof body.text !== "string") {
    throw new Error(isObj(body) && typeof body.message === "string" ? body.message : `Extraction failed (${res.status})`);
  }
  const meta = isObj(body.meta) ? body.meta : {};
  return {
    text: body.text,
    meta: {
      title: typeof meta.title === "string" ? meta.title : null,
      pages: typeof meta.pages === "number" ? meta.pages : 0,
      truncated: meta.truncated === true,
    },
  };
}

/** Start a journal-club appraisal run. Same Pro gate + 429 quota shape as startResearch; returns the run
 *  id to poll. The extracted paper text + meta ride the request (no storage bucket). */
export async function startAppraisal(paperText: string, paperMeta: PaperMeta): Promise<string> {
  if (isPreviewMode) throw new Error("Appraisal needs a live connection (not available in preview).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to appraise a paper");

  const res = await fetch(`${supabaseUrl}/functions/v1/research`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "appraisal", paper_text: paperText, paper_meta: paperMeta }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 429 && isObj(body) && body.error === "quota_exceeded") {
    const err = new Error("quota_exceeded") as AskQuotaError;
    err.quota = body as unknown as QuotaExceededError;
    throw err;
  }
  if (!res.ok || !isObj(body) || typeof body.run_id !== "string") {
    throw new Error(isObj(body) && typeof body.message === "string" ? body.message : isObj(body) && typeof body.error === "string" ? body.error : `appraisal failed (${res.status})`);
  }
  return body.run_id;
}
```

(`isObj`, `AskQuotaError`, `QuotaExceededError`, `supabase`, `supabaseUrl`, `supabaseAnonKey`, `isPreviewMode` are all already imported/defined in `lib/api.ts` — verified.)

- [ ] **Step 2: Create the upload sheet component**

Create `apps/web/components/PaperUploadSheet.tsx`:

```typescript
"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { extractPaper, startAppraisal } from "@/lib/api";

const MAX_BYTES = 15 * 1024 * 1024;

type Phase = "idle" | "extracting" | "starting";

/** A small sheet: pick or drop a PDF, extract its text, then launch a journal-club appraisal run.
 *  Honest errors only — too big, not a PDF, empty/scanned, or a server error carry their real message. */
export function PaperUploadSheet({ onClose, onLaunch }: { onClose: () => void; onLaunch: (runId: string, title: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";

  async function handleFile(file: File) {
    setError(null);
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That PDF is over the 15 MB limit.");
      return;
    }
    try {
      setPhase("extracting");
      const { text, meta } = await extractPaper(file);
      setPhase("starting");
      const runId = await startAppraisal(text, meta);
      onLaunch(runId, meta.title ?? file.name.replace(/\.pdf$/i, ""));
      onClose();
    } catch (e) {
      setPhase("idle");
      // Surface the quota gate distinctly so a free user understands why it stopped.
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg === "quota_exceeded" ? "Journal-club appraisal is a Pro feature (or you've hit today's limit)." : msg);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="upload-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Upload a paper to appraise" onClick={onClose}>
      <div className="upload-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="upload-sheet-head">
          <b>Journal club — appraise a paper</b>
          <button type="button" className="upload-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div
          className={`upload-drop${dragOver ? " over" : ""}${busy ? " busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click(); }}
        >
          <Icon name="doc" size={24} />
          {phase === "extracting" ? <span>Reading the PDF…</span>
            : phase === "starting" ? <span>Starting the appraisal…</span>
            : <span>Drop a PDF here, or click to choose. Text-based PDFs only, up to 15 MB.</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
        {error ? <p className="upload-err">{error}</p> : null}
        <p className="upload-note">Your appraisal grounds every verdict in a verbatim quote from the paper. The original PDF is not stored.</p>
      </div>
    </div>
  );
}
```

Note on icons: the icon set (`apps/web/components/icons.tsx`) has `doc`, `plus`, `bell`, `shield`, `sparkle`, `check` (all used above and in Task 5/6) but has **no `x`/`close` icon** — that is why the close button uses a plain `×` glyph, not `<Icon>`. Do not swap in `<Icon name="x">` (it would render nothing). Styling classes (`upload-sheet-*`, `upload-drop`, `upload-close`, `upload-err`, `upload-note`) are added in the next step.

- [ ] **Step 3: Add minimal styles for the sheet**

The app's composer/shell styles live in `apps/web/app/styles/shell.css` (verified: `.composer`/`.acct-menu` are defined there, NOT in `globals.css`). Append these rules to `apps/web/app/styles/shell.css`:

```css
/* Journal-club paper upload sheet */
.upload-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 60; }
.upload-sheet { background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 14px; padding: 18px; width: min(440px, 92vw); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
.upload-sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.upload-close { background: none; border: none; font-size: 20px; line-height: 1; color: var(--text-2); cursor: pointer; padding: 0 4px; }
.upload-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 28px 16px; border: 1.5px dashed var(--border-1); border-radius: 12px; color: var(--text-2); cursor: pointer; transition: border-color .15s, background .15s; }
.upload-drop.over { border-color: var(--accent, #6aa); background: color-mix(in srgb, var(--accent, #6aa) 8%, transparent); }
.upload-drop.busy { cursor: default; opacity: 0.7; }
.upload-err { color: var(--danger, #c0392b); margin-top: 10px; font-size: 13px; }
.upload-note { color: var(--text-3); margin-top: 10px; font-size: 12px; }
```

Match the CSS variable names already used in `shell.css` (e.g. confirm `--bg-1`/`--border-1`/`--text-2`/`--text-3` are the real tokens; the app uses these but adjust if the file uses different names). The literal fallbacks in the `color-mix`/`--accent`/`--danger` rules keep it readable regardless.

- [ ] **Step 4: Wire the sheet + menu entry into `ask/page.tsx`**

In `apps/web/app/app/ask/page.tsx`:

(a) Add the import near the other component imports:

```typescript
import { PaperUploadSheet } from "@/components/PaperUploadSheet";
```

(b) Inside the `Composer` component, alongside the existing `const [plusOpen, setPlusOpen] = useState(false);` and `const [sourcesOpen, setSourcesOpen] = useState(false);`, add:

```typescript
  const [journalOpen, setJournalOpen] = useState(false); // the Journal club upload sheet
```

(c) In the `+` tools menu, replace the disabled "Add photos & files" button. Find:

```typescript
              <div className="sep" role="separator" />
              <button type="button" role="menuitem" disabled>
                <Icon name="plus" size={14} /><span style={{ flex: 1 }}>Add photos &amp; files</span><small style={{ color: "var(--text-3)" }}>Soon</small>
              </button>
```

Replace with:

```typescript
              <div className="sep" role="separator" />
              <button type="button" role="menuitem" onClick={() => { setJournalOpen(true); setPlusOpen(false); }}>
                <Icon name="doc" size={14} /><span style={{ flex: 1 }}>Journal club — appraise a paper</span><small style={{ color: "var(--text-3)" }}>PDF</small>
              </button>
              <button type="button" role="menuitem" disabled>
                <Icon name="plus" size={14} /><span style={{ flex: 1 }}>Add photos &amp; files</span><small style={{ color: "var(--text-3)" }}>Soon</small>
              </button>
```

(If #98 has merged and a Skills section with "Journal club — Soon" exists, instead un-disable THAT entry and give it the same `onClick={() => { setJournalOpen(true); setPlusOpen(false); }}` — do not add the tools-menu item.)

(d) The upload sheet's `onLaunch(runId, title)` must append a turn that polls the ALREADY-started run. The real mechanism (verified on `origin/main`) is `launchResearch`, a `useCallback` that does `setTurns((prev) => prev.map(...))` writing a `research: { runId, mode, title, error, proGate }` object into a turn, then calls `startResearch`. For appraisal the run is already started (the sheet did it), so we add a sibling that appends a NEW turn with the known runId instead of starting one. Locate `launchResearch` (search the file for `const launchResearch = useCallback`) — it lives in the parent component (`AskPage`), NOT in `Composer`. Note the exact shape it writes to `research` (verified: `{ runId, mode, title, error: null, proGate: false }`) and how it appends/maps a turn (it uses `setTurns`). Immediately after `launchResearch`, add this sibling in the SAME component scope:

```typescript
  // Appraisal launch: the run id already exists (the upload sheet started it). Append a new turn whose
  // research card polls it — same card/poll machinery as launchResearch, minus the startResearch call.
  const launchAppraisal = useCallback((runId: string, title: string) => {
    setTurns((prev) => [...prev, { q: title, a: null, err: null, research: { runId, mode: "appraisal" as ReportMode, title, error: null, proGate: false } }]);
  }, []);
```

Match the exact turn object shape `launchResearch` uses (the fields on a turn: `q`, `a`, `err`, `research`). If a turn has additional required fields, copy them from `launchResearch`'s object. Then thread `launchAppraisal` down to `Composer` as a prop (add it to `ComposerProps` and pass it where `<Composer ... />` is rendered), and render the sheet inside `Composer` after the `DataSourcesPanel`:

```typescript
      {journalOpen ? (
        <PaperUploadSheet
          onClose={() => setJournalOpen(false)}
          onLaunch={(runId, title) => { onLaunchAppraisal(runId, title); setJournalOpen(false); }}
        />
      ) : null}
```

Add `onLaunchAppraisal: (runId: string, title: string) => void` to `ComposerProps` and to the destructured `Composer` params (currently `function Composer({ question, setQuestion, taRef, autoGrow, submit, busy, mode, setMode, modeOpen, setModeOpen, error, welcome }: ComposerProps)`), and pass `onLaunchAppraisal={launchAppraisal}` at the single `<Composer ... />` render call site (verified: there is exactly one, in `AskPage`).

- [ ] **Step 5: (folded into Step 4)**

No separate `submit` change is needed — `launchAppraisal` appends the turn directly, and the existing thread render (`t.research ? <ResearchRunCard card={t.research} onComplete={...} />`) picks it up unchanged. Confirm the `onComplete` persistence for an appraisal turn: the existing `persistResearchTurn(i, t.q, t.research!.mode, r)` call passes `mode` through, so a completed appraisal card is persisted the same way (it saves `{ mode: "appraisal", savedReportId, title, citationCount }` via `saveResearchTurn`) — no change required, but verify `saveResearchTurn`/`SavedResearchCard` accept an arbitrary `ReportMode` (they store `mode` as-is; verified the persisted shape is mode-agnostic).

- [ ] **Step 6: Add the "appraisal" mode label to `ResearchRunCard`**

In `ask/page.tsx`, find the `modeLabel` computation inside `ResearchRunCard`:

```typescript
  const modeLabel = card.mode === "lab_draft"
    ? "Lab draft (beta)"
    : card.mode === "discovery"
    ? "Discovery"
    : "Deep research";
```

Replace with:

```typescript
  const modeLabel = card.mode === "lab_draft"
    ? "Lab draft (beta)"
    : card.mode === "discovery"
    ? "Discovery"
    : card.mode === "appraisal"
    ? "Journal club appraisal"
    : "Deep research";
```

- [ ] **Step 7: Make a persisted appraisal card rehydrate with the right mode**

`ResearchCard.mode` and `SavedResearchCard.mode` are both the shared `ReportMode` (verified), so extending `ReportMode` in Task 1 is enough for the types — no local union to widen. BUT `rehydrateResearchCard` runs a saved card's `mode` through `parseReportMode` in `lib/api.ts`, which currently allowlists only `structured_review`/`meta`/`lab_draft`/`discovery`/`standard` and falls everything else back to `"standard"`. Without a fix, a reopened appraisal card would relabel to "Deep research". Fix `parseReportMode` in `apps/web/lib/api.ts`:

```typescript
function parseReportMode(value: unknown): ReportMode {
  return value === "structured_review" || value === "meta" || value === "lab_draft" || value === "discovery" || value === "appraisal" || value === "standard"
    ? value
    : "standard";
}
```

(Add `apps/web/lib/api.ts` to this task's commit if not already staged — it is, from Step 1.)

- [ ] **Step 8: Build the web app**

Run: `cd apps/web && npm run build`
Expected: build succeeds. Fix any type errors surfaced by the new `opts` arg, the `mode: "appraisal"` card, or icon names.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/PaperUploadSheet.tsx apps/web/lib/api.ts apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): journal-club composer entry, PDF upload sheet, appraisal launch"
```

---

## Task 6: Library + report view render the appraisal

**Files:**
- Modify: `apps/web/app/app/reports/page.tsx` (`MODE_LABEL` + `MODE_ORDER`)
- Modify: `apps/web/components/ResearchReportView.tsx` (discussion-questions block + paper header line)

**Interfaces:**
- Consumes: `ResearchReport.appraisal_questions?`, `ResearchReport.paper_meta?`, `mode: "appraisal"` (Task 1). The reports Library groups by `normalizeMode(r.mode)`; an appraisal keeps its own group.
- Produces: no new exported symbols.

- [ ] **Step 1: Add the appraisal group to the reports Library**

In `apps/web/app/app/reports/page.tsx`, find:

```typescript
const MODE_LABEL: Record<string, string> = {
  standard: "Deep research",
  discovery: "Discovery reports",
  lab_draft: "Lab drafts",
  other: "Other",
};
const MODE_ORDER = ["standard", "discovery", "lab_draft"];
```

Replace with:

```typescript
const MODE_LABEL: Record<string, string> = {
  standard: "Deep research",
  discovery: "Discovery reports",
  lab_draft: "Lab drafts",
  appraisal: "Journal club appraisals",
  other: "Other",
};
const MODE_ORDER = ["standard", "discovery", "lab_draft", "appraisal"];
```

(`normalizeMode` maps only `meta`/`structured_review` → `standard`; `"appraisal"` passes through unchanged, so it lands in its own group.)

- [ ] **Step 2: Render the discussion-questions block + paper header in `ResearchReportView.tsx`**

In `apps/web/components/ResearchReportView.tsx`, add a paper header line. Find the summary/lead render — the block that renders either the meta abstract or `<p className="lead">{renderInline(report.summary)}</p>`. Immediately BEFORE that block (right after the `grade-row`/export-bar region, before the abstract/lead), add a paper-meta line:

```typescript
      {report.paper_meta ? (
        <p className="muted-note appraisal-paper-line">
          <Icon name="doc" size={13} /> Appraisal of {report.paper_meta.title ?? "an uploaded paper"}
          {report.paper_meta.pages ? ` · ${report.paper_meta.pages} pages` : ""}
          {report.paper_meta.truncated ? " · long paper, appraised from its leading text" : ""}
        </p>
      ) : null}
```

Then find the discussion-questions insertion point: the `report.uncertainties.length` block (the "Still uncertain" render) near the end of the component. Immediately BEFORE that `{report.uncertainties.length ? (` block, add:

```typescript
      {report.appraisal_questions?.length ? (
        <div className="research-questions">
          <div className="muted-label">Discussion questions</div>
          <ol>
            {report.appraisal_questions.map((q, i) => <li key={i}>{renderInline(q)}</li>)}
          </ol>
        </div>
      ) : null}
```

(`renderInline`, `Icon`, and the `muted-label`/`muted-note` classes are already used throughout this file — verified.)

- [ ] **Step 3: Add minimal styles for the questions block**

The report-view classes (`.research-section`, `.research-gaps`, `.muted-label`, `.ai-unclear`) live in `apps/web/app/styles/shell.css` (verified). Append these rules to `apps/web/app/styles/shell.css`:

```css
/* Journal-club appraisal report view */
.appraisal-paper-line { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.research-questions { margin-top: 18px; }
.research-questions ol { margin: 6px 0 0 18px; }
.research-questions li { margin-bottom: 6px; }
```

- [ ] **Step 4: Build the web app**

Run: `cd apps/web && npm run build`
Expected: build succeeds; the report view + Library type-check against the new optional fields.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/app/reports/page.tsx apps/web/components/ResearchReportView.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): render journal-club appraisals in Library and report view"
```

---

## Task 7: Verification + owner-gated coupled deploy + PR

**Files:**
- No code files. This task is the full-stack verification pass, the owner-gated function deploy, and the PR — sequenced like PR #90 (fn deploy BEFORE web merge).

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: a deployed `research` edge function (owner-gated) and a PR whose checklist enforces deploy-before-merge.

- [ ] **Step 1: Run every touched test suite green**

```bash
deno test packages/shared/
deno test --allow-env supabase/functions/ask/
deno test --allow-env supabase/functions/research/appraise.test.ts
cd apps/web && npx tsx lib/pdf/extract.test.ts && npm run smoke:export && npm run build && cd ../..
```

Expected: all green. This is the pre-review gate.

- [ ] **Step 2: State the guardrail posture explicitly (no run required)**

The `ask` edge function is unchanged by this work (only `research/**`, `apps/web/**`, `packages/shared/**` changed; `ask/safety.ts` is imported verbatim, never edited). Therefore the `ask` guardrail suite (`deno run --allow-net --allow-env scripts/guardrail-suite.ts`) is **not affected** and is not part of this ship's gate. Write this sentence into the PR body so a reviewer doesn't expect a guardrail delta.

- [ ] **Step 3: Manual end-to-end smoke (local or preview)**

Sign in, open the composer, `+` → "Journal club — appraise a paper", drop a small text-based PDF of a real RCT. Confirm, in order:
1. The upload sheet shows "Reading the PDF…" then "Starting the appraisal…" then closes.
2. A `ResearchRunCard` appears labeled "Journal club appraisal running…" with live progress steps.
3. On completion, "Report ready" links to `/app/reports/<id>`.
4. The report renders: paper header line, bottom-line summary, dimension sections ("Study design — strong", etc.), a "Discussion questions" list, and a single reference ([1] the uploaded paper).
5. PDF / Word / PowerPoint exports each download and include a "Discussion questions" section/slide.
6. The report appears in `/app/reports` under a "Journal club appraisals" group.
7. Negative paths: a >15MB PDF, a `.docx` renamed to `.pdf`, and a scanned-image PDF each show their specific honest error in the sheet (over-limit / not-a-PDF / no-text-layer).

- [ ] **Step 4: OWNER-GATED — deploy the `research` edge function BEFORE merging web**

This is the binding order (PR #90 pattern): the fn must accept `mode:"appraisal"` + `paper_text` in production before the web build that sends it goes live on `app.pharmaorb.app` (which auto-deploys `main` on merge). Ask the owner to approve, then deploy:

```bash
supabase functions deploy research --project-ref <PROJECT_REF> --use-api
```

(`--use-api` per the project's deploy convention — local Docker builds wedge. `<PROJECT_REF>` is the production project ref.)

Do NOT proceed to merge until the owner has confirmed the deploy succeeded. If the owner declines to deploy now, the PR stays open — merging web first would let a `mode:"appraisal"` request hit the old fn, which now 400s on the boundary guard (Task 3 Step 6) rather than silently degrading, but the feature would simply not work until the fn ships.

- [ ] **Step 5: Post-deploy production sanity (owner-run or owner-approved)**

After the fn deploy, confirm the deployed fn rejects a malformed appraisal (guard works) and accepts a well-formed one. A minimal check (service-role or a signed-in token):

```bash
# Expect 400 "paper_text required" — the boundary guard.
curl -sS -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/research" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"appraisal"}' | head -c 300
```

Expected: `{"error":"paper_text required",...}` with HTTP 400. (A full appraisal is better exercised through the UI in Step 3 against the deployed fn.)

- [ ] **Step 6: Branch, push, open the PR with the coupled-deploy checklist**

```bash
git push -u origin feat/journal-club
gh pr create --base main --head feat/journal-club \
  --title "feat: journal-club appraisal — upload a paper, get a grounded critical appraisal + deck" \
  --body "$(cat <<'EOF'
## What this ships (plain English)

Upload a research paper (PDF) and get back a structured critical appraisal — design, population, endpoints, statistical validity, and risk-of-bias flags, each with a plain-English verdict grounded in a verbatim quote from the paper — plus open discussion questions. It saves to the Library as a cited report and exports to PDF / Word / PowerPoint, so it's ready to present at a journal club. Live progress feels like an existing deep-research run.

## How it works

- **Upload → text:** a new Node route (`/api/v1/papers/extract`) parses the PDF with `unpdf`, capping text at ~200KB and flagging truncation honestly.
- **Text → appraisal:** the extracted text rides the request to the existing `research` edge function under a new `mode: "appraisal"`. The pipeline reuses the FROZEN `ask/safety.ts` layer as designed (preScreen on the short derived title; `detectViolations` on the assembled appraisal prose) and grounds every verdict in a verbatim quote.
- **Appraisal → report:** the result is shaped into the existing `ResearchReport` contract (paper = citation [1]; discussion questions in a new additive `appraisal_questions?` field), so the Library, report view, and all three exports render it unchanged.

## Decisions (verified against origin/main)

- **No migration.** `saved_reports.mode` is unconstrained `text` (20260623000000_projects.sql:39); `kind='deep_research'` is already allowed (0123). We write `kind='deep_research'` + `mode='appraisal'`. The Library groups by `mode`.
- **No storage bucket / no new table.** Extracted text rides the request; verbatim quotes are captured in the saved report. The original PDF is not re-downloadable (acceptable v1).

## Deploy order (BINDING — PR #90 pattern)

- [ ] `research` edge function deployed to production (owner-gated) BEFORE this merges.
- [ ] Post-deploy: `mode:"appraisal"` without `paper_text` returns 400 (boundary guard) in prod.
- [ ] Only then: merge to `main` (auto-deploys web to app.pharmaorb.app).

## Guardrail

The `ask` edge function is unchanged (its safety layer is imported verbatim, never edited), so the `ask` guardrail suite is not affected and is not part of this ship's gate.

## Test plan

- `deno test packages/shared/` (appraisal shaper) — green.
- `deno test --allow-env supabase/functions/ask/` (frozen layer intact) — green.
- `deno test --allow-env supabase/functions/research/appraise.test.ts` (verbatim + normalize) — green.
- `apps/web`: `npx tsx lib/pdf/extract.test.ts`, `npm run smoke:export`, `npm run build` — green.
- Manual E2E: upload → appraisal → report → three exports → Library group; plus the three negative upload paths.
EOF
)"
```

- [ ] **Step 7: After merge, verify production**

Once merged and Vercel finishes the `main` auto-deploy, run the manual E2E (Task 7 Step 3) once more against production to confirm the fn-and-web pair is coherent.

---

## Self-Review

**1. Spec coverage:**

- Upload a paper (PDF) → Task 2 (extraction route) + Task 5 (upload sheet). ✓
- Structured critical appraisal (design/population/endpoints/statistical validity/risk-of-bias, verdicts, verbatim-quote grounding) → Task 3 (`APPRAISAL_TOOL` dimensions, `verbatimQuote`, verdicts). ✓
- Auto-generated presentation deck → Task 4 (pptx) + existing `reportToPptx` reused via the `ResearchReport` shape. ✓
- Discussion questions → Task 1 (`appraisal_questions`), Task 4 (exports), Task 6 (view). ✓
- Appears in Library + can be filed to a project → Task 6 (Library group). Filing to a project reuses the existing saved-report → project mechanism (a saved report of `kind='deep_research'` is already project-fileable; no new work — the report is a normal saved report). ✓
- Agentic live progress → Task 3 (`executeAppraisalRun` streams `ResearchProgressStep`s) + existing `ResearchRunCard` polling. ✓
- REUSE mature modules → `ask/safety.ts` (frozen, imported), `ask/llm.ts`, `ask/model-router.ts`, ground.ts-style verbatim check (ported as `verbatimQuote`, not edited), `pptx/docx/pdf` exports. ✓
- ENDPOINT extend `research` with `mode "appraisal"`, contract preserved → Task 3. ✓
- DB no-migration decision → documented + verified. ✓
- Storage minimal-persistence decision → documented + verified. ✓
- FROZEN `ask/**` untouched; `detectViolations`/`preScreen` reused → Task 3. ✓
- Shared Deno tests for new pure module → Task 1 (`appraisal-report.test.ts`), Task 3 (`appraise.test.ts`). ✓
- Web gate `npm run build`; deploys/migrations owner-gated + deploy-before-web → Task 7. ✓
- Composer "Journal club" replaces the honest stub; PR #98 robustness → Task 5 + PR #98 note. ✓
- No fake UI states; honest errors → Task 2 (route errors), Task 5 (sheet errors). ✓
- Guardrail-not-touched stated → Global Constraints + Task 7 Step 2. ✓
- `legal_fulltext_chunks` optional future home, not wired v1 → intentionally omitted (spec says do not wire unless trivially beneficial; minimal-persistence path makes it unnecessary). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code. Two steps (Task 5 Step 5 card-append, Task 5 Step 2 icon-name) explicitly instruct inspecting the real file and give a concrete grep + fallback — these are grounded verification steps, not placeholders, because the exact local helper name in `ask/page.tsx`'s research-card append path cannot be pinned without reading the mutable region at execution time; the required OUTPUT (one appended turn with `research: { runId, mode:"appraisal", title }`) is fully specified.

**3. Type consistency:**
- `ReportMode` gains `"appraisal"` (Task 1) — used consistently in `index.ts` (Task 3), `startAppraisal` (Task 5), `ResearchRunCard`/Library (Task 5/6).
- `AppraisalInput` / `PaperMeta` / `AppraisalDimension` / `AppraisalPoint` / `AppraisalVerdict` / `AppraisalDimensionKey` defined once in `research.ts` (Task 1), consumed by `appraisal-report.ts` (Task 1), `appraise.ts` (Task 3), `lib/api.ts`/`PaperUploadSheet` (Task 5, `PaperMeta` only).
- `shapeAppraisalReport(input: AppraisalInput): ResearchReport` — signature identical in definition (Task 1) and call sites (Task 3).
- `verbatimQuote(quote, paperText): string | null` and `normalizeAppraisal(raw, meta, paperText): AppraisalInput` — signatures identical in test (Task 3 Step 1) and impl (Task 3 Step 3).
- `extractPaper(file): Promise<{text, meta}>` and `startAppraisal(paperText, paperMeta): Promise<string>` — identical in `lib/api.ts` (Task 5 Step 1) and `PaperUploadSheet` (Task 5 Step 2).
- `PAPER_TAG = "1"` — the shaper's only citation tag; the test asserts `chunk_tag === "1"` and `citation_ids === ["1"]`. Consistent.
- `ClaimSupport` field names (`chunk_tag`, `quote`) — Task 1 Step 6 verifies against the real type before relying on them.
- `ResearchProgressStep.step` values used by `executeAppraisalRun` (`planning`/`writing`/`checking`/`done`) are all members of the fixed union — no new step names invented, so `ResearchRunCard` renders them unchanged.
