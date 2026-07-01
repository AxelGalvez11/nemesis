# Evidence Super-App Research: How the Best Citation-Grounded AI Products Work — and What PharmaOrb Should Take From Each
*Generated: 2026-07-01 | Sources: ~60 (official docs, independent audits, teardown analyses) | Confidence: High on mechanics/APIs, Medium on private-company internals*

## Executive Summary

Every product studied splits into four layers, and no single product owns all four: **grounded answering** (ChatGPT/Gemini/Claude/Perplexity), **evidence-quality signals** (scite/Consensus/Elicit), **source-grounded workspaces and maps** (NotebookLM/Litmaps), and **deliverables** (Gamma/Manus/NotebookLM Studio). The strategic finding: the deliverables layer is where people demonstrably pay (Gamma: $100M+ ARR, ~600k paid subscribers on credit-gated deck generation) and it is also where trust is weakest — a Feb 2026 fact-check of six AI presentation makers found **no tool verified more than 44% of the claims on its slides, and Gamma fabricated 8% outright**. "Cited deliverables" is an open hole in the market that sits exactly on top of what PharmaOrb already built (deterministic report card, per-claim support spans, PDF/Word/PPT export). Meanwhile the trust-signal layer that scite charges enterprise money for is partially replicable free: scite's own per-DOI tally endpoint is public and tokenless today, and Semantic Scholar's API exposes citation contexts and intents at no cost. The main build recommendation is a four-layer integration plan (below) that copies UX patterns rather than licensing engines, with only two paid integrations worth considering (scite enterprise, Elicit API).

---

## 1. How the big assistants ground answers (ChatGPT, Gemini, Claude, Perplexity)

**Shared architecture.** All four converge on the same schema: span-anchored citations — `{url, title, start_index, end_index}` attached to segments of the answer. All four let the model decide when to search (a learned tool call, not a rule). And all four fetch far more than they cite: OpenAI's docs state the consulted-source list "is often greater than the number of citations"; Perplexity retrieves 60+ sources and cites 3–4. PharmaOrb's "1 cited + 11 reviewed" display already matches how these APIs are actually structured.

