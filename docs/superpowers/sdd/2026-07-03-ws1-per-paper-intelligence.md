# WS-1 — Per-paper evidence intelligence (implementation blueprint)

Date: 2026-07-03
Status: BLUEPRINT (no source edited)
Owner-gated: deploy of `enrich-source` + web ship both need an explicit ask.

## Goal (Consensus-style per-paper detail)

For each cited source, surface two additive, DETERMINISTIC signals in the UI:

- **(a) Journal-quality tier + citation count** — a Q1–Q4-style tier computed from
  free OpenAlex venue metrics + DOAJ, plus the paper's `cited_by_count`. No LLM, no
  paid SJR license.
- **(b) Verbatim "supporting quote" span** — the actual source sentence that backs
  the claim, from the existing `support-span.ts` logic. Never an LLM paraphrase.

It must be **additive** and must **not change the `/ask` answer text** when the WS-1
flag is off.

---

## 0. Baseline and where the code actually lives (READ THIS FIRST)

> **This blueprint's baseline is `main` (post PR #87 "evidence trust layer" + PR #88
> "retrieval depth"), NOT the current working branch `feat/chatgpt-ui-parity`.**

Verified with `git ls-tree`:

- `supabase/functions/enrich-source/` exists on `main` but **does NOT exist on
  `feat/chatgpt-ui-parity`** (`main` is not an ancestor of HEAD).
- The `EvidencePanel.tsx` on the current branch has **no** `useEnrichment` /
  `cited_by` / `retracted` wiring.

**Slice 0 (prerequisite):** WS-1 branches from `main` (e.g. `git checkout -b
feat/ws1-per-paper-intelligence main`). All real paths below are relative to that
tree:

- `supabase/functions/enrich-source/index.ts`
- `supabase/functions/enrich-source/providers.ts`
- `supabase/functions/enrich-source/cache.ts`
- `supabase/functions/enrich-source/snapshot.ts`
- `apps/web/lib/enrichment.ts`

The copies I read during research were under `.claude/worktrees/evidence-trust-layer/…`
and `.claude/worktrees/retrieval-depth/…` — **do not reference worktree paths in the
implementation**; they are read-only mirrors of the merged branches.

### Reuse vs net-new (the honest framing)

| WS-1 piece | State today | Net-new work |
|---|---|---|
| (b) verbatim supporting quote | **Already computed.** `attachSupport` runs at `ask/index.ts:420`, unconditionally, and every `AnswerPoint.support[]` carries `{citation_tag, quote}`. `EvidencePanel` already renders the *active* one via `activeQuote`. | Render the quote **per-paper** (not just the active claim): thread the paper's own supporting quote onto the source card. Pure client wiring. |
| (a) citation count | **Already fetched.** `SourceEnrichment.cited_by` (from `cited_by_count`) is returned today by `enrich-source/providers.ts`. | Render it on the card (it's fetched but not shown per-paper as a first-class badge). |
| (a) journal-quality tier | **Does not exist.** `parseOpenAlexWork` selects only `ids,is_retracted,cited_by_count`. | **The genuine build:** a deterministic Q1–Q4 tier from OpenAlex venue metrics + DOAJ, computed in the `enrich-source` side channel, rendered as a badge. |

So the risky/novel surface is small: one pure tier function + one extra OpenAlex call
in the side channel + display wiring. The `/ask` answer path is **not touched**.

---

## 1. Exact current signatures / shapes to extend (quoted real code)

### 1a. `enrich-source/providers.ts` — the side-channel enrichment (main)

```ts
export interface SourceEnrichment {
  doi: string | null;
  retracted: boolean;
  cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

export interface EnrichmentBase extends Omit<SourceEnrichment, "snapshot"> {
  fetched: boolean;
}

export function parseOpenAlexWork(json: unknown): { doi: string | null; retracted: boolean; cited_by: number | null } {
  const w = (json ?? {}) as Record<string, unknown>;
  const ids = (w.ids ?? {}) as Record<string, unknown>;
  return {
    doi: normalizeDoi(typeof ids.doi === "string" ? ids.doi : null),
    retracted: w.is_retracted === true,
    cited_by: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
  };
}

export async function fetchEnrichmentBase(pmid: string): Promise<EnrichmentBase> {
  const openAlex = await getJson(
    `https://api.openalex.org/works/pmid:${pmid}?mailto=${OPENALEX_MAILTO}&select=ids,is_retracted,cited_by_count`,
  );
  const work = parseOpenAlexWork(openAlex.json);
  const tallies = work.doi
    ? parseSciteTallies((await getJson(`https://api.scite.ai/tallies/${encodeURIComponent(work.doi)}`)).json)
    : null;
  return { ...work, tallies, fetched: openAlex.ok };
}
```

`getJson(url): Promise<FetchOutcome>` (`{ ok: boolean; json: unknown }`) is the
best-effort fetch helper — reuse it verbatim for the new `/sources` call.

### 1b. `packages/shared/src/answer.ts` — the wire types

The `Citation` interface (the `citations[]` entry the panel renders) is the additive
surface. It **already** carries the pattern for optional, degrade-gracefully signals
(`doaj_vetted`, `support_level`, `evidence_role`, `study_type`, `publication_types`,
`oa_url`). WS-1 adds two optional fields alongside these (Section 2).

`ClaimSupport` (the verbatim quote) already exists:

```ts
export interface ClaimSupport {
  citation_tag: string;
  quote: string; // Verbatim supporting sentence from that source.
}

