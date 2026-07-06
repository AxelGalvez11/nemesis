# PharmaOrb — Retrieval breadth, claim provenance, live monitoring, wet-lab draft & agentic feel

**Status:** PLAN — awaiting owner approval. No code until a workstream + order is confirmed.
**Date:** 2026-06-11
**Branch context:** the whole research/meta pipeline lives on `feat/research-in-ask-reports-surface` (not on `main`; 55+ commits ahead). These workstreams build on that branch. Nothing here deploys without an explicit owner OK.

## Cross-cutting guardrails (apply to every workstream)
- **Never-LLM-guess.** Numbers and now *supporting highlights* must be REAL verbatim substrings of retrieved source text, found deterministically — never an LLM "this is the supporting sentence" guess.
- **One safety scan, one citation namespace.** Any new client-facing text flows through the single `detectViolations` scan; citations stay in one 1..N namespace. Do not add an LLM path that bypasses the frozen `/ask` safety layer.
- **Owner-gated:** prod deploy, DB migrations, new secrets/API keys, and PR merges each need a fresh explicit OK. Retrieval-breadth changes alter what users see → owner-gated before deploy.
- **Verifiable without app login** wherever possible (unit tests + inspect generated output), per the standing "can't log into the app from a session" constraint.

## Recommended sequence
1. **WS-A Retrieval breadth** (quick win; directly fixes "only ~10 papers"). Foundational.
2. **WS-C Claim→highlighted-source provenance** (high-trust UX; the new ask).
3. **WS-B Open-access source expansion** (incremental bolt-ons).
4. **WS-F Agentic surfacing** (show the work; multi-angle in chat).
5. **WS-D Topic live-monitoring / "standing watch"** (flagship; needs a scheduler primitive).
6. **WS-E Wet-lab "draft" mode** (side-lane; behind a flag; heaviest framing risk).

> Prerequisite reminder: the meta-analysis branch is built+tested but **undeployed**. Shipping it (preview-verify + Stripe) remains the real bottleneck and is tracked separately (Task 6.4). These features can be built in parallel but ship on the same gated path.

---

## WS-A — Retrieval breadth (fix "only ~10 papers", incl. paywalled)
**Goal:** surface far more citations, including paywalled-but-indexed papers, without weakening grounding.

**Root causes (verified in code):**
- `supabase/functions/ask/core-source-sync/providers/pubmed.ts` — the esearch term is `${query} AND free full text[sb]`, which *excludes paywalled papers* even though their abstracts are indexed and citable. The fetch only pulls `rettype: "abstract"` anyway, so the filter costs breadth for no gain. `retmax` capped at 25 (default 5).
- `supabase/functions/ask/index.ts` — `MATCH_COUNT = 8`: the chat shows only the top 8 sources.
- `supabase/functions/ask/live-sources.ts` — `PER_SOURCE_MAX = 10`, `LIVE_TIMEOUT_MS = 4000` (a throttled PubMed can time out).
- Research path already broader: `orchestrate.ts` `REPORT_MAX_CHUNKS = 24`, `SUB_TOP_M = 6`.

**Files:** `core-source-sync/providers/pubmed.ts`, `ask/index.ts`, `ask/live-sources.ts`, `ask/research/orchestrate.ts` (+ tests `pubmed*.test.ts`, `live-sources.test.ts`).

**Approach / steps:**
1. Make the PubMed full-text filter **optional** via a param (`oaOnly?: boolean`, default off for citation breadth). Keep an OA-preference signal for the *meta-analysis* corpus where richer text helps grounding (pass `oaOnly: true` only on the meta extraction pass, or rank OA higher rather than exclude).
2. Raise the chat `MATCH_COUNT` (e.g. 8 → 12–15) and re-check the reranker keeps quality; surface a "show more sources" affordance rather than dumping all.
3. Bump `retmax`/`PER_SOURCE_MAX` candidate pulls (more candidates INTO the reranker; the displayed cap stays controlled). Confirm `NCBI_API_KEY` is set in prod (memory says yes) so the higher volume doesn't throttle; consider raising `LIVE_TIMEOUT_MS` for PubMed specifically.
4. Tests: assert the PubMed term omits the OA filter when `oaOnly` is false; assert candidate counts scale; assert the meta path still prefers groundable text.

**Risks:** (a) more abstract-only sources could dilute rerank quality → mitigate by keeping rerank and a controlled display cap; (b) meta-analysis grounding wants verbatim numbers — abstracts usually carry them, but verify the meta path isn't starved; (c) higher volume + NCBI rate limits → keep key + per-source timeout. **Complexity: LOW–MEDIUM.**

---

## WS-B — Open-access STEM source expansion
**Goal:** ingest more open/free literature; each source is a small bolt-on (the architecture is "add a source = one `LIVE_SOURCES` entry").

**Files:** new `core-source-sync/providers/{openalex,crossref,unpaywall,biorxiv}.ts`; register in `ask/live-sources.ts` `LIVE_SOURCES`; map via `core-source-sync/normalized-source.ts` + `ask/retrieve.ts` `liveToChunk`. Provider labels in the search-method copy.

