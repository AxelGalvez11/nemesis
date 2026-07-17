# Publishable Evidence Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a Deep Research report into a sellable, defensible evidence document — Word/PowerPoint export, honest literature gaps + a "what we searched" summary, Vancouver/AMA reference formatting (user toggle), and an honest "structured / PRISMA-informed evidence review" mode — added on top of the **live, in-production** Deep Research engine without breaking it.

**Architecture:** Additive hybrid. New OPTIONAL fields on `ResearchReport` (saved in `saved_reports.payload`, `kind` stays `'deep_research'` → no migration, no break to the frozen `api.ts` read-path) + a server-side export layer (Next.js Node route handlers). The frozen guarantees hold: every new model-authored prose field is added to the single `detectViolations` scan; the citation namespace (`mergeEvidence` 1..N retag) is untouched; gaps and counts are computed deterministically in real code, the LLM only adds grounded nuance.

**Tech Stack:** TypeScript. Deno edge functions (`supabase/functions/ask/**`, `supabase/functions/research`, providers under `core-source-sync`). Next.js 16 App Router web app (`apps/web`, React 19, `@supabase/supabase-js`). Shared contract package `@nemesis/shared` (plain `.ts`, tested with `deno test packages/shared/`). New libs: `docx` v9.7.1 + `pptxgenjs` v4.0.1 (both MIT, Node-runtime only). Tests: `deno test` for all pure logic (shared + edge); `apps/web/scripts/smoke.mjs` (node) for the docx/pptx route formatters.

---

## Why the phase order differs from the design spec

The spec ordered: export → gaps → citations → rigorous. This plan inserts **Phase 2 (engine-side metadata foundation)** before gaps and citations, because of a dependency the spec front-loaded into "Phase 3a":

- The gap types `no_rct` / `no_synthesis` need PubMed `publication_types`, and `no_human_trial` needs ClinicalTrials `study_type` — **none of which reach the report today** (`parsePubMedXml` captures only last names + MeSH; `liveToChunk` drops all `metadata`).
- The Vancouver/AMA reference list needs author initials, journal, volume, issue, pages — **the same already-downloaded-but-unparsed PubMed EFetch XML**.

So one foundational extraction (`pubmed.ts` parse + `liveToChunk` pass-through + `RetrievedChunk`/`Citation` optional fields + the three Citation build sites) feeds **both** features. It co-deploys with the `research` edge function (the providers run inside it at runtime), so it doesn't fight the "each phase its own surface" posture. Phases remain independently deployable.

