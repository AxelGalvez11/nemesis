# PharmaOrb Backend — PR0: Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eval harness that turns "make the backend supremely good" into a committed number — a deterministic retrieval-quality scorecard (recall@k / nDCG@k / MRR) over the live corpus, plus a CI gate — so every later backend change (HNSW, hybrid retrieval, faithfulness) is provable, not guessed.

**Architecture:** A standalone `eval/` directory of Deno/TypeScript scripts. Two suites: (1) a **retrieval harness** (cheap, deterministic, no LLM, no quota) that embeds golden questions with Voyage and calls the live `match_core_source_chunks` RPC, scoring returned sources against a corpus-relative golden set; (2) an **answer harness** (LLM-judge, scaffolded here, gated later). Mirrors the existing `scripts/phase3-validate.ts` mint-user → sign-in → measure → teardown pattern. A committed baseline JSON is the regression reference for all later PRs.

**Tech Stack:** Deno 2.x, `npm:zod`, Voyage `voyage-3-large` (1024-dim), Supabase Postgres + pgvector, Supabase REST/RPC + GoTrue admin API, GitHub Actions.

---

## CONTEXT RECAP (read first — this plan is self-contained post-compact)

**The mission (owner, 2026-06-08):** Make the evidence backend the best it can be — measurably on par with OpenEvidence — before any new frontend. MVP = "ChatGPT/Claude/Perplexity, but every claim is backed by a real citation." Arc: deepen corpus → ingest all of PubMed + open-access journals → eventually synthesize research hypotheses. Web before mobile.

**Where the backend is:** Supabase cloud project ref `qyjmivntajbigjswhahb`. Corpus = `core_sources` (provider catalog, `UNIQUE(provider, provider_id)`, `content_hash`, `superseded_at`) + `core_source_chunks` (`embedding vector(1024)`, ivfflat lists=100). Retrieval = `match_core_source_chunks` RPC. `/ask` pipeline = preScreen → classify → resolve → retrieve (cosine ≥0.5, top-8) → generate → enforceCitations → professional-routing → trace. A deterministic evidence-tier engine exists (`packages/shared/src/evidence-scoring.ts`). ~3,011 entities / ~4,162 chunks today.

**The build sequence (this plan = PR0; later PRs scoped at the bottom):**
- **PR0 (this doc):** eval harness + baseline + `eval.yml`. No app/schema/edge changes. Reads the live corpus only.
- PR1: ivfflat→HNSW index (Librarian). PR2: hybrid dense+sparse RRF + Voyage rerank (Answer Engine). Then P2 faithfulness → P3 agentic loop + conversation-aware + streaming → P4 scale ingest → P5 projects.

**Strategic plan doc (companion):** `docs/superpowers/plans/2026-06-08-pharmaorb-evidence-backend.md` (mission, locked decisions, the 3-agent team, cross-agent contracts, open decisions). Read it for the full picture.

**LOCKED DECISIONS that constrain this plan:**
- "Supremely good" is eval-defined; nothing ships unless metrics hold/improve.
- Golden labels are **corpus-relative** (only sources that exist in `core_sources` count toward recall) and keyed on `core_sources UNIQUE(provider, provider_id)` (PMID for `pubmed_oa`, NCT for `clinicaltrials`, SPL set-id for `dailymed`/`openfda`).
- The eval harness **READS** the frozen safety layer but never modifies `safety.ts`/`templates.ts` or the tier engine. `guardrail.yml` = safety gate; `eval.yml` = quality gate — complementary, never merged.
- CI jobs that hit `/ask` must grant the ephemeral test user an `enterprise` subscription (1000/day) before running, to avoid the free-tier 10/day `429 quota_exceeded` false-fail (see `pharmabro-guardrail-ci-quota-falsefail`). **Retrieval-only jobs (this PR) call the RPC directly and need NO grant.**

**CROSS-AGENT CONTRACTS this PR establishes (later PRs depend on them):**
- **Gold label contract:** `expected_sources` keyed on `(provider, provider_id)`, resolved to `source_id` at eval time.
- **Retriever contract:** any future retriever (PR1 HNSW, PR2 hybrid) MUST keep a path returning ranked `(chunk_id, source_id)` so `retrieval-eval.ts` can score it unchanged.
- **Faithfulness `tag→chunk_id` contract (ASK to Answer Engine, blocks P2):** today `Citation` has `chunk_tag`+`source_id` but no `chunk_id`/text; the trace `retrieval_scores` has `chunk_id` but no tag. Strict per-citation faithfulness needs an explicit `{tag→chunk_id}` map persisted in the trace/response. PR0 only computes context-level groundedness; record this ask in `eval/README.md`.

