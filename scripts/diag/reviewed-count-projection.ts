// READ-ONLY: project the NEW "also reviewed" count using the REAL production buildReviewedSet applied
// to the REAL live reranked pool — before deploying. Answers: does the visible source count jump from
// ~18 toward ~40, and how does the 0.35 floor treat weak-coverage (consumer) queries?
//
// Not a substitute for the deployed guardrail suite (which can only test deployed code) — this validates
// the display-derivation math end-to-end on live data using the actual shipped functions.
//
// Run: SB_URL=https://qyjmivntajbigjswhahb.supabase.co \
//   deno run --env-file=supabase/functions/.env --allow-env --allow-net --allow-read scripts/diag/reviewed-count-projection.ts

import { classify } from "../../supabase/functions/ask/classify.ts";
import { llmApiKey } from "../../supabase/functions/ask/llm.ts";
import { understandQuery } from "../../supabase/functions/ask/query-understanding.ts";
import { providerPriorityForIntent } from "../../supabase/functions/ask/templates.ts";
import { retrieve } from "../../supabase/functions/ask/retrieve.ts";
import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
import { rerankChunks } from "../../supabase/functions/ask/rerank.ts";
import { buildReviewedSet, type RetrievedChunk } from "../../supabase/functions/ask/citation.ts";
import { evidenceRole } from "../../supabase/functions/ask/source-support.ts";
import { buildSubQueries, extractSearchTerms } from "../../supabase/functions/ask/search-query.ts";
import type { Intent } from "../../packages/shared/src/answer.ts";

const SB_URL = Deno.env.get("SB_URL") ?? "https://qyjmivntajbigjswhahb.supabase.co";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const THRESHOLD = 0.5, THOROUGH_MATCH = 18, THOROUGH_PER_SOURCE = 12, THOROUGH_RECALL_POOL = 40;
const REVIEWED_CAP = 34, REVIEWED_SCORE_FLOOR = 0.35, ASSUMED_CITED = 6; // ~cited count for the projection

const QUESTIONS = [
  "Is sucralose bad for me?",
  "How effective is tirzepatide for weight loss?",
  "How does metformin lower blood sugar?",
  "Can I take ibuprofen with lisinopril?",
];

async function main() {
  if (!SERVICE_KEY) throw new Error("SERVICE_KEY required");
  console.log("Projected NEW reviewed count (real buildReviewedSet over the real live pool, thorough)\n");
  console.log("query\tpool(multiQ)\tabove_floor\treviewed(new)\ttotal(new)\told_total");

  for (const q of QUESTIONS) {
    let entityMentions: string[] = [], intent: Intent = "health_context";
    try { const c = await classify(q, llmApiKey()); entityMentions = c.entity_mentions; intent = c.intent; } catch { /* fallback */ }
    const u = understandQuery(q, entityMentions, extractSearchTerms(q) || q);
    // Multi-query dense recall (Task 3b), as production computes it under LIVE_SOURCES_ON.
    const subQueries = buildSubQueries(q, entityMentions, intent);
    const dense = await retrieve({
      question: q, providers: providerPriorityForIntent(intent), entityId: null, threshold: THRESHOLD,
      matchCount: THOROUGH_MATCH, subQueries, recallPool: THOROUGH_RECALL_POOL, sbUrl: SB_URL, serviceKey: SERVICE_KEY,
    });
    let live: Awaited<ReturnType<typeof gatherLiveCandidates>> = [];
    try { live = await gatherLiveCandidates({ query: u.sourceQuery, mentions: u.fieldMentions, researchQuery: u.researchQuery, perSourceMax: THOROUGH_PER_SOURCE }); } catch { /* best-effort */ }
    const combined: RetrievedChunk[] = [...dense.chunks, ...live.map((c, i) => liveToChunk(c, String(i + 1)))];
    const reranked = await rerankChunks(q, combined);
    const aboveFloor = reranked.filter((c) => (c.rerank_score ?? c.similarity ?? 0) >= REVIEWED_SCORE_FLOOR).length;
    // Exclude a proxy cited set (top ASSUMED_CITED chunk_ids) and run the REAL production helper.
    const citedIds = new Set(reranked.slice(0, ASSUMED_CITED).map((c) => c.chunk_id));
    const reviewed = buildReviewedSet(
      reranked as (RetrievedChunk & { rerank_score?: number })[], citedIds, ASSUMED_CITED,
      REVIEWED_SCORE_FLOOR, REVIEWED_CAP,
      (c) => { const er = evidenceRole(c); return { evidence_role: er.role, evidence_weight: er.weight }; },
    );
    const total = ASSUMED_CITED + reviewed.length;
    console.log(`${q.slice(0, 20)}\t${reranked.length}\t${aboveFloor}\t${reviewed.length}\t${total}\t18`);
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log("\n(old_total = today's ~18 thorough. new total = cited(~6) + reviewed. Floor 0.35 keeps drug-question tails, trims weak consumer tails.)");
}

main().catch((e) => console.error("probe failed:", (e as Error).message));