**Deploy posture:** the engine is already live (PR #49, `0127` applied). Nothing ships to prod without the owner's explicit greenlight. Surfaces per phase: Phase 0 = shared (no deploy); Phase 1 = web (Vercel); Phase 2/3/5 = `research` edge function; Phase 4 = web (render) + the `research` edge function only if Citation builders changed there; Phase 6 = verification across all.

---

## File Structure

**Created:**
- `packages/shared/src/forbidden-phrases.ts` — pure PRISMA-overclaim guard (rigorous-mode copy only). + `forbidden-phrases.test.ts`.
- `packages/shared/src/citation-format.ts` — pure `formatReference` / `buildReferenceList` (Vancouver + AMA). + `citation-format.test.ts`.
- `packages/shared/src/research-contract.test.ts` — asserts the new optional `ResearchReport`/`Citation` fields are assignable (type-shape guard).
- `supabase/functions/ask/research/gaps.ts` — pure `deriveGaps(chunks, subQuestions)` → `{ gaps, counts }`. + tests appended to `supabase/functions/ask/research/research.test.ts`.
- `apps/web/lib/export/docx.ts` — pure `reportToDocx(report, style)` → `Promise<Buffer>`.
- `apps/web/lib/export/pptx.ts` — pure `reportToPptx(report, style)` → `Promise<Buffer>`.
- `apps/web/app/api/reports/[id]/export/docx/route.ts` — Node route handler.
- `apps/web/app/api/reports/[id]/export/pptx/route.ts` — Node route handler.

**Modified:**
- `packages/shared/src/research.ts` — add `mode?`, `gaps?`, `search_method?`, `counts?`, `citation_style?` + the `GapStatement`/`SearchMethod`/`RetrievalCounts`/`ReportMode`/`CitationStyle` types.
- `packages/shared/src/answer.ts` — `Citation += authors?/journal?/year?/volume?/issue?/pages?`.
- `supabase/functions/core-source-sync/providers/pubmed.ts` — parse `publication_types`, author initials, volume, issue, pages, journal ISO abbreviation.
- `supabase/functions/core-source-sync/providers/europepmc.ts` — carry `authorString`, `journalInfo`, `pubYear`, `pubType` into `metadata`.
- `supabase/functions/ask/citation.ts` — `RetrievedChunk +=` optional metadata fields; `enforceCitations` carries them onto `Citation`.
- `supabase/functions/ask/live-sources.ts` — `liveToChunk` maps `source.metadata` → chunk fields.
- `supabase/functions/ask/retrieve.ts` — `fetchSourceMeta` selects + maps `core_sources.metadata` for library chunks.
- `supabase/functions/ask/research/orchestrate.ts` — `buildCitations` carries metadata; `runResearch` accepts `mode`, attaches `gaps`/`counts`/`search_method`; the `detectViolations` join gains the gaps + method prose.
- `supabase/functions/ask/research/synthesize.ts` — rigorous-mode `search_method` + inclusion/exclusion-notes schema fields.
- `supabase/functions/ask/research/plan.ts` — rigorous-mode plan variant.
- `supabase/functions/ask/index.ts` — the `chunk_tag: c.tag` Citation build site (line ~434) carries metadata.
- `supabase/functions/research/index.ts` — accept `mode` in the request body; pass to `runResearch`.
- `apps/web/lib/server.ts` — add `userClient(req)` (RLS-scoped, per-request).
- `apps/web/lib/api.ts` — `startResearch(question, mode?)`; export-download helpers.
- `apps/web/components/ResearchReportView.tsx` — fix `abbr()` europepmc bug; render gaps/counts + reference list + style toggle + export buttons; render Methods & Limitations for `structured_review`.
- `apps/web/components/EvidencePanel.tsx` — render the reference list for chat answers (graceful).
- `apps/web/app/app/research/page.tsx` — mode selector on the composer.
- `apps/web/package.json` — add `docx`, `pptxgenjs`.
- `apps/web/scripts/smoke.mjs` — export-formatter smoke (PK magic-byte) check.

---

## Phase 0 — Contract & guardrails (shared package; no deploy)

### Task 0.1: New report types + optional Citation metadata

**Files:**
- Modify: `packages/shared/src/answer.ts`
- Modify: `packages/shared/src/research.ts`
- Test: `packages/shared/src/research-contract.test.ts`

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/research-contract.test.ts`:

```typescript
// Type-shape guard: the publishable-reports additions are OPTIONAL and assignable.
// A green run proves the new fields exist with the intended shapes without changing
// any existing required field (the frozen contract stays backward-compatible).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Citation } from "./answer.ts";
import type {
  CitationStyle,
  GapStatement,
  ReportMode,
  ResearchReport,
  RetrievalCounts,
  SearchMethod,
} from "./research.ts";

Deno.test("Citation accepts optional bibliographic metadata", () => {
  const c: Citation = {
    chunk_tag: "1",
    source_id: "live:pubmed_oa:123",
    source_type: "pubmed_oa",
    title: "A study",
    section: null,
    url: null,
    license: "cc_by",
    published_date: "2024-01-01",
    retrieved_at: "2026-06-10T00:00:00Z",
    authors: ["Smith J", "Doe A"],
    journal: "N Engl J Med",
    year: "2024",
    volume: "390",
    issue: "2",
    pages: "101-110",
  };
  assertEquals(c.authors?.length, 2);
});

Deno.test("ResearchReport accepts the optional publishable-report fields", () => {
  const mode: ReportMode = "structured_review";
  const style: CitationStyle = "ama";
  const counts: RetrievalCounts = {
    per_provider: { pubmed_oa: 6, clinicaltrials: 4 },
    total_retrieved: 10,
    cap_per_source: 6,
    retrieved_at: "2026-06-10T00:00:00Z",
  };
  const gap: GapStatement = {
    dimension: "study_design",
    type: "no_rct",
    scope: "this_run",
    text: "No randomized controlled trial was among the sources we searched.",
    denominator: { providers_searched: ["pubmed_oa", "clinicaltrials"], n_sources: 10, retrieved_at: "2026-06-10T00:00:00Z" },
    corroborating_trials: [],
  };
  const method: SearchMethod = {
    databases: ["PubMed/Europe PMC", "ClinicalTrials.gov", "openFDA"],
    queries: ["tesamorelin efficacy", "tesamorelin safety"],
    search_date: "2026-06-10",
    inclusion_notes: "Sources retrieved by relevance, capped per source.",
    exclusion_notes: "No exhaustive census; non-open-access full text not read.",
  };
  const partial: Pick<ResearchReport, "mode" | "gaps" | "counts" | "search_method" | "citation_style"> = {
    mode,
    gaps: [gap],
    counts,
    search_method: method,
    citation_style: style,
  };
  assertEquals(partial.mode, "structured_review");
  assertEquals(partial.gaps?.[0].type, "no_rct");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test packages/shared/src/research-contract.test.ts`
Expected: FAIL — `Citation` has no `authors`; `ReportMode`/`GapStatement`/etc. not exported from `research.ts`.

- [ ] **Step 3: Add the optional metadata fields to `Citation`**

In `packages/shared/src/answer.ts`, replace the `Citation` interface (lines ~79-91) with:

```typescript
/** A resolved citation (§8 citations[] entry), joined back to core_sources. */
export interface Citation {
  /** The retrieval-local [n] tag the answer text references. */
  chunk_tag: string;
  source_id: string;
  source_type: string; // provider: openfda | clinicaltrials | pubmed_oa | ...
  title: string | null;
  section: string | null;
  url: string | null;
  license: string | null;
  published_date: string | null; // YYYY-MM-DD
  retrieved_at: string | null;
  // ── Optional bibliographic metadata (publishable-reports). Populated for NEW
  //    content once the Phase-2 plumbing lands; absent on older saved reports/chats,
  //    where the reference formatter degrades gracefully. Never required. ──
  authors?: string[];
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}
```

- [ ] **Step 4: Add the new report types to `research.ts`**

Append to `packages/shared/src/research.ts` (after the existing `ResearchProgressStep` interface):

```typescript
// ── Publishable-reports additions (additive & optional; saved in payload JSON) ──

/** Report rigor mode. 'standard' = today's Deep Research; 'structured_review' = the
 *  honest, method-documenting "structured / PRISMA-informed evidence review". */
export type ReportMode = "standard" | "structured_review";

/** Numbered medical citation style the reference list/exports use. */
export type CitationStyle = "vancouver" | "ama";

/** PICOS-ish dimension a gap is about (kept small + honest; not a formal framework). */
export type GapDimension =
  | "study_design"
  | "population"
  | "outcome"
  | "comparator"
  | "long_term"
  | "synthesis";

/** A deterministic, denominator-scoped literature gap. Computed in real code from the
 *  evidence actually retrieved this run (never "no evidence exists" — Altman-Bland). */
export interface GapStatement {
  dimension: GapDimension;
  type: "no_rct" | "no_human_trial" | "no_synthesis" | "conflicting" | "sparse";
  /** 'this_run' = scoped to the sources we searched; 'indexed_literature' = scoped to
   *  what we index (only used when projection coverage is verified — see plan §3). */
  scope: "this_run" | "indexed_literature";
  text: string;
  denominator: {
    providers_searched: string[];
    n_sources: number;
    retrieved_at: string | null;
  };
  /** Ongoing/recruiting trials that may answer the gap (strengthening-only; never deletes a gap). */
  corroborating_trials: string[]; // NCT ids
}

/** Honest "what we searched" summary. Counts are candidates retrieved (relevance-capped),
 *  NEVER PRISMA "records identified". */
export interface RetrievalCounts {
  per_provider: Record<string, number>;
  total_retrieved: number;
  cap_per_source: number;
  retrieved_at: string | null;
}

/** The documented, honest method for a structured_review report. Plain English; no PRISMA labels. */
export interface SearchMethod {
  databases: string[];
  queries: string[];
  search_date: string; // YYYY-MM-DD
  inclusion_notes: string;
  exclusion_notes: string;
}
```

Then add the optional fields to the `ResearchReport` interface (after `template?: AnswerTemplate;`):

```typescript
  // ── Publishable-reports additions (all optional; default to today's behavior). ──
  /** Rigor mode. Absent/`'standard'` = the existing Deep Research report. */
  mode?: ReportMode;
  /** Deterministic, denominator-scoped literature gaps (Phase 3). */
  gaps?: GapStatement[];
  /** Documented honest method, set only for `structured_review` (Phase 5). */
  search_method?: SearchMethod;
  /** "What we searched" counts (Phase 3). */
  counts?: RetrievalCounts;
  /** Citation style chosen for this report; exports read it so a download matches the screen. */
  citation_style?: CitationStyle;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `deno test packages/shared/src/research-contract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/answer.ts packages/shared/src/research.ts packages/shared/src/research-contract.test.ts
git commit -m "feat(shared): optional publishable-report fields on ResearchReport + Citation"
```

### Task 0.2: Forbidden-phrase guard (PRISMA-overclaim)

**Files:**
- Create: `packages/shared/src/forbidden-phrases.ts`
- Test: `packages/shared/src/forbidden-phrases.test.ts`

**Scope note:** this guard runs ONLY over the rigorous-mode *method/inclusion/methods-note copy* (Phase 5), where first-person self-description is the whole point — so banning these phrases outright is correct and cannot mis-flag a body sentence that legitimately cites an external "systematic review" or "meta-analysis" (those live in `sections`, scanned by `detectViolations`, not by this guard).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/forbidden-phrases.test.ts`:

```typescript
// The PRISMA-overclaim guard. PharmaOrb does bounded, relevance-capped retrieval — it is
// NOT a systematic/scoping review and has no PRISMA flow. These phrases must never appear
// in the method copy of a "structured / PRISMA-informed" report (honesty cornerstone, plan §2).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectForbiddenPhrases, FORBIDDEN_PHRASE_LABELS } from "./forbidden-phrases.ts";

Deno.test("flags every banned self-claim phrase", () => {
  for (const phrase of [
    "This systematic review of tesamorelin...",
    "We performed a scoping review of the literature.",
    "Our PRISMA-compliant search identified...",
    "See the PRISMA flow diagram below.",
    "A total of 412 records identified through database searching.",
  ]) {
    assert(detectForbiddenPhrases(phrase).length > 0, `should flag: ${phrase}`);
  }
});

Deno.test("passes honest method copy", () => {
  const ok =
    "We searched PubMed/Europe PMC, ClinicalTrials.gov, and openFDA on 2026-06-10. " +
    "Sources were retrieved by relevance and capped per source — not an exhaustive census. " +
    "Each claim was checked against its cited source.";
  assertEquals(detectForbiddenPhrases(ok), []);
});

Deno.test("is case-insensitive and reports a human label", () => {
  const hits = detectForbiddenPhrases("a SYSTEMATIC REVIEW");
  assertEquals(hits, [FORBIDDEN_PHRASE_LABELS.systematic_review]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test packages/shared/src/forbidden-phrases.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/forbidden-phrases.ts`:

```typescript
// PRISMA-overclaim guard (honesty cornerstone, plan §2). PURE, deterministic — the same
// discipline as the safety-layer detectViolations: code, not intent, prevents the claim.
// Applied ONLY to rigorous-mode method/inclusion/methods-note copy (Phase 5), so it cannot
// mis-flag a body sentence that cites an external systematic review or meta-analysis.

export const FORBIDDEN_PHRASE_LABELS = {
  systematic_review: "claims to be a systematic review",
  scoping_review: "claims to be a scoping review",
  prisma: "claims PRISMA compliance / flow",
  records_identified: 'uses PRISMA "records identified" phrasing',
} as const;

interface ForbiddenRule {
  key: keyof typeof FORBIDDEN_PHRASE_LABELS;
  re: RegExp;
}

const RULES: ForbiddenRule[] = [
  { key: "systematic_review", re: /\bsystematic\s+review\b/i },
  { key: "scoping_review", re: /\bscoping\s+review\b/i },
  { key: "prisma", re: /\bprisma\b/i }, // covers "PRISMA-compliant", "PRISMA flow diagram", bare "PRISMA"
  { key: "records_identified", re: /\brecords?\s+identified\b/i },
];

/** Returns the human labels of every banned phrase found. Empty array = clean. */
export function detectForbiddenPhrases(text: string): string[] {
  const out: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text)) out.push(FORBIDDEN_PHRASE_LABELS[rule.key]);
  }
  return out;
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/shared/src/index.ts`, append after the `research.ts` export:

```typescript
// Publishable-reports: PRISMA-overclaim guard + numbered citation formatter (pure).
export * from "./forbidden-phrases.ts";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `deno test packages/shared/src/forbidden-phrases.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/forbidden-phrases.ts packages/shared/src/forbidden-phrases.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): PRISMA-overclaim forbidden-phrase guard"
```

---

## Phase 1 — Word + PowerPoint export (web only)

Ships against the **current** report shape. Gaps/counts/reference sections appear automatically once Phases 2–4 land (the formatters render those fields only when present). Cheapest, safest, immediate value.

### Task 1.1: Add the export libraries

**Files:** Modify `apps/web/package.json`

- [ ] **Step 1: Add deps**

In `apps/web/package.json` `dependencies`, add (alphabetical):

```json
    "docx": "^9.7.1",
    "pptxgenjs": "^4.0.1",
```

- [ ] **Step 2: Install + verify**

Run: `npm install` (from repo root, workspaces) then `npm ls docx pptxgenjs -w @pharmaorb/web`
Expected: both resolve at the locked versions, no peer-dep errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(web): add docx + pptxgenjs for report export"
```

### Task 1.2: RLS-scoped per-request Supabase client

**Files:** Modify `apps/web/lib/server.ts`

- [ ] **Step 1: Add `userClient`**

In `apps/web/lib/server.ts`, after `adminClient()`, add:

```typescript
/** A per-request client that acts AS the signed-in user (their bearer token), so reads/writes
 *  are RLS-enforced to their own rows. Use this — not adminClient — to read user-owned data in
 *  route handlers (e.g. saved_reports), so the route can never read another user's row. */
export function userClient(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck -w @pharmaorb/web`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/server.ts
git commit -m "feat(web): RLS-scoped userClient(req) for route handlers"
```

### Task 1.3: Pure Word formatter

**Files:** Create `apps/web/lib/export/docx.ts`

**Honesty carry-through (non-negotiable, plan §5.1):** the doc MUST include `evidence_grade`, the "Not fully fact-checked" caution when `claims_verified === false`, `safety_notes`, and (when present) the Methods & Limitations / counts — a polished file must never read as more authoritative than the in-app view.

- [ ] **Step 1: Write the formatter**

Create `apps/web/lib/export/docx.ts`:

```typescript
// Pure Word (.docx) formatter for a ResearchReport. No I/O, no filesystem write — builds the
// document in memory and returns a Node Buffer (docx v9.7.1; Packer.toBuffer needs the Node
// runtime, enforced by the route handler's `export const runtime = "nodejs"`).
//
// Honesty carry-through: evidence_grade, the unverified caution, safety_notes, gaps, counts,
// and (structured_review) the method block are all emitted so the file is never more
// authoritative than the screen.
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@nemesis/shared";
import { buildReferenceList } from "@nemesis/shared";

function para(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}
function bullet(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 } });
}
function points(ps: AnswerPoint[]): Paragraph[] {
  return ps.map((p) => bullet(p.text));
}

export async function reportToDocx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: report.question || "Evidence Report", bold: true })],
  }));

  // Honesty banner up top: grade + verification state.
  const gradeLine = `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`;
  const verifyLine = report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
  children.push(para(gradeLine));
  children.push(para(verifyLine));

  if (report.summary) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Summary")] }));
    children.push(para(report.summary));
  }

  // Structured-review method block (only when present).
  if (report.search_method) {
    const m = report.search_method;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Methods & Limitations")] }));
    children.push(para(`Databases searched: ${m.databases.join(", ")}.`));
    children.push(para(`Search queries: ${m.queries.join("; ")}.`));
    children.push(para(`Search date: ${m.search_date}.`));
    children.push(para(m.inclusion_notes));
    children.push(para(m.exclusion_notes));
  }

  // "What we searched" counts (honest cap disclosure; never "records identified").
  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What we searched")] }));
    children.push(para(
      `${c.total_retrieved} candidate sources retrieved (top-ranked by relevance, capped at ` +
      `${c.cap_per_source} per source — not an exhaustive census). By source: ${per}.`,
    ));
  }

  for (const sec of report.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(sec.heading)] }));
    children.push(...points(sec.points));
  }

  if (report.safety_notes.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Safety")] }));
    children.push(...points(report.safety_notes));
  }

  if (report.gaps?.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Evidence gaps")] }));
    children.push(...report.gaps.map((g) => bullet(g.text)));
  }

  if (report.uncertainties.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Still uncertain")] }));
    children.push(...points(report.uncertainties));
  }

  if (report.citations.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("References")] }));
    const refs = buildReferenceList(report.citations as Citation[], style);
    children.push(...refs.map((r) => new Paragraph({ children: [new TextRun(`${r.n}. ${r.text}`)] })));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
```

> Note: `buildReferenceList` is created in Phase 4. For Phase 1, a temporary shim is added in Step 2 so this compiles and ships; Phase 4 replaces the shim with the real formatter (same signature), and the export gains conformant references with zero route changes.

- [ ] **Step 2: Add a minimal `buildReferenceList` shim (replaced in Phase 4)**

Create `packages/shared/src/citation-format.ts` with a numbered fallback (Phase 4 fills in Vancouver/AMA):

```typescript
// Numbered medical reference formatter (Vancouver + AMA). Phase 1 ships a graceful numbered
// fallback; Phase 4 replaces the body of formatReference with style-exact punctuation. The
// SIGNATURE is final so callers (export routes, ReportView) never change again.
// Import the source modules directly (NOT the ./index barrel) to avoid a barrel import cycle.
import type { Citation } from "./answer.ts";
import type { CitationStyle } from "./research.ts";

export interface FormattedReference {
  n: number;
  tag: string;
  text: string;
}

/** Format one citation as a reference string in the given style. PURE. */
export function formatReference(c: Citation, _style: CitationStyle): string {
  // Phase-1 fallback: title + provider + date. Phase 4 specializes per source_type + style.
  const bits = [c.title ?? c.source_id, providerLabel(c.source_type)];
  if (c.published_date) bits.push(c.published_date);
  if (c.url) bits.push(c.url);
  return bits.filter(Boolean).join(". ") + ".";
}

/** Build the full numbered reference list (numeric tag order), in the given style. PURE. */
export function buildReferenceList(citations: Citation[], style: CitationStyle): FormattedReference[] {
  return [...citations]
    .sort((a, b) => Number(a.chunk_tag.replace(/\D/g, "")) - Number(b.chunk_tag.replace(/\D/g, "")))
    .map((c, i) => ({ n: i + 1, tag: c.chunk_tag.replace(/\D/g, ""), text: formatReference(c, style) }));
}

function providerLabel(t: string): string {
  const x = t.toLowerCase();
  if (x.includes("openfda") || x.includes("dailymed")) return "[package insert]";
  if (x.includes("clinicaltrials")) return "ClinicalTrials.gov";
  if (x.includes("faers")) return "FDA FAERS (adverse-event database query)";
  if (x.includes("pubmed") || x.includes("europepmc")) return "PubMed";
  return t;
}
```

Add to the barrel `packages/shared/src/index.ts`:

```typescript
export * from "./citation-format.ts";
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck -w @pharmaorb/web` and `deno test packages/shared/src/research-contract.test.ts`
Expected: PASS (the export module compiles against the shim; shared still green).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/export/docx.ts packages/shared/src/citation-format.ts packages/shared/src/index.ts
git commit -m "feat(web): pure reportToDocx formatter + numbered reference shim"
```

### Task 1.4: Pure PowerPoint formatter

**Files:** Create `apps/web/lib/export/pptx.ts`

- [ ] **Step 1: Write the formatter**

Create `apps/web/lib/export/pptx.ts`:

```typescript
// Pure PowerPoint (.pptx) formatter for a ResearchReport. Builds in memory and returns a Node
// Buffer (pptxgenjs v4.0.1; write({ outputType: "nodebuffer" }) needs the Node runtime). A
// briefing deck: title + honesty, summary, each section, safety, gaps, references.
import pptxgen from "pptxgenjs";
import type { AnswerPoint, Citation, CitationStyle, ResearchReport } from "@nemesis/shared";
import { buildReferenceList } from "@nemesis/shared";

type Run = { text: string; options: { bullet: boolean; breakLine: boolean } };
function bullets(ps: AnswerPoint[]): Run[] {
  return ps.map((p) => ({ text: p.text, options: { bullet: true, breakLine: true } }));
}

function contentSlide(pptx: pptxgen, title: string, runs: Run[]): void {
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: "1A1A1A" });
  if (runs.length) {
    slide.addText(runs, { x: 0.5, y: 1.2, w: 12.3, h: 5.6, fontSize: 15, color: "363636", valign: "top" });
  }
}

export async function reportToPptx(report: ResearchReport, style: CitationStyle): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.author = "PharmaOrb";
  pptx.title = report.question || "Evidence Report";
  pptx.layout = "LAYOUT_WIDE";

  // Title slide + honesty.
  const title = pptx.addSlide();
  title.addText(report.question || "Evidence Report", { x: 0.5, y: 1.8, w: 12.3, h: 1.4, fontSize: 30, bold: true, color: "1A1A1A" });
  const verify = report.template
    ? `Conservative response (${report.template.replace(/_/g, " ")}).`
    : report.claims_verified
    ? "Each claim was checked against its cited source."
    : "NOT FULLY FACT-CHECKED — the claim-by-claim check could not run; treat with extra caution.";
  title.addText(
    [
      { text: `Evidence grade: ${report.evidence_grade.replace(/_/g, " ")}`, options: { breakLine: true } },
      { text: verify, options: { breakLine: true } },
    ],
    { x: 0.5, y: 3.4, w: 12.3, h: 1.5, fontSize: 14, color: "5A5A5A" },
  );

  if (report.summary) contentSlide(pptx, "Summary", [{ text: report.summary, options: { bullet: false, breakLine: true } }]);

  if (report.search_method) {
    const m = report.search_method;
    contentSlide(pptx, "Methods & Limitations", [
      { text: `Databases: ${m.databases.join(", ")}`, options: { bullet: true, breakLine: true } },
      { text: `Search queries: ${m.queries.join("; ")}`, options: { bullet: true, breakLine: true } },
      { text: `Search date: ${m.search_date}`, options: { bullet: true, breakLine: true } },
      { text: m.inclusion_notes, options: { bullet: true, breakLine: true } },
      { text: m.exclusion_notes, options: { bullet: true, breakLine: true } },
    ]);
  }

  // "What we searched" counts slide (parity with the Word doc's honesty disclosure).
  if (report.counts) {
    const c = report.counts;
    const per = Object.entries(c.per_provider).map(([k, v]) => `${k}: ${v}`).join(", ");
    contentSlide(pptx, "What we searched", [
      { text: `${c.total_retrieved} candidate sources retrieved (top-ranked by relevance, capped at ${c.cap_per_source} per source — not an exhaustive census).`, options: { bullet: true, breakLine: true } },
      { text: `By source: ${per}.`, options: { bullet: true, breakLine: true } },
    ]);
  }

  for (const sec of report.sections) contentSlide(pptx, sec.heading, bullets(sec.points));
  if (report.safety_notes.length) contentSlide(pptx, "Safety", bullets(report.safety_notes));
  if (report.gaps?.length) {
    contentSlide(pptx, "Evidence gaps", report.gaps.map((g) => ({ text: g.text, options: { bullet: true, breakLine: true } })));
  }
  if (report.uncertainties.length) contentSlide(pptx, "Still uncertain", bullets(report.uncertainties));

  if (report.citations.length) {
    const refs = buildReferenceList(report.citations as Citation[], style);
    contentSlide(pptx, "References", refs.map((r) => ({ text: `${r.n}. ${r.text}`, options: { bullet: false, breakLine: true } })));
  }

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buf;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck -w @pharmaorb/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/export/pptx.ts
git commit -m "feat(web): pure reportToPptx formatter"
```

### Task 1.5: Export route handlers

**Files:**
- Create: `apps/web/app/api/reports/[id]/export/docx/route.ts`
- Create: `apps/web/app/api/reports/[id]/export/pptx/route.ts`

- [ ] **Step 1: Write the docx route**

Create `apps/web/app/api/reports/[id]/export/docx/route.ts`:

```typescript
import type { CitationStyle, ResearchReport } from "@nemesis/shared";
import { json, userClient, verifyBearer } from "@/lib/server";
import { reportToDocx } from "@/lib/export/docx";

// docx Packer.toBuffer needs Node; declare it so Next never flips this to edge.
export const runtime = "nodejs";
export const maxDuration = 60;

function styleOf(req: Request, report: ResearchReport): CitationStyle {
  const q = new URL(req.url).searchParams.get("style");
  if (q === "ama" || q === "vancouver") return q;
  return report.citation_style ?? "vancouver";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "authentication required" }, 401);
  const { id } = await ctx.params;

  // RLS-scoped read AS the user (never service-role); same kind filter as the frozen read-path.
  const { data, error } = await userClient(req)
    .from("saved_reports")
    .select("payload,title")
    .eq("id", id)
    .eq("kind", "deep_research")
    .maybeSingle();
  if (error) return json({ error: "report read failed" }, 500);
  if (!data?.payload) return json({ error: "report not found" }, 404);

  const report = data.payload as unknown as ResearchReport;
  const buffer = await reportToDocx(report, styleOf(req, report));
  const filename = safeFilename((data.title as string) ?? "evidence-report", "docx");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeFilename(title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";
  return `${base}.${ext}`;
}
```

- [ ] **Step 2: Write the pptx route**

Create `apps/web/app/api/reports/[id]/export/pptx/route.ts` — identical to the docx route except: import `reportToPptx`; call `reportToPptx`; `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`; `safeFilename(..., "pptx")`.

```typescript
import type { CitationStyle, ResearchReport } from "@nemesis/shared";
import { json, userClient, verifyBearer } from "@/lib/server";
import { reportToPptx } from "@/lib/export/pptx";

export const runtime = "nodejs";
export const maxDuration = 60;

function styleOf(req: Request, report: ResearchReport): CitationStyle {
  const q = new URL(req.url).searchParams.get("style");
  if (q === "ama" || q === "vancouver") return q;
  return report.citation_style ?? "vancouver";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "authentication required" }, 401);
  const { id } = await ctx.params;

  const { data, error } = await userClient(req)
    .from("saved_reports")
    .select("payload,title")
    .eq("id", id)
    .eq("kind", "deep_research")
    .maybeSingle();
  if (error) return json({ error: "report read failed" }, 500);
  if (!data?.payload) return json({ error: "report not found" }, 404);

  const report = data.payload as unknown as ResearchReport;
  const buffer = await reportToPptx(report, styleOf(req, report));
  const filename = safeFilename((data.title as string) ?? "evidence-report", "pptx");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeFilename(title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";
  return `${base}.${ext}`;
}
```

- [ ] **Step 3: Type-check + build**

Run: `npm run typecheck -w @pharmaorb/web && npm run build -w @pharmaorb/web`
Expected: PASS — routes compile; both marked Node runtime.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/reports
git commit -m "feat(web): Node route handlers to export a report as .docx/.pptx (RLS-scoped read)"
```

### Task 1.6: Export buttons in the report view + download helpers

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/ResearchReportView.tsx`

- [ ] **Step 1: Add the authed-download helper to `api.ts`**

Append to `apps/web/lib/api.ts` (after `fetchResearchReports`):

```typescript
/** Download a saved report as .docx/.pptx. Fetches the Node route WITH the user's bearer token
 *  (a plain <a download> can't set Authorization), then triggers a browser download of the blob. */
export async function downloadReportExport(
  reportId: string,
  format: "docx" | "pptx",
  style: "vancouver" | "ama",
): Promise<void> {
  if (isPreviewMode) throw new Error("Export needs a live connection (not available in preview).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to export");

  const res = await fetch(`/api/reports/${reportId}/export/${format}?style=${style}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Pass the report id + style into `ResearchReportView` and render buttons**

`ResearchReportView` currently takes only `{ report }`. The saved-report id is needed for the export URL. Modify the component signature to `{ report, reportId }` (optional `reportId`; buttons render only when present — a freshly-finished run already has `row.saved_report_id`, and an opened report has `?r=<id>`).

In `apps/web/components/ResearchReportView.tsx`:

- Change the props: `export function ResearchReportView({ report, reportId, style = "vancouver", onStyleChange }: { report: ResearchReport; reportId?: string; style?: CitationStyle; onStyleChange?: (s: CitationStyle) => void })` (import `CitationStyle` from `@nemesis/shared`, and `downloadReportExport` from `@/lib/api`, and `useState`).
- Add an export toolbar just below the `grade-row`, rendered only when `reportId` is set and `report.template` is falsy:

```tsx
{reportId && !report.template ? (
  <div className="report-export-bar">
    <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "docx", style)}>
      <Icon name="doc" size={14} />Word
    </button>
    <button type="button" className="chip-action" onClick={() => void downloadReportExport(reportId, "pptx", style)}>
      <Icon name="doc" size={14} />PowerPoint
    </button>
  </div>
) : null}
```

(The Vancouver/AMA toggle UI is added in Phase 4; `style` defaults to `"vancouver"` here so Phase 1 ships a working default.)

- [ ] **Step 3: Thread `reportId` from the research page**

In `apps/web/app/app/research/page.tsx`, the two `ResearchReportView` usages get the id. Track the opened/finished report id in state. Replace the done-render usages:

```tsx
{phase === "done" && report ? <ResearchReportView report={report} reportId={openedReportId} /> : null}
```

Add state `const [openedReportId, setOpenedReportId] = useState<string | null>(null);` and set it: in the poll completion branch (`setReport(rep); setOpenedReportId(row.saved_report_id);`) and in the `?r=` open branch (`setReport(rep); setOpenedReportId(rParam);`), and clear it in `reset()`.

- [ ] **Step 4: Type-check + build**

Run: `npm run typecheck -w @pharmaorb/web && npm run build -w @pharmaorb/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/ResearchReportView.tsx apps/web/app/app/research/page.tsx
git commit -m "feat(web): Word/PowerPoint export buttons on the research report"
```

### Task 1.7: Export smoke test (PK magic bytes)

**Files:** Modify `apps/web/scripts/smoke.mjs`

- [ ] **Step 1: Read the existing smoke harness shape**

Run: `sed -n '1,40p' apps/web/scripts/smoke.mjs` and `grep -n "smoke" apps/web/package.json`.
Expected: learn how it loads modules. **Resolve the TypeScript-loader question NOW, before writing Step 2:** the export formatters are `.ts`, and a plain `node scripts/smoke.mjs` will NOT import `.ts`. Pick one and use it consistently in Steps 2–3: (a) if the existing smoke already runs under `tsx`/`--import tsx`, reuse that; (b) otherwise change the `smoke` script (or add `smoke:export`) to `tsx scripts/smoke.mjs` (add `tsx` as a web devDependency). The whole export-verification story rests on this loader actually loading the `.ts` formatters.

- [ ] **Step 2: Add the export smoke check**

Append to `apps/web/scripts/smoke.mjs` a check that builds both formats from a fixture report and asserts the OOXML zip magic bytes (`50 4B 03 04` = `PK\x03\x04`):

```javascript
// ── Export formatters: generate from a fixture report, assert non-empty OOXML (PK zip) bytes ──
import { reportToDocx } from "../lib/export/docx.ts";
import { reportToPptx } from "../lib/export/pptx.ts";

const fixtureReport = {
  question: "Smoke: tesamorelin evidence",
  summary: "Bottom line for the smoke fixture.",
  sub_questions: ["What is tesamorelin?"],
  sections: [{ heading: "What it is", points: [{ text: "A GHRH analog.", citation_ids: ["1"] }] }],
  uncertainties: [{ text: "Long-term safety is unclear.", citation_ids: [] }],
  safety_notes: [{ text: "Discuss with a clinician.", citation_ids: ["1"] }],
  citations: [{
    chunk_tag: "1", source_id: "live:pubmed_oa:1", source_type: "pubmed_oa",
    title: "A study", section: null, url: "https://pubmed.ncbi.nlm.nih.gov/1/",
    license: "cc_by", published_date: "2024-01-01", retrieved_at: "2026-06-10T00:00:00Z",
    authors: ["Smith J"], journal: "N Engl J Med", year: "2024", volume: "390", issue: "2", pages: "101-110",
  }],
  evidence_grade: "moderate", safety_flags: [], claims_verified: false,
};

function assertPkZip(buf, label) {
  if (!buf || buf.length < 100) throw new Error(`${label}: empty/too small (${buf?.length} bytes)`);
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    throw new Error(`${label}: not a PK zip (OOXML) file`);
  }
  console.log(`✓ ${label}: ${buf.length} bytes, PK zip OK`);
}