export interface AnswerPoint {
  text: string;
  citation_ids: string[];
  support?: ClaimSupport[]; // set by attachSupport(); verbatim source provenance
}
```

### 1c. `support-span.ts` — the verbatim-quote engine (already wired)

```ts
export function bestSupportingSpan(claim: string, sourceText: string): SupportSpan | null;
// SupportSpan = { quote, start, end, score }; quote === sourceText.slice(start, end)

export function attachSupport(
  sections: AnswerSections,
  chunks: ReadonlyArray<Pick<RetrievedChunk, "tag" | "chunk_text">>,
): AnswerSections;
```

Called at `ask/index.ts:420`. Deterministic, pure, `MIN_SCORE = 0.34`, verbatim
substring. **This is the source of the "supporting quote" — no new logic needed.**

### 1d. `evidence-scoring.ts` — the pattern to MIRROR (not extend)

`scoreSignals(raw) -> { tier, signals }` is per-ENTITY aggregate grading. WS-1 does
NOT touch it. It is the **template** for the new per-PAPER pure function: a documented
signal table, conservative defaults, a pure tier ladder, unit-tested with `Deno.test`
+ `assertEquals` in `evidence-scoring.test.ts`.

### 1e. `study-type.ts` / `citation-meta.ts` — already-shipped per-paper signals

`studyTypeLabel(c)` and `citationMeta(c)` already stamp per-paper study-type + DOAJ
onto each `Citation` (via `ask/citation.ts:57` `citationMeta`). WS-1's tier badge sits
next to the existing `study-type-pill` / `doaj-pill` in `EvidencePanel.tsx:143-150`.

---

## 2. The new per-paper signal TYPE

New file: **`packages/shared/src/paper-quality.ts`** (pure, no I/O, no LLM —
same discipline as `evidence-scoring.ts`).

```ts
/** Deterministic journal-quality tier for one PAPER's venue.
 *  Q1 = top quartile by OpenAlex 2-year mean citedness, Q4 = bottom, unranked = no
 *  venue metric available (NEVER guessed). Positive-only OA/DOAJ modifiers can only
 *  confirm quality, never downgrade — mirrors the DOAJ positive-only doctrine. */
export type JournalTier = "q1" | "q2" | "q3" | "q4" | "unranked";

/** Raw venue signals read straight off OpenAlex `/sources` + `/works` (no derivation).
 *  Every field optional/nullable — the API is sparse and the tier degrades to
 *  "unranked" when the metric is absent (conservative default). */
