# Token economy for the Nemesis agent — research synthesis (2026-07-16)

Five-way research sweep over how production agents (Claude Code, Aider, Cline, OpenHands,
Manus, Cursor, Devin) cut token burn. Every number below was verified by fetching the
primary source; single-vendor or anecdotal figures are marked. This doc ranks the
techniques by expected impact ON NEMESIS specifically.

## The two ledgers (read this first)

Nemesis has two different "token budgets" and most techniques only move one of them:

- **Ledger A — our provider bill** (what DeepSeek charges the company).
- **Ledger B — the student's metered daily budget** (raw token counts in usage_counters;
  free 25k / Student 1.5M / Pro 4M).

**Caching only moves Ledger A.** A cache hit is a price discount on tokens that are still
sent, still processed, and still counted. DeepSeek bills cache-hit input at ~2% of
cache-miss on v4-flash ($0.0028/M vs $0.14/M) and ~0.8% on v4-pro ($0.003625/M vs
$0.435/M) — enormous for our margin, invisible to the student's cap.
**Token-COUNT reducers (fewer tokens actually sent/generated) move both ledgers.**

## Ranked plan for Nemesis

### 1. Append-only context discipline → maximize DeepSeek cache hits (Ledger A, huge)
DeepSeek context-caching is automatic ("enabled by default for all users", 64-token
units, longest-prefix match, TTL hours-to-days). Agent loops resend the whole context
every step; Manus calls KV-hit rate "the single most important metric for a
production-stage AI agent" (input:output ≈ 100:1 in agent loops).
What breaks hits: timestamps early in the system prompt, editing earlier messages,
non-deterministic JSON key order, tool/schema changes mid-session, provider failover
(GLM/Gemini = guaranteed full miss).
**Nemesis actions:** audit the loop for byte-stable prefixes (SOUL.md static, tool
schemas static, no early timestamps); log `prompt_cache_hit_tokens` from DeepSeek
responses in nemesis-llm to get a live hit-rate metric before/after; treat auto-compact
as a deliberate cache-reset event (it rewrites history — unavoidable, but don't ALSO
bust the cache between compactions).

### 2. Browser work on text snapshots + batched actions (both ledgers, huge for school-sync)
Playwright's own docs: accessibility-tree snapshot ≈ 200–400 tokens vs 3,000–5,000 per
screenshot; Anthropic's computer-use docs: screenshots cost ~1,000–1,800 input tokens
each. Batching deterministic action sequences (click→type→submit as ONE call) measured
41% fewer total tokens and 74% fewer tool calls on a form task (arXiv 2511.19477).
Stale-snapshot accumulation is the other killer: multi-step MCP browser flows carried
90k+ tokens of old page snapshots by step 12 (practitioner benchmark, 114k vs 27k for
a disk-based CLI equivalent).
**Nemesis actions:** school-portal skills already prefer CDP/console bulk extraction —
harden that into a rule (screenshot only when vision is genuinely needed); keep only the
LAST page snapshot in context (OpenHands BrowserOutputCondenser pattern, k=1); write
harvested HTML to disk and digest in code, never inline.

### 3. Filter-in-code before the model sees it (both ledgers, huge for ingestion)
Anthropic (code-execution-with-MCP): filtering/aggregating tool results in a sandbox
before they reach the model turned 150,000 tokens into 2,000 (98.7%). Same doctrine:
`head`/`tail` sampling instead of loading whole files; subagent-style summaries return
1–2k tokens instead of tens of thousands.
**Nemesis actions:** this IS the half-built killer-workflow primitive
(bulk-harvest → digest → build). Lecture-file → flashcards pipelines should extract and
chunk text in code (skills already run shell) and feed the model distilled sections,
never raw dumps. HTML→markdown stripping for web pages: Firecrawl measured 94% fewer
input tokens (median page 38,381 → 2,788).

### 4. Tool-output diet: caps, pagination, re-read suppression (both ledgers)
Claude Code caps file reads (first 2,000 lines, offset/limit pagination) and suppresses
duplicate reads ("File unchanged since last read"); a community mtime-hook measured
~40% session savings from blocking re-reads alone (anecdote). Line-numbered read format
carries ~1.7x overhead vs raw text (practitioner measurement) — use raw content where
line numbers serve no purpose.
**Nemesis actions:** enforce read caps + pagination in the file tools; add
unchanged-file re-read suppression to the loop; audit our read format for decoration
overhead.