- **ChatGPT**: 5-step pipeline (query reformulation → Bing metadata → snippet evaluation → full-page fetch for chosen pages → synthesis). Only ~46% of queries trigger live search. Its API tiers matter for us: the Responses API `web_search` tool supports **`filters.allowed_domains` (up to 100 domains)** — OpenAI's own documentation example is a **semaglutide query restricted to pubmed.ncbi.nlm.nih.gov, clinicaltrials.gov, fda.gov**. Agentic search (reasoning models issue `open_page`/`find_in_page` actions) powers the visible Activity trail. ([developers.openai.com web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [ziptie.dev teardown](https://ziptie.dev/blog/how-does-chatgpt-search-work/))
- **Gemini**: grounding returns `groundingSupports` — per-segment mapping of which retrieved chunks back which sentence. Note: the per-segment `confidenceScores` are **dead for Gemini 2.5+** ("this list is empty and should be ignored") — nobody in production currently ships a per-claim numeric support score. Gemini's **"Double-check response"** button re-searches the answer and highlights green (corroborated) / orange (contradicted or not found) — the only shipped per-statement verification UI, and the closest analog to our Evidence Meter idea. ([ai.google.dev grounding docs](https://ai.google.dev/gemini-api/docs/google-search))
- **Claude**: the **Citations API** is purpose-built for our use case — pass documents (or `search_result` blocks from your own retrieval pipeline), and every cited span comes back with **`cited_text`, the verbatim source passage**, validated by the API to point at real document locations. This is architecturally identical to PharmaOrb's shipped ClaimSupport/support-span design — external confirmation we bet on the right primitive. Web search tool supports `allowed_domains`, $10/1k searches. ([platform.claude.com citations](https://platform.claude.com/docs/en/build-with-claude/citations))
- **Perplexity**: retrieval-first with a three-layer reranker and a fail-safe that **re-queries rather than serve weak citations**; citations are structurally assigned *before* generation, not retrofitted. Pro Search shows its step plan — trust theater users love. Academic focus mode = peer-reviewed-only filter. ([ziptie.dev analysis](https://ziptie.dev/blog/how-perplexity-ai-answers-work/))

**The audits behind our moat thesis:** CJR/Tow Center found a **76.5% attribution error rate for ChatGPT** and **37% answer error for Perplexity**. "Citations make claims checkable, not correct." Deterministic real-source guarantees remain a genuine differentiator.

## 2. The science evidence engines (scite, Consensus, Elicit)

- **scite.ai** — classifies the actual citing sentence from full text as **supporting / mentioning / contrasting** (1.6B+ citation statements; moat = 30+ publisher full-text mining deals). Its per-paper tally badge + editorial notices (retractions) is the canonical "how was this paper received" trust widget. **Integration reality: `GET api.scite.ai/tallies/{doi}` is public, tokenless, and uncapped today** (verify ToS before shipping); search over citation statements, the citation graph, Reference Check, and a white-label Assistant API are enterprise/sales-gated. Their enterprise tier already bundles FAERS/MAUDE/regulatory datasets — they are moving toward our territory. Weakness: most citations classify as "mentioning," so tallies often add little signal. ([api.scite.ai/docs](https://api.scite.ai/docs), [pricing](https://scite.ai/pricing))
- **Consensus.app** — the **Consensus Meter** (Yes/No/Possibly % across top ≤20 papers) plus **Study Snapshot cards** (population, sample size, duration, methods, outcomes — LLM-extracted from abstracts) plus per-position quality stats (recency, count of RCTs/meta-analyses, avg journal SJR, citations). **No API — copy the patterns, can't license the service.** Critical caveat we must design around: the Meter is vote-counting (n=50 counts the same as n=5,000, ignores effect sizes and publication bias) — methodologists abandoned that decades ago. Our per-sub-claim meter must weight by design + size, not count votes. ([Consensus help docs](https://help.consensus.app/en/articles/10069920-the-consensus-meter), [Aaron Tay's 2025 critique](https://aarontay.substack.com/p/a-2025-deep-dive-of-consensus-promises))
- **Elicit** — the systematic-review pipeline (find → screen with AI-generated criteria → extract into a papers × questions matrix, **every cell backed by a verbatim supporting quote** → PRISMA-2020 report). Evaluated against 994 Cochrane reviews: 95% search recall, 96% extraction accuracy. **Has a real self-serve API (March 2026, Pro $49/mo): `/api/v1/search` and async `/api/v1/reports`** — the one evidence-synthesis engine we could actually pipe into Deep Research today. ([elicit.com/blog/elicit-api](https://elicit.com/blog/elicit-api), [Cochrane eval](https://elicit.com/blog/evaluating-elicit-slr))

## 3. Source-grounded workspaces, evidence maps, deliverables

- **NotebookLM** — closed RAG over user sources with the most-copied trust mechanic in the industry: **numbered citation chips that click-jump to the exact highlighted passage in the source**. June 2026 added **Source Attribution**: every generated artifact (report, deck, podcast) exposes the exact prompt + source list used to build it, with an "Iterate" button. Studio generates reports, study guides, **PPTX slide decks** (image slides, "Revise" = per-slide natural-language edit instructions), infographics, data tables, audio/video overviews. **The paywall is deliverable volume** (free: 10 Deep Research reports/mo, 3 overviews/day → top tier 100+/200). Mind Maps: auto knowledge map where clicking a branch opens a source-grounded chat scoped to that topic. No consumer API. ([Jeff Su 2026 guide](https://www.jeffsu.org/notebooklm-changed-completely-heres-what-matters-in-2026/), [DigitalOcean overview](https://www.digitalocean.com/resources/articles/what-is-notebooklm))
- **Evidence maps** — Litmaps (x = publication date, y = citation count; "Monitor this map" alerts; acquired ResearchRabbit), Connected Papers (similarity graph). None expose APIs; they all sit on the **free Semantic Scholar Academic Graph** — which means we can render the same maps ourselves. Obsidian-style graphs only work with AI overlays (InfraNodus: cluster + gap detection → generated research questions). ([Effortless Academic comparison](https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025/))
- **Deck/document generators** — Gamma ($100M+ ARR, ~600k paying, credit-gated freemium, profitable) proves research→deck is a real paid behavior; Tome died selling the same thing to consumers (the paying market is work/prosumer decks). **Uniform weakness: cited decks don't exist.** LayerProof's Feb 2026 fact-check: Gamma 20% verified/8% fabricated, Canva 17%, best tool 44%. Manus (Meta) builds research-first decks but "doesn't provide citations — no way to know which sources it drew from." Copyable mechanics: Manus's PPTX template ingestion (upload your deck, it applies your theme) and NotebookLM's per-slide Revise. ([Sacra on Gamma](https://sacra.com/c/gamma/), [LayerProof study](https://layerproof.app/blog/we-fact-checked-6-ai-presentation-makers-hallucination/), [Plus AI on Manus](https://plusai.com/blog/manus-ai-slide-generator-review))

## 4. The medical vertical + the free infrastructure

- **OpenEvidence** ($12B valuation Jan 2026, ~40% of US physicians, 8.5M consultations/mo) — trust stack: per-answer citations with relevancy labels, **abstention when evidence is inconclusive** (explicit no-hallucination policy), NPI-verified clinician gating, licensed NEJM + JAMA full text, 100% USMLE. Free to clinicians, pharma-ad funded, **no API**. Its moat is licensing + physician distribution — not tech. Grounded-QA mechanics of its class are replicable open-source (**PaperQA2**, FutureHouse — claims expert-level retrieval QA and more-factual-than-Wikipedia summaries; **Ai2 Scholar QA** — open-source sectioned reports with verbatim excerpt verification). ([Contrary Research breakdown](https://research.contrary.com/company/openevidence), [PaperQA2](https://github.com/future-house/paper-qa))
- **Undermind** ($16/mo Pro, no API) — agentic iterative search with citation chasing; independent librarian benchmark: recall@50 ≈ 82% vs systematic-review gold standard; 1,000+ GSK scientists use it. Pattern to copy: **adaptive search rounds + per-paper relevance summaries**, and the "badger the user into a specific question" intake (we call this scoping — already built in Deep Research).
- **SciSpace** ($12–200/mo) — matrix extraction + agentic Deep Review (1,750 → 320 relevant → top-20 synthesis); searches are non-reproducible, quality varies.
- **Free/cheap infrastructure PharmaOrb can build on now:**
  - **Semantic Scholar API** — citation **contexts** (the citing sentence!) + **intents** + influence flags + TLDR summaries. The free skeleton of a scite-parity feature. 1 rps with free key; mirror bulk datasets for volume.
  - **OpenAlex** — 250M works, topics, `is_retracted`, CC0 (fully commercial-safe); free key ≈ $1/day usage; quarterly full snapshot free.
  - **Europe PMC** — millions of OA **full texts** + a unique Annotations API (pre-mined drugs, diseases, gene-disease relations, trial IDs in text). Already partially integrated in PharmaOrb.
  - **Unpaywall** (100k calls/day free — legal free-PDF resolution), **Crossref + Retraction Watch** (retraction data now CC0-public, daily-updated CSV — the free retraction guard), **ClinicalTrials.gov v2** (already integrated).

---

## 5. What this means for PharmaOrb — the super-app blueprint

The one-sentence strategy: **combine ChatGPT's conversational UX (Layer C, already underway), scite/Consensus-grade trust signals built on free infrastructure (Layer B), OpenEvidence-style grounding discipline we already have (Layer A), and the cited-deliverables hole nobody fills (Layer D) — and charge on deliverable volume + depth, which is the proven paywall.**

### Copy / build / buy table

| Capability | Source of pattern | Action | Cost |
|---|---|---|---|
| Plain-English cited answers, Activity trail, sources panel | ChatGPT (measured spec in docs/design/chatgpt-ui-parity-plan.md) | COPY — Phases 1–4 in progress | $0 |
| Verbatim-quote span citations | Claude Citations API ≙ our ClaimSupport | KEEP — already built; optionally swap judge to Citations API later | $0 |
| Click-to-passage jump + highlight | NotebookLM | BUILD — wire support spans to open source at quote | small |
| Per-artifact "Source Attribution" (prompt + sources on every report/deck) | NotebookLM (June 2026) | BUILD — we already track provenance deterministically | small |
| Supporting/contrasting received-by-science badge per citation | scite | BUILD free v1 on scite public tallies endpoint (ToS check) + Semantic Scholar citation contexts/intents; scite enterprise later if it earns it | $0 → sales |
| Study Snapshot cards (population, n, duration, methods) | Consensus | BUILD — LLM-extract from abstracts we already retrieve; cache per PMID | small |
| Per-claim Evidence Meter with quality weighting (NOT vote counting) | Consensus Meter + its documented failure modes | BUILD — weight by study design + n; show per-position recency/design/citation stats | medium |
| Post-answer "double-check" per-statement corroboration coloring | Gemini Double-check | BUILD later — pairs with span verification spine (SPAN_VERIFY_ENABLED, already on branch) | medium |
| Retraction guard | Crossref/Retraction Watch CC0 CSV | BUILD — daily sync job | tiny |
| Evidence map (x = year, y = evidence grade; node click → grounded chat; "Monitor this map") | Litmaps + NotebookLM mind map + our watch agent | BUILD — we have EvidenceMap component work + monitoring agent already | medium |
| Cited slide decks / docs (per-slide claims carry citation pills + report card) | Market hole (LayerProof: best competitor 44% verified) | BUILD — extend existing PPT/Word/PDF exporters with per-claim citations, template ingestion, per-slide Revise | medium |
| Systematic-review-grade reports via API | Elicit API ($49/mo Pro) | OPTIONAL BUY — pilot as a "PRISMA mode" behind Pro | $49/mo pilot |
| Retrieval breadth backstop | OpenAI web_search w/ allowed_domains (PubMed/CT.gov/FDA example is literally in their docs) | OPTIONAL — as consumer/news lens alongside our deterministic retrieval | usage |

### Phasing (extends the UI parity plan already committed)
1. **Now (UI phases 1–4)**: ChatGPT-parity skin — done: canvas/composer (committed); next: thinking/Activity panel, citation pills + sources panel, welcome + tools launcher.
2. **Trust layer**: retraction guard, scite tallies badge, Study Snapshot cards, click-to-passage. All free-infrastructure, all engine-adjacent but frontend-safe.
3. **Meter layer**: per-sub-claim Evidence Meter with design/size weighting + per-position quality stats; then Gemini-style double-check coloring using the span-verification spine.
4. **Deliverables layer (the paid product)**: cited decks/docs with template ingestion + Revise; Source Attribution panel on every artifact; paywall = deliverable volume (Gamma/NotebookLM-proven) + Deep/PRISMA modes.
5. **Map layer**: evidence map per question wired to Monitoring ("watch this map").

### What we do NOT do
- Don't vote-count in the Meter (Consensus's documented flaw).
- Don't present journal-prestige as claim quality (container ≠ content).
- Don't chase OpenEvidence's licensing moat (NEJM/JAMA full text is not gettable at our size); our lane is consumer/investigational with deterministic safety + provenance.
- Don't build voice podcasts or knowledge-graph gimmicks before deliverables — deliverables are the revenue-proven layer.

## Key Takeaways
- The market's four layers have never been combined; PharmaOrb already owns pieces of all four.
- Cited deliverables = biggest gap + proven willingness to pay (Gamma $100M ARR uncited; best competitor 44% claim verification).
- The scite-style trust layer is buildable free (scite public tallies + Semantic Scholar contexts + CC0 retraction data).
- Per-claim numeric confidence is an open frontier — Google killed theirs; a weighted per-sub-claim meter would be genuinely novel in production.
- External audits (76.5% ChatGPT attribution errors) keep validating the deterministic-provenance moat.

## Methodology
Four parallel research agents, ~25 search queries + ~30 full-page reads across official docs, pricing pages, independent audits (CJR/Tow, LayerProof, Aaron Tay), teardowns (ziptie.dev, FunnelStory), and funding coverage. Sub-questions: assistant grounding architectures; scite/Consensus/Elicit mechanics + licensability; NotebookLM/maps/deliverables; medical vertical + open corpora. Single-source claims flagged inline in the agent handoffs (kept in session transcript).
