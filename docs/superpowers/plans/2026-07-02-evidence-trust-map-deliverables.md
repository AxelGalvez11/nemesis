# Evidence Trust Layer + Map + Meter + Cited Deliverables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four research-backed upgrades from `docs/research/evidence-super-app-research.md` §5: (1) free trust badges on every source (retraction flag, scite supporting/contrasting tally, study snapshot), (2) a Litmaps-style evidence map per answer, (3) a deterministic per-claim Evidence Meter, (4) citations inside every exported deck/document.

**Architecture:** All enrichment lives in a NEW edge function `enrich-source` with a Postgres cache table — the frozen `ask` engine is never touched. The web app fetches enrichment per source card after render (async, non-blocking). The map and meter are pure functions in `packages/shared` (deno-tested) with thin SVG/React renderers. Deliverables extend the existing `apps/web/lib/export/{pptx,docx,pdf}.ts` pipeline additively.

**Tech Stack:** Deno edge functions (Supabase), OpenAlex API (CC0), scite public tallies API, PubMed efetch, existing `callTool` LLM helper, React + plain SVG (no new chart deps), existing pptxgenjs/docx export deps.

## Global Constraints

- **NEVER modify** `supabase/functions/ask/safety.ts`, `prompts.ts`, `routing.ts`, `classify.ts` — the frozen safety layer. Enrichment is a separate function.
- All new `Citation`-adjacent data is **optional and additive** — old saved chats/reports must render unchanged.
- **No vote-counting** in the meter: study design + support level weighting only; a count of papers is never the score.
- All external calls happen **server-side** in `enrich-source` (no API keys or third-party calls from the browser; favicons via existing `lib/favicon.ts` are the only exception).
- OpenAlex: send `mailto=engineering@pharmaorb.app` param (polite pool). scite: public endpoint, throttle ≤5 req/s, and treat any 4xx as "no data" (never an error surfaced to users).
- Enrichment is **best-effort**: any failure renders the card exactly as today (no spinner, no error state on cards).
- Colors/spacing via existing CSS tokens (`--surface-2`, `--warn`, `--danger`, `--text-2` …) — all three themes must work.
- Run `deno test --allow-all` in the touched function/package dir + `npx tsc --noEmit` in `apps/web` before every commit.
- Deploys stay owner-gated. This plan ends with everything on a branch + PR; `enrich-source` deploy is a separate explicit step.

## File Structure (what gets created/modified)

```
supabase/migrations/20260702090000_source_enrichment.sql        (new — cache table)
packages/shared/src/source-ids.ts / .test.ts                    (new — PMID/DOI extraction)
packages/shared/src/claim-meter.ts / .test.ts                   (new — Evidence Meter math)
packages/shared/src/evidence-map-points.ts / .test.ts           (new — map geometry)
packages/shared/src/index.ts                                    (modify — export new modules)
supabase/functions/enrich-source/index.ts                       (new — edge function)
supabase/functions/enrich-source/providers.ts / .test.ts        (new — OpenAlex/scite/efetch parsing)
supabase/functions/enrich-source/snapshot.ts / .test.ts         (new — LLM snapshot extraction)
apps/web/lib/enrichment.ts                                      (new — client fetcher + cache)
apps/web/components/EvidencePanel.tsx                           (modify — badges + map toggle)
apps/web/components/EvidenceMapView.tsx                         (new — SVG scatter)
apps/web/app/app/ask/page.tsx                                   (modify — meter chip on points)
apps/web/app/styles/shell.css                                   (modify — badge/map/meter styles)
apps/web/lib/export/pptx.ts / docx.ts / pdf.ts                  (modify — per-claim refs + attribution)
packages/shared/src/report-attribution.ts / .test.ts            (new — attribution block builder)
```

---

## Phase 1 — Trust layer

### Task 1: `source_enrichment` cache table

**Files:**
- Create: `supabase/migrations/20260702090000_source_enrichment.sql`

**Interfaces:**
- Produces: table `source_enrichment(key text pk, payload jsonb, fetched_at timestamptz)` — key is `pmid:<n>` or `doi:<lowercased doi>`; payload is the `SourceEnrichment` JSON defined in Task 3.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply to the local shadow only (no prod push)**

Run: `supabase db lint 2>&1 | tail -3` (schema syntax check; prod `db push` stays owner-gated at ship time)
Expected: no errors for the new file.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702090000_source_enrichment.sql
git commit -m "feat(db): source_enrichment cache table (service-role only)"
```

### Task 2: shared `source-ids` module (PMID/DOI extraction)

**Files:**
- Create: `packages/shared/src/source-ids.ts`, `packages/shared/src/source-ids.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./source-ids.ts";`)

**Interfaces:**
- Produces: `pmidFromUrl(url: string | null | undefined): string | null`, `normalizeDoi(raw: string | null | undefined): string | null`, `enrichmentKeyFor(c: { url?: string | null }): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/source-ids.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichmentKeyFor, normalizeDoi, pmidFromUrl } from "./source-ids.ts";

Deno.test("pmidFromUrl extracts a PubMed id", () => {
  assertEquals(pmidFromUrl("https://pubmed.ncbi.nlm.nih.gov/36331550/"), "36331550");
  assertEquals(pmidFromUrl("https://pubmed.ncbi.nlm.nih.gov/36331550"), "36331550");
  assertEquals(pmidFromUrl("https://europepmc.org/article/MED/36331550"), "36331550");
  assertEquals(pmidFromUrl("https://clinicaltrials.gov/study/NCT05000000"), null);
  assertEquals(pmidFromUrl(null), null);
});

Deno.test("normalizeDoi lowercases and strips prefixes", () => {
  assertEquals(normalizeDoi("https://doi.org/10.1001/JAMA.2023.1"), "10.1001/jama.2023.1");
  assertEquals(normalizeDoi("DOI: 10.1001/jama.2023.1"), "10.1001/jama.2023.1");
  assertEquals(normalizeDoi("not a doi"), null);
});

Deno.test("enrichmentKeyFor prefers pmid, else null", () => {
  assertEquals(enrichmentKeyFor({ url: "https://pubmed.ncbi.nlm.nih.gov/1234/" }), "pmid:1234");
  assertEquals(enrichmentKeyFor({ url: "https://api.fda.gov/label/x" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && deno test --allow-all src/source-ids.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/source-ids.ts
// PMID/DOI identity helpers for source enrichment. PubMed-family citations carry their
// PMID in the url; label/trial sources have no PMID and are simply not enrichable (the
// trust badges are literature signals — an FDA label has no citation tallies).

const PMID_RES = [
  /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i,
  /europepmc\.org\/(?:article|abstract)\/MED\/(\d+)/i,
];

export function pmidFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const re of PMID_RES) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

const DOI_RE = /10\.\d{4,9}\/[^\s"'<>]+/;

export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(DOI_RE);
  return m ? m[0].replace(/[.,;)\]]+$/, "").toLowerCase() : null;
}

/** Cache/lookup key for a citation: pmid:<n> when the url carries a PMID, else null. */
export function enrichmentKeyFor(c: { url?: string | null }): string | null {
  const pmid = pmidFromUrl(c.url);
  return pmid ? `pmid:${pmid}` : null;
}
```