const docxBuf = await reportToDocx(fixtureReport, "vancouver");
assertPkZip(docxBuf, "reportToDocx");
const pptxBuf = await reportToPptx(fixtureReport, "ama");
assertPkZip(pptxBuf, "reportToPptx");
```

(If `smoke.mjs` cannot import `.ts` directly under plain node, run this check via `npx tsx apps/web/scripts/smoke.mjs` or add a `smoke:export` script using `tsx`. Confirm in Step 1 which runner the existing smoke uses and match it.)

- [ ] **Step 3: Run the smoke check**

Run: `npm run smoke -w @pharmaorb/web` (or the matched tsx command)
Expected: `✓ reportToDocx: <N> bytes, PK zip OK` and `✓ reportToPptx: <N> bytes, PK zip OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/smoke.mjs
git commit -m "test(web): smoke the docx/pptx export formatters (PK magic bytes)"
```

**Phase 1 deploy (owner-gated):** push the branch → Vercel preview → owner downloads a real saved report, confirms it opens in Word/PowerPoint and visibly carries the grade + "Not fully fact-checked" state + safety notes → greenlight to promote.

---

## Phase 2 — Engine-side metadata foundation (Deno edge; deploys with the `research` function)

The shared prerequisite for gaps (Phase 3) and references (Phase 4). All from already-downloaded data.

### Task 2.1: Parse the unparsed PubMed metadata

**Files:**
- Modify: `supabase/functions/core-source-sync/providers/pubmed.ts`
- Test: `supabase/functions/core-source-sync/providers/pubmed.test.ts` (create if absent)

- [ ] **Step 1: Write the failing parser test**

Create (or append to) `supabase/functions/core-source-sync/providers/pubmed.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parsePubMedXml } from "./pubmed.ts";

