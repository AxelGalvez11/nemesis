# PharmaOrb Eval Harness

The operational definition of **"supremely good"**: a committed number for the
evidence backend's retrieval quality, plus a CI gate that blocks any change that
regresses it. Every later backend PR (HNSW, hybrid retrieval, faithfulness) is
proven against this harness, not guessed.

There are two suites:

1. **Retrieval harness** (`retrieval-eval.ts`) — cheap, deterministic, no LLM, no
   `/ask` quota. Embeds golden questions with Voyage, calls the live
   `match_core_source_chunks` RPC as an authenticated user, and scores the ranked
   sources against a corpus-relative golden set. **This is the gate.**
2. **Answer harness** (`answer-eval.ts`) — an LLM-judge scaffold for answer
   groundedness/relevance and per-citation faithfulness. **Scaffold only in PR0,
   not wired into `eval.yml`.** See the open items at the bottom.

---

## Metrics

All metrics live in [`lib/metrics.ts`](./lib/metrics.ts) as pure functions over a
**ranked list of ids** and a **gold id set**, with **binary relevance** (a source
is either gold or it is not). `mean()` is the aggregator across golden items —
empty lists return `0`, so aggregates are never `NaN`.

The ranked list scored by the harness is the de-duplicated `source_id` order
returned by the retriever (chunks collapse to their parent source, first
occurrence wins).

### recall@k

Fraction of the gold set that appears in the top-`k` of the ranked list:

```
recall@k = |{ gold sources in ranked[0..k) }| / |gold|
```

- Returns `0` when `|gold| == 0` (an unanswerable / no-gold item contributes
  nothing to recall; correctness for those items is asserted separately via the
  AC3 sanity check, not via recall).
- Reported at `k ∈ {5, 10, 20}`.

### dcg@k / nDCG@k

Discounted Cumulative Gain over the top-`k`, summing a log-discount for each gold
hit by its rank (`i` is 0-indexed, so position `i+1` is 1-indexed):

```
dcg@k  = Σ over i in [0, k) where ranked[i] ∈ gold:  1 / log2(i + 2)
idcg@k = Σ over i in [0, min(|gold|, k)):            1 / log2(i + 2)
nDCG@k = dcg@k / idcg@k        (0 when idcg@k == 0)
```

`idcg@k` is the DCG of the ideal ranking (all gold sources packed at the top),
truncated to `min(|gold|, k)` terms, so nDCG is normalized into `[0, 1]`.
Reported at `k = 10`.

### MRR

Reciprocal rank of the **first** gold hit in the ranked list (1-indexed); `0` if
no gold source appears:

```
mrr = 1 / (rank of first gold hit)        (0 if none)
```

### Aggregation

Each metric is computed per answerable golden item, then aggregated with
`mean()` over the scored items. The aggregate object is the gate surface and the
committed baseline.

---

## The gate rule

The gate is `ci-gate.ts`, run by [`.github/workflows/eval.yml`](../.github/workflows/eval.yml)
on every PR into `main`:

- Re-run the retrieval harness against the live corpus.
- For **each aggregate metric**, require `now >= baseline - TOLERANCE`, where
  `TOLERANCE = 0.03` (absolute). No aggregate metric may drop more than the
  tolerance band below the committed baseline.
- The AC3 sanity must hold: `unanswerable_clean === unanswerable_total` (every
  unanswerable probe returns zero rows at the live ASK threshold of `0.5`).

**Baseline:** `baselines/2026-06-08-retrieval-baseline.json` is the committed P0
reference. The harness only overwrites it when run with `--write-baseline`; CI
never writes it.

**Absolute floors are deferred to PR1.** PR0 establishes a *relative* gate (no
regression beyond tolerance vs the committed baseline). Hard absolute minimums
for each metric — the "this is the floor, full stop" numbers — are set at PR1
once the HNSW index lands and the golden set is expert-reviewed and grown to
~40–60 items. (Judge model + absolute floors are tracked in the plan's OPEN
DECISIONS.)

---

## Corpus-relative vs coverage (do not conflate)

These are two **different axes** and the harness measures only the first:

- **Corpus-relative (retrieval quality — what the gate scores).** Recall and the
  ranking metrics are scored **only against gold sources that actually exist in
  `core_sources`**. Gold `(provider, provider_id)` pairs are resolved to
  `source_id` at eval time (`resolveSourceIds`); a pair that does not resolve is
  **not** counted as a miss — it is reported as `unresolved_gold` and the item is
  skipped. This isolates *"given the evidence is in the corpus, does the
  retriever rank it well?"* from corpus content gaps.
- **Coverage (does the corpus contain the right evidence at all).** Whether the
  corpus *holds* the relevant source in the first place is a separate question,
  tracked by `corpus-census.ts` (counts of `core_sources` per provider). Coverage
  growth is the job of the ingest PRs (P4), not this gate.

A retrieval regression and a coverage gap look different and are owned by
different PRs. The gate must never punish a retriever for evidence that was never
ingested — hence corpus-relative scoring and the `unresolved_gold` accounting.

---

## LLM-judge anti-flake rules (answer harness)

The answer harness (when implemented) uses an LLM as a judge for groundedness and
relevance. LLM judges are non-deterministic by default; to keep the gate from
flaking, the judge must be:

- **Temperature 0.** All judge calls run at `temperature: 0` for maximally
  deterministic scoring.
- **Pinned model + prompt.** The judge model id and the judge prompt are pinned
  and versioned; changing either is a deliberate, reviewed change (it moves the
  measurement, like changing a ruler).
- **Aggregate-with-margin.** Never gate on a single per-item judge score. Gate on
  the **aggregate** with a tolerance margin (same shape as the retrieval gate's
  `TOLERANCE` band), so residual judge jitter on individual items cannot trip a
  false-fail.

---

## OpenEvidence-offline policy

The golden schema carries an `openevidence_slice` boolean tag
([`golden/schema.ts`](./golden/schema.ts)) marking the subset of questions used
to benchmark against OpenEvidence.

OpenEvidence answers are **not fetched programmatically** by the harness or by CI
(no public API / ToS for automated retrieval). The `openevidence_slice` is a
**manually curated, offline comparison**: a human compares PharmaOrb's answers on
that slice against OpenEvidence out-of-band and records the assessment. Nothing in
the automated gate calls OpenEvidence, and CI does not depend on it. This keeps
the deterministic gate free of any external, unstable dependency.

---

## ASK to the Answer Engine: the `{tag → chunk_id}` map (blocks strict per-citation faithfulness in P2)

Strict per-citation faithfulness in the answer harness (P2) is **blocked** on an
interface the Answer Engine must provide.

Today:

- `Citation` carries `chunk_tag` + `source_id`, but **no `chunk_id` and no chunk
  text**.
- The trace's `retrieval_scores` carries `chunk_id`, but **no tag**.

There is therefore no way to map a citation in the generated answer back to the
exact retrieved chunk that supports it. Strict per-citation faithfulness (NLI
support-check: "does this specific chunk entail this specific sentence?") requires
an explicit **`{tag → chunk_id}` map persisted in the trace/response**.

**PR0 computes only context-level groundedness** (is the answer grounded in the
retrieved context as a whole?). Per-citation faithfulness is deferred to P2 and
depends on this map landing — see the TODOs in `answer-eval.ts`. Once the Answer
Engine persists the map, `enforceCitations` can be extended from an
existence-check to an NLI support-check, and the answer harness can gate on
faithfulness.

---

## Running locally

Requires `SB_URL`, `SERVICE_KEY`, `ANON_KEY`, `VOYAGE_API_KEY` (locally these live
in `supabase/functions/.env`; CI uses repo secrets).

```bash
# 1. Metric math (no network)
deno test eval/lib/metrics.test.ts

# 2. Corpus census — proves baselining is possible (non-zero counts per provider)
SB_URL=... SERVICE_KEY=... ANON_KEY=... \
  deno run --allow-net --allow-env eval/corpus-census.ts

# 3. Retrieval harness (dry run, no baseline write)
SB_URL=... SERVICE_KEY=... ANON_KEY=... VOYAGE_API_KEY=... \
  deno run --allow-net --allow-env --allow-read eval/retrieval-eval.ts

# 4. Write the committed baseline (intentional)
... deno run --allow-net --allow-env --allow-read --allow-write \
  eval/retrieval-eval.ts --write-baseline
```

The answer harness (`answer-eval.ts`) is a scaffold and is **not** part of the
gate; running it exercises `/ask` (LLM + quota) and is gated by `grantEnterprise`
on the minted test user.