**KNOWN-GOOD INTERFACES (verified against the repo — build to these):**
- Live RPC (migration 0113, 6-arg): `match_core_source_chunks(query_embedding vector(1024), match_count int DEFAULT 8, match_threshold float DEFAULT 0.6, filter_providers text[] DEFAULT NULL, filter_section text DEFAULT NULL, filter_drug_entity uuid DEFAULT NULL)` → rows `{ id uuid (chunk id), source_id uuid, chunk_text text, section text, span jsonb, provider text, license text, attribution_required bool, source_url text, retrieved_at timestamptz, similarity float }`. Granted to `authenticated, service_role`; REVOKEd from `anon`. (Ignore the dead 1536-dim defs in 0101/0105.)
- Voyage embed: `POST https://api.voyageai.com/v1/embeddings` body `{ model: "voyage-3-large", input: [text], input_type: "query" }` → `body.data[0].embedding` (1024 floats).
- Mint user: `POST {SB_URL}/auth/v1/admin/users` (SERVICE_KEY) body `{ email, password, email_confirm: true }` → `{ id }`.
- Sign in: `POST {SB_URL}/auth/v1/token?grant_type=password` (ANON_KEY apikey header) body `{ email, password }` → `{ access_token }`.
- RPC over REST: `POST {SB_URL}/rest/v1/rpc/match_core_source_chunks` headers `{ apikey: ANON_KEY, Authorization: "Bearer <JWT>", "Content-Type": "application/json" }` body `{ query_embedding, match_count, match_threshold }`.
- Table read (service key, RLS-bypassing): `GET {SB_URL}/rest/v1/core_sources?select=id,provider,provider_id&provider_id=in.(...)` headers `{ apikey: SERVICE_KEY, Authorization: "Bearer <SERVICE_KEY>" }`.
- Teardown: `DELETE {SB_URL}/auth/v1/admin/users/{userId}` (SERVICE_KEY) — cascades.

**ENV required to run:** `SB_URL=https://qyjmivntajbigjswhahb.supabase.co`, `SERVICE_KEY`, `ANON_KEY`, `VOYAGE_API_KEY`. (Locally these live in `supabase/functions/.env`; CI uses repo secrets `SB_URL`/`SERVICE_KEY`/`ANON_KEY`/`VOYAGE_API_KEY`.)

---

## File Structure

| File | Responsibility |
|---|---|
| `eval/lib/metrics.ts` | Pure recall@k / nDCG@k / MRR over `(ranked ids, gold set)`. No I/O. |
| `eval/lib/metrics.test.ts` | Deno unit tests for the metric math (known-answer fixtures). |
| `eval/lib/voyage.ts` | `embedQuery(text)` → 1024-dim vector via Voyage. |
| `eval/lib/corpus.ts` | Auth helpers (mint/sign-in/teardown), `resolveSourceIds(pairs)`, RPC caller. |
| `eval/golden/schema.ts` | Zod schema + loader/validator for a golden item; exports `GoldenItem`. |
| `eval/golden/golden-set.json` | Corpus-relative golden Qs (seed + expansion task). |
| `eval/corpus-census.ts` | Counts embedded chunks per provider + distinct `(provider, provider_id)` per seed drug. |
| `eval/retrieval-eval.ts` | The retrieval harness: embed → RPC → score → aggregate → write baseline. |
| `eval/answer-eval.ts` | Scaffold only (LLM-judge groundedness/relevance); not a gate in PR0. |
| `eval/baselines/2026-06-08-retrieval-baseline.json` | Committed P0 baseline artifact (the exit number). |
| `eval/README.md` | Operational definition of "supremely good": metrics, gate rules, the `tag→chunk_id` ask. |
| `.github/workflows/eval.yml` | CI: runs retrieval-eval on PRs into main; fails on aggregate regression beyond tolerance. |

---

## Task 1: Metrics math (pure, TDD)

