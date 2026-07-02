// READ-ONLY measurement probe: how big is `aug.pool` (the FULL reranked union of dense-library
// chunks + live-source candidates) BEFORE it gets sliced down to the top matchCount (12 base /
// 18 thorough) that the user actually sees as sources?
//
// This replicates `augmentWithLive` (supabase/functions/ask/index.ts:496-548) by importing and
// calling the REAL exported functions it calls — retrieve(), gatherLiveCandidates(),
// rerankChunks(), liveToChunk(), understandQuery(), classify() — rather than reimplementing any
// of their internals. Nothing here mutates supabase/functions/ask/*.ts, deploys anything, or
// writes to a database beyond the read-through side effects `classify()`/`retrieve()` already
// have in normal /ask usage (an LLM call + Voyage embed + Supabase RPC reads).
//
// Run:
//   cd .claude/worktrees/retrieval-depth
//   deno run --env-file=supabase/functions/.env --allow-env --allow-net --allow-read \
//     scripts/diag/augment-pool-size.ts

import { classify } from "../../supabase/functions/ask/classify.ts";
import { llmApiKey } from "../../supabase/functions/ask/llm.ts";
import { understandQuery, isConsumerProductOnlyQuery } from "../../supabase/functions/ask/query-understanding.ts";
import { providerPriorityForIntent } from "../../supabase/functions/ask/templates.ts";
import { retrieve } from "../../supabase/functions/ask/retrieve.ts";
import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
import { rerankChunks } from "../../supabase/functions/ask/rerank.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";
import { extractSearchTerms } from "../../supabase/functions/ask/search-query.ts";
import { espellCorrect } from "../../supabase/functions/core-source-sync/providers/pubmed.ts";
import type { Intent } from "../../packages/shared/src/answer.ts";

// ---- Constants copied verbatim from supabase/functions/ask/index.ts (read-only measurement;
// these are literal-value copies, not imports, because index.ts does not export them). ----
// index.ts:84  const ASK_MATCH_THRESHOLD = 0.5;
const ASK_MATCH_THRESHOLD = 0.5;
// index.ts:103 const THOROUGH_LIVE_PER_SOURCE_MAX = 12;
const THOROUGH_LIVE_PER_SOURCE_MAX = 12;
// index.ts:93  const THOROUGH_MATCH_COUNT = 18;
const THOROUGH_MATCH_COUNT = 18;

const SB_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL") ?? "https://qyjmivntajbigjswhahb.supabase.co";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SERVICE_KEY) {
  console.error("SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required — none found in env.");
  Deno.exit(1);
}

const QUESTIONS = [
  "Is sucralose bad for me?",
  "How effective is tirzepatide for weight loss?",
  "How does metformin lower blood sugar?",
  "Can I take ibuprofen with lisinopril?",
];

interface RowResult {
  question: string;
  dense: number;
  live: number;
  union: number;
  reranked: number;
  scoreAt: (rank: number) => string;
  failedSources: string[];
}

function fmtScore(chunks: Array<{ rerank_score: number }>, rank: number): string {
  const idx = rank - 1; // rank 1 = index 0 (chunks are already sorted most-relevant-first)
  if (idx < 0 || idx >= chunks.length) return "n/a";
  return chunks[idx].rerank_score.toFixed(4);
}