- [ ] **Step 4: Export from the package index**

In `packages/shared/src/index.ts`, add alongside the other exports: `export * from "./source-ids.ts";`

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && deno test --allow-all`
Expected: all shared tests pass, incl. 3 new.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/source-ids.ts packages/shared/src/source-ids.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): pmid/doi extraction for source enrichment"
```

### Task 3: `enrich-source` providers module (OpenAlex + scite parsing)

**Files:**
- Create: `supabase/functions/enrich-source/providers.ts`, `supabase/functions/enrich-source/providers.test.ts`

**Interfaces:**
- Produces:
  - `interface SourceEnrichment { doi: string | null; retracted: boolean; cited_by: number | null; tallies: { supporting: number; contrasting: number; mentioning: number } | null; snapshot: StudySnapshot | null; }`
  - `interface StudySnapshot { population: string | null; sample_size: number | null; duration: string | null; design: string | null; }`
  - `parseOpenAlexWork(json: unknown): { doi: string | null; retracted: boolean; cited_by: number | null }`
  - `parseSciteTallies(json: unknown): SourceEnrichment["tallies"]`
  - `fetchEnrichmentBase(pmid: string): Promise<Omit<SourceEnrichment, "snapshot">>` (network; not unit-tested)

- [ ] **Step 1: Write the failing parser tests (no network)**

```ts
// supabase/functions/enrich-source/providers.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseOpenAlexWork, parseSciteTallies } from "./providers.ts";

Deno.test("parseOpenAlexWork extracts doi, retraction, cited_by", () => {
  const r = parseOpenAlexWork({
    ids: { doi: "https://doi.org/10.1001/JAMA.2023.1" },
    is_retracted: true,
    cited_by_count: 96,
  });
  assertEquals(r, { doi: "10.1001/jama.2023.1", retracted: true, cited_by: 96 });
});

Deno.test("parseOpenAlexWork tolerates missing fields", () => {
  assertEquals(parseOpenAlexWork({}), { doi: null, retracted: false, cited_by: null });
  assertEquals(parseOpenAlexWork(null), { doi: null, retracted: false, cited_by: null });
});

Deno.test("parseSciteTallies maps the tallies shape", () => {
  const t = parseSciteTallies({ total: 120, supporting: 41, contradicting: 3, mentioning: 76 });
  assertEquals(t, { supporting: 41, contrasting: 3, mentioning: 76 });
});

Deno.test("parseSciteTallies returns null on junk", () => {
  assertEquals(parseSciteTallies(null), null);
  assertEquals(parseSciteTallies({ error: "not found" }), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase/functions/enrich-source && deno test --allow-all`
Expected: FAIL — providers.ts not found.

- [ ] **Step 3: Implement providers.ts**

```ts
// supabase/functions/enrich-source/providers.ts
// Third-party enrichment for a literature source, keyed by PMID.
//  - OpenAlex (CC0): DOI resolution, is_retracted, cited_by_count.
//  - scite public tallies (per DOI): supporting / contrasting / mentioning counts.
// Both are best-effort: any HTTP/shape failure degrades to nulls, never throws to the caller.
import { normalizeDoi } from "../../../packages/shared/src/source-ids.ts";

export interface StudySnapshot {
  population: string | null;
  sample_size: number | null;
  duration: string | null;
  design: string | null;
}

export interface SourceEnrichment {
  doi: string | null;
  retracted: boolean;
  cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

const OPENALEX_MAILTO = "engineering@pharmaorb.app";

export function parseOpenAlexWork(json: unknown): { doi: string | null; retracted: boolean; cited_by: number | null } {
  const w = (json ?? {}) as Record<string, unknown>;
  const ids = (w.ids ?? {}) as Record<string, unknown>;
  return {
    doi: normalizeDoi(typeof ids.doi === "string" ? ids.doi : null),
    retracted: w.is_retracted === true,
    cited_by: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
  };
}

export function parseSciteTallies(json: unknown): SourceEnrichment["tallies"] {
  const t = (json ?? {}) as Record<string, unknown>;
  if (typeof t.supporting !== "number" || typeof t.mentioning !== "number") return null;
  const contrasting = typeof t.contradicting === "number" ? t.contradicting
    : typeof t.contrasting === "number" ? t.contrasting : 0;
  return { supporting: t.supporting, contrasting, mentioning: t.mentioning };
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null; // 4xx/5xx = "no data", by design
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchEnrichmentBase(pmid: string): Promise<Omit<SourceEnrichment, "snapshot">> {
  const work = parseOpenAlexWork(
    await getJson(`https://api.openalex.org/works/pmid:${pmid}?mailto=${OPENALEX_MAILTO}&select=ids,is_retracted,cited_by_count`),
  );
  const tallies = work.doi
    ? parseSciteTallies(await getJson(`https://api.scite.ai/tallies/${encodeURIComponent(work.doi)}`))
    : null;
  return { ...work, tallies };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions/enrich-source && deno test --allow-all`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enrich-source/providers.ts supabase/functions/enrich-source/providers.test.ts
git commit -m "feat(enrich): OpenAlex + scite tallies providers with tolerant parsing"
```

### Task 4: snapshot extraction (LLM over the PubMed abstract)

**Files:**
- Create: `supabase/functions/enrich-source/snapshot.ts`, `supabase/functions/enrich-source/snapshot.test.ts`

**Interfaces:**
- Consumes: `callTool<T>(...)`, `llmApiKey()`, `hasLlmKey()` from `../ask/llm.ts` (existing); `StudySnapshot` from `./providers.ts`.
- Produces: `SNAPSHOT_TOOL: Tool`, `sanitizeSnapshot(raw: unknown): StudySnapshot | null`, `fetchAbstract(pmid: string): Promise<string | null>`, `extractSnapshot(pmid: string): Promise<StudySnapshot | null>`

- [ ] **Step 1: Write the failing test (sanitizer only — the LLM call is not unit-tested)**