**Candidate sources (pick per value):** OpenAlex (240M works, free), Crossref + Unpaywall (DOIs + legal free-PDF links), Europe PMC full-text (metadata already wired), bioRxiv/medRxiv (preprints — label "not peer-reviewed", fits honesty framing), Semantic Scholar / CORE / DOAJ.

**Approach / steps (per source):** write fetcher (query → normalized records w/ title, abstract, authors, year, DOI/url, license), add a `LiveSourceDef`, map to `RetrievedChunk` w/ provider tag + bibliographic metadata (Citation already has optional `authors/journal/year/...`), add a parser test with a captured fixture. Preprints get a provider label that renders a "preprint — not peer-reviewed" badge.

**Risks:** rate limits/ToS per API; dedupe across sources (same DOI from OpenAlex + PubMed) → dedupe by DOI/normalized title in `mergeEvidence`; preprint quality → label clearly, never silently pool into evidence grade. **Complexity: MEDIUM** (LOW per source, repeated).

---

## WS-C — Citation → highlighted supporting passage (the new ask)
**Goal:** clicking a claim's `[n]` opens the source and **highlights the exact passage that supports that claim** — claim-level provenance, computed honestly (real substring, no LLM guess).

**Current state (verified):** `AnswerPoint.citation_ids` already maps each claim to its cited tags. But `Citation` carries **no** supporting quote/offsets/text; the chat `EvidencePanel` (in `ask/page.tsx`, driven by `onCite(answer, tag)` + `activeTag`) shows citation *metadata* only; `app/app/source/[id]/page.tsx` shows metadata only (no retrieved text, no highlight). No per-claim snippet exists in the `/ask` path (the meta path *does* keep verbatim `source_quote`).

**Approach — deterministic supporting-span extraction (honest):**
- New pure module `ask/support-span.ts`: `bestSupportingSpan(claimText, chunkText)` → returns the best-matching contiguous passage (sentence/window) in `chunkText` by lexical overlap (token Jaccard / longest-common n-gram), with a minimum-overlap threshold. Returns null (no highlight, honest) when nothing clears the bar. NO LLM — same verbatim discipline as `ground.ts`. Unit-testable in isolation.
- Wire at answer assembly (`ask/index.ts` where the `top` slice + citations are built, and `research/orchestrate.ts`/`faithfulness.ts` for reports): for each kept claim×cited-chunk, compute the span; attach `{ chunk_tag, supporting_quote, char_start, char_end }`.