**Files:**
- Create: `eval/lib/metrics.ts`
- Test: `eval/lib/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// eval/lib/metrics.test.ts
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dcgAtK, mrr, ndcgAtK, recallAtK } from "./metrics.ts";

Deno.test("recallAtK counts gold hits in top-k over gold size", () => {
  const ranked = ["a", "b", "c", "d"];
  const gold = new Set(["a", "c"]);
  assertEquals(recallAtK(ranked, gold, 2), 0.5); // top2=[a,b] → {a} hit / 2 gold
  assertEquals(recallAtK(ranked, gold, 4), 1.0); // {a,c} / 2
  assertEquals(recallAtK(ranked, gold, 1), 0.5); // {a} / 2
});

Deno.test("recallAtK returns 0 for empty gold (unanswerable)", () => {
  assertEquals(recallAtK(["a"], new Set<string>(), 10), 0);
});

Deno.test("mrr is reciprocal rank of first gold hit, 0 if none", () => {
  assertEquals(mrr(["a", "b", "c"], new Set(["a"])), 1.0);
  assertAlmostEquals(mrr(["a", "b", "c"], new Set(["c"])), 1 / 3, 1e-9);
  assertEquals(mrr(["a", "b"], new Set(["z"])), 0);
});

Deno.test("ndcgAtK normalizes DCG against the ideal ranking", () => {
  const ranked = ["a", "b"]; // a relevant @1, b not
  const gold = new Set(["a", "c"]); // 2 relevant total
  // DCG@2 = 1/log2(2) = 1 ; IDCG@2 = 1/log2(2)+1/log2(3) = 1 + 0.63093 = 1.63093
  assertAlmostEquals(ndcgAtK(ranked, gold, 2), 1 / 1.6309297535714573, 1e-6);
  // perfect ranking → 1.0
  assertAlmostEquals(ndcgAtK(["a", "c"], gold, 2), 1.0, 1e-9);
});

Deno.test("dcgAtK sums 1/log2(i+2) for gold hits in top-k", () => {
  assertAlmostEquals(dcgAtK(["a", "b"], new Set(["a", "b"]), 2), 1 + 1 / Math.log2(3), 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test eval/lib/metrics.test.ts`
Expected: FAIL — "Module not found" / `metrics.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// eval/lib/metrics.ts
// Pure retrieval metrics over a ranked list of ids vs a gold id set. Binary relevance.

export function recallAtK(ranked: string[], gold: Set<string>, k: number): number {
  if (gold.size === 0) return 0;
  let hits = 0;
  for (const id of ranked.slice(0, k)) if (gold.has(id)) hits++;
  return hits / gold.size;
}

export function dcgAtK(ranked: string[], gold: Set<string>, k: number): number {
  let dcg = 0;
  ranked.slice(0, k).forEach((id, i) => {
    if (gold.has(id)) dcg += 1 / Math.log2(i + 2); // position i+1 (1-indexed)
  });
  return dcg;
}

export function ndcgAtK(ranked: string[], gold: Set<string>, k: number): number {
  const dcg = dcgAtK(ranked, gold, k);
  const ideal = Math.min(gold.size, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export function mrr(ranked: string[], gold: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) if (gold.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

/** Mean of a numeric list; 0 for empty (so aggregates never NaN). */
export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test eval/lib/metrics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add eval/lib/metrics.ts eval/lib/metrics.test.ts
git commit -m "test(eval): pure recall@k/nDCG@k/MRR metrics with unit tests"
```

---

## Task 2: Golden-set schema + seed data

**Files:**
- Create: `eval/golden/schema.ts`
- Create: `eval/golden/golden-set.json`

- [ ] **Step 1: Write the schema + loader**

```ts
// eval/golden/schema.ts
import { z } from "npm:zod";

export const ProviderId = z.object({
  provider: z.enum(["pubmed_oa", "clinicaltrials", "dailymed", "openfda", "rxnorm", "fda_orange_book"]),
  provider_id: z.string().min(1), // PMID | NCT id | SPL set-id
});
export type ProviderId = z.infer<typeof ProviderId>;

export const GoldenItem = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  intent: z.string().min(1), // e.g. drug_overview, side_effects, drug_interaction
  answerability: z.enum(["answerable", "unanswerable"]),
  expected_sources: z.array(ProviderId).default([]),
  notes: z.string().optional(),
  needs_expert_review: z.boolean().default(true),
  openevidence_slice: z.boolean().default(false),
});
export type GoldenItem = z.infer<typeof GoldenItem>;

export const GoldenSet = z.array(GoldenItem);

export async function loadGolden(path = new URL("./golden-set.json", import.meta.url)): Promise<GoldenItem[]> {
  const raw = JSON.parse(await Deno.readTextFile(path));
  return GoldenSet.parse(raw); // fail-fast on malformed gold
}
```

- [ ] **Step 2: Seed the golden set (6 real items now; expansion is a tracked follow-up)**