```ts
// supabase/functions/enrich-source/snapshot.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeSnapshot } from "./snapshot.ts";

Deno.test("sanitizeSnapshot keeps clean fields and clamps junk", () => {
  assertEquals(
    sanitizeSnapshot({ population: "healthy young adults", sample_size: 34, duration: "10 weeks", design: "randomized controlled trial" }),
    { population: "healthy young adults", sample_size: 34, duration: "10 weeks", design: "randomized controlled trial" },
  );
});

Deno.test("sanitizeSnapshot nulls non-answers and absurd n", () => {
  assertEquals(
    sanitizeSnapshot({ population: "not stated", sample_size: -5, duration: "unknown", design: "" }),
    { population: null, sample_size: null, duration: null, design: null },
  );
  assertEquals(sanitizeSnapshot(null), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase/functions/enrich-source && deno test --allow-all src/../snapshot.test.ts` (plain `deno test --allow-all` also fine)
Expected: FAIL — snapshot.ts not found.

- [ ] **Step 3: Implement snapshot.ts**

```ts
// supabase/functions/enrich-source/snapshot.ts
// Consensus-style "Study Snapshot": population / n / duration / design, extracted from the
// PubMed abstract by a forced tool call. Extraction-only: fields absent from the abstract
// come back null (never guessed). Cached with the rest of the enrichment payload.
import { callTool, hasLlmKey, llmApiKey, type Tool } from "../ask/llm.ts";
import type { StudySnapshot } from "./providers.ts";

export const SNAPSHOT_TOOL: Tool = {
  name: "record_snapshot",
  description: "Record the study snapshot fields exactly as stated in the abstract.",
  parameters: {
    type: "object",
    properties: {
      population: { type: "string", description: "Who was studied, verbatim-close (e.g. 'healthy young adults'). Empty string if not stated." },
      sample_size: { type: "number", description: "Total participants (N). 0 if not stated." },
      duration: { type: "string", description: "Study length (e.g. '10 weeks'). Empty string if not stated." },
      design: { type: "string", description: "Study design as stated (e.g. 'randomized controlled trial', 'cohort'). Empty string if not stated." },
    },
    required: ["population", "sample_size", "duration", "design"],
  },
};

const NON_ANSWERS = /^(|not stated|unknown|n\/a|none|unclear)$/i;

export function sanitizeSnapshot(raw: unknown): StudySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !NON_ANSWERS.test(s) ? s.slice(0, 120) : null;
  };
  const n = typeof r.sample_size === "number" && r.sample_size >= 1 && r.sample_size <= 10_000_000
    ? Math.round(r.sample_size) : null;
  return { population: str(r.population), sample_size: n, duration: str(r.duration), design: str(r.design) };
}

export async function fetchAbstract(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text` +
        (Deno.env.get("NCBI_API_KEY") ? `&api_key=${Deno.env.get("NCBI_API_KEY")}` : ""),
    );
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 100 ? text.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

export async function extractSnapshot(pmid: string): Promise<StudySnapshot | null> {
  if (!hasLlmKey()) return null;
  const abstract = await fetchAbstract(pmid);
  if (!abstract) return null;
  try {
    const raw = await callTool<Record<string, unknown>>({
      system: "You extract study metadata from a medical abstract. Copy ONLY what the abstract states; use empty string / 0 for anything not stated. Never infer or estimate.",
      user: abstract,
      tool: SNAPSHOT_TOOL,
      model: "gpt-4o-mini",
    }, llmApiKey());
    return sanitizeSnapshot(raw);
  } catch {
    return null;
  }
}
```

NOTE for implementer: check `callTool`'s exact parameter shape in `supabase/functions/ask/llm.ts:112` before wiring — if its signature is `(system, user, tool, apiKey, model?)` positional or a different params object, adapt THIS call site (the tool schema and sanitizer stay as written). The unit test covers `sanitizeSnapshot` only, so signature drift can't break CI.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions/enrich-source && deno test --allow-all`
Expected: 6 pass (4 providers + 2 snapshot).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enrich-source/snapshot.ts supabase/functions/enrich-source/snapshot.test.ts
git commit -m "feat(enrich): study-snapshot extraction (efetch + forced tool call, extraction-only)"
```

### Task 5: `enrich-source` edge function (batch endpoint + cache)

**Files:**
- Create: `supabase/functions/enrich-source/index.ts`

**Interfaces:**
- Consumes: `fetchEnrichmentBase`, `extractSnapshot`, `SourceEnrichment` (Tasks 3–4); table `source_enrichment` (Task 1).
- Produces: `POST /functions/v1/enrich-source` with body `{ pmids: string[] }` (≤24) → `{ results: Record<string, SourceEnrichment> }` keyed `pmid:<n>`. Requires a signed-in user JWT (verify_jwt default). 30-day cache TTL.

- [ ] **Step 1: Implement index.ts**

```ts
// supabase/functions/enrich-source/index.ts
// Batch source-enrichment endpoint. Client sends the PMIDs visible in the evidence panel;
// we serve from the source_enrichment cache and fill misses live (OpenAlex + scite +
// snapshot). Best-effort per id — one bad id never fails the batch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchEnrichmentBase, type SourceEnrichment } from "./providers.ts";
import { extractSnapshot } from "./snapshot.ts";