**Files / data model:**
- `packages/shared/src/answer.ts`: add optional `support?: { citation_tag, quote, start, end }[]` to `AnswerPoint` (or a per-citation `supporting_quote`), and carry the cited chunk's `text` (or a bounded excerpt) so the viewer can render+highlight. Keep all fields optional (older saved chats degrade gracefully — same pattern as the bibliographic fields).
- `ask/support-span.ts` (+ `support-span.test.ts`).
- `ask/index.ts`, `ask/research/orchestrate.ts`, `ask/research/faithfulness.ts`: populate `support`.
- `apps/web/app/app/ask/page.tsx` (`EvidencePanel`, `Answer`, `onCite`): when a `[n]` is clicked for a claim, show the source excerpt with the supporting span `<mark>`-highlighted and scroll to it.
- `apps/web/app/app/source/[id]/page.tsx` + `packages/shared/src/search.ts` `SourceDetail` + `lib/api.ts` `fetchSource`: render retrieved text with `<mark>` highlight; accept an optional `?span=start,end` (or quote) to highlight a specific passage.
- Optional: external deep-link via [text fragments](https://developer.mozilla.org/docs/Web/Text_fragments) `url#:~:text=<quote>` so "Open original" highlights on the publisher page when supported.

**Approach / steps:**
1. `support-span.ts` + tests (TDD): exact-substring → window-overlap → null. Pin "no fabricated highlight" (returns null when overlap < threshold).
2. Extend `AnswerPoint`/`Citation` types (optional fields) + contract test.
3. Populate `support` at assembly (chat + report); ensure the excerpt text is the retrieved chunk text we already have in-hand.
4. UI: highlight in `EvidencePanel` + source viewer; wire `onCite` to scroll-to-span; add the text-fragment link-out.
5. Persisted chats/reports carry `support` so reopened turns highlight identically (the saved-payload pattern already used for chats).

**Risks:** (a) the supporting span must never *misrepresent* — a weak match shown as "this supports the claim" erodes the moat; mitigate with a strict overlap threshold + honest "closest passage" labeling and null when unsure; (b) for some live sources we only stored the abstract — highlight within what we actually retrieved, link out for the rest; (c) saved-payload size (carry a bounded excerpt, not whole articles). **Complexity: MEDIUM.**

---

## WS-D — Topic live-monitoring / "standing watch"
**Goal:** save a topic/computed analysis; the engine re-runs the search on a schedule and alerts ONLY when a newly indexed paper materially moves the answer.

**Current state:** there is **no general scheduler** for user watches (core-source-sync runs its own ingest; no `Deno.cron`/`pg_cron` for per-user watches).

**Approach / steps:**
1. New scheduler primitive: Supabase `pg_cron` → invokes a new edge function `watch-runner`, or a scheduled invoke. (Migration + cron = owner-gated.)
2. New tables (RLS-scoped): `evidence_watches` (user_id, query/saved_report_id, mode, cadence, last_result snapshot) + `watch_alerts` (watch_id, fired_at, what_changed, new_citation_ids). Migration owner-gated.
3. `watch-runner`: for each due watch, re-run `research/orchestrate.ts`, **diff** new result vs stored snapshot (new citations; for meta, whether the pooled estimate crosses significance or shifts the deterministic evidence-grade tier), write an alert only on material change.
4. Notification surface: in-app alert list first (email later — needs SMTP, separate).
5. UI: "Watch this topic" on an answer/report; a Watches page listing alerts (reuses saved-report objects).
6. Tests: diff logic on fixed corpus snapshots (fires on a planted new trial, silent otherwise) — verifiable without app login.

**Risks:** scheduler/infra is the one genuinely new primitive; alert spam (tune "material change" thresholds); cost of repeated runs (cadence + dedupe). **Complexity: HIGH.**

---

## WS-E — Wet-lab "draft" mode (literature-grounded, clearly labeled)
**Goal:** a *draft* protocol/method scaffold assembled from cited methods papers — explicitly unvalidated, never authoritative, never bench-safety advice.

**Honesty framing (non-negotiable):** generative, so it sits *outside* the never-fabricate core — therefore it must (a) assemble steps from REAL cited methods passages (reuse `retrieve.ts`+`ground.ts`+`support-span.ts`), (b) carry a prominent "UNVALIDATED DRAFT — verify against primary sources; not lab/safety guidance" banner, (c) abstain/flag where literature is thin, (d) never emit authoritative reagent/dose/safety instructions. Runs through the one safety scan.

**Files:** new mode in `ask/research/orchestrate.ts` (or a dedicated function) + a draft-specific plan/synthesis prompt with hard disclaimers; new render component + Pro/flag gate; reuse provenance highlight (WS-C).

**Approach / steps:** add a `draft` mode flag; retrieve methods literature for the goal; assemble a cited, sectioned draft (objective / materials-as-reported / method-as-reported / caveats) where every concrete step is traceable to a cited passage; enforce the disclaimer + thin-evidence abstention; gate behind a flag/Pro; test the abstention + disclaimer behavior without app login.

**Risks:** scope creep toward authoritative protocol generation (the line to hold); liability if framed as guidance; moat dilution (it's a side-lane). Keep it a clearly-bounded, labeled draft or don't ship it. **Complexity: MEDIUM** (HIGH if it drifts toward real protocol generation — avoid).

---

## WS-F — Make it feel agentic (not a chatbot)
**Goal:** show the multi-step work and act, within the safety guarantees. No open-ended autonomous loops (they break the one-scan/one-namespace guarantees).

**Files:** `ask/research/orchestrate.ts` already `emit()`s progress ("planning / checking / done"); `apps/web/app/app/ask/page.tsx` `STAGES` + streaming UI; chat retrieval in `ask/index.ts`.

**Approach / steps:**
1. **Surface the plan + steps:** render the streamed `emit()` stages as a live checklist (what it's doing, which sources it pulled). (Mostly UI.)
2. **Multi-angle retrieval in the *chat*:** the chat is single-query today; Deep Research already does parallel sub-question retrieval + round-robin merge. Bring a bounded multi-query expansion to the quick chat for comparison/multi-drug questions (reuse the orchestrate merge shape; keep the single safety scan + single citation namespace). This also helps WS-A's breadth.
3. **Proactive:** the WS-D watches are the most agentic move (works while away).
4. **Artifacts:** keep leaning on deliverables (docx/pptx/forest/monograph) — it *produces things*.
5. **Clarify-before-answer:** the scope/clarifying-question step already exists; surface it more.

**Risks:** don't cross into unsupervised agent loops; keep latency acceptable for the chat. **Complexity: LOW–MEDIUM** (UI-led).

---

## Testing & ship discipline (all workstreams)
- TDD per the repo's gate: `deno test --allow-env supabase/functions/ask/` + `deno test packages/shared/` + `pnpm --filter @pharmaorb/web typecheck && build && smoke:export`, green before each commit.
- Pure logic (`support-span.ts`, diff logic, provider parsers) gets unit tests with captured fixtures — verifiable without app login.
- Each workstream ships as its own green increment; deploy/merge owner-gated.

## Awaiting confirmation
Confirm which workstream(s) and in what order. Recommended first: **WS-A (retrieval breadth)** then **WS-C (claim→highlight provenance)**. On approval I'll produce the detailed bite-sized TDD steps for the chosen workstream and begin.