```json
// eval/golden/golden-set.json
[
  { "id": "sema-sideeffects-001", "question": "What are the most common side effects of semaglutide?", "intent": "side_effects", "answerability": "answerable", "expected_sources": [{ "provider": "openfda", "provider_id": "TODO-SPL-SETID" }], "notes": "Resolve SPL set-id via corpus-census for semaglutide.", "needs_expert_review": true },
  { "id": "metformin-renal-001", "question": "What are the renal contraindications for metformin?", "intent": "drug_overview", "answerability": "answerable", "expected_sources": [{ "provider": "openfda", "provider_id": "TODO-SPL-SETID" }], "needs_expert_review": true },
  { "id": "sertraline-pregnancy-001", "question": "What does the label say about sertraline use in pregnancy?", "intent": "pregnancy_pediatrics", "answerability": "answerable", "expected_sources": [{ "provider": "openfda", "provider_id": "TODO-SPL-SETID" }], "needs_expert_review": true },
  { "id": "atorvastatin-trials-001", "question": "What clinical trials studied atorvastatin for cardiovascular risk?", "intent": "drug_overview", "answerability": "answerable", "expected_sources": [{ "provider": "clinicaltrials", "provider_id": "TODO-NCT" }], "needs_expert_review": true },
  { "id": "lisinopril-interaction-001", "question": "Are there interaction warnings between lisinopril and potassium-sparing diuretics?", "intent": "drug_interaction", "answerability": "answerable", "expected_sources": [{ "provider": "openfda", "provider_id": "TODO-SPL-SETID" }], "needs_expert_review": true },
  { "id": "fabricated-001", "question": "What does the evidence say about the compound florbexamine zorptilium qwxz?", "intent": "drug_overview", "answerability": "unanswerable", "expected_sources": [], "notes": "AC3 sanity: must return zero matches.", "needs_expert_review": false }
]
```