### 5. Model routing per step (Ledger A; protects margins on High mode)
v4-pro costs ~3.1x v4-flash on both cache-miss input and output. RouteLLM (LMSYS,
fetched): 85% cost reduction on MT-Bench at 95% of GPT-4 quality by routing only 14% of
calls to the big model. Devin's Fusion (frontier main + cheap sidekick): 35% cheaper at
frontier-level performance (their benchmark).
**Nemesis actions:** we already default flash and gate High mode; extend routing INSIDE
tasks — planning/verification on pro (when High), mechanical extraction/formatting on
flash, and ALL compaction/summarization on the aux cheap client (never the main model).

### 6. Lazy loading of skills and tool schemas (both ledgers, startup cost)
Anthropic's Tool Search Tool: 77k tokens of upfront schemas → 8.7k (85% cut) with
deferred loading, and accuracy ROSE on large tool libraries. Agent Skills progressive
disclosure: name+description always present; full SKILL.md body only on invocation.
**Nemesis actions:** verify the fork only injects skill names/descriptions up front
(not bodies); measure the static prefix (SOUL + schemas + skill list) — every session
pays it, and it's also the cache anchor, so slim it once and freeze it.

### 7. Smarter compaction (both ledgers; quality guardrails)
OpenHands condenser: keep first 4 events + recent, LLM-summarize the middle → up to 2x
per-turn API-cost reduction, cost growth quadratic→linear, NO solve-rate loss (54% vs
53%). Manus counter-lesson: never erase failed actions from context ("Erasing failure
removes evidence") — compaction that strips errors destroys error recovery.
**Nemesis actions:** we compact at 50% — keep the mission/first messages + recent turns,
summarize the middle with the AUX model, and explicitly preserve failure records in the
summary.

### 8. Batch independent tool calls / programmatic tool calling (both ledgers)
Multiple tool_use blocks per turn (parallel reads) avoid whole context resends per call;
Anthropic's programmatic tool calling measured 37% token reduction (43,588 → 27,297) by
keeping intermediates out of model context.
**Nemesis actions:** prompt/SOUL guidance for the agent to batch independent calls; the
digest-in-code pattern (#3) is the strong form of this.

### 9. Output-side discipline (Ledger B mostly)
DeepSeek output is only 2x input price (vs 5x Anthropic / 6x OpenAI), so output trimming
matters less for OUR bill — but the student's raw-count budget prices output tokens the
same as input, so concise-output prompting and per-task max_tokens caps directly stretch
their cap. Warning from a randomized trial (arXiv 2603.23525): moderate input
compression saved 27.9%, but AGGRESSIVE compression backfired (+1.8% total cost) because
the model wrote longer outputs. Don't over-trim.

### 10. Metering-fairness lever (owner decision, not engineering)
Because cache hits cut our cost 50x but not the student's meter, we could weight
cache-hit tokens at a fraction in usage metering (bill students the way DeepSeek bills
us). Heavy agent workflows would stop draining daily caps. Consequences: changes unit
economics, plan-limit calibration, and the money-watch alarm thresholds — needs an
explicit owner call before anyone touches metering.

## Anti-patterns confirmed by the research
- Spawning subagents to "save tokens" — Anthropic's own numbers: agents ≈ 4x chat
  tokens, multi-agent ≈ 15x. Isolation pays only when it avoids re-sending huge
  material across MANY remaining steps; prefer filter-in-code.
- Erasing failures during compaction (kills self-correction).
- Over-aggressive prompt compression (outputs balloon).
- Diff-only edit dogma: diffs cut output tokens, but failed diff→retry→full-rewrite
  spirals cost MORE (Cline issue); Cursor deliberately uses full-file + fast-apply for
  accuracy. Keep diff edits, keep the whole-file fallback fast.

## Sources
Primary pages fetched by the research agents: Anthropic engineering blog (context
engineering, advanced tool use, code execution with MCP, multi-agent research system),
platform.claude.com docs (prompt caching, pricing, compaction, computer use),
api-docs.deepseek.com (kv_cache, pricing, news0802), manus.im context-engineering post,
aider.chat docs, OpenHands docs/blog/PR #6578, playwright.dev/mcp/snapshots, LMSYS
RouteLLM post, cognition.com/blog/devin-fusion, cursor.com/blog/instant-apply,
firecrawl.dev blog, arXiv 2511.19477 + 2603.23525 + 2307.13854, plus flagged
practitioner issues/benchmarks (marked anecdotal above).