const TTL_DAYS = 30;
const MAX_BATCH = 24;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let pmids: string[];
  try {
    const body = await req.json();
    pmids = Array.isArray(body?.pmids) ? body.pmids.filter((p: unknown) => typeof p === "string" && /^\d{1,9}$/.test(p)).slice(0, MAX_BATCH) : [];
  } catch {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  }

  const keys = pmids.map((p) => `pmid:${p}`);
  const results: Record<string, SourceEnrichment> = {};

  const { data: cached } = await admin.from("source_enrichment").select("key,payload,fetched_at").in("key", keys);
  const fresh = new Set<string>();
  const cutoff = Date.now() - TTL_DAYS * 24 * 3600 * 1000;
  for (const row of cached ?? []) {
    if (new Date(row.fetched_at).getTime() > cutoff) {
      results[row.key] = row.payload as SourceEnrichment;
      fresh.add(row.key);
    }
  }

  const misses = pmids.filter((p) => !fresh.has(`pmid:${p}`));
  await Promise.all(misses.map(async (pmid) => {
    const base = await fetchEnrichmentBase(pmid);
    const snapshot = await extractSnapshot(pmid);
    const payload: SourceEnrichment = { ...base, snapshot };
    results[`pmid:${pmid}`] = payload;
    await admin.from("source_enrichment").upsert({ key: `pmid:${pmid}`, payload, fetched_at: new Date().toISOString() });
  }));

  return new Response(JSON.stringify({ results }), { headers: { ...CORS, "content-type": "application/json" } });
});
```

- [ ] **Step 2: Type-check the function**

Run: `cd supabase/functions/enrich-source && deno check index.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/enrich-source/index.ts
git commit -m "feat(enrich): batch enrich-source edge function with 30-day cache"
```

### Task 6: web enrichment client + trust badges on source cards

**Files:**
- Create: `apps/web/lib/enrichment.ts`
- Modify: `apps/web/components/EvidencePanel.tsx` (badges), `apps/web/app/styles/shell.css` (styles)

**Interfaces:**
- Consumes: `enrichmentKeyFor`/`pmidFromUrl` (`@pharmabro/shared`), the deployed endpoint from Task 5, existing `SourceCard` markup (`.badge-src`, `.meta` rows).
- Produces: `useEnrichment(citations: Citation[]): Record<string, SourceEnrichment>` React hook (keyed `pmid:<n>`), `SourceEnrichment` re-exported type; UI badges: `.retracted-banner`, `.scite-badge`, `.snapshot-line`, `.citedby-chip`.

- [ ] **Step 1: Implement the client (module-level in-memory cache, one batch per answer)**

```ts
// apps/web/lib/enrichment.ts
"use client";
// Fetches trust enrichment (retraction / scite tallies / snapshot / cited-by) for the
// PubMed-family sources in an answer. One batched call per unique PMID set; module-level
// cache so panel re-renders and repeat questions don't refetch. Best-effort: errors → {}.
import { useEffect, useState } from "react";
import type { Citation } from "@pharmabro/shared";
import { pmidFromUrl } from "@pharmabro/shared";
import { supabase } from "@/lib/supabase";