> **Expansion task (do after Task 3's census, before the baseline in Task 5):** replace each `TODO-*` with a real `(provider, provider_id)` confirmed present in the corpus (use `eval/corpus-census.ts` output), and grow to ~40–60 items across the 10 seed drugs (atorvastatin, metformin, semaglutide, isotretinoin, sertraline, omeprazole, amoxicillin, lisinopril, hydroxychloroquine, testosterone), with a tagged `openevidence_slice` subset and several more `unanswerable` items. Items with unresolved `TODO-*` ids are skipped by the harness and reported as "unresolved gold".

- [ ] **Step 3: Verify the schema compiles (smoke)**

Run: `deno check eval/golden/schema.ts`
Expected: no type errors. (The runtime `loadGolden()` is exercised in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add eval/golden/schema.ts eval/golden/golden-set.json
git commit -m "feat(eval): golden-set zod schema + seed items (corpus-relative, provider/provider_id keyed)"
```

---

## Task 3: Corpus + Voyage helpers, and the census

**Files:**
- Create: `eval/lib/voyage.ts`
- Create: `eval/lib/corpus.ts`
- Create: `eval/corpus-census.ts`

- [ ] **Step 1: Voyage query-embedding helper**

```ts
// eval/lib/voyage.ts
const VOYAGE_MODEL = "voyage-3-large";

export async function embedQuery(text: string, apiKey = Deno.env.get("VOYAGE_API_KEY")): Promise<number[]> {
  if (!apiKey) throw new Error("VOYAGE_API_KEY required");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage embed failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return body.data[0].embedding as number[]; // 1024 floats
}
```

- [ ] **Step 2: Corpus/auth helpers**

```ts
// eval/lib/corpus.ts
// Shared auth + corpus resolution for the eval harnesses. Mirrors scripts/phase3-validate.ts.

export interface Env { SB_URL: string; SERVICE_KEY: string; ANON_KEY: string; }

export function readEnv(): Env {
  const SB_URL = Deno.env.get("SB_URL");
  const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
  const ANON_KEY = Deno.env.get("ANON_KEY");
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
    console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
    Deno.exit(2);
  }
  return { SB_URL, SERVICE_KEY, ANON_KEY };
}

export interface TestUser { userId: string; jwt: string; }

export async function mintUser(env: Env): Promise<TestUser> {
  const email = `eval+${crypto.randomUUID().slice(0, 8)}@nemesis.test`;
  const password = crypto.randomUUID();
  const created = await fetch(`${env.SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const userId = created?.id ?? created?.user?.id;
  const jwt = (await fetch(`${env.SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  if (!userId || !jwt) throw new Error("mintUser failed");
  return { userId, jwt };
}

export async function teardownUser(env: Env, userId: string): Promise<void> {
  await fetch(`${env.SB_URL}/rest/v1/generated_answers?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, Prefer: "return=minimal" },
  }).catch(() => {});
  await fetch(`${env.SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}` },
  }).catch(() => {});
}

/** Only for /ask-exercising jobs (answer-eval). Retrieval-eval does NOT need this. */
export async function grantEnterprise(env: Env, userId: string): Promise<void> {
  const res = await fetch(`${env.SB_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, plan: "enterprise", status: "active" }),
  });
  if (!res.ok) throw new Error(`grantEnterprise failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

export interface MatchRow { id: string; source_id: string; similarity: number; provider: string; }

/** Call the live retriever (authenticated). match_count high + threshold 0 = unbiased ranking. */
export async function matchChunks(
  env: Env, jwt: string, embedding: number[], matchCount = 50, matchThreshold = 0,
): Promise<MatchRow[]> {
  const res = await fetch(`${env.SB_URL}/rest/v1/rpc/match_core_source_chunks`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query_embedding: embedding, match_count: matchCount, match_threshold: matchThreshold }),
  });
  if (!res.ok) throw new Error(`match RPC failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return await res.json();
}

/** Resolve gold (provider, provider_id) pairs to corpus source_ids. Unresolved = not in corpus. */
export async function resolveSourceIds(
  env: Env, pairs: Array<{ provider: string; provider_id: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // key `${provider}:${provider_id}` -> source_id
  if (pairs.length === 0) return out;
  const ids = [...new Set(pairs.map((p) => p.provider_id))];
  const inList = ids.map((x) => `"${x.replaceAll('"', '')}"`).join(",");
  const rows = await fetch(
    `${env.SB_URL}/rest/v1/core_sources?select=id,provider,provider_id&provider_id=in.(${inList})`,
    { headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}` } },
  ).then((r) => r.json());
  for (const r of rows as Array<{ id: string; provider: string; provider_id: string }>) {
    out.set(`${r.provider}:${r.provider_id}`, r.id);
  }
  return out;
}
```

- [ ] **Step 3: Corpus census script**

```ts
// eval/corpus-census.ts
// Proves what is retrievable today. Counts embedded chunks per provider (read via service key).
import { readEnv } from "./lib/corpus.ts";

const env = readEnv();
// Embedded chunk count grouped by provider — uses a PostgREST count over the join-free chunk table.
const providers = ["openfda", "dailymed", "pubmed_oa", "clinicaltrials", "rxnorm", "fda_orange_book"];
const census: Record<string, number> = {};
for (const p of providers) {
  // count core_sources for the provider that have >=1 embedded chunk is non-trivial via REST;
  // approximate corpus presence by counting core_sources rows per provider (durable + cheap).
  const res = await fetch(
    `${env.SB_URL}/rest/v1/core_sources?select=id&provider=eq.${p}&superseded_at=is.null`,
    { headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, Prefer: "count=exact", Range: "0-0" } },
  );
  const range = res.headers.get("content-range") ?? "*/0"; // e.g. "0-0/4192"
  census[p] = Number(range.split("/")[1] ?? 0);
}
console.log(JSON.stringify({ generated_for: env.SB_URL, sources_by_provider: census }, null, 2));
```

- [ ] **Step 4: Run the census against the live corpus**

Run: `SB_URL=... SERVICE_KEY=... ANON_KEY=... deno run --allow-net --allow-env eval/corpus-census.ts`
Expected: JSON with non-zero counts per provider (proves baselining is possible). Use these to fill the `TODO-*` ids in `golden-set.json`.

- [ ] **Step 5: Commit**

```bash
git add eval/lib/voyage.ts eval/lib/corpus.ts eval/corpus-census.ts
git commit -m "feat(eval): voyage query embed + corpus/auth helpers + corpus census"
```

---

## Task 4: Retrieval harness

**Files:**
- Create: `eval/retrieval-eval.ts`

- [ ] **Step 1: Implement the harness**

```ts
// eval/retrieval-eval.ts
// Deterministic retrieval-quality scorecard. No LLM, no quota. Writes the baseline artifact.
import { loadGolden } from "./golden/schema.ts";
import { embedQuery } from "./lib/voyage.ts";
import { matchChunks, mintUser, readEnv, resolveSourceIds, teardownUser } from "./lib/corpus.ts";
import { mean, mrr, ndcgAtK, recallAtK } from "./lib/metrics.ts";

const env = readEnv();
const K_RECALL = [5, 10, 20];
const NDCG_K = 10;
const MATCH_COUNT = 50;

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
}

const golden = await loadGolden();
const answerable = golden.filter((g) => g.answerability === "answerable");
const unanswerable = golden.filter((g) => g.answerability === "unanswerable");

const user = await mintUser(env);
const perItem: Array<Record<string, unknown>> = [];
let unresolvedGold = 0;

try {
  for (const item of answerable) {
    const goldMap = await resolveSourceIds(env, item.expected_sources);
    const goldIds = new Set([...goldMap.values()]);
    if (item.expected_sources.length > 0 && goldIds.size === 0) { unresolvedGold++; continue; } // TODO ids not in corpus
    const emb = await embedQuery(item.question);
    const rows = await matchChunks(env, user.jwt, emb, MATCH_COUNT, 0);
    const rankedSources = dedupePreserveOrder(rows.map((r) => r.source_id));
    const rec = Object.fromEntries(K_RECALL.map((k) => [`recall@${k}`, recallAtK(rankedSources, goldIds, k)]));
    perItem.push({ id: item.id, gold: goldIds.size, ...rec, [`ndcg@${NDCG_K}`]: ndcgAtK(rankedSources, goldIds, NDCG_K), mrr: mrr(rankedSources, goldIds) });
  }

  // AC3 sanity: unanswerable probes must return zero rows at the live ASK threshold (0.5).
  let unanswerableClean = 0;
  for (const item of unanswerable) {
    const emb = await embedQuery(item.question);
    const rows = await matchChunks(env, user.jwt, emb, MATCH_COUNT, 0.5);
    if (rows.length === 0) unanswerableClean++;
  }

  const agg: Record<string, number> = {};
  for (const k of K_RECALL) agg[`recall@${k}`] = mean(perItem.map((p) => p[`recall@${k}`] as number));
  agg[`ndcg@${NDCG_K}`] = mean(perItem.map((p) => p[`ndcg@${NDCG_K}`] as number));
  agg["mrr"] = mean(perItem.map((p) => p["mrr"] as number));

  const report = {
    generated_for: env.SB_URL,
    golden_total: golden.length,
    answerable_scored: perItem.length,
    unresolved_gold: unresolvedGold,
    unanswerable_total: unanswerable.length,
    unanswerable_clean: unanswerableClean, // should equal unanswerable_total (AC3)
    aggregate: agg,
    per_item: perItem,
  };
  console.log(JSON.stringify(report, null, 2));
  if (Deno.args.includes("--write-baseline")) {
    await Deno.writeTextFile(new URL("./baselines/2026-06-08-retrieval-baseline.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
    console.error("baseline written");
  }
} finally {
  await teardownUser(env, user.userId);
}
```

- [ ] **Step 2: Dry-run against the live corpus (no baseline write)**

Run: `SB_URL=... SERVICE_KEY=... ANON_KEY=... VOYAGE_API_KEY=... deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts`
Expected: a JSON report; `unanswerable_clean === unanswerable_total` (AC3 holds); answerable items with resolved gold show non-zero `recall@10` once the golden `TODO-*` ids are filled. (`--allow-read`: the harness reads `golden-set.json`.)

- [ ] **Step 3: Commit**

```bash
git add eval/retrieval-eval.ts
git commit -m "feat(eval): deterministic retrieval harness (recall@k/nDCG/MRR + AC3 sanity)"
```

---

## Task 5: Resolve golden ids + write the committed baseline

**Files:**
- Modify: `eval/golden/golden-set.json` (fill `TODO-*` + expand toward 40–60 items)
- Create: `eval/baselines/2026-06-08-retrieval-baseline.json`

- [ ] **Step 1:** Run `eval/corpus-census.ts` and, for each seed drug, query `GET {SB_URL}/rest/v1/core_sources?select=provider,provider_id,title&title=ilike.*<drug>*` (service key) to find real `(provider, provider_id)` ids; replace every `TODO-*` in `golden-set.json`. Add items until ~40–60, tag an `openevidence_slice`, add ≥3 more `unanswerable`.
- [ ] **Step 2:** Re-run the harness writing the baseline: `... deno run --allow-net --allow-env --allow-read --allow-write eval/retrieval-eval.ts --write-baseline`. Expected: `eval/baselines/2026-06-08-retrieval-baseline.json` written with non-null aggregate metrics and `unanswerable_clean === unanswerable_total`. (`--allow-write`: writes the baseline artifact.)
- [ ] **Step 3: Commit**

```bash
git add eval/golden/golden-set.json eval/baselines/2026-06-08-retrieval-baseline.json
git commit -m "feat(eval): resolved corpus-relative golden set + committed P0 retrieval baseline"
```

---

## Task 6: CI gate (`eval.yml`)

**Files:**
- Create: `.github/workflows/eval.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/eval.yml
# Quality gate (complements guardrail.yml, the safety gate). Retrieval-eval is cheap +
# deterministic (no LLM, no /ask quota), so it runs on PRs into main and fails if
# aggregate retrieval metrics regress below the committed baseline minus a tolerance band.
name: eval
on:
  pull_request:
    branches: [main]
  workflow_dispatch: {}
concurrency:
  group: eval-${{ github.ref }}
  cancel-in-progress: true
jobs:
  retrieval-eval:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # Skip fork PRs (no secrets → would exit for a config reason, not a regression).
    if: github.event_name == 'workflow_dispatch' || github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Metric math unit tests
        run: deno test eval/lib/metrics.test.ts
      - name: Retrieval eval vs committed baseline
        env:
          SB_URL: ${{ secrets.SB_URL }}
          SERVICE_KEY: ${{ secrets.SERVICE_KEY }}
          ANON_KEY: ${{ secrets.ANON_KEY }}
          VOYAGE_API_KEY: ${{ secrets.VOYAGE_API_KEY }}
        run: deno run --allow-net --allow-env --allow-read --allow-run eval/ci-gate.ts
```

- [ ] **Step 2: Write the gate comparator** `eval/ci-gate.ts`

```ts
// eval/ci-gate.ts — run the harness, compare aggregate to the committed baseline with a tolerance band.
const TOLERANCE = 0.03; // absolute; aggregate may not drop more than this vs baseline
const baseline = JSON.parse(await Deno.readTextFile(new URL("./baselines/2026-06-08-retrieval-baseline.json", import.meta.url)));
const cmd = new Deno.Command("deno", { args: ["run", "--allow-net", "--allow-env", "--allow-read", "eval/retrieval-eval.ts"], stdout: "piped" });
const { stdout } = await cmd.output();
const current = JSON.parse(new TextDecoder().decode(stdout));
let failed = false;
for (const key of Object.keys(baseline.aggregate)) {
  const base = baseline.aggregate[key] as number;
  const now = current.aggregate[key] as number ?? 0;
  const ok = now >= base - TOLERANCE;
  console.log(`${ok ? "✓" : "✗"} ${key}: baseline=${base.toFixed(4)} now=${now.toFixed(4)} (tol ${TOLERANCE})`);
  if (!ok) failed = true;
}
if (current.unanswerable_clean !== current.unanswerable_total) { console.log("✗ AC3: unanswerable probes returned matches"); failed = true; }
Deno.exit(failed ? 1 : 0);
```

- [ ] **Step 3:** Add CI secrets if missing: GitHub → Settings → Secrets and variables → Actions → `SB_URL`, `SERVICE_KEY`, `ANON_KEY`, `VOYAGE_API_KEY`. (`SERVICE_KEY`/`ANON_KEY` already exist for guardrail.yml; add `SB_URL` + `VOYAGE_API_KEY`.)
- [ ] **Step 4: Commit**

```bash
git add .github/workflows/eval.yml eval/ci-gate.ts
git commit -m "ci(eval): retrieval-quality gate vs committed baseline (no LLM, no quota false-fail)"
```

---

## Task 7: `eval/README.md` + answer-eval scaffold

**Files:**
- Create: `eval/README.md`
- Create: `eval/answer-eval.ts` (scaffold; NOT a gate in PR0)

- [ ] **Step 1:** Write `eval/README.md` defining: each metric + formula; the gate rule (no aggregate regression beyond `TOLERANCE` vs the committed baseline; absolute floors set at PR1); corpus-relative vs coverage distinction; the LLM-judge anti-flake rules (temperature 0, pinned model+prompt, aggregate-with-margin); the OpenEvidence-offline policy; and the **`tag→chunk_id` interface ASK to the Answer Engine** (blocks strict per-citation faithfulness in P2).
- [ ] **Step 2:** Write `eval/answer-eval.ts` as a documented scaffold: it mints a user, calls `grantEnterprise`, POSTs golden Qs to `/ask` with 2s pacing, and has a TODO for the temperature-0 LLM-judge groundedness/relevance scoring (pending model choice) + a TODO for strict per-citation faithfulness (pending the `tag→chunk_id` map). Not wired into `eval.yml`.
- [ ] **Step 3: Commit**

```bash
git add eval/README.md eval/answer-eval.ts
git commit -m "docs(eval): operational 'supremely good' definition + answer-judge scaffold"
```

---

## Acceptance (PR0 exit)
From a clean checkout with `SB_URL`/`SERVICE_KEY`/`ANON_KEY`/`VOYAGE_API_KEY` set:
1. `deno test eval/lib/metrics.test.ts` passes (metric math verified).
2. `deno run --allow-net --allow-env eval/corpus-census.ts` prints non-zero source counts per provider (baselining is possible).
3. `deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts` completes against the live `match_core_source_chunks` as an authenticated user, tears down its user, and reports `unanswerable_clean === unanswerable_total` (AC3 holds).
4. The answerable golden slice (with resolved ids) shows `recall@10 > 0`; the committed baseline JSON exists with non-null aggregates.
5. `eval.yml` runs green on a PR with **no `429` quota false-fail** (retrieval-only → no `/ask`, no grant needed).
6. Re-running the harness on the same engine + golden set reproduces the baseline within `TOLERANCE` (determinism).

**This baseline number is the P0 exit. The Skeptic re-runs this harness on every later-phase PR and blocks merge on aggregate regression beyond tolerance.**

---

## ROADMAP (later PRs — scope only; expand into their own plans when reached)
- **PR1 — ivfflat→HNSW (Librarian).** One timestamped migration: drop ivfflat, `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`; `CREATE OR REPLACE match_core_source_chunks` adding tunable `hnsw.ef_search`, body/signature otherwise identical; **re-`REVOKE EXECUTE ... FROM anon, PUBLIC` + re-`GRANT authenticated, service_role` in the same file** (drop/recreate re-triggers Supabase's anon default-grant). Acceptance: retrieval-eval ≥ baseline; guardrail green; anon RPC denied. ⚠️ Cloud schema deploy → needs explicit owner ask + `supabase db push`.
- **PR2 — hybrid + rerank (Answer Engine).** Add STORED `tsvector` + GIN on `core_source_chunks.content`; new `hybrid_match_core_source_chunks` RPC fusing dense ANN + FTS via in-SQL RRF (k=60), returning per-row dense `similarity` so the **dense-cosine no-source refusal is preserved (AC3 by construction)**; Voyage rerank-2 over fused top-K behind `RERANK_ENABLED`. Decide FTS config (`simple` vs `english` vs hybrid) via a recall experiment on the golden set. ⚠️ Edge-fn deploy `--use-api` → needs ask.
- **P2 faithfulness.** Persist the `{tag→chunk_id}` map (Answer Engine), then extend `enforceCitations` from existence-check to NLI support-check (can only drop/refuse). Wire the answer-eval faithfulness gate.
- **P3.** Agentic loop (router + tools: `vector_search`, `pubmed_search` E-utilities, `clinicaltrials_search` CT v2, `get_entity_evidence`, `rerank`) + corrective/self-RAG + conversation-aware retrieval (existing `conversation_messages`) + streaming (Vercel AI SDK). Safety wrapper stays deterministic and outside the loop.
- **P4 scale ingest.** PMC-OA full-text bulk (AWS Open Data) → durable `ingest_jobs`/`ingest_items` host-runner → embed (halfvec quantization + lite-vs-large tiering) → HNSW; then PubMed baseline + daily updates; content-hash dedup/supersession extends `persist.ts`. ⚠️ Verify `pg_available_extensions` for pgvectorscale; if absent, HNSW + halfvec + partitioning.
- **P5 projects.** `projects` table (user-owned) + nullable `project_id` FK on `conversations`/`saved_reports`/`research_report_runs`/`watchlist_items` + owner-only RLS + `project_count` entitlement (BEFORE INSERT trigger mirroring `enforce_watchlist_limit`).

## OPEN DECISIONS (owner)
- Scale infra: HNSW + halfvec + partitioning on Supabase (recommended) vs pgvectorscale (verify availability / self-host).
- FTS config for PR2: `simple` vs `english` vs hybrid (lean hybrid).
- Golden-set authorship bar: harness-drafts + "needs expert review"; OE slice expert-reviewed first.
- Judge model + absolute metric floors (set at PR1).
- `project_count` per plan (free/plus/pro/professional/enterprise).

## PENDING (not part of PR0, carried from the status review)
- **Bank PR #25 or hold?** It's green/CLEAN (shadcn frontend + Sentry + conversations + zod). Held pending owner word.
- **Stripe** — owner runs `/mcp` → "claude.ai Stripe" to authorize the live dashboard check.
- **Held PR #24** (mobile rebrand slice 1) until later mobile slices.
- Cloud schema/edge deploys (PR1/PR2) each need a fresh explicit owner ask (per `pharmabro-cloud-writes-via-test-channel`).