async function measureOne(question: string): Promise<RowResult> {
  const failedSources: string[] = [];
  const origConsoleError = console.error;
  // gatherLiveCandidates is already per-source fault-tolerant: a failed/slow source is caught
  // inside withTimeout (live-sources.ts:270-274) and logged via console.error("live source <label>
  // failed: ..."). Capture those lines here (without editing that file) so we can report which
  // source(s) failed per question.
  console.error = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
    if (line.includes("live source") && line.includes("failed")) {
      failedSources.push(line);
    }
    origConsoleError(...args);
  };

  try {
    // ---- classify (real LLM call — mirrors index.ts step 1: intent + entity_mentions) ----
    const apiKey = llmApiKey();
    let entityMentions: string[] = [];
    let intent: Intent = "health_context";
    try {
      const cls = await classify(question, apiKey);
      entityMentions = cls.entity_mentions;
      intent = cls.intent;
    } catch (e) {
      console.warn(`  classify() failed (${(e as Error).message}); falling back to [] mentions / health_context intent`);
    }

    // ---- query understanding (mirrors augmentWithLive's own re-derivation, index.ts:507-527) ----
    const baseResearchQuery = extractSearchTerms(question) || question;
    const understood = understandQuery(question, entityMentions, baseResearchQuery);
    const term = understood.sourceQuery;
    let researchQuery = understood.researchQuery;
    if (understood.fieldMentions.length === 0) {
      researchQuery = await espellCorrect(researchQuery);
    }

    // ---- dense retrieve (mirrors index.ts step 3, using matchCount=18 per the task spec) ----
    const consumerProductOnly = isConsumerProductOnlyQuery(understood);
    const priority = consumerProductOnly ? ["pubmed_oa"] : providerPriorityForIntent(intent);
    const retrieveOpts = {
      question,
      providers: priority,
      entityId: null,
      threshold: ASK_MATCH_THRESHOLD,
      matchCount: THOROUGH_MATCH_COUNT,
      sbUrl: SB_URL,
      serviceKey: SERVICE_KEY,
    };
    let ret = await retrieve(retrieveOpts);
    if (!consumerProductOnly && ret.chunks.length === 0 && priority !== null) {
      ret = await retrieve({ ...retrieveOpts, providers: null });
    }
    const denseCount = ret.chunks.length;

    // ---- live candidates (mirrors index.ts:528) ----
    const live = await gatherLiveCandidates({
      query: term,
      mentions: understood.fieldMentions,
      researchQuery,
      perSourceMax: THOROUGH_LIVE_PER_SOURCE_MAX,
    });
    const liveCount = live.length;

    // ---- union (mirrors index.ts:531 exactly) ----
    const combined: RetrievedChunk[] = [...ret.chunks, ...live.map((c, i) => liveToChunk(c, String(i + 1)))];
    const unionCount = combined.length;

    // ---- rerank the union (mirrors index.ts:534 — reranks on `question`, not `term`) ----
    let ordered: Array<RetrievedChunk & { rerank_score: number }> = [];
    try {
      ordered = await rerankChunks(question, combined);
    } catch (e) {
      console.warn(`  rerankChunks failed (${(e as Error).message}); pool falls back to unordered dense+live union`);
      ordered = combined.map((c) => ({ ...c, rerank_score: NaN }));
    }

    return {
      question,
      dense: denseCount,
      live: liveCount,
      union: unionCount,
      reranked: ordered.length,
      scoreAt: (rank: number) => fmtScore(ordered, rank),
      failedSources: [...new Set(failedSources)],
    };
  } finally {
    console.error = origConsoleError;
  }
}

async function main() {
  console.log("augment-pool-size probe — measuring aug.pool size before the top-18 slice\n");
  console.log(`SB_URL=${SB_URL}`);
  console.log(`matchCount(thorough)=${THOROUGH_MATCH_COUNT}  perSourceMax(thorough)=${THOROUGH_LIVE_PER_SOURCE_MAX}  threshold=${ASK_MATCH_THRESHOLD}\n`);

  const results: RowResult[] = [];
  for (const q of QUESTIONS) {
    console.log(`--- "${q}" ---`);
    try {
      const r = await measureOne(q);
      results.push(r);
      console.log(`  dense=${r.dense}  live=${r.live}  union=${r.union}  reranked(pool)=${r.reranked}`);
      console.log(`  rerank score  rank1=${r.scoreAt(1)}  rank18=${r.scoreAt(18)}  rank30=${r.scoreAt(30)}  rank40=${r.scoreAt(40)}  min(rank${r.reranked})=${r.scoreAt(r.reranked)}`);
      if (r.failedSources.length) {
        console.log(`  failed live sources:\n    ${r.failedSources.join("\n    ")}`);
      }
    } catch (e) {
      console.error(`  MEASUREMENT FAILED: ${(e as Error).message}`);
    }
    console.log("");
  }

  console.log("=== SUMMARY TABLE (tab-separated) ===");
  console.log(["question", "dense", "live", "union", "reranked", "score@1", "score@18", "score@30", "score@40", "score@min"].join("\t"));
  for (const r of results) {
    console.log([
      r.question,
      r.dense,
      r.live,
      r.union,
      r.reranked,
      r.scoreAt(1),
      r.scoreAt(18),
      r.scoreAt(30),
      r.scoreAt(40),
      r.scoreAt(r.reranked),
    ].join("\t"));
  }
}

main().catch((e) => {
  console.error("probe failed:", (e as Error).message);
  Deno.exit(1);
});
