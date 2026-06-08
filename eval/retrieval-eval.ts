// eval/retrieval-eval.ts
// Deterministic retrieval-quality scorecard. No LLM, no quota. Writes the baseline artifact.
// Exposes runRetrievalEval() so the CI gate can run it IN-PROCESS (no fragile nested subprocess);
// run as a CLI (import.meta.main) it prints the report and, with --write-baseline, persists it.
import { loadGolden } from "./golden/schema.ts";
import { embedQuery } from "./lib/voyage.ts";
import { matchChunks, mintUser, readEnv, resolveSourceIds, teardownUser } from "./lib/corpus.ts";
import { mean, mrr, ndcgAtK, recallAtK } from "./lib/metrics.ts";

const K_RECALL = [5, 10, 20];
const NDCG_K = 10;
const MATCH_COUNT = 50;

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
}

export interface RetrievalReport {
  generated_for: string;
  golden_total: number;
  answerable_scored: number;
  unresolved_gold: number;
  unanswerable_total: number;
  unanswerable_clean: number;
  aggregate: Record<string, number>;
  per_item: Array<Record<string, unknown>>;
}

export async function runRetrievalEval(): Promise<RetrievalReport> {
  const env = readEnv();
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
      if (item.expected_sources.length > 0 && goldIds.size === 0) { unresolvedGold++; continue; } // gold not in corpus
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

    return {
      generated_for: env.SB_URL,
      golden_total: golden.length,
      answerable_scored: perItem.length,
      unresolved_gold: unresolvedGold,
      unanswerable_total: unanswerable.length,
      unanswerable_clean: unanswerableClean, // should equal unanswerable_total (AC3)
      aggregate: agg,
      per_item: perItem,
    };
  } finally {
    await teardownUser(env, user.userId);
  }
}

if (import.meta.main) {
  const report = await runRetrievalEval();
  console.log(JSON.stringify(report, null, 2));
  if (Deno.args.includes("--write-baseline")) {
    await Deno.writeTextFile(new URL("./baselines/2026-06-08-retrieval-baseline.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
    console.error("baseline written");
  }
}