export interface StudySnapshot { population: string | null; sample_size: number | null; duration: string | null; design: string | null }
export interface SourceEnrichment {
  doi: string | null; retracted: boolean; cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

const memo = new Map<string, SourceEnrichment>();

async function fetchBatch(pmids: string[]): Promise<Record<string, SourceEnrichment>> {
  const missing = pmids.filter((p) => !memo.has(`pmid:${p}`));
  if (missing.length) {
    try {
      const { data, error } = await supabase.functions.invoke("enrich-source", { body: { pmids: missing } });
      if (!error && data?.results) for (const [k, v] of Object.entries(data.results)) memo.set(k, v as SourceEnrichment);
    } catch { /* best-effort */ }
  }
  const out: Record<string, SourceEnrichment> = {};
  for (const p of pmids) { const hit = memo.get(`pmid:${p}`); if (hit) out[`pmid:${p}`] = hit; }
  return out;
}

export function useEnrichment(citations: Citation[]): Record<string, SourceEnrichment> {
  const [map, setMap] = useState<Record<string, SourceEnrichment>>({});
  const pmids = [...new Set(citations.map((c) => pmidFromUrl(c.url)).filter((p): p is string => !!p))];
  const sig = pmids.join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    void fetchBatch(sig.split(",")).then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, [sig]);
  return map;
}
```

NOTE for implementer: confirm the client import for the supabase browser client — grep `apps/web/lib` for the existing pattern (`from "@/lib/supabase"` or a `createClient` helper) and match it; `supabase.functions.invoke` sends the user JWT automatically.

- [ ] **Step 2: Render the badges in `EvidencePanel.tsx`**

In `EvidencePanel` (the exported component), call the hook and thread per-card enrichment into `SourceCard`:

```tsx
// inside EvidencePanel(...):
const enrichment = useEnrichment([...citations, ...rev]);
// pass to each card: enrich={enrichment[enrichmentKeyFor(c) ?? ""]}
```

In `SourceCard`, add after the `.meta` row (`props` gains `enrich?: SourceEnrichment`):

```tsx
{enrich?.retracted ? (
  <div className="retracted-banner" role="alert">
    RETRACTED — this paper was withdrawn after publication. Treat its findings as unreliable.
  </div>
) : null}
{enrich?.tallies || enrich?.cited_by != null ? (
  <div className="meta trust-row">
    {enrich.tallies ? (
      <span className="scite-badge" title={`How later papers cite this one (scite): ${enrich.tallies.supporting} supporting · ${enrich.tallies.contrasting} contrasting · ${enrich.tallies.mentioning} mentioning`}>
        <i className="scite-sup">▲ {enrich.tallies.supporting}</i>
        <i className="scite-con">▼ {enrich.tallies.contrasting}</i>
      </span>
    ) : null}
    {enrich.cited_by != null ? <span className="citedby-chip">Cited by {enrich.cited_by}</span> : null}
  </div>
) : null}
{enrich?.snapshot && (enrich.snapshot.population || enrich.snapshot.sample_size || enrich.snapshot.design) ? (
  <p className="snapshot-line">
    {[
      enrich.snapshot.design,
      enrich.snapshot.sample_size ? `n=${enrich.snapshot.sample_size}` : null,
      enrich.snapshot.population,
      enrich.snapshot.duration,
    ].filter(Boolean).join(" · ")}
  </p>
) : null}
```

- [ ] **Step 3: Add the styles to `shell.css`** (near the existing `.src .meta` block)

```css
/* ── trust badges (enrichment) ── */
.retracted-banner { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); border: 1px solid var(--danger); color: var(--danger); font-size: 11.5px; font-weight: 700; letter-spacing: 0.03em; border-radius: 8px; padding: 6px 9px; margin: 7px 0 2px; }
.scite-badge { display: inline-flex; gap: 8px; align-items: center; background: var(--surface-2); border-radius: 999px; padding: 2px 9px; font-size: 11px; }
.scite-badge i { font-style: normal; font-family: var(--mono); }
.scite-sup { color: var(--acid-dim); }
.scite-con { color: var(--danger); }
.citedby-chip { font-size: 11px; color: var(--text-3); }
.snapshot-line { font-size: 12px; color: var(--text-2); margin: 6px 0 0; }
```

- [ ] **Step 4: Type-check + tests**

Run: `cd apps/web && npx tsc --noEmit && for t in lib/*.test.ts; do npx tsx "$t" >/dev/null || echo "FAIL $t"; done`
Expected: clean.

- [ ] **Step 5: Visual check via the static-mock recipe** (memory: "Verify UI without app auth") — add one mocked card with all three badges to the scratch mock, screenshot, confirm all three themes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/enrichment.ts apps/web/components/EvidencePanel.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): retraction banner, scite tally badge, study snapshot on source cards"
```

---

## Phase 2 — Evidence map

### Task 7: shared map-geometry module

**Files:**
- Create: `packages/shared/src/evidence-map-points.ts`, `packages/shared/src/evidence-map-points.test.ts`
- Modify: `packages/shared/src/index.ts` (export)

**Interfaces:**
- Consumes: `Citation` (existing).
- Produces: `interface EvidenceMapPoint { tag: string; title: string; year: number; weight: number; cited: boolean; role: string | null; x: number; y: number; r: number }`, `buildEvidenceMap(citations: Citation[], reviewed: Citation[], width: number, height: number): { points: EvidenceMapPoint[]; years: [number, number] } | null` (null when <3 datable sources — no map for thin answers).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/evidence-map-points.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEvidenceMap } from "./evidence-map-points.ts";
import type { Citation } from "./answer.ts";

const cite = (over: Partial<Citation>): Citation => ({
  chunk_tag: "1", source_id: "s", source_type: "pubmed_oa", title: "T", section: null,
  url: null, license: null, published_date: "2020-01-01", retrieved_at: null, ...over,
});

Deno.test("buildEvidenceMap scales year→x and weight→y within the box", () => {
  const m = buildEvidenceMap(
    [cite({ chunk_tag: "1", year: "2010", evidence_weight: 20 }), cite({ chunk_tag: "2", year: "2024", evidence_weight: 90 })],
    [cite({ chunk_tag: "3", year: "2017", evidence_weight: 55 })],
    600, 300,
  );
  if (!m) throw new Error("expected a map");
  assertEquals(m.years, [2010, 2024]);
  const [a, b, c] = m.points;
  assertEquals(a.x < c.x && c.x < b.x, true);   // chronological left→right
  assertEquals(b.y < a.y, true);                 // higher weight = higher on the chart (smaller y)
  assertEquals(a.cited, true);
  assertEquals(c.cited, false);
});

Deno.test("buildEvidenceMap returns null under 3 datable sources", () => {
  assertEquals(buildEvidenceMap([cite({})], [], 600, 300), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/shared && deno test --allow-all src/evidence-map-points.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/evidence-map-points.ts
// The evidence map (Litmaps-pattern): x = publication year, y = deterministic evidence
// weight (0-100, already computed per source), dot size = support score, filled = cited
// in the answer. Pure geometry — the component just draws these points.
import type { Citation } from "./answer.ts";

export interface EvidenceMapPoint {
  tag: string; title: string; year: number; weight: number; cited: boolean; role: string | null;
  x: number; y: number; r: number;
}

const PAD = 34; // axis gutter

function yearOf(c: Citation): number | null {
  const y = c.year ? parseInt(c.year, 10) : c.published_date ? parseInt(c.published_date.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) && y > 1900 && y < 2100 ? y : null;
}

export function buildEvidenceMap(
  citations: Citation[], reviewed: Citation[], width: number, height: number,
): { points: EvidenceMapPoint[]; years: [number, number] } | null {
  const all = [
    ...citations.map((c) => ({ c, cited: true })),
    ...reviewed.map((c) => ({ c, cited: false })),
  ].map(({ c, cited }) => ({ c, cited, year: yearOf(c) }))
    .filter((e): e is { c: Citation; cited: boolean; year: number } => e.year !== null);
  if (all.length < 3) return null;

  const years = all.map((e) => e.year);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const span = Math.max(1, y1 - y0);

  const points = all.map(({ c, cited, year }) => {
    const weight = typeof c.evidence_weight === "number" ? c.evidence_weight : 40;
    const support = typeof c.support_score === "number" ? c.support_score : 40;
    return {
      tag: c.chunk_tag, title: c.title ?? c.source_type, year, weight, cited,
      role: c.evidence_role ?? null,
      x: PAD + ((year - y0) / span) * (width - PAD * 2),
      y: PAD + (1 - weight / 100) * (height - PAD * 2),
      r: 4 + (support / 100) * 6,
    };
  });
  return { points, years: [y0, y1] };
}
```

- [ ] **Step 4: Export from index.ts, run tests**

Add `export * from "./evidence-map-points.ts";` to `packages/shared/src/index.ts`.
Run: `cd packages/shared && deno test --allow-all` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/evidence-map-points.ts packages/shared/src/evidence-map-points.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): evidence-map geometry (year × evidence-weight scatter)"
```

### Task 8: `EvidenceMapView` component + panel toggle

**Files:**
- Create: `apps/web/components/EvidenceMapView.tsx`
- Modify: `apps/web/components/EvidencePanel.tsx` (Sources | Map toggle in `.ev-head`), `apps/web/app/styles/shell.css`

**Interfaces:**
- Consumes: `buildEvidenceMap` (Task 7); existing card anchors `id="ev-src-<normTag>"` in `SourceCard`.
- Produces: `<EvidenceMapView citations reviewed onSelect={(tag)=>void} />` — clicking a dot calls `onSelect(tag)`, and the panel scrolls that source card into view (`document.getElementById("ev-src-"+tag)?.scrollIntoView({behavior:"smooth", block:"center"})`).

- [ ] **Step 1: Implement the component**

```tsx
// apps/web/components/EvidenceMapView.tsx
"use client";
// SVG scatter of the answer's evidence: newer → right, stronger → up, bigger dot =
// stronger claim support, filled = cited (hollow = reviewed-only). Click a dot to jump
// to its source card. Pure render over buildEvidenceMap().
import type { Citation } from "@pharmabro/shared";
import { buildEvidenceMap } from "@pharmabro/shared";
import { normTag } from "@/lib/cite";

const W = 320, H = 240;

export function EvidenceMapView({ citations, reviewed, onSelect }: {
  citations: Citation[]; reviewed: Citation[]; onSelect: (tag: string) => void;
}) {
  const map = buildEvidenceMap(citations, reviewed, W, H);
  if (!map) return <div className="ev-empty">Not enough dated sources to draw a map.</div>;
  return (
    <div className="ev-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evidence map: publication year vs evidence strength">
        <line x1="30" y1={H - 28} x2={W - 10} y2={H - 28} className="ev-map-axis" />
        <line x1="30" y1="12" x2="30" y2={H - 28} className="ev-map-axis" />
        <text x={34} y={H - 12} className="ev-map-label">{map.years[0]}</text>
        <text x={W - 44} y={H - 12} className="ev-map-label">{map.years[1]}</text>
        <text x={6} y={18} className="ev-map-label">strong</text>
        <text x={6} y={H - 34} className="ev-map-label">weak</text>
        {map.points.map((p) => (
          <circle
            key={p.tag} cx={p.x} cy={p.y} r={p.r}
            className={`ev-map-dot${p.cited ? " cited" : ""}`}
            role="button" tabIndex={0}
            onClick={() => onSelect(normTag(p.tag))}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(normTag(p.tag)); }}
          >
            <title>{`${p.title} (${p.year}) — evidence weight ${p.weight}`}</title>
          </circle>
        ))}
      </svg>
      <p className="ev-map-hint">Newer → right · stronger → up · filled = cited in this answer. Click a dot to open its source.</p>
    </div>
  );
}
```

- [ ] **Step 2: Wire the toggle into `EvidencePanel`**

Add local state + head buttons (after the `LIVE` chip in `.ev-head`), replacing the card list when map mode is on:

```tsx
const [view, setView] = useState<"sources" | "map">("sources");
// in .ev-head:
<div className="ev-view-toggle" role="tablist">
  <button role="tab" aria-selected={view === "sources"} className={view === "sources" ? "active" : ""} onClick={() => setView("sources")}>Sources</button>
  <button role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map</button>
</div>
// in .ev-body, when view === "map":
<EvidenceMapView citations={citations} reviewed={rev} onSelect={(tag) => {
  setView("sources");
  requestAnimationFrame(() => document.getElementById(`ev-src-${tag}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}} />
```

(`EvidencePanel` needs `useState` — add `"use client"` is already present; import `useState` from react and `EvidenceMapView`.)

- [ ] **Step 3: Styles**

```css
/* ── evidence map ── */
.ev-view-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.ev-view-toggle button { border: none; background: transparent; color: var(--text-2); font-size: 11.5px; padding: 3px 11px; cursor: pointer; font-family: var(--font); }
.ev-view-toggle button.active { background: var(--surface-2); color: var(--text); }
.ev-map { padding: 12px; }
.ev-map svg { width: 100%; height: auto; }
.ev-map-axis { stroke: var(--line-2); stroke-width: 1; }
.ev-map-label { fill: var(--text-3); font-size: 9px; font-family: var(--mono); }
.ev-map-dot { fill: transparent; stroke: var(--text-3); stroke-width: 1.5; cursor: pointer; }
.ev-map-dot.cited { fill: var(--acid); fill-opacity: 0.75; stroke: var(--acid-deep); }
.ev-map-dot:hover { stroke: var(--text); }
.ev-map-hint { font-size: 11px; color: var(--text-3); margin: 8px 2px 0; line-height: 1.5; }
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; static-mock screenshot of the map in light + grey themes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/EvidenceMapView.tsx apps/web/components/EvidencePanel.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): evidence map view (year x strength scatter) with Sources/Map toggle"
```

---

## Phase 3 — Evidence Meter + report attribution

### Task 9: shared `claim-meter` module (deterministic, design-weighted)

**Files:**
- Create: `packages/shared/src/claim-meter.ts`, `packages/shared/src/claim-meter.test.ts`
- Modify: `packages/shared/src/index.ts` (export)

**Interfaces:**
- Consumes: `Citation` (`publication_types`, `evidence_role`, `support_level`).
- Produces: `interface ClaimMeter { score: number; label: "strong" | "moderate" | "limited" | "contested"; basis: string }`, `meterForPoint(citationIds: string[] | undefined, citations: Citation[]): ClaimMeter | null` (null when the point has no resolvable citations).

- [ ] **Step 1: Write the failing tests (incl. the anti-vote-counting case)**

```ts
// packages/shared/src/claim-meter.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { meterForPoint } from "./claim-meter.ts";
import type { Citation } from "./answer.ts";

