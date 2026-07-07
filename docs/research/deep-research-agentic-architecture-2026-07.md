# Copying ChatGPT Deep Research — architecture brief (2026-07-07)

Research-backed plan to replicate OpenAI's agentic iterative deep-research loop into PharmaOrb's
research engine (Deno/Supabase edge fn, DeepSeek, Tavily wired). Sources at bottom.

## The canonical loop (every open-source clone converges on this — dzhng/deep-research is closest to our stack)

```
deepResearch(query, breadth, depth, learnings=[], sources=[]):
  if depth == 0: return finalize(query, learnings, sources)
  serpQueries = generateSerpQueries(query, learnings, n=breadth)     # LLM call
  parallel (bounded 2-4) for each serpQuery:
    results = tavilySearch(serpQuery, max_results=5)
    {learnings, followUps} = extractLearnings(serpQuery, results)    # LLM call — PER SOURCE for us
    sources += results.urls
    if depth-1 > 0:
      recurse deepResearch(combine(goal, followUps), ceil(breadth/2), depth-1, learnings, sources)
  return dedupe(learnings), dedupe(sources)
finalize: writeFinalReport(query, ALL learnings, sources)            # LLM call; sources appended mechanically
```

Breadth **halves each level** (`ceil(breadth/2)`) → bounds total queries instead of exploding.

## The 4 prompts (load-bearing)

- **(a) SERP query gen:** "Given the query [+ prior learnings], generate N unique search queries; for each state the research goal + follow-up directions." Schema-constrained output.
- **(b) Learning extraction (MOST IMPORTANT):** "From these results for query X, extract up to N concise, entity- and number-preserving learnings + up to N follow-up questions." Converts noisy pages → atomic facts BEFORE synthesis → bounds tokens.
- **(c) Gap/follow-up:** not separate — bundled into (b)'s followUps; recursion re-queries on goal+followUps.
- **(d) Synthesis:** "Given the original prompt + ALL learnings, write a 3+ page cited report." Sources appended as a mechanical `## Sources` bibliography.

## Parameters for a 4-6 min background job (research recommendation)

- **Depth 2** (root + one follow-up). Depth 3 = runaway cost, diminishing novelty.
- **Breadth 3-4** at root, halving to 2 → ~10-12 total searches, run with concurrency 2-4.
- **max_results 5** per query (more = noise).
- Budget ~2-3 min compute inside a 4-6 min ceiling.

## CRITICAL medical-tool adaptation (deviate from dzhng here)

dzhng tracks citations at the **source-list level** (flat URL array, appended as bibliography) — the
LLM never attributes a claim to a URL. That's the clones' hallucinated-citation weakness. For
PharmaOrb we MUST carry a **`{learning, sourceUrl, sourceText}` tuple** — extract learnings
**per single source, not per batch of 5** — so each learning has exactly one backing URL+text. This
feeds our existing per-claim faithfulness judge, which drops any claim its cited source doesn't
support. That judge + the deterministic forbidden-phrase scan are what make web grounding SAFE in a
medical tool: web breadth in, citation bar unchanged.

## Tavily knobs + credit math

- `search_depth: "basic"` = 1 credit (broad root fan-out); `"advanced"` = 2 credits (precision follow-ups only).
- `include_raw_content: true` — no extra cost on /search, returns cleaned page markdown → no second scrape.
- `max_results` 5 default.
- Extract endpoint = 1 credit / 5 URLs (basic) for scraping a specific known URL.
- ~10-12 basic searches/run ≈ 10-12 credits → ~330-400 runs/mo on the $30 4,000-credit plan. Cheap enough to run per query.

## Pitfalls the repos warn about

1. **Token blowup from raw pages** — truncate each page (dzhng: 25k chars) and extract-then-discard raw content; never accumulate raw text across the tree.
2. **Unbounded fan-out / rate limits** — bounded concurrency (semaphore), hard depth cap 2-3.
3. **Synthesis collapses on undeduped/unstructured learnings** — dedupe learnings (`Set`), keep them concise; optionally a supervisor "is the brief satisfied?" check before synthesis to not burn budget on easy queries.

## PharmaOrb build plan (Tier 2)

Gated `DEEP_RESEARCH_AGENTIC=on` (default off = today's pipeline byte-identical). New
`web-research.ts` runs the loop; each web result → RetrievedChunk (provider "web", synthetic id,
url, chunk_text = extracted content), trust-ranked (journal/.gov/.edu/Cochrane/guideline > blog).
Merged into the existing evidence pool → the SAME reranker + faithfulness judge + forbidden-phrase
scan + citation enforcement run unchanged. Progress events feed the existing Activity panel
(search queries, sources found) — the ChatGPT activity-trail parity we already have on deep research.

## Sources

- dzhng/deep-research: github.com/dzhng/deep-research (loop source)
- OpenAI Introducing Deep Research: openai.com/index/introducing-deep-research/
- OpenAI Deep Research system card: cdn.openai.com/deep-research-system-card.pdf
- GPT-Researcher: github.com/assafelovic/gpt-researcher
- LangChain open_deep_research: langchain.com/blog/open-deep-research
- HuggingFace open-deep-research: huggingface.co/blog/open-deep-research
- Tavily API + credits: docs.tavily.com/documentation/api-reference/endpoint/search , /documentation/api-credits