export interface PaperQualityInputs {
  /** OpenAlex source summary_stats["2yr_mean_citedness"] — the impact metric we bucket on. */
  mean_citedness_2yr: number | null;
  /** OpenAlex source summary_stats.h_index — tie-break / sanity floor only. */
  h_index: number | null;
  /** OpenAlex source.is_in_doaj — vetted, anti-predatory OA journal (positive-only). */
  is_in_doaj: boolean;
  /** OpenAlex source.is_oa / work.open_access.is_oa — open access (informational). */
  is_oa: boolean;
}

/** The per-paper signal object the wire carries (all additive, all optional on Citation). */
export interface PaperQuality {
  tier: JournalTier;
  /** The venue's 2yr mean citedness the tier was bucketed from, for transparency. */
  mean_citedness_2yr: number | null;
  is_in_doaj: boolean;
  is_oa: boolean;
}

export function journalTier(i: PaperQualityInputs): JournalTier;      // pure ladder
export function computePaperQuality(i: PaperQualityInputs): PaperQuality; // wrapper
```

### Additive fields on `Citation` (`packages/shared/src/answer.ts`)

```ts
export interface Citation {
  // …existing…
  /** Deterministic journal-quality tier from OpenAlex venue metrics (WS-1). Absent
   *  on non-paper sources (labels/trials), on older saved chats, and when no venue
   *  metric was available. Positive-only: absence never means "low quality". */
  journal_tier?: JournalTier;
  /** The paper's OpenAlex cited_by_count at enrichment time (WS-1). Absent for
   *  non-paper sources and older saved chats. */
  cited_by_count?: number;
  /** The verbatim supporting sentence for THIS paper (WS-1 per-paper render). Absent
   *  when no span cleared support-span.ts's threshold. Verbatim source text, never
   *  LLM prose. Optional so the /ask trace and older chats are unchanged. */
  support_quote?: string;
}
```

> **Decision:** `journal_tier` / `cited_by_count` are populated **client-side** from
> the `enrich-source` response (they are PMID-keyed and arrive after render), so they
> are NOT written by `/ask` and NOT stored in the `/ask` trace. `support_quote` is
> derived client-side from the `answer_sections[].support[]` already in the response
> (Section 4). This keeps `/ask` byte-identical by construction.

`enrich-source`'s `SourceEnrichment` gains the same two venue fields so the client can
read them:

```ts
export interface SourceEnrichment {
  // …existing…
  journal_tier: JournalTier;      // "unranked" when no venue metric
  cited_by: number | null;        // already present — this IS the citation count
  mean_citedness_2yr: number | null;
  is_in_doaj: boolean;
}
```

---

## 3. OpenAlex enrichment plug-in point + the deterministic tier rule

### Where it plugs in

`enrich-source/providers.ts` → `fetchEnrichmentBase(pmid)`. Function to COPY: the
existing `getJson()` best-effort fetch. Pattern: read venue metrics off OpenAlex,
degrade to nulls on any failure, feed into `journalTier()`.

**Verified API facts (checked live against `api.openalex.org` on 2026-07-03):**

1. The `/works` response's `primary_location.source` carries `id`, `issn_l`, `issn`,
   `is_oa`, **`is_in_doaj`** — but **NOT `summary_stats`** (no impact metric).
2. The impact metric lives on the **`/sources/{id}` object**:
   `summary_stats["2yr_mean_citedness"]`, `summary_stats.h_index`,
   `summary_stats.i10_index`, plus top-level `is_in_doaj`, `is_oa`.
3. Therefore the tier needs a **second OpenAlex call** keyed by the source id.

**Two-step fetch (both free, key-less, polite pool via `mailto`):**

```
Step 1 (extend existing /works select):
  GET /works/pmid:{pmid}?select=ids,is_retracted,cited_by_count,primary_location
  → read primary_location.source.id (e.g. "https://openalex.org/S...")
    and primary_location.source.is_in_doaj / is_oa