const cite = (tag: string, over: Partial<Citation>): Citation => ({
  chunk_tag: tag, source_id: tag, source_type: "pubmed_oa", title: "T", section: null,
  url: null, license: null, published_date: "2022-01-01", retrieved_at: null, ...over,
});

Deno.test("one meta-analysis with direct support outscores three weak mentions (no vote counting)", () => {
  const meta = meterForPoint(["1"], [cite("1", { publication_types: ["Meta-Analysis"], support_level: "direct" })]);
  const mentions = meterForPoint(["2", "3", "4"], [
    cite("2", { support_level: "weak" }), cite("3", { support_level: "weak" }), cite("4", { support_level: "weak" }),
  ]);
  if (!meta || !mentions) throw new Error("expected meters");
  assertEquals(meta.score > mentions.score, true);
  assertEquals(meta.label, "strong");
});

Deno.test("label bands", () => {
  const rct = meterForPoint(["1"], [cite("1", { publication_types: ["Randomized Controlled Trial"], support_level: "direct" })]);
  assertEquals(rct?.label, "strong");
  const weak = meterForPoint(["1"], [cite("1", { support_level: "weak" })]);
  assertEquals(weak?.label, "limited");
});

Deno.test("null when no citations resolve", () => {
  assertEquals(meterForPoint([], []), null);
  assertEquals(meterForPoint(["9"], [cite("1", {})]), null);
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/shared && deno test --allow-all src/claim-meter.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/claim-meter.ts
// Per-claim Evidence Meter — DETERMINISTIC and design-weighted, never vote-counted.
// score = max over the claim's sources of (design weight × support multiplier), plus a
// small corroboration bonus for each ADDITIONAL supporting source (capped) — so one meta-
// analysis beats any pile of mentions, and extra real support nudges, never dominates.
import type { Citation } from "./answer.ts";
import { normTag } from "./cite-normalize.ts"; // if absent, inline: (t)=>t.replace(/\D/g,"")

export interface ClaimMeter {
  score: number; // 0-100
  label: "strong" | "moderate" | "limited" | "contested";
  basis: string; // plain-English one-liner for the tooltip
}

const DESIGN_WEIGHT: Array<{ re: RegExp; w: number; name: string }> = [
  { re: /meta-analysis|systematic review/i, w: 95, name: "meta-analysis/systematic review" },
  { re: /randomized controlled trial/i, w: 85, name: "randomized trial" },
  { re: /clinical trial/i, w: 70, name: "clinical trial" },
  { re: /cohort|observational|case-control/i, w: 55, name: "observational study" },
  { re: /review/i, w: 50, name: "review" },
  { re: /case report/i, w: 30, name: "case report" },
];

const SUPPORT_MULT: Record<string, number> = { direct: 1, partial: 0.75, weak: 0.45, background: 0.35, reviewed: 0.3 };

function designOf(c: Citation): { w: number; name: string } {
  const types = (c.publication_types ?? []).join(" ");
  for (const d of DESIGN_WEIGHT) if (d.re.test(types)) return { w: d.w, name: d.name };
  if (c.evidence_role === "official_label") return { w: 80, name: "official label" };
  if (c.study_type) return { w: 60, name: "registered trial record" };
  return { w: 45, name: "research article" };
}

export function meterForPoint(citationIds: string[] | undefined, citations: Citation[]): ClaimMeter | null {
  if (!citationIds?.length) return null;
  const byTag = new Map(citations.map((c) => [normTag(c.chunk_tag), c]));
  const used = citationIds.map((id) => byTag.get(normTag(id))).filter((c): c is Citation => !!c);
  if (!used.length) return null;

  const scored = used.map((c) => {
    const d = designOf(c);
    const mult = SUPPORT_MULT[c.support_level ?? "partial"] ?? 0.6;
    return { c, d, s: d.w * mult };
  }).sort((a, b) => b.s - a.s);

  const top = scored[0]!;
  const extraSupport = scored.slice(1).filter((e) => (e.c.support_level === "direct" || e.c.support_level === "partial")).length;
  const score = Math.round(Math.min(100, top.s + Math.min(10, extraSupport * 4)));

  const label: ClaimMeter["label"] = score >= 70 ? "strong" : score >= 50 ? "moderate" : "limited";
  const basis = `${top.d.name}${top.c.support_level ? ` · ${top.c.support_level} support` : ""}${extraSupport ? ` · corroborated by ${extraSupport} more` : ""}`;
  return { score, label, basis };
}
```

NOTE for implementer: `normTag` lives in `apps/web/lib/cite.ts` today. Check whether `packages/shared` already exports a tag normalizer (grep `normTag` in `packages/shared/src`); if not, define `const normTag = (t: string) => t.replace(/\D/g, "")` locally in claim-meter.ts and drop the import — do NOT import web code into shared. ("contested" label is reserved for when scite contrasting data reaches claim level — not wired in this task; the type includes it so the UI is ready.)

- [ ] **Step 4: Export from index, run tests** — `deno test --allow-all` all green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/claim-meter.ts packages/shared/src/claim-meter.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): deterministic design-weighted per-claim evidence meter"
```

### Task 10: meter chip in the answer UI

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (Prose points), `apps/web/app/styles/shell.css`

**Interfaces:**
- Consumes: `meterForPoint` (Task 9); `Prose`'s existing `points` (`{ text, citation_ids, support }`) and `citeMap`/`answer.citations` already in `Answer`'s scope.
- Produces: a `.meter-chip` after each point's citation pill.

- [ ] **Step 1: Render the chip.** In `Answer`, pass `citations={answer.citations}` down to `Prose`; in `Prose`'s point loop, after `{chips}`:

```tsx
{(() => {
  const m = meterForPoint(p.citation_ids, citations);
  return m ? (
    <span className={`meter-chip meter-${m.label}`} title={`Evidence for this point: ${m.basis}`}>
      <i style={{ width: `${m.score}%` }} />
      <b>{m.label}</b>
    </span>
  ) : null;
})()}
```

(Prose's props gain `citations: Citation[]`; update both call sites — `Prose` and `PointItems` if reused there.)

- [ ] **Step 2: Styles**

```css
/* ── per-claim evidence meter ── */
.meter-chip { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; vertical-align: 1px; background: var(--surface-2); border-radius: 999px; padding: 2px 9px 2px 7px; font-size: 10.5px; }
.meter-chip i { display: inline-block; width: 34px; max-width: 34px; height: 4px; border-radius: 2px; background: var(--line-2); position: relative; overflow: hidden; }
.meter-chip b { font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; font-size: 9.5px; }
.meter-strong i { background: linear-gradient(90deg, var(--acid) var(--pct, 80%), var(--line-2) 0); }
.meter-moderate i { background: linear-gradient(90deg, var(--warn) var(--pct, 55%), var(--line-2) 0); }
.meter-limited i { background: linear-gradient(90deg, var(--text-3) var(--pct, 35%), var(--line-2) 0); }
```

NOTE for implementer: the inline `style={{width}}` on `<i>` conflicts with the fixed 34px track — instead set `style={{ "--pct": `${m.score}%` } as React.CSSProperties}` on the chip and keep `<i />` empty; the gradients above read `--pct`.

- [ ] **Step 3: Verify** — tsc clean; mock screenshot showing strong/moderate/limited chips.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): per-claim evidence meter chips on answer points"
```

### Task 11: report Source Attribution block (NotebookLM pattern)

**Files:**
- Create: `packages/shared/src/report-attribution.ts`, `packages/shared/src/report-attribution.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/web/components/ResearchReportView.tsx` (render at the foot)

**Interfaces:**
- Consumes: the report's citations array (grep `ResearchReport` in `packages/shared/src/research.ts` for the exact field — it carries citations + method metadata; adapt field names to what's there).
- Produces: `buildAttribution(input: { citations: Citation[]; generatedAt: string; engineVersion?: string; mode: string }): { headline: string; lines: string[] }` — e.g. headline `"Built from 18 sources"`, lines `["9 PubMed · 4 trials · 3 FDA · 2 guidance", "Method: structured review · engine ask-v16 · generated 2026-07-02"]`.

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/report-attribution.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAttribution } from "./report-attribution.ts";
import type { Citation } from "./answer.ts";

const c = (t: string): Citation => ({ chunk_tag: "1", source_id: "s", source_type: t, title: null, section: null, url: null, license: null, published_date: null, retrieved_at: null });

Deno.test("buildAttribution counts families and stamps method", () => {
  const a = buildAttribution({
    citations: [c("pubmed_oa"), c("pubmed_oa"), c("clinicaltrials"), c("openfda")],
    generatedAt: "2026-07-02", engineVersion: "ask-v16", mode: "structured review",
  });
  assertEquals(a.headline, "Built from 4 sources");
  assertEquals(a.lines[0], "2 PubMed · 1 trials · 1 FDA");
  assertEquals(a.lines[1], "Method: structured review · engine ask-v16 · generated 2026-07-02");
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement**

```ts
// packages/shared/src/report-attribution.ts
// NotebookLM-style Source Attribution: every generated artifact states what it was built
// from and how — deterministic counts from the citations it actually carries.
import type { Citation } from "./answer.ts";

function family(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("pubmed") || p.includes("europepmc") || p.includes("openalex")) return "PubMed";
  if (p.includes("trial") || p.includes("nct")) return "trials";
  if (p.includes("fda") || p.includes("dailymed") || p.includes("faers")) return "FDA";
  if (p.includes("medlineplus")) return "guidance";
  return "other";
}

export function buildAttribution(input: { citations: Citation[]; generatedAt: string; engineVersion?: string; mode: string }): { headline: string; lines: string[] } {
  const order = ["PubMed", "trials", "FDA", "guidance", "other"];
  const counts = new Map<string, number>();
  for (const c of input.citations) counts.set(family(c.source_type), (counts.get(family(c.source_type)) ?? 0) + 1);
  const breakdown = order.filter((f) => counts.has(f)).map((f) => `${counts.get(f)} ${f}`).join(" · ");
  const meta = `Method: ${input.mode}${input.engineVersion ? ` · engine ${input.engineVersion}` : ""} · generated ${input.generatedAt}`;
  return { headline: `Built from ${input.citations.length} source${input.citations.length === 1 ? "" : "s"}`, lines: [breakdown, meta] };
}
```

- [ ] **Step 4: Render at the foot of `ResearchReportView.tsx`** (a quiet `.attribution` box: headline bold 13px, lines 12px `--text-2`) and **run tests + tsc**.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/report-attribution.ts packages/shared/src/report-attribution.test.ts packages/shared/src/index.ts apps/web/components/ResearchReportView.tsx
git commit -m "feat: source-attribution block on research reports"
```

---

## Phase 4 — Cited deliverables

### Task 12: per-claim references inside PPT/DOCX/PDF exports

**Files:**
- Modify: `apps/web/lib/export/pptx.ts` (`reportToPptx`), `apps/web/lib/export/docx.ts` (`reportToDocx`), `apps/web/lib/export/pdf.ts` (`reportToPdf`)
- Create: `packages/shared/src/claim-refs.ts`, `packages/shared/src/claim-refs.test.ts` (shared formatting so all three exporters agree)

**Interfaces:**
- Consumes: `ResearchReport` (existing exporter input), `formatReference` (existing, `citation-format.ts`).
- Produces: `claimRefMarker(citationIds: string[] | undefined): string` (`" [1,3]"` or `""`), `referenceLines(citations: Citation[], style: CitationStyle): string[]` (numbered, DOI/URL included when present).

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/claim-refs.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimRefMarker } from "./claim-refs.ts";