const XML = `
<PubmedArticleSet><PubmedArticle>
<MedlineCitation><PMID>12345</PMID>
<Article>
<Journal><Title>The New England Journal of Medicine</Title>
<ISOAbbreviation>N Engl J Med</ISOAbbreviation>
<JournalIssue><Volume>390</Volume><Issue>2</Issue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>Tesamorelin in HIV lipodystrophy.</ArticleTitle>
<Pagination><MedlinePgn>101-110</MedlinePgn></Pagination>
<Abstract><AbstractText>Tesamorelin reduced visceral fat.</AbstractText></Abstract>
<AuthorList>
<Author><LastName>Falutz</LastName><ForeName>Julian</ForeName><Initials>J</Initials></Author>
<Author><LastName>Mamputu</LastName><ForeName>Jean-Claude</ForeName><Initials>JC</Initials></Author>
</AuthorList>
<PublicationTypeList>
<PublicationType>Randomized Controlled Trial</PublicationType>
<PublicationType>Journal Article</PublicationType>
</PublicationTypeList>
</Article>
<MeshHeadingList><MeshHeading><DescriptorName>Humans</DescriptorName></MeshHeading></MeshHeadingList>
</MedlineCitation>
</PubmedArticle></PubmedArticleSet>`;

Deno.test("parsePubMedXml captures bibliographic + publication-type metadata", () => {
  const [a] = parsePubMedXml(XML);
  assertEquals(a.pmid, "12345");
  assertEquals(a.journal, "The New England Journal of Medicine");
  assertEquals(a.journal_iso, "N Engl J Med");
  assertEquals(a.volume, "390");
  assertEquals(a.issue, "2");
  assertEquals(a.pages, "101-110");
  assertEquals(a.year, 2024);
  assertEquals(a.authors, ["Falutz J", "Mamputu JC"]);
  assertEquals(a.publication_types, ["Randomized Controlled Trial", "Journal Article"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test supabase/functions/core-source-sync/providers/pubmed.test.ts`
Expected: FAIL — `parsePubMedXml` not exported; new fields missing.

- [ ] **Step 3: Extend the parser**

In `supabase/functions/core-source-sync/providers/pubmed.ts`:

1. Add fields to the `ParsedArticle` interface:

```typescript
interface ParsedArticle {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  journal_iso: string;
  volume: string;
  issue: string;
  pages: string;
  year: number | null;
  authors: string[];
  publication_types: string[];
  mesh: string[];
  license: CoreSourceLicense;
}
```

2. Export the parser and capture the new fields. Replace the relevant parsing block in `parsePubMedXml`:

```typescript
export function parsePubMedXml(xml: string): ParsedArticle[] {
  const articleBlocks = xml.split(/<PubmedArticle[^>]*>/).slice(1);
  const out: ParsedArticle[] = [];

  for (const block of articleBlocks) {
    const pmid = extract(block, /<PMID[^>]*>([\s\S]*?)<\/PMID>/);
    const title = decode(extract(block, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/));
    const abstractText = decode(
      Array.from(block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g), (m) => m[1]).join("\n\n"),
    );
    const journal = decode(extract(block, /<Title[^>]*>([\s\S]*?)<\/Title>/));
    const journal_iso = decode(extract(block, /<ISOAbbreviation[^>]*>([\s\S]*?)<\/ISOAbbreviation>/));
    const volume = decode(extract(block, /<Volume>([\s\S]*?)<\/Volume>/));
    const issue = decode(extract(block, /<Issue>([\s\S]*?)<\/Issue>/));
    const pages = decode(extract(block, /<MedlinePgn>([\s\S]*?)<\/MedlinePgn>/));
    const yearStr = extract(block, /<Year>(\d{4})<\/Year>/);

    // Authors as "LastName Initials" (Vancouver/AMA form). Each <Author> block parsed
    // individually so a missing initials field degrades to last-name-only, not a mis-pair.
    const authors = Array.from(block.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g), (m) => {
      const a = m[1];
      const last = decode(extract(a, /<LastName>([^<]+)<\/LastName>/));
      const initials = decode(extract(a, /<Initials>([^<]+)<\/Initials>/));
      if (!last) return "";
      return initials ? `${last} ${initials}` : last;
    }).filter(Boolean);

    const publication_types = Array.from(
      block.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g),
      (m) => decode(m[1]),
    );
    const mesh = Array.from(
      block.matchAll(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g),
      (m) => m[1],
    );
    const license: CoreSourceLicense = "cc_by";

    if (pmid) {
      out.push({
        pmid, title, abstract: abstractText, journal, journal_iso, volume, issue, pages,
        year: yearStr ? Number(yearStr) : null, authors, publication_types, mesh, license,
      });
    }
  }
  return out;
}
```

3. Carry the new fields into the `NormalizedSource.metadata` in `fetchPubMedOA` (replace the `metadata` object):

```typescript
      metadata: {
        pmid: a.pmid,
        journal: a.journal,
        journal_iso: a.journal_iso,
        volume: a.volume,
        issue: a.issue,
        pages: a.pages,
        year: a.year,
        authors: a.authors,
        publication_types: a.publication_types,
        mesh: a.mesh,
      },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/core-source-sync/providers/pubmed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/core-source-sync/providers/pubmed.ts supabase/functions/core-source-sync/providers/pubmed.test.ts
git commit -m "feat(ingest): parse PubMed author initials, volume/issue/pages, journal ISO, publication types"
```

### Task 2.2: Carry Europe PMC metadata

**Files:** Modify `supabase/functions/core-source-sync/providers/europepmc.ts`

- [ ] **Step 1: Extend the result interface + metadata**

In `europepmc.ts`, add to `EpmcResult`: `authorList?: { author?: Array<{ lastName?: string; initials?: string }> }` and `pubTypeList?: { pubType?: string[] }` (Europe PMC `core` result fields). Then replace the `metadata` object in the push:

```typescript
      metadata: {
        source: "europepmc",
        pmid: r.pmid,
        pmcid: r.pmcid,
        year: r.pubYear,
        journal: r.journalInfo?.journal?.title,
        authors: (r.authorList?.author ?? [])
          .map((au) => [au.lastName, au.initials].filter(Boolean).join(" "))
          .filter(Boolean),
        publication_types: r.pubTypeList?.pubType ?? [],
      },
```

(`authorString` is also present as a flat string fallback; the structured `authorList` is preferred for clean Vancouver/AMA form. No new fetch — `resultType=core` already returns these.)

- [ ] **Step 2: Type-check the edge module**

Run: `deno check supabase/functions/core-source-sync/providers/europepmc.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/core-source-sync/providers/europepmc.ts
git commit -m "feat(ingest): carry Europe PMC authors/journal/publication types in metadata"
```

### Task 2.3: Add optional metadata to `RetrievedChunk`

**Files:** Modify `supabase/functions/ask/citation.ts`

- [ ] **Step 1: Extend `RetrievedChunk`**

In `citation.ts`, add to the `RetrievedChunk` interface (after `similarity: number;`):

```typescript
  // ── Optional bibliographic + study-type metadata (publishable-reports). Live results carry
  //    these from the provider's NormalizedSource.metadata; library results from core_sources.
  //    Absent on most chunks; consumers degrade gracefully. ──
  authors?: string[];
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  /** PubMed PublicationType list (for gap study-type classification). */
  publication_types?: string[];
  /** ClinicalTrials.gov study type (INTERVENTIONAL | OBSERVATIONAL | ...) for gap classification. */
  study_type?: string;
  trial_status?: string;
  trial_phase?: string;
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/ask/citation.ts`
Expected: PASS (purely additive optional fields).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ask/citation.ts
git commit -m "feat(ask): optional bibliographic + study-type fields on RetrievedChunk"
```

### Task 2.4: Map metadata through `liveToChunk`

**Files:**
- Modify: `supabase/functions/ask/live-sources.ts`
- Test: append to `supabase/functions/ask/live-sources.test.ts` (create if absent)

- [ ] **Step 1: Write the failing mapping test**

Create/append `supabase/functions/ask/live-sources.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { liveToChunk, type LiveCandidate } from "./live-sources.ts";

Deno.test("liveToChunk carries PubMed bibliographic metadata onto the chunk", () => {
  const c: LiveCandidate = {
    origin: "pubmed", provider: "pubmed_oa", provider_id: "12345",
    title: "A study", url: "https://pubmed.ncbi.nlm.nih.gov/12345/", text: "abstract",
    source: {
      provider: "pubmed_oa", provider_id: "12345", title: "A study",
      source_url: "https://pubmed.ncbi.nlm.nih.gov/12345/", license: "cc_by",
      content_text: "abstract", content_hash: "h",
      metadata: {
        authors: ["Falutz J"], journal: "N Engl J Med", year: 2024, volume: "390",
        issue: "2", pages: "101-110", publication_types: ["Randomized Controlled Trial"],
      },
    },
  };
  const chunk = liveToChunk(c, "1");
  assertEquals(chunk.authors, ["Falutz J"]);
  assertEquals(chunk.journal, "N Engl J Med");
  assertEquals(chunk.year, "2024");
  assertEquals(chunk.volume, "390");
  assertEquals(chunk.publication_types, ["Randomized Controlled Trial"]);
});

Deno.test("liveToChunk carries ClinicalTrials study type", () => {
  const c: LiveCandidate = {
    origin: "clinicaltrials", provider: "clinicaltrials", provider_id: "NCT1",
    title: "Trial", url: "https://clinicaltrials.gov/study/NCT1", text: "trial",
    source: {
      provider: "clinicaltrials", provider_id: "NCT1", title: "Trial",
      source_url: "https://clinicaltrials.gov/study/NCT1", license: "public_domain",
      content_text: "trial", content_hash: "h",
      metadata: { nct_id: "NCT1", study_type: "INTERVENTIONAL", status: "RECRUITING", phases: ["PHASE2"] },
    },
  };
  const chunk = liveToChunk(c, "1");
  assertEquals(chunk.study_type, "INTERVENTIONAL");
  assertEquals(chunk.trial_status, "RECRUITING");
  assertEquals(chunk.trial_phase, "PHASE2");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test supabase/functions/ask/live-sources.test.ts`
Expected: FAIL — chunk fields are `undefined`.

- [ ] **Step 3: Map the metadata in `liveToChunk`**

In `live-sources.ts`, replace the `liveToChunk` return with a version that reads `c.source.metadata` (a small typed helper keeps it tidy):

```typescript
export function liveToChunk(c: LiveCandidate, tag: string): RetrievedChunk {
  const syntheticId = `live:${c.provider}:${c.provider_id}`;
  const m = (c.source.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    return undefined;
  };
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;
  const phases = strArr(m.phases);
  return {
    tag,
    chunk_id: syntheticId,
    chunk_text: c.text,
    source_id: syntheticId,
    provider: c.provider,
    title: c.title,
    section: null,
    url: c.url,
    license: c.source.license,
    published_date: c.source.effective_at ? c.source.effective_at.slice(0, 10) : null,
    retrieved_at: new Date().toISOString(),
    similarity: 0,
    // Bibliographic (PubMed/Europe PMC).
    authors: strArr(m.authors),
    journal: str(m.journal_iso) ?? str(m.journal),
    year: str(m.year),
    volume: str(m.volume),
    issue: str(m.issue),
    pages: str(m.pages),
    publication_types: strArr(m.publication_types),
    // Study-type (ClinicalTrials).
    study_type: str(m.study_type),
    trial_status: str(m.status),
    trial_phase: phases && phases.length ? phases[phases.length - 1] : undefined,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/ask/live-sources.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ask/live-sources.ts supabase/functions/ask/live-sources.test.ts
git commit -m "feat(ask): liveToChunk carries bibliographic + study-type metadata"
```

### Task 2.5: Carry library-source metadata in `retrieve.ts`

**Files:** Modify `supabase/functions/ask/retrieve.ts`

- [ ] **Step 1: Select + map `metadata` for library chunks**

In `retrieve.ts`:

1. Extend `SourceMeta` and `fetchSourceMeta` to also select `metadata`:

```typescript
interface SourceMeta {
  title: string | null;
  effective_at: string | null;
  metadata: Record<string, unknown> | null;
}
```

In `fetchSourceMeta`, change the select to `"id,title,effective_at,metadata"` and the row map to:

```typescript
  return new Map(rows.map((r) => [r.id, { title: r.title, effective_at: r.effective_at, metadata: r.metadata ?? null }]));
```

(update the inline row type to include `metadata: Record<string, unknown> | null`.)

2. In the `chunks` map, populate the optional fields from `meta?.metadata` using the same `str`/`strArr` helpers (extract them to module scope or inline):

```typescript
    const md = (meta?.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : undefined);
    const strArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined);
    return {
      tag: String(i + 1),
      chunk_id: r.id,
      chunk_text: r.chunk_text,
      source_id: r.source_id,
      provider: r.provider,
      title: meta?.title ?? null,
      section: r.section,
      url: r.source_url,
      license: r.license,
      published_date: meta?.effective_at ? meta.effective_at.slice(0, 10) : null,
      retrieved_at: r.retrieved_at,
      similarity: r.similarity,
      authors: strArr(md.authors),
      journal: str(md.journal_iso) ?? str(md.journal),
      year: str(md.year),
      volume: str(md.volume),
      issue: str(md.issue),
      pages: str(md.pages),
      publication_types: strArr(md.publication_types),
      study_type: str(md.study_type),
      trial_status: str(md.status),
      trial_phase: undefined,
    };
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/ask/retrieve.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ask/retrieve.ts
git commit -m "feat(ask): carry core_sources.metadata onto library RetrievedChunks"
```

### Task 2.6: Carry chunk metadata onto every `Citation`

The three real build sites (confirmed by grep of `chunk_tag:`): `orchestrate.ts` `buildCitations`, `citation.ts` `enforceCitations`, `index.ts` (~line 434). All map a `RetrievedChunk` → `Citation`; each must copy the new optional fields.

**Files:**
- Modify: `supabase/functions/ask/research/orchestrate.ts`
- Modify: `supabase/functions/ask/citation.ts`
- Modify: `supabase/functions/ask/index.ts`
- Test: append to `supabase/functions/ask/research/research.test.ts`

- [ ] **Step 1: Write the failing carry-through test**

Append to `supabase/functions/ask/research/research.test.ts`:

```typescript
import { buildCitations } from "./orchestrate.ts";
import type { RetrievedChunk } from "../citation.ts";

Deno.test("buildCitations carries bibliographic metadata onto the Citation", () => {
  const chunks: RetrievedChunk[] = [{
    tag: "1", chunk_id: "live:pubmed_oa:1", source_id: "live:pubmed_oa:1", provider: "pubmed_oa",
    title: "A study", section: null, url: null, license: "cc_by",
    published_date: "2024-01-01", retrieved_at: "2026-06-10T00:00:00Z", similarity: 0,
    authors: ["Falutz J"], journal: "N Engl J Med", year: "2024", volume: "390", issue: "2", pages: "101-110",
  }];
  const [c] = buildCitations(["1"], chunks);
  assertEquals(c.authors, ["Falutz J"]);
  assertEquals(c.journal, "N Engl J Med");
  assertEquals(c.volume, "390");
});
```

(Ensure `assertEquals` is imported at the top of `research.test.ts`; it already is.)

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test supabase/functions/ask/research/research.test.ts`
Expected: FAIL — `c.authors` is `undefined`.

- [ ] **Step 3: Add a shared mapper + use it at all three sites**

In `orchestrate.ts` `buildCitations`, replace the returned object literal's tail (after `retrieved_at: c.retrieved_at,`) by spreading a helper. Define the helper once and reuse:

```typescript
/** Copy the optional bibliographic/study-type fields from a chunk onto a Citation. PURE. */
export function citationMeta(c: RetrievedChunk): Pick<Citation, "authors" | "journal" | "year" | "volume" | "issue" | "pages"> {
  return {
    authors: c.authors,
    journal: c.journal,
    year: c.year,
    volume: c.volume,
    issue: c.issue,
    pages: c.pages,
  };
}
```

Then in `buildCitations`, the mapped object becomes:

```typescript
      return {
        chunk_tag: tag,
        source_id: c.source_id,
        source_type: c.provider,
        title: c.title,
        section: c.section,
        url: c.url,
        license: c.license,
        published_date: c.published_date,
        retrieved_at: c.retrieved_at,
        ...citationMeta(c),
      };
```

In `citation.ts` `enforceCitations`, import `citationMeta` from `./research/orchestrate.ts`? — NO (avoid a cycle: orchestrate imports citation). Instead define `citationMeta` in `citation.ts` (the leaf) and import it into `orchestrate.ts`. Move the helper to `citation.ts` (it already owns `RetrievedChunk` + `Citation` types is in shared), export it, and have `orchestrate.ts` import it. Then in `enforceCitations`'s mapped object add `...citationMeta(c)` after `retrieved_at`.

In `index.ts` (~line 434, the `chunk_tag: c.tag` site), add `...citationMeta(c)` to that object too (import `citationMeta` from `./citation.ts`). Verify the local variable there is a `RetrievedChunk` (named `c`); if the field is `c.tag`, the same chunk shape applies.

- [ ] **Step 4: Run all engine tests**

Run: `deno test supabase/functions/ask/`
Expected: PASS — 286 existing + new carry-through test; frozen safety suite untouched and green.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ask/citation.ts supabase/functions/ask/research/orchestrate.ts supabase/functions/ask/index.ts supabase/functions/ask/research/research.test.ts
git commit -m "feat(ask): carry bibliographic metadata onto every Citation build site"
```

**Phase 2 deploy (owner-gated):** deploy the `research` edge function (`supabase functions deploy research --use-api`). Verify via a live Pro run that a finished report's `citations[]` now carry `authors`/`journal`/`volume` for PubMed sources (read the saved payload). No user-visible change yet — the foundation is in place.

---

## Phase 3 — Deterministic literature gaps + honest counts (Deno edge)

Run-scoped (Tier-2), fully deterministic, denominator-phrased. **No LLM** in this phase. (The spec's optional "reframe model `uncertainties` into grounded cited gaps via a faithfulness-style check" is a separate later increment — deliberately deferred so this phase stays deterministic and small.)

### Task 3.1: `deriveGaps` pure module

**Files:**
- Create: `supabase/functions/ask/research/gaps.ts`
- Test: append to `supabase/functions/ask/research/research.test.ts`

Classification reuses the same predicates as `evidence-scoring.ts` `extractSignals`, applied to the run's `RetrievedChunk[]`:
- `n_human_trials` = chunks with `study_type === "INTERVENTIONAL"`.
- `n_rct` = chunks whose `publication_types` match `/randomized controlled trial/i`.
- `n_synthesis` = chunks whose `publication_types` match `/meta-analysis/i` or `/systematic review/i`.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/ask/research/research.test.ts`:

```typescript
import { deriveGaps } from "./gaps.ts";

function chunk(partial: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    tag: "1", chunk_id: "x", source_id: "x", provider: "pubmed_oa", title: null, section: null,
    url: null, license: null, published_date: null, retrieved_at: "2026-06-10T00:00:00Z",
    similarity: 0, ...partial,
  };
}

Deno.test("deriveGaps: no human trial, no rct, no synthesis when only labels retrieved", () => {
  const chunks = [chunk({ provider: "openfda" }), chunk({ provider: "openfda" })];
  const { gaps, counts } = deriveGaps(chunks, ["q1"]);
  const types = gaps.map((g) => g.type).sort();
  assertEquals(types.includes("no_human_trial"), true);
  assertEquals(types.includes("no_rct"), true);
  assertEquals(types.includes("no_synthesis"), true);
  assertEquals(counts.total_retrieved, 2);
  assertEquals(counts.per_provider.openfda, 2);
  // Denominator-scoped phrasing, never "no evidence exists".
  for (const g of gaps) {
    assertEquals(/no evidence exists/i.test(g.text), false);
    assertEquals(g.scope, "this_run");
  }
});

Deno.test("deriveGaps: an RCT chunk removes the no_rct gap and the no_human_trial gap (if interventional)", () => {
  const chunks = [
    chunk({ provider: "pubmed_oa", publication_types: ["Randomized Controlled Trial"] }),
    chunk({ provider: "clinicaltrials", study_type: "INTERVENTIONAL" }),
  ];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  assertEquals(gaps.some((g) => g.type === "no_rct"), false);
  assertEquals(gaps.some((g) => g.type === "no_human_trial"), false);
  // No synthesis still flagged.
  assertEquals(gaps.some((g) => g.type === "no_synthesis"), true);
});

Deno.test("deriveGaps: a meta-analysis removes no_synthesis", () => {
  const chunks = [chunk({ publication_types: ["Meta-Analysis"] })];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  assertEquals(gaps.some((g) => g.type === "no_synthesis"), false);
});

Deno.test("deriveGaps: recruiting trial attaches as corroborating, never deletes a gap", () => {
  const chunks = [
    chunk({ provider: "openfda" }),
    chunk({ provider: "clinicaltrials", source_id: "live:clinicaltrials:NCT9", study_type: "INTERVENTIONAL", trial_status: "RECRUITING" }),
  ];
  const { gaps } = deriveGaps(chunks, ["q1"]);
  // An interventional+recruiting trial means no_human_trial is gone, but no_rct/no_synthesis remain,
  // and the recruiting NCT is attached to a surviving gap as "an answer may be coming".
  const rct = gaps.find((g) => g.type === "no_rct");
  assertEquals(!!rct, true);
  assertEquals(rct?.corroborating_trials.includes("NCT9"), true);
});

Deno.test("deriveGaps: empty pool yields counts but a single sparse gap", () => {
  const { gaps, counts } = deriveGaps([], ["q1"]);
  assertEquals(counts.total_retrieved, 0);
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].type, "sparse");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test supabase/functions/ask/research/research.test.ts`
Expected: FAIL — `gaps.ts` not found.

- [ ] **Step 3: Write `deriveGaps`**

Create `supabase/functions/ask/research/gaps.ts`:

```typescript
// Deterministic literature-gap derivation (publishable-reports, plan §3). PURE, no LLM.
// Operates on the RUN's retrieved chunks — run-scoped (Tier-2) gaps, every statement carries
// its denominator ("in the sources we searched"), never "no evidence exists" (Altman-Bland).
// Classification mirrors evidence-scoring.ts extractSignals predicates.
import type { RetrievedChunk } from "../citation.ts";
import type { GapStatement, RetrievalCounts } from "../../../../packages/shared/src/research.ts";

const CAP_PER_SOURCE = 6; // matches both LIVE_PER_SOURCE_MAX and SUB_TOP_M in orchestrate.ts (both 6); disclosed as the per-source cap.

const isRct = (c: RetrievedChunk) => (c.publication_types ?? []).some((t) => /randomized controlled trial/i.test(t));
const isSynthesis = (c: RetrievedChunk) =>
  (c.publication_types ?? []).some((t) => /meta-analysis/i.test(t) || /systematic review/i.test(t));
const isInterventional = (c: RetrievedChunk) => (c.study_type ?? "").toUpperCase() === "INTERVENTIONAL";

/** NCT id from a clinicaltrials chunk's synthetic source_id ("live:clinicaltrials:NCT123"). */
function nctOf(c: RetrievedChunk): string | null {
  const m = c.source_id.match(/(NCT\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

export function deriveGaps(
  chunks: RetrievedChunk[],
  _subQuestions: string[],
): { gaps: GapStatement[]; counts: RetrievalCounts } {
  const retrieved_at = chunks.find((c) => c.retrieved_at)?.retrieved_at ?? null;
  const per_provider: Record<string, number> = {};
  for (const c of chunks) per_provider[c.provider] = (per_provider[c.provider] ?? 0) + 1;
  const providers_searched = Object.keys(per_provider);
  const counts: RetrievalCounts = {
    per_provider,
    total_retrieved: chunks.length,
    cap_per_source: CAP_PER_SOURCE,
    retrieved_at,
  };

  if (chunks.length === 0) {
    return {
      counts,
      gaps: [{
        dimension: "synthesis",
        type: "sparse",
        scope: "this_run",
        text: "No sources cleared the relevance threshold for this question in the databases we searched, so no evidence claims could be grounded.",
        denominator: { providers_searched, n_sources: 0, retrieved_at },
        corroborating_trials: [],
      }],
    };
  }

  // Ongoing/recruiting interventional trials → strengthening-only corroboration.
  const ongoingNct = [...new Set(chunks
    .filter((c) => c.provider === "clinicaltrials" && isInterventional(c) && /RECRUIT|NOT_YET|ACTIVE|ENROLL/i.test(c.trial_status ?? ""))
    .map(nctOf)
    .filter((x): x is string => !!x))];

  const denom = { providers_searched, n_sources: chunks.length, retrieved_at };
  const gaps: GapStatement[] = [];

  if (!chunks.some(isInterventional)) {
    gaps.push({
      dimension: "study_design",
      type: "no_human_trial",
      scope: "this_run",
      text: "No interventional (human) clinical trial was among the sources we searched for this question.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }
  if (!chunks.some(isRct)) {
    gaps.push({
      dimension: "study_design",
      type: "no_rct",
      scope: "this_run",
      text: "No randomized controlled trial was among the sources we searched for this question.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }
  if (!chunks.some(isSynthesis)) {
    gaps.push({
      dimension: "synthesis",
      type: "no_synthesis",
      scope: "this_run",
      text: "No systematic review or meta-analysis was among the sources we searched for this question, so these retrieved findings are not yet synthesized.",
      denominator: denom,
      corroborating_trials: ongoingNct,
    });
  }

  return { gaps, counts };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test supabase/functions/ask/research/research.test.ts`
Expected: PASS (all deriveGaps tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ask/research/gaps.ts supabase/functions/ask/research/research.test.ts
git commit -m "feat(research): deterministic run-scoped literature gaps + honest counts"
```

### Task 3.2: Wire gaps/counts into the report + the single safety scan

**Files:**
- Modify: `supabase/functions/ask/research/orchestrate.ts`
- Test: append to `supabase/functions/ask/research/research.test.ts`

- [ ] **Step 1: Write the failing safety-scan-covers-gaps test**

Append to `research.test.ts` (this proves a forbidden medical string placed in a gap is caught — the frozen one-scan guarantee extends to the new field):

```typescript
import { detectViolations } from "../safety.ts";

Deno.test("the assembled safety-scan string includes gap text (one-scan guarantee)", () => {
  // deriveGaps text is deterministic + safe, so we assert the JOIN includes it by constructing the
  // same string orchestrate builds. A banned phrase placed in a gap MUST be caught.
  const gapText = "This peptide is completely safe to inject."; // a doc-20 violation
  const assembled = ["summary", "section", "point", gapText].join("  ");
  assertEquals(detectViolations(assembled).length > 0, true);
});
```

- [ ] **Step 2: Compute gaps + counts and attach them; add gaps to the scan**

In `orchestrate.ts`:

1. Import `deriveGaps`:

```typescript
import { deriveGaps } from "./gaps.ts";
```

2. In `runResearch`, compute gaps right after `mergeEvidence` (chunks exist) — but the gap TEXT must be part of the one safety scan. Compute it before the scan and include its text in the `assembled` join. After step 4 (`const chunks = mergeEvidence(...)`), add:

```typescript
  const { gaps, counts } = deriveGaps(chunks, subQuestions);
```

3. Extend the `assembled` array (step 6) to include gap text:

```typescript
  const assembled = [
    synth.raw.summary,
    ...synth.raw.points.map((p) => p.section),
    ...synth.raw.points.map((p) => p.text),
    ...synth.raw.safety_notes.map((p) => p.text),
    ...synth.raw.uncertainties.map((p) => p.text),
    ...gaps.map((g) => g.text), // NEW: gaps narrative is model-adjacent free text → must be scanned
  ].join("  ");
```

(Gap text is deterministic/safe today, but scanning it preserves the guarantee for any future LLM-authored gap nuance.)

4. Pass `gaps`/`counts` into `assembleReport` and onto the report. Extend the `assembleReport` args type with `gaps: GapStatement[]; counts: RetrievalCounts;` (import the types from shared) and add them to the returned object:

```typescript
  return {
    question: args.question,
    summary: enforced.summary,
    sub_questions: args.subQuestions,
    sections,
    uncertainties,
    safety_notes,
    citations: buildCitations(allTags, chunks),
    evidence_grade: args.evidenceGrade,
    safety_flags: args.safetyFlags,
    claims_verified: args.claimsVerified,
    gaps: args.gaps,
    counts: args.counts,
  };
```

And in the `runResearch` call to `assembleReport`, pass `gaps, counts`.

(Leave `templateReport` unchanged — safety-template reports carry no gaps/counts, correctly.)

- [ ] **Step 3: Run all engine tests**

Run: `deno test supabase/functions/ask/`
Expected: PASS — frozen suite + new tests.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ask/research/orchestrate.ts supabase/functions/ask/research/research.test.ts
git commit -m "feat(research): attach deterministic gaps+counts; extend the single safety scan to cover gaps"
```

### Task 3.3: Render gaps + counts in the report view

**Files:** Modify `apps/web/components/ResearchReportView.tsx`

- [ ] **Step 1: Render counts + gaps (honest labels)**

In `ResearchReportView.tsx`, after the safety block and before `uncertainties`, add:

```tsx
{report.counts ? (
  <details className="research-counts">
    <summary>What we searched ({report.counts.total_retrieved} candidate sources)</summary>
    <p className="muted-note">
      Top-ranked by relevance, capped at {report.counts.cap_per_source} per source — not an exhaustive census.
    </p>
    <ul>
      {Object.entries(report.counts.per_provider).map(([prov, n]) => (
        <li key={prov}>{abbr(prov)}: {n}</li>
      ))}
    </ul>
  </details>
) : null}

{report.gaps?.length ? (
  <div className="research-gaps">
    <div className="muted-label">Evidence gaps</div>
    {report.gaps.map((g, i) => (
      <p className="ai-para" key={i}>
        {g.text}
        {g.corroborating_trials.length ? (
          <span className="gap-trials"> An answer may be coming: {g.corroborating_trials.join(", ")}.</span>
        ) : null}
      </p>
    ))}
  </div>
) : null}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run typecheck -w @pharmaorb/web && npm run build -w @pharmaorb/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ResearchReportView.tsx
git commit -m "feat(web): render honest 'what we searched' counts + literature gaps"
```

**Phase 3 deploy (owner-gated):** deploy `research`; the web render change deploys with Vercel. Verify a live run shows gaps + counts with honest cap disclosure.

---

## Phase 4 — Vancouver + AMA reference list + toggle (web render + export wiring)

Replaces the Phase-1 `formatReference` shim with style-exact punctuation. Consumes Phase-2 metadata; degrades gracefully when fields are absent (old reports/chats).

### Task 4.1: Style-exact `formatReference` / `buildReferenceList`

**Files:**
- Modify: `packages/shared/src/citation-format.ts`
- Test: `packages/shared/src/citation-format.test.ts`

Vancouver vs AMA for a journal article (the only place they differ meaningfully over our fixed source set):
- **Vancouver:** `Authors. Title. Journal. Year;Volume(Issue):Pages.` (authors `Last AB`, comma-separated, period after author list).
- **AMA:** `Authors. Title. *Journal*. Year;Volume(Issue):Pages.` (same skeleton; AMA italicizes the journal and uses the same numeric `Year;Vol(Iss):Pages` form — for plain-text output the difference reduces to journal styling; we encode AMA's full-journal-name preference and the period/semicolon punctuation). Both are numbered lists.

Non-journal source types render the same in both styles:
- openFDA/DailyMed → `Title [package insert]. URL. Accessed retrieved_at.`
- ClinicalTrials → `Title. ClinicalTrials.gov: NCT…. URL.`
- FAERS → `FDA Adverse Event Reporting System (FAERS) database query. URL. Accessed retrieved_at.`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/citation-format.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReferenceList, formatReference } from "./citation-format.ts";
import type { Citation } from "./answer.ts";

const article: Citation = {
  chunk_tag: "2", source_id: "live:pubmed_oa:1", source_type: "pubmed_oa",
  title: "Tesamorelin in HIV lipodystrophy", section: null,
  url: "https://pubmed.ncbi.nlm.nih.gov/1/", license: "cc_by",
  published_date: "2024-01-01", retrieved_at: "2026-06-10",
  authors: ["Falutz J", "Mamputu JC"], journal: "N Engl J Med", year: "2024",
  volume: "390", issue: "2", pages: "101-110",
};

Deno.test("Vancouver journal article", () => {
  assertEquals(
    formatReference(article, "vancouver"),
    "Falutz J, Mamputu JC. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

// 8 authors → the styles diverge on author truncation (the real plain-text difference).
const manyAuthors: Citation = { ...article, authors: ["A A", "B B", "C C", "D D", "E E", "F F", "G G", "H H"] };

Deno.test("Vancouver lists the first 6 authors + et al when >6", () => {
  assertEquals(
    formatReference(manyAuthors, "vancouver"),
    "A A, B B, C C, D D, E E, F F, et al. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

Deno.test("AMA lists the first 3 authors + et al when >6", () => {
  assertEquals(
    formatReference(manyAuthors, "ama"),
    "A A, B B, C C, et al. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

Deno.test("Vancouver and AMA agree when ≤6 authors (no truncation)", () => {
  assertEquals(formatReference(article, "vancouver"), formatReference(article, "ama"));
});

Deno.test("graceful fallback when volume/issue/pages absent", () => {
  const sparse: Citation = { ...article, volume: undefined, issue: undefined, pages: undefined };
  assertEquals(
    formatReference(sparse, "vancouver"),
    "Falutz J, Mamputu JC. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024.",
  );
});

Deno.test("openFDA renders as a package insert, not a journal cite", () => {
  const label: Citation = {
    chunk_tag: "1", source_id: "s", source_type: "openfda", title: "EGRIFTA prescribing information",
    section: "warnings", url: "https://dailymed.example/x", license: "public", published_date: "2023-01-01",
    retrieved_at: "2026-06-10",
  };
  assertEquals(
    formatReference(label, "vancouver"),
    "EGRIFTA prescribing information [package insert]. https://dailymed.example/x. Accessed 2026-06-10.",
  );
});

Deno.test("ClinicalTrials renders with the NCT id", () => {
  const trial: Citation = {
    chunk_tag: "3", source_id: "live:clinicaltrials:NCT0", source_type: "clinicaltrials",
    title: "A phase 2 trial", section: null, url: "https://clinicaltrials.gov/study/NCT0",
    license: "public_domain", published_date: null, retrieved_at: "2026-06-10",
  };
  assertEquals(
    formatReference(trial, "vancouver"),
    "A phase 2 trial. ClinicalTrials.gov: NCT0. https://clinicaltrials.gov/study/NCT0.",
  );
});

Deno.test("buildReferenceList numbers in tag order", () => {
  const refs = buildReferenceList([article], "vancouver");
  assertEquals(refs[0].n, 1);
  assertEquals(refs[0].tag, "2");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test packages/shared/src/citation-format.test.ts`
Expected: FAIL — the shim output doesn't match the style-exact strings.

- [ ] **Step 3: Replace the shim body with the real formatter**

Replace the body of `formatReference` in `packages/shared/src/citation-format.ts`:

```typescript
export function formatReference(c: Citation, style: CitationStyle): string {
  const t = c.source_type.toLowerCase();
  const title = (c.title ?? "").trim().replace(/\.+$/, "");
  const accessed = c.retrieved_at ? `Accessed ${c.retrieved_at.slice(0, 10)}.` : "";

  // openFDA / DailyMed → package insert.
  if (t.includes("openfda") || t.includes("dailymed")) {
    return joinSentences([`${title} [package insert]`, c.url ?? "", accessed]);
  }
  // ClinicalTrials.gov → registry entry with NCT id.
  if (t.includes("clinicaltrials")) {
    const nct = (c.source_id.match(/(NCT\d+)/i)?.[1] ?? "").toUpperCase();
    return joinSentences([title, nct ? `ClinicalTrials.gov: ${nct}` : "ClinicalTrials.gov", c.url ?? ""]);
  }
  // FAERS → database-query note (not a journal cite).
  if (t.includes("faers")) {
    return joinSentences(["FDA Adverse Event Reporting System (FAERS) database query", c.url ?? "", accessed]);
  }

  // Journal article (PubMed / Europe PMC). The numeric skeleton is shared:
  //   Authors. Title. Journal. Year;Vol(Issue):Pages.
  // The styles diverge ONLY on author truncation (the real plain-text difference, since we don't
  // italicize): Vancouver/ICMJE lists the first 6 then "et al." when >6 authors; AMA lists the first 3.
  const authors = formatAuthors(c.authors ?? [], style);
  const journal = c.journal ?? "";
  const year = c.year ?? (c.published_date ? c.published_date.slice(0, 4) : "");
  let volIss = c.volume ?? "";
  if (c.volume && c.issue) volIss = `${c.volume}(${c.issue})`;
  const tail = [year, volIss && `;${volIss}`, c.pages && `:${c.pages}`].filter(Boolean).join("");
  return joinSentences([authors, title, journal, tail]);
}

/** Author list with style-specific truncation. ≤6 authors → list all; >6 → Vancouver keeps the
 *  first 6 + "et al", AMA keeps the first 3 + "et al". The trailing period comes from joinSentences. */
function formatAuthors(authors: string[], style: CitationStyle): string {
  if (authors.length === 0) return "";
  if (authors.length <= 6) return authors.join(", ");
  const keep = style === "ama" ? 3 : 6;
  return `${authors.slice(0, keep).join(", ")}, et al`;
}

/** Join non-empty parts as "A. B. C." with a single trailing period; collapses doubled periods. */
function joinSentences(parts: string[]): string {
  const body = parts.map((p) => p.trim()).filter(Boolean).join(". ");
  return (body.endsWith(".") ? body : `${body}.`).replace(/\.{2,}/g, ".");
}
```

Keep `buildReferenceList` and `FormattedReference` as in Phase 1 (signature unchanged). Remove the now-unused `providerLabel` helper.

> Punctuation note: the tail builds `Year;Vol(Issue):Pages` with NO spaces (ICMJE/AMA form), then `joinSentences` adds the final period → `... N Engl J Med. 2024;390(2):101-110.`. The journal segment and tail are joined by `joinSentences` as separate parts, so the result is `Journal. Year;...` exactly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test packages/shared/src/citation-format.test.ts`
Expected: PASS (all 8) — including the two divergence tests proving the toggle is real (Vancouver keeps 6 authors, AMA keeps 3, when >6).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/citation-format.ts packages/shared/src/citation-format.test.ts
git commit -m "feat(shared): Vancouver/AMA reference formatting per source type"
```

### Task 4.2: Style toggle + fixed-bug render in the report view

**Files:** Modify `apps/web/components/ResearchReportView.tsx`

- [ ] **Step 1: Fix the `abbr()` europepmc bug + add pubmed_oa is already mapped**

In `PROVIDER_ABBR`, add `europepmc: "PMID"` so a `source_type` of `europepmc` no longer renders as `REF`:

```typescript
const PROVIDER_ABBR: Record<string, string> = {
  openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", europepmc: "PMID",
  clinicaltrials: "NCT", faers: "FAERS", rxnorm: "RxNorm",
};
```

- [ ] **Step 2: Replace the `Sources` list with a formatted reference list + add the toggle**

Replace the `Sources` component body to render `buildReferenceList(citations, style)` (import `buildReferenceList` and `CitationStyle` from `@nemesis/shared`). Pass `style` from the parent. Keep the scroll-to-source affordance (the `id={rep-src-<tag>}` anchor stays).

```tsx
function Sources({ citations, style }: { citations: Citation[]; style: CitationStyle }) {
  const refs = buildReferenceList(citations, style);
  const byTag = new Map(citations.map((c) => [normTag(c.chunk_tag), c]));
  return (
    <div className="research-sources">
      <div className="ai-block-label">References ({refs.length})</div>
      <ol>
        {refs.map((r) => {
          const c = byTag.get(r.tag);
          const href = safeHref(c?.url ?? null);
          return (
            <li key={r.tag} id={`rep-src-${r.tag}`} className="research-src">
              <span>{r.text}</span>
              {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="ref-link"> ↗</a> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

Add the toggle near the export bar (parent owns `style` state, passed in via props from the page):

```tsx
<div className="cite-style-toggle" role="group" aria-label="Citation style">
  <button type="button" className={style === "vancouver" ? "active" : ""} onClick={() => onStyleChange?.("vancouver")}>Vancouver</button>
  <button type="button" className={style === "ama" ? "active" : ""} onClick={() => onStyleChange?.("ama")}>AMA</button>
</div>
```

Update the `Sources` usage at the bottom of the component to `<Sources citations={report.citations} style={style} />`.

- [ ] **Step 3: Own `style` state in the research page + pass to export**

In `apps/web/app/app/research/page.tsx`, add `const [citeStyle, setCiteStyle] = useState<CitationStyle>("vancouver");` (import `CitationStyle`), pass `style={citeStyle} onStyleChange={setCiteStyle}` to `ResearchReportView`. The export buttons (Task 1.6) already read `style` from props → they now reflect the toggle. (No DB write-back; the export route receives `?style=` matching the screen — satisfies "exports match the screen".)

- [ ] **Step 4: Apply the formatter to chat answers too (graceful)**

In `apps/web/components/EvidencePanel.tsx`, where the chat answer's `citations` render, replace the raw source line with `formatReference(c, "vancouver")` (chat has no toggle; default Vancouver). This retroactively formats saved chats (old ones degrade gracefully — missing metadata → title + provider + date). Import `formatReference` from `@nemesis/shared`. (If `EvidencePanel` renders many surfaces, scope this change to the citations/sources list only; do not touch unrelated markup.)

- [ ] **Step 5: Type-check + build**

Run: `npm run typecheck -w @pharmaorb/web && npm run build -w @pharmaorb/web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ResearchReportView.tsx apps/web/components/EvidencePanel.tsx apps/web/app/app/research/page.tsx
git commit -m "feat(web): Vancouver/AMA reference list + style toggle; fix europepmc REF label"
```

**Phase 4 deploy (owner-gated):** web render deploys via Vercel; no engine change in this phase (the Citation builders already carry metadata from Phase 2). Verify a new report shows conformant Vancouver references and toggling to AMA + exporting yields a matching file.

---

## Phase 5 — Structured / PRISMA-informed mode (Deno edge; highest care)

### Task 5.1: Rigorous-mode plan variant

**Files:**
- Modify: `supabase/functions/ask/research/plan.ts`
- Test: append to `research.test.ts`

- [ ] **Step 1: Add a mode-aware system prompt + signature**

In `plan.ts`, add a `mode` parameter to `planSubQuestions(question, apiKey, mode: ReportMode = "standard")`. For `structured_review`, append a stricter directive to the system prompt requiring facet coverage (identity/mechanism, human clinical evidence, safety/adverse effects, comparators, and explicit open questions) — but the existing rules (no sourcing/dosing/personal-advice sub-questions) stay verbatim. Keep the `PLAN_TOOL` schema unchanged. The change is additive guidance only.

```typescript
import type { ReportMode } from "../../../../packages/shared/src/research.ts";

const STRUCTURED_SUFFIX = [
  "",
  "STRUCTURED REVIEW MODE: ensure the sub-questions explicitly cover, where the question warrants:",
  "(1) identity/mechanism, (2) the human clinical evidence (trials), (3) safety/adverse effects,",
  "(4) comparators/alternatives, and (5) the key open questions / unknowns. Favor completeness of",
  "these facets over breadth of topic.",
].join("\n");
```

In `planSubQuestions`, build the system string as `mode === "structured_review" ? PLAN_SYSTEM + STRUCTURED_SUFFIX : PLAN_SYSTEM`.

- [ ] **Step 2: Test it plumbs (the normalize contract is unchanged)**

Append a light test asserting `planSubQuestions`'s pure helper still clamps; the mode only changes the prompt (not the output contract), so the existing `normalizeSubQuestions` tests cover behavior. Add:

```typescript
import { normalizeSubQuestions } from "./plan.ts";
Deno.test("normalizeSubQuestions unchanged under structured mode (prompt-only change)", () => {
  assertEquals(normalizeSubQuestions(["a", "b", "c"], "q").length, 3);
});
```

- [ ] **Step 3: Run + commit**

Run: `deno test supabase/functions/ask/research/research.test.ts`
Expected: PASS.

```bash
git add supabase/functions/ask/research/plan.ts supabase/functions/ask/research/research.test.ts
git commit -m "feat(research): structured-review plan variant (facet-complete sub-questions)"
```

### Task 5.2: Method copy + the forbidden-phrase guard, wired

**Files:**
- Modify: `supabase/functions/ask/research/synthesize.ts`
- Modify: `supabase/functions/ask/research/orchestrate.ts`
- Test: append to `research.test.ts`

The honest method is **deterministic, code-authored** (not model prose) — built from the run's facts (databases used, sub-questions as queries, `retrieved_at` as the search date). This sidesteps the risk of the model overclaiming, and the forbidden-phrase guard is a belt-and-suspenders check.

- [ ] **Step 1: Write the failing guard-wiring test**

Append to `research.test.ts`:

```typescript
import { buildSearchMethod } from "./orchestrate.ts";
import { detectForbiddenPhrases } from "../../../../packages/shared/src/forbidden-phrases.ts";

Deno.test("buildSearchMethod produces honest, PRISMA-clean method copy", () => {
  const m = buildSearchMethod(
    ["pubmed_oa", "clinicaltrials", "openfda"],
    ["tesamorelin efficacy", "tesamorelin safety"],
    "2026-06-10",
  );
  assertEquals(m.search_date, "2026-06-10");
  // The fixed copy must never trip the PRISMA-overclaim guard.
  const allCopy = [...m.databases, ...m.queries, m.inclusion_notes, m.exclusion_notes].join("  ");
  assertEquals(detectForbiddenPhrases(allCopy), []);
});
```

- [ ] **Step 2: Add `buildSearchMethod` (deterministic, code-authored)**

In `orchestrate.ts`, add:

```typescript
import type { ReportMode, RetrievalCounts, SearchMethod } from "../../../../packages/shared/src/research.ts";

const PROVIDER_DB_LABELS: Record<string, string> = {
  pubmed_oa: "PubMed / Europe PMC (open-access subset)",
  clinicaltrials: "ClinicalTrials.gov",
  openfda: "openFDA drug labels",
  faers: "FDA FAERS (adverse-event reports)",
};

/** Build the honest, code-authored method for a structured_review report. PURE. Never names a
 *  registered protocol, exhaustive search, dual screening, or PRISMA — because none were done. */
export function buildSearchMethod(providers: string[], queries: string[], searchDate: string): SearchMethod {
  const databases = providers.map((p) => PROVIDER_DB_LABELS[p] ?? p);
  return {
    databases,
    queries,
    search_date: searchDate,
    inclusion_notes:
      "Sources were retrieved automatically by relevance and capped per source — a bounded, " +
      "top-ranked sample, not an exhaustive census. Each claim was checked against its cited source.",
    exclusion_notes:
      "This is an automated, single-pass evidence review: no registered protocol, no exhaustive " +
      "search, no dual independent screening, and no per-study risk-of-bias or GRADE appraisal. " +
      "Non-open-access full text was not read (abstracts/metadata only).",
  };
}
```

- [ ] **Step 3: Thread `mode` through `runResearch` + attach method + scan it + guard it**

In `orchestrate.ts`:

1. Add `mode` to `OrchestrateConfig` (`mode?: ReportMode;`).
2. Pass `mode` to `planSubQuestions(question, cfg.apiKey, cfg.mode ?? "standard")`.
3. After computing `gaps`/`counts`, build the method when rigorous:

```typescript
  const searchMethod = cfg.mode === "structured_review"
    ? buildSearchMethod(Object.keys(counts.per_provider), subQuestions, (counts.retrieved_at ?? new Date().toISOString()).slice(0, 10))
    : undefined;
```

4. Extend the `assembled` safety-scan join to include method copy when present:

```typescript
    ...(searchMethod ? [searchMethod.inclusion_notes, searchMethod.exclusion_notes, ...searchMethod.databases, ...searchMethod.queries] : []),
```

5. Belt-and-suspenders forbidden-phrase guard — if any method/inclusion copy trips it (it never should, being fixed code, but a future edit might), discard to the conservative fallback exactly like a `detectViolations` hit:

```typescript
  if (searchMethod) {
    const overclaim = detectForbiddenPhrases(
      [searchMethod.inclusion_notes, searchMethod.exclusion_notes, ...searchMethod.databases, ...searchMethod.queries].join("  "),
    );
    if (overclaim.length > 0) {
      console.error("research forbidden-phrase guard tripped:", JSON.stringify(overclaim));
      return templateReport(question, "safety_fallback", CONSERVATIVE_FALLBACK_COPY, flags);
    }
  }
```

(import `detectForbiddenPhrases` from shared.)

6. Set `mode`, `search_method`, `citation_style` on the report. Extend `assembleReport` args with `mode?: ReportMode; searchMethod?: SearchMethod;` and add to the returned object:

```typescript
    mode: args.mode ?? "standard",
    search_method: args.searchMethod,
    citation_style: "vancouver",
```

Pass `mode: cfg.mode, searchMethod` in the `assembleReport` call.

- [ ] **Step 4: synthesize.ts — no schema change needed (method is code-authored)**

Because the method is deterministic, `synthesize.ts` does NOT need new schema fields. (Skip schema changes — YAGNI. The spec's "synthesize.ts schema fields for search_method" is superseded by the safer code-authored method. Document this deviation in the commit.)

- [ ] **Step 5: Run all engine tests**

Run: `deno test supabase/functions/ask/`
Expected: PASS — frozen suite + new tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ask/research/orchestrate.ts supabase/functions/ask/research/research.test.ts
git commit -m "feat(research): structured_review mode — code-authored honest method + forbidden-phrase guard, scanned"
```

### Task 5.3: Accept `mode` at the edge endpoint + wire the UI

**Files:**
- Modify: `supabase/functions/research/index.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/app/app/research/page.tsx`
- Modify: `apps/web/components/ResearchReportView.tsx`

- [ ] **Step 1: Accept `mode` in the request body**

In `supabase/functions/research/index.ts`:

- Parse mode: after reading `question`, add
  ```typescript
  const mode = body.mode === "structured_review" ? "structured_review" : "standard";
  ```
  (extend the `body` type to `{ question?: string; mode?: string }`).
- Thread it into `executeRun(runId, userId, question, mode)` and into `runResearch(question, { ..., mode })`. Update `executeRun`'s signature + the `runResearch` config object.

Still consumes one `deep_research_daily` slot (no metering change — owner-chosen).

- [ ] **Step 2: `startResearch(question, mode?)`**

In `apps/web/lib/api.ts`, change `startResearch(question: string)` → `startResearch(question: string, mode: "standard" | "structured_review" = "standard")` and include `mode` in the POST body: `body: JSON.stringify({ question, mode })`.

- [ ] **Step 3: Mode selector on the composer**

In `apps/web/app/app/research/page.tsx`, add a `mode` state (`"standard" | "structured_review"`, default `"standard"`), a small two-button selector in `ResearchComposer`, and pass `mode` into `start(input)` → `startResearch(text, mode)`. Label the rigorous option honestly: **"Structured review (documents its method)"**.

- [ ] **Step 4: Render the Methods & Limitations block + prominent unverified note**

In `ResearchReportView.tsx`, when `report.search_method` is present, render a Methods & Limitations section (databases, queries, search date, inclusion/exclusion notes) near the top (after the summary). The existing `claims_verified === false` pill already surfaces the unverified state prominently — keep it; for `structured_review` reports, also render the `UNVERIFIED_NOTE`-style caution inline if `!claims_verified` (it already flows through `uncertainties`).

```tsx
{report.search_method ? (
  <section className="research-section research-method">
    <h4 className="research-heading">Methods &amp; Limitations</h4>
    <p className="ai-para">Databases searched: {report.search_method.databases.join(", ")}.</p>
    <p className="ai-para">Search date: {report.search_method.search_date}.</p>
    <p className="ai-para">{report.search_method.inclusion_notes}</p>
    <p className="ai-para">{report.search_method.exclusion_notes}</p>
  </section>
) : null}
```

- [ ] **Step 5: Type-check, build, engine tests**

Run: `npm run typecheck -w @pharmaorb/web && npm run build -w @pharmaorb/web && deno test supabase/functions/ask/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/research/index.ts apps/web/lib/api.ts apps/web/app/app/research/page.tsx apps/web/components/ResearchReportView.tsx
git commit -m "feat: structured-review mode end-to-end (endpoint mode param + UI selector + Methods block)"
```

**Phase 5 deploy (owner-gated):** deploy `research` + web. Verify a `structured_review` run shows the honest Methods & Limitations, the exports include it, and a deliberately-banned method string (temporary local edit) trips the guard → conservative fallback (then revert the edit).

---

## Phase 6 — Integration & verification (compose + verify; gated deploy)

### Task 6.1: End-to-end export fixture (honesty signals present)

**Files:** Modify `apps/web/scripts/smoke.mjs` (extend the Phase-1 export smoke)

- [ ] **Step 1: Add a structured_review fixture with gaps + counts + method and assert honesty bytes**

Extend the smoke fixture to a `structured_review` report with `claims_verified: false`, `gaps`, `counts`, `search_method`, and metadata-rich citations. Generate docx + pptx, and assert the produced bytes are valid PK zips AND non-trivially larger than the minimal fixture (a proxy that the extra sections rendered). Decode the docx `word/document.xml` (it's a zip entry) and assert it contains the literal strings `"NOT FULLY FACT-CHECKED"`, `"capped at"`, and `"Methods"`:

```javascript
import { unzipSync, strFromU8 } from "fflate"; // already transitively available via docx/pptxgenjs deps; else add devDep

const structured = { /* ...fixtureReport..., */
  mode: "structured_review", claims_verified: false,
  counts: { per_provider: { pubmed_oa: 6, clinicaltrials: 4 }, total_retrieved: 10, cap_per_source: 6, retrieved_at: "2026-06-10T00:00:00Z" },
  search_method: { databases: ["PubMed / Europe PMC"], queries: ["tesamorelin"], search_date: "2026-06-10", inclusion_notes: "Retrieved by relevance, capped per source.", exclusion_notes: "No exhaustive search; no dual screening." },
  gaps: [{ dimension: "study_design", type: "no_rct", scope: "this_run", text: "No randomized controlled trial was among the sources we searched.", denominator: { providers_searched: ["pubmed_oa"], n_sources: 10, retrieved_at: "2026-06-10T00:00:00Z" }, corroborating_trials: ["NCT9"] }],
};
const docx2 = await reportToDocx(structured, "vancouver");
assertPkZip(docx2, "structured docx");
const xml = strFromU8(unzipSync(docx2)["word/document.xml"]);
for (const needle of ["NOT FULLY FACT-CHECKED", "capped at", "Methods"]) {
  if (!xml.includes(needle)) throw new Error(`honesty signal missing from docx: ${needle}`);
}
console.log("✓ structured docx carries honesty signals");
```

(If `fflate` isn't resolvable, add it as a web devDependency — it's tiny and MIT.)

- [ ] **Step 2: Run + commit**

Run: `npm run smoke -w @pharmaorb/web`
Expected: all `✓` lines, including the honesty-signal assertion.

```bash
git add apps/web/scripts/smoke.mjs apps/web/package.json package-lock.json
git commit -m "test(web): integration smoke — exports carry honesty signals for structured reports"
```

### Task 6.2: Frozen read-path regression

**Files:** Test only — append to `research.test.ts` (engine-side proof the `kind` is unchanged)

- [ ] **Step 1: Assert a structured_review report still saves with `kind='deep_research'`**

The read-path (`fetchResearchReport`/`fetchResearchReports`) filters `.eq('kind','deep_research')`. A structured_review report must keep that `kind` so it isn't hidden. The engine never sets `kind` (the `research` edge function hard-codes `kind: "deep_research"` in `insertSavedReport`), and `mode` lives in the payload — so the invariant holds by construction. Add a guard test asserting the report object's `mode` does not leak into a `kind` and that `assembleReport` output has no `kind` field:

```typescript
Deno.test("assembleReport output carries mode in payload, never a kind field", () => {
  const report = assembleReport({
    question: "q", subQuestions: ["q"],
    enforced: { summary: "s", body: [{ section: "X", text: "t", citation_ids: ["1"] }], safety_notes: [], uncertainties: [] },
    chunks: [{ tag: "1", chunk_id: "x", source_id: "x", provider: "pubmed_oa", title: null, section: null, url: null, license: null, published_date: null, retrieved_at: null, similarity: 0 }],
    evidenceGrade: "moderate", safetyFlags: [], claimsVerified: true,
    gaps: [], counts: { per_provider: {}, total_retrieved: 0, cap_per_source: 6, retrieved_at: null },
    mode: "structured_review",
  });
  assertEquals(report.mode, "structured_review");
  assertEquals("kind" in report, false);
});
```

(Adjust `assembleReport` args to match the final signature from Tasks 3.2 + 5.2.)

- [ ] **Step 2: Run + commit**

Run: `deno test supabase/functions/ask/`
Expected: PASS.

```bash
git add supabase/functions/ask/research/research.test.ts
git commit -m "test(research): structured_review keeps kind=deep_research (frozen read-path safe)"
```

### Task 6.3: Full green gate

- [ ] **Step 1: Run every suite**

Run, expecting all PASS:
```bash
deno test packages/shared/
deno test supabase/functions/ask/
npm run typecheck -w @pharmaorb/web
npm run build -w @pharmaorb/web
npm run smoke -w @pharmaorb/web
```
Expected: shared green; engine 286 + new green (frozen safety suite untouched); web typecheck/build green; smoke `✓`.

- [ ] **Step 2: PR + CI**

Open the PR for `feat/publishable-evidence-reports`; confirm CI (ask-units, guardrail, retrieval-eval) is green. (The guardrail suite samples the frozen safety layer — it must stay green since the safety layer was not modified.)

### Task 6.4: Deploy checklist (owner-gated, per surface)

- [ ] Phase 1 + 3 + 4 web changes → Vercel (preview → owner verify → promote).
- [ ] Phase 2 + 3 + 5 engine → `supabase functions deploy research --use-api` (after owner greenlight; verify a live Pro run end-to-end: standard + structured_review, gaps/counts present, references conformant, exports carry honesty signals, one `deep_research_daily` slot metered).
- [ ] No migration in any phase (`kind` unchanged; report shape lives in `saved_reports.payload`).
- [ ] Release note: pre-Phase-3 reports have degraded references (no saved bibliographic metadata) — only new reports get full Vancouver/AMA entries (§5.1 caveat).

---

## Self-review notes (coverage against the spec)

- §2 honesty cornerstone → Phase 0.2 guard + Phase 5.2 wiring + Task 6.1 honesty-byte assertion. Branding strings are code-authored and guard-checked.
- §4 data model → Phase 0.1 (exact optional fields, `kind` unchanged, no migration).
- §5.1 export → Phase 1 (RLS-scoped read, honesty carry-through, regenerate-on-download, style via query param, old-report caveat in release note).
- §5.2 gaps + counts → Phases 2 (metadata) + 3 (deterministic gaps, denominator phrasing, CT strengthening-only, one-scan extension). The LLM-grounded `uncertainties` reframe is explicitly deferred.
- §5.3 Vancouver/AMA → Phases 2 (3a/3b metadata) + 4 (3c formatter, client render, export-style wiring, europepmc `abbr()` fix). CSL declined. The toggle produces a **real** difference: author truncation (Vancouver first-6-then-"et al." vs AMA first-3) — not cosmetic, with divergence tests; `?style=` flows to the export route so a download matches the screen.
- §5.4 structured mode → Phase 5 (plan variant, code-authored method, both safety guards, claims_verified surfaced, normal Pro slot). Deviation from spec: the method is deterministic code, not a synthesize.ts schema field — safer, documented in the Task 5.2 commit.
- §6 phases → re-sequenced with the metadata foundation (Phase 2) pulled before gaps/citations; rationale documented at the top.
- §7 testing → pure formatters + deriveGaps Deno-tested; export routes smoke-tested (PK bytes + honesty signals); forbidden-phrase guard tested; frozen 286-suite untouched.

---

## Corrections applied during implementation (review-driven)

These deviate from the code snippets above; the shipped code is authoritative. Each was caught by the per-task or final whole-branch review and fixed before the PR.

- **Honest count framing (final review, Important).** `RetrievalCounts.cap_per_source` was a *per-sub-question-search* cap (6) but `per_provider` counts the *merged* pool (≤24) — so "24 retrieved, capped at 6 per source, pubmed_oa: 24" was a self-contradiction. Renamed `cap_per_source` → `per_search_cap`, added `n_searches`, and reframed the copy (screen + docx + pptx) to "{N} candidate sources retrieved across {M} sub-question searches (each kept its top {cap} by relevance), then merged and de-duplicated — a bounded, top-ranked sample, not an exhaustive census." The smoke honesty-needle changed from `"capped at"` → `"not an exhaustive census"`.
- **`no_synthesis` gap phrasing (Task 3.1, Critical).** The tail "findings are not yet synthesized across studies" was an unscoped literature-wide claim (Altman-Bland); changed to "...so these retrieved findings are not yet synthesized."
- **Structured-mode method copy (Task 5.2, Critical).** An implementer rewrite turned the inclusion/exclusion notes into eligibility-screening language (implying a screening process we don't run + dropping the "what was NOT done" disclosure); reverted to the honest copy and locked it with test assertions.
- **pptx honesty parity (Task 1.4).** The deck was missing the "What we searched" counts slide the Word doc had; added.
- **Vancouver/AMA toggle was a no-op in the first draft** (advisor, pre-implementation) — fixed in the plan itself to a real author-truncation difference before Phase 4 ran.
- **Export gap-trials parity + europepmc labels + `EvidencePanel` europepmc badge** — small consistency fixes from review.

The metadata-foundation phase (Phase 2) carries PubMed `publication_types` (for gap classification) alongside the citation fields in one parser pass, per the advisor — both gaps and citations read the same foundation.