Step 2 (new, only when a source id is present):
  GET /sources/{sourceId}?select=summary_stats,is_in_doaj,is_oa
  → summary_stats["2yr_mean_citedness"], h_index
```

Both use the existing `getJson()`; a failure of step 2 degrades `journal_tier` to
`"unranked"` and does NOT poison `fetched` (same best-effort discipline as `tallies`).
Sequential resolution already holds (scite rate-limit note in `index.ts`), so the
extra call adds one HTTP round-trip per cache-miss PMID — cached for `TTL_DAYS = 30`.

> Rate-limit note: OpenAlex polite pool is generous, but this doubles OpenAlex calls
> per miss. Mitigation already in place: 30-day cache + `MAX_BATCH = 24` +
> `ENRICH_DAILY_BATCH_CAP = 150`. No extra guard needed.

### The deterministic tier-mapping rule (documented, no SJR license)

`journalTier()` buckets `2yr_mean_citedness` into quartile-style bands. OpenAlex
publishes no ready-made quartile, so we bucket on the raw impact metric with fixed,
documented thresholds (a transparent proxy for SJR quartiles, NOT SJR):

```
mean_citedness_2yr >= 8.0  → q1   (top-impact venues, e.g. NEJM/Lancet-class)
mean_citedness_2yr >= 3.0  → q2
mean_citedness_2yr >= 1.0  → q3
mean_citedness_2yr >  0.0  → q4
mean_citedness_2yr == 0 or null → unranked   (conservative default; no false tier)
```

- Thresholds are **constants documented in the file** (`Q1_CITEDNESS = 8.0`, etc.),
  the same "documented, not magic" discipline as `ADEQUATE_ENROLLMENT = 100`.
- `is_in_doaj` and `is_oa` are **positive-only modifiers**: they may render an
  extra "Vetted OA" affordance but MUST NOT raise or lower the citedness tier. A
  low-citedness DOAJ journal stays its citedness tier + shows the OA badge (the DOAJ
  positive-only doctrine from `doaj-registry.ts`). Encode this by NOT letting DOAJ
  touch the ladder — it flows through `PaperQuality.is_in_doaj` for display only.
- `h_index` is carried for future tie-breaking / a sanity floor but is NOT in the
  v1 ladder (keep the rule single-signal + auditable; add later if needed).
- **Calibration TODO before ship:** the 8/3/1 thresholds are a defensible first cut;
  pull the distribution of `2yr_mean_citedness` across ~50 real pharma-journal
  sources and confirm the bands land roughly quartile-shaped. Document the sample in
  the PR. (Thresholds live in one constant block so recalibration is a 4-line diff.)

---

## 4. Verbatim supporting-quote span → threaded per-paper

**No engine change.** The quote already exists in the response:
`answer_sections.{what_we_know,what_we_do_not_know,safety_notes}[].support[] =
{ citation_tag, quote }`, produced by `attachSupport` (`support-span.ts`) at
`ask/index.ts:420`, from `bestSupportingSpan()` (verbatim substring, `MIN_SCORE 0.34`).

Today `EvidencePanel` only shows the quote for the **clicked** claim (`activeQuote`).
WS-1 renders each paper's OWN supporting quote on its card even when not clicked.

**Client derivation (pure, in the web layer — e.g. a small helper in
`apps/web/lib/cite.ts` or inline in the panel):**

```ts
// Build tag -> first verbatim support quote across all answer sections.
function supportQuotesByTag(sections: AnswerSections): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of [...sections.what_we_know, ...sections.what_we_do_not_know, ...sections.safety_notes]) {
    for (const s of p.support ?? []) {
      if (!m.has(s.citation_tag) && s.quote.trim()) m.set(s.citation_tag, s.quote);
    }
  }
  return m;
}
```

Then in the panel: `const support_quote = quotesByTag.get(normTag(c.chunk_tag))` and
render it in the existing `<blockquote className="src-support">` block (currently
gated on `active`), now shown whenever a paper has a quote — behind the WS-1 flag
(Section 5) so the feature-off render is byte-identical to today.

> **Why client-side, not a new `Citation.support_quote` on the wire:** the data is
> ALREADY in `answer_sections`; adding a server field would touch the `/ask` assembly
> and the trace. Deriving it client-side keeps `/ask` untouched. (If a later slice
> wants it on the wire for exports, add `support_quote?` in `chunkToCitation` — but
> that is out of WS-1's byte-identity-critical scope.)

---

## 5. Flag / env mechanism + proof-of-no-op-when-off

### Confirmed existing pattern

`ask/index.ts:98`:

```ts
const LIVE_SOURCES_ON = Deno.env.get("LIVE_SOURCES") === "on";
```

`Deno.env.get("<FLAG>") === "on"` is THE repo convention. Reuse it.

### WS-1 flag

- **Server (`enrich-source`):** `const WS1_JOURNAL_TIER_ON = Deno.env.get("WS1_PER_PAPER") === "on";`
  When off, skip the `/sources` step-2 call entirely and return
  `journal_tier: "unranked"`, `mean_citedness_2yr: null`, `is_in_doaj: false`. The
  existing `cited_by` continues to be returned (it's not new). This makes the added
  OpenAlex call zero-cost when off.
- **Client (web):** a public build flag `NEXT_PUBLIC_WS1_PER_PAPER === "on"` gates
  the new per-card render (journal-tier pill + per-paper quote block). When off,
  `EvidencePanel` renders exactly as today (active-only quote, no tier pill).

### Proof of no-op when off

1. **`/ask` byte-identity — by construction, no flag even needed on `/ask`.** WS-1
   adds nothing to `ask/index.ts`. The journal tier is computed in `enrich-source`
   (a separate function, invoked client-side AFTER the answer renders). Prove it with
   `scripts/guardrail-suite.ts`: it already asserts `answer_sections` shape/stability
   across the base/fast/thorough registers. Run it before and after — identical.
   Add one assertion: the `AskResponse` carries no new field (no `journal_tier` /
   `support_quote` at the response root; those live in `answer_sections[].support`
   which is unchanged).
2. **`enrich-source` off = old payload.** A unit test asserts that with
   `WS1_PER_PAPER` unset, `resolveMiss(pmid)` returns a `SourceEnrichment` whose
   `journal_tier === "unranked"` and no `/sources` call was made (mock/spy `getJson`).
3. **Web off = old DOM.** With `NEXT_PUBLIC_WS1_PER_PAPER` unset, `EvidencePanel`
   produces the same card markup as `main` today (snapshot / render assertion; the
   new `<blockquote>` only renders on `active` as before).

---

## 6. File-by-file change list + slice order

### Slice A — deterministic backend core + tests (the IP; no UI)

| File | Change |
|---|---|
| `packages/shared/src/paper-quality.ts` | **NEW.** `JournalTier`, `PaperQualityInputs`, `PaperQuality`, `journalTier()`, `computePaperQuality()`. Pure. Documented thresholds. |
| `packages/shared/src/paper-quality.test.ts` | **NEW.** Tier buckets + conservative defaults (Section 7). |
| `packages/shared/src/index.ts` | Add `export * from "./paper-quality.ts";` (barrel — mirrors line 19/42/60). |
| `packages/shared/src/answer.ts` | Add optional `journal_tier?`, `cited_by_count?`, `support_quote?` to `Citation`. Import `JournalTier`. Additive only. |
| `supabase/functions/enrich-source/providers.ts` | Extend `/works` `select` to include `primary_location`; add step-2 `/sources/{id}` fetch (via existing `getJson`); add `parseOpenAlexSource(json)` (pure) → feed `journalTier()`; extend `SourceEnrichment` + `fetchEnrichmentBase` with `journal_tier` / `mean_citedness_2yr` / `is_in_doaj`. Gate the step-2 call on `WS1_PER_PAPER`. |
| `supabase/functions/enrich-source/providers.test.ts` | Add `parseOpenAlexSource` unit tests + a "flag off = unranked, no step-2" test. |

### Slice B — UI badges + per-paper quotes (display only)

| File | Change |
|---|---|
| `apps/web/lib/enrichment.ts` | Extend `SourceEnrichment` type mirror with `journal_tier` / `mean_citedness_2yr` / `is_in_doaj` (client copy of the wire type). |
| `apps/web/components/EvidencePanel.tsx` | (1) Compute `supportQuotesByTag(sections)` and render each paper's own quote (flag-gated). (2) Render a `journal-tier-pill` (Q1–Q4) + a `cited-by` count badge from the enrichment map, next to the existing study-type / DOAJ pills (lines 143-150). All behind `NEXT_PUBLIC_WS1_PER_PAPER`. |
| `apps/web/app/globals.css` (or `shell.css`) | Add `.journal-tier-pill.q1..q4` + `.cited-by` styles next to `.study-type-pill` / `.doaj-pill`. |
| Panel caller (the component that passes `citations` + `activeQuote` into `EvidencePanel`) | Pass `answer_sections` (or the derived `quotesByTag`) down so per-paper quotes are available. Verify the prop wiring. |

### Slice C — quality tier used by filters (DISPLAY-ONLY)

| File | Change |
|---|---|
| `apps/web/components/EvidencePanel.tsx` | Add a client-side "min journal tier" filter control that hides/dims cards below a chosen tier. **DISPLAY-ONLY** — it filters the RENDERED list; it never re-requests, re-ranks, or changes which sources the answer cited. |

> **HARD RULE (write in the PR description too):** the journal tier must **NEVER**
> enter `retrieve.ts`, `rerank.ts`, `balanceCitedSlice`, `enforceCitations`, or the
> `evidence_grade` ceiling. Memory (`retrieval-depth-built`) warns a shifted pool
> shifts the cited set → the answer text moves → byte-identity is gone. Slice C is a
> view filter, full stop.

Suggested order: **A → B → C.** A is independently shippable + fully unit-tested
before any pixel changes. B and C are behind the web flag.

---

## 7. Test pattern to follow + new tests per slice

**Pattern (Deno, `assertEquals`):** `packages/shared/src/study-type.test.ts` and
`packages/shared/src/evidence-scoring.test.ts` — `import { assertEquals } from
"https://deno.land/std@0.224.0/assert/mod.ts"` + one `Deno.test(name, () => { … })`
per behavior. Edge-function tests follow
`supabase/functions/ask/source-support.test.ts` /
`supabase/functions/enrich-source/providers.test.ts`.

### Slice A tests (`paper-quality.test.ts`)
- Each band boundary: `8.0 → q1`, `7.99 → q2`, `3.0 → q2`, `1.0 → q3`, `0.5 → q4`,
  `0 → unranked`, `null → unranked` (conservative default — the `deriveSignals`
  discipline).
- DOAJ / is_oa do NOT change the tier (positive-only): a `mean_citedness_2yr = 0.5,
  is_in_doaj = true` still returns tier `q4`, `is_in_doaj: true`.
- `computePaperQuality` passes through `mean_citedness_2yr` / `is_in_doaj` / `is_oa`
  verbatim.

### Slice A tests (`providers.test.ts`)
- `parseOpenAlexSource` on a real-shaped `/sources` body → correct
  `mean_citedness_2yr` / `h_index` / `is_in_doaj`; on `{}` / null → all-null,
  `unranked`.
- **Flag-off:** with `WS1_PER_PAPER` unset, `fetchEnrichmentBase` makes no `/sources`
  call and returns `journal_tier: "unranked"` (spy on `getJson`).
- Best-effort: a step-2 5xx/network error → `journal_tier: "unranked"`, `fetched`
  still reflects the step-1 outcome (not poisoned).

### Slice B tests
- `supportQuotesByTag` picks the first non-empty quote per tag across all three
  sections; empty when no `support`.
- Render test (existing web test harness, if any): flag-off panel markup == `main`;
  flag-on panel shows tier pill + per-paper quote.

### Regression (all slices)
- `scripts/guardrail-suite.ts` — run pre/post; `answer_sections` stable; no new
  root-level `AskResponse` field. (This is the frozen-answer proof.)

---

## 8. Risks: where the frozen path could accidentally change, and how to avoid it

1. **Tier leaking into retrieval/ranking.** The single biggest risk. If `journal_tier`
   is ever read by `rerank.ts` / `balanceCitedSlice` / `enforceCitations`, the cited
   set shifts and the answer text moves. **Avoid:** tier lives ONLY in the
   `enrich-source` side channel + client render. Never import `paper-quality.ts` into
   `ask/`. Add a grep check to the PR ("`paper-quality` imported only by
   `enrich-source` + web").
2. **Touching `ask/index.ts` assembly.** Adding `journal_tier`/`support_quote` to the
   `/ask` response (via `chunkToCitation` / `ratedCitations`) would change the trace
   and could reorder JSON. **Avoid:** WS-1 adds NOTHING to `ask/index.ts`. The quote
   is derived client-side from data already present; the tier arrives via
   `enrich-source`.
3. **`answer.ts` field additions changing serialization.** New optional fields are
   safe (absent = omitted), but only if nothing on `/ask` ever sets them. **Avoid:**
   keep `journal_tier`/`cited_by_count`/`support_quote` client-populated; confirm no
   `ask/` code writes them.
4. **Extra OpenAlex call cost / rate-limit.** Doubles OpenAlex calls per cache-miss.
   **Avoid:** step-2 gated on `WS1_PER_PAPER`; 30-day cache; `MAX_BATCH`/daily cap
   already in `enrich-source`. Fails open to `unranked`, never blocks a card.
5. **Threshold miscalibration (a Q1 that isn't).** A wrong band mislabels a journal.
   **Avoid:** thresholds in one documented constant block; calibrate against ~50 real
   sources before ship; "unranked" (not a guessed tier) whenever the metric is
   absent — the same never-fabricate discipline as `studyTypeLabel` returning
   `undefined`.
6. **`enrich-source` not on the current branch.** Building on
   `feat/chatgpt-ui-parity` would fail — the function isn't there. **Avoid:** Slice 0,
   branch from `main`.
7. **DOAJ double-counting.** `is_in_doaj` from OpenAlex vs the bundled DOAJ ISSN
   registry (`doaj-registry.ts`) are two independent signals. **Avoid:** keep the
   existing `doaj_vetted` (ISSN-registry) badge as-is; the OpenAlex `is_in_doaj` is
   informational input to `PaperQuality` display only — don't merge or contradict the
   two; if both present they should agree, and disagreement is fine (both
   positive-only).

---

## Appendix — key line references (baseline = main)

- `ask/index.ts:98` — `LIVE_SOURCES` env-flag pattern to copy.
- `ask/index.ts:420` — `attachSupport(...)` (quote engine already wired).
- `ask/index.ts:424-437` — `rateSourceSupport` + `chunkToCitation` (per-paper ratings
  path; do NOT add tier here).
- `ask/citation.ts:57` — `citationMeta()` stamps DOAJ/study-type per paper (sibling of
  the new tier).
- `enrich-source/providers.ts:84-95` — `fetchEnrichmentBase` (extend here).
- `enrich-source/providers.ts:67-82` — `getJson()` (reuse for `/sources`).
- `EvidencePanel.tsx:143-157` — study-type/DOAJ pills + `src-support` quote block
  (render site).
- `apps/web/lib/enrichment.ts:11-15,41` — `useEnrichment` client hook (extend type).
- `packages/shared/src/study-type.test.ts` / `evidence-scoring.test.ts` — test
  pattern.