Deno.test("claimRefMarker renders bracketed numeric tags", () => {
  assertEquals(claimRefMarker(["S1", "S3"]), " [1,3]");
  assertEquals(claimRefMarker([]), "");
  assertEquals(claimRefMarker(undefined), "");
});
```

- [ ] **Step 2: Implement**

```ts
// packages/shared/src/claim-refs.ts
// Deliverable citation formatting shared by the PPT/DOCX/PDF exporters — every claim line
// in an exported artifact carries its [n] source markers (the "cited deck" differentiator:
// no mainstream deck generator ships citations — see docs/research/evidence-super-app-research.md §3).
import type { Citation } from "./answer.ts";
import { formatReference, type CitationStyle } from "./citation-format.ts";

export function claimRefMarker(citationIds: string[] | undefined): string {
  if (!citationIds?.length) return "";
  const nums = citationIds.map((id) => id.replace(/\D/g, "")).filter(Boolean);
  return nums.length ? ` [${nums.join(",")}]` : "";
}

export function referenceLines(citations: Citation[], style: CitationStyle): string[] {
  return citations.map((c, i) => `${i + 1}. ${formatReference(c, style)}${c.url ? ` — ${c.url}` : ""}`);
}
```

NOTE for implementer: check `citation-format.ts` for `CitationStyle`'s exact export name and `formatReference`'s signature before writing this file; align imports.

- [ ] **Step 3: Wire into each exporter.** Open `reportToPptx` / `reportToDocx` / `reportToPdf`, find where report finding/claim text lines are emitted, and append `claimRefMarker(point.citation_ids)` to each; add (or extend) a final **References** slide/section from `referenceLines(report.citations, style)`. The three files already iterate report sections — this is an append at the text-assembly points, not a restructure. Read each exporter top-to-bottom first; keep changes additive.

- [ ] **Step 4: Verify** — shared tests + `npx tsc --noEmit`; then generate one real export locally (any saved report → download PPT) and eyeball: markers on claims, References slide present, nothing overflows.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/claim-refs.ts packages/shared/src/claim-refs.test.ts packages/shared/src/index.ts apps/web/lib/export/pptx.ts apps/web/lib/export/docx.ts apps/web/lib/export/pdf.ts
git commit -m "feat(export): per-claim [n] markers + references section in PPT/DOCX/PDF"
```

