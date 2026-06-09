# /ask live-evidence wiring — design + safety validation (2026-06-08)

Wires the live sources (#34), the cross-encoder reranker, and a fabrication guard into the `/ask`
answer engine. Code lands on main; **going live is owner-gated**: a single env flag (`LIVE_SOURCES=on`)
plus the edge-function deploy. With the flag unset, `/ask` is byte-for-byte the dense-only behavior the
guardrail/AC3 suite locks in (231 ask unit tests confirm).

## What it does (when `LIVE_SOURCES=on`)
1. **Gather** live candidates (PubMed, Europe PMC, ClinicalTrials, openFDA, FAERS) on the resolved drug
   TERM (not the raw question — openFDA/FAERS/CT 400 on a sentence). Fault-tolerant + 4 s timeout.
2. **Merge + rerank** the union of library chunks + live candidates with Voyage rerank-2.5, so both
   rank on one scale. Keep the top 8.
3. **Fabrication guard** (the safety crux) then runs before generation.

Fault-tolerant throughout: a gather or rerank failure degrades to the dense library result; live
sources can never sink an answer. Live candidates carry a synthetic `live:<provider>:<id>` source_id
(safe — `generated_answers.source_ids` is jsonb, no UUID type / FK; `enforceCitations` keys on the tag).

## The safety crux: why a score floor cannot guard fabrication
The dense 0.5 floor does NOT refuse class-plausible fakes — "florizagliflozin" embeds mostly to its real
SGLT2 neighbors and pulls real dapagliflozin/empagliflozin evidence above the floor (prior finding,
`adversarial-probes.json`). **Measured here that a rerank SCORE floor fails the same way**: gathering
live on the florizagliflozin question returns real SGLT2 class-sibling papers the cross-encoder scores
**0.69** — high, because they ARE relevant to the class. (`eval/live-fabrication-probe.ts`.)

So the guard is **categorical, not a magnitude**: keep the answer only if the drug the user LITERALLY
named appears in the retained evidence (`isFabricatedDrugQuery`, `fabrication.ts`). A real-but-new drug
(retatrutide — sparse in our entity table) clears: its live PubMed/CT records literally contain
"retatrutide". A fabricated drug never clears: the support names its real neighbors, never the fake.
We check the literal mention, NOT the resolved canonical name — `resolveEntities` takes the top fuzzy
match, so a fake can mis-resolve to a real neighbor; trusting the canonical would let it back in.

## Validation
- `supabase/functions/ask/fabrication.test.ts` — 13 deterministic unit tests (in CI / ask-units):
  florizagliflozin refuses, fake co-mentioned with a real drug refuses (every named drug must be
  supported), word-boundary (maglutide ⊄ semaglutide, BPC-158 ≠ BPC-157), retatrutide clears,
  general questions exempt.
- `eval/live-pipeline-safety.ts` — full live-path gate (manual; hits live APIs + Voyage + the LLM, so
  NOT in blocking CI). TWO parts:
  - **Part A (guard behavior):** all 3 fakes REFUSE, retatrutide + dapagliflozin CLEAR. ✓ passing.
  - **Part B (classify→mention extraction):** the guard's only input is `classify`'s `entity_mentions`.
    If the classifier ever drops/normalizes a fake token, the guard is BLIND and the fake leaks. Part B
    classifies the 3 probe QUESTIONS and asserts each fake token is actually extracted. **Needs a valid
    LLM key** — it is INCOMPLETE in any environment without one (e.g. local dev). **Must run green
    before enabling.**
- `eval/live-fabrication-probe.ts` — the diagnostic that measured the score-floor failure.

## Known conservative behavior (refine later)
The guard checks the literal mention, so a brand/generic mismatch where the brand the user typed
appears in NO retained chunk would refuse (err-safe: the no_source template still surfaces the retrieved
records as related info). In practice labels/FAERS carry brand names, so this is rare; a brand↔generic
synonym map is the follow-up. Also: every `/ask` adds one live gather (≤4 s) + one rerank call —
bounded, but real per-question latency/cost once enabled.

## To enable (owner)
1. `supabase functions deploy ask` (owner-gated).
2. **Run `eval/live-pipeline-safety.ts` with a VALID LLM key and confirm BOTH parts are green** —
   Part B (classify extracts each fake token) is the end-to-end safety check and is INCOMPLETE without
   the key. This is a recurring gate (live results change), not a one-time sign-off.
3. Set `LIVE_SOURCES=on` (+ optional `RR_MODEL`, `OPENFDA_API_KEY`/`NCBI_API_KEY` for higher limits).

Read-through-ingest (saveToLibrary, the WRITE path) stays a separate switch.