### Task 13: attribution slide + "Cited" labeling on downloads

**Files:**
- Modify: `apps/web/lib/export/pptx.ts` / `docx.ts` / `pdf.ts` (attribution block from Task 11), the report download UI (grep `reportToPptx(` in `apps/web` for the button component; add the label there).

**Interfaces:**
- Consumes: `buildAttribution` (Task 11).

- [ ] **Step 1:** In each exporter, after the References section, emit the attribution: headline + two lines (`buildAttribution({ citations: report.citations, generatedAt: new Date().toISOString().slice(0,10), mode: report.mode ?? "structured review" })`). Match each format's plain-text emit style used in Task 12.
- [ ] **Step 2:** In the download UI component, retitle buttons to "PowerPoint (cited)" / "Word (cited)" / "PDF (cited)" and add a one-line note under them: "Every claim carries its sources — the references and build method are inside the file."
- [ ] **Step 3: Verify** — export one deck, confirm the closing attribution slide; tsc clean.
- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/export apps/web  # plus the specific UI file found in step 2
git commit -m "feat(export): source-attribution slide + cited labeling on downloads"
```

---

## Ship checklist (after all tasks)

- [ ] `cd packages/shared && deno test --allow-all` — all green
- [ ] `cd supabase/functions/enrich-source && deno test --allow-all && deno check index.ts` — green
- [ ] `cd supabase/functions/ask && deno test --allow-all` — still green (nothing here should have changed; this is the tripwire)
- [ ] `cd apps/web && npx tsc --noEmit` + tsx lib tests — green
- [ ] Static-mock screenshots: badges, map, meter chips in light + grey + dark
- [ ] PR to main; CI (ask-units, guardrail, retrieval-eval, Vercel) green
- [ ] OWNER-GATED deploy steps, in order: `supabase db push` (Task 1 migration) → `supabase functions deploy enrich-source --use-api` → merge PR (web auto-deploys) — the web badges no-op gracefully until the function exists, so order is safe either way
- [ ] Post-deploy: one live answer → confirm badges/map/meter render and `source_enrichment` rows appear

## Explicitly out of scope (deliberate)

- Click-to-passage: already shipped — citation pills highlight the verbatim supporting sentence on the active card, and external links carry a scroll-to-text fragment (`withTextFragment`, EvidencePanel.tsx). No task needed.
- Obsidian-style free-form concept graphs (research verdict: gimmick without purpose)
- Vote-counting meters and journal-prestige-as-quality claims
- scite enterprise API / Elicit API integrations (revisit after Tier 1 proves value)
- PPTX template ingestion + per-slide "Revise" (next deliverables iteration — needs this plan's Task 12/13 as the base)
- Audio/video overviews
