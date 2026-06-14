// eval/answer-eval.ts
//
// Answer-quality benchmark. NOT a CI gate: it exercises the live `/ask` engine (LLM + quota), so
// unlike the deterministic retrieval gate it is run on demand to produce a tracked scorecard, not
// on every PR. It is intentionally NOT wired into `.github/workflows/eval.yml`.
//
// IMPLEMENTED (deterministic, no judge): a scorecard over the golden set —
//   - answered_rate       : answerable items that delivered a real cited answer,
//   - grounding_coverage  : fraction of cited claims backed by a verbatim WS-C `support` span
//                           (the headline faithfulness PROXY — "a supporting sentence was FOUND",
//                           not yet "the source semantically ENTAILS the claim"),
//   - citation_coverage   : fraction of claims carrying a citation tag,
//   - clean_refusal_rate  : unanswerable items correctly refused.
// STILL TODO (the semantic LLM-judge layer, a/b below): temperature-0 entailment faithfulness +
// relevance + completeness, pending the judge-model decision. The `{tag -> chunk_id}` blocker noted
// in eval/README.md is partially lifted by the WS-C `support` spans (per-claim source provenance).
//
// What it does today:
//   - mints a throwaway authenticated user (real app path, not the service key),
//   - grants that user `enterprise` so the `/ask` calls don't hit the free-tier
//     10/day quota and false-fail with 429 (see pharmabro-guardrail-ci-quota-falsefail),
//   - POSTs each golden question to `${SB_URL}/functions/v1/ask` with ~2s pacing
//     (mirrors scripts/phase3-validate.ts so an LLM-call burst doesn't trip the
//     provider rate limit), collects the structured AskResponse,
//   - tears the user down in `finally`.
//
// What it does NOT do yet (the two pending pieces, left as explicit TODOs below):
//   (a) temperature-0 LLM-judge groundedness/relevance scoring — pending the
//       judge-model choice (an OPEN DECISION),
//   (b) strict per-citation faithfulness — pending the `{tag -> chunk_id}` map the
//       Answer Engine must persist in the trace/response (see eval/README.md).
//
// Usage (when implemented):
//   SB_URL=... SERVICE_KEY=... ANON_KEY=... \
//     deno run --allow-net --allow-env --allow-read eval/answer-eval.ts

import { loadGolden, type GoldenItem } from "./golden/schema.ts";
import { grantEnterprise, mintUser, readEnv, teardownUser } from "./lib/corpus.ts";
import { scoreAnswers, type ScoredAnswer } from "./lib/answer-metrics.ts";

// Spacing between LLM-backed `/ask` calls so the run doesn't burst the provider
// rate limit (real usage isn't bursty; a transient 5xx here would be a harness
// artifact, not a bug). Mirrors PACE_MS in scripts/phase3-validate.ts.
const PACE_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The structured shape `/ask` returns (mirrors scripts/phase3-validate.ts). The
// groundedness/faithfulness TODOs below will consume this — `answer_sections`
// carries the prose to judge, `citations` the claimed sources.
interface AskResponse {
  answer_id: string;
  intent: string;
  plain_english_summary: string;
  evidence_grade: string;
  answer_sections: {
    // `support` is the WS-C verbatim provenance span(s) for a claim — present only when a cited
    // source sentence cleared the support threshold. Its presence is the grounding-coverage signal.
    what_we_know: Array<{ text: string; citation_ids: string[]; support?: Array<{ quote?: string }> }>;
    what_we_do_not_know: Array<{ text: string }>;
    safety_notes: Array<{ text: string; citation_ids: string[]; support?: Array<{ quote?: string }> }>;
    questions_to_ask: string[];
  };
  // NOTE: per eval/README.md, a Citation today carries `chunk_tag` + `source_id`
  // but NO `chunk_id` / chunk text — which is exactly why strict per-citation
  // faithfulness (TODO b) is blocked until the Answer Engine persists a
  // `{tag -> chunk_id}` map.
  citations: Array<{ source_id: string; source_type: string; url: string | null }>;
  safety_flags: string[];
  template?: string;
  refused_unsupported: boolean;
}

async function ask(
  env: ReturnType<typeof readEnv>,
  jwt: string,
  question: string,
): Promise<AskResponse | { __error: string }> {
  const res = await fetch(`${env.SB_URL}/functions/v1/ask`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question, use_health_context: false }),
  });
  if (!res.ok) return { __error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  return await res.json();
}

// Reduce a golden item + its /ask response to the deterministic signals the scorecard scores.
// "delivered" = a real cited answer (not a safety template / unsupported-refusal / zero-citation).
// A claim is "supported" when it carries a verbatim WS-C `support` span; "cited" when it has a tag.
function toScored(item: GoldenItem, r: AskResponse | { __error: string }): ScoredAnswer {
  const answerable = item.answerability === "answerable";
  if ("__error" in r) return { id: item.id, answerable, delivered: false, claims: [] };
  const delivered = !r.template && !r.refused_unsupported && r.citations.length > 0;
  const points = delivered
    ? [...(r.answer_sections?.what_we_know ?? []), ...(r.answer_sections?.safety_notes ?? [])]
    : [];
  return {
    id: item.id,
    answerable,
    delivered,
    claims: points.map((p) => ({
      cited: (p.citation_ids?.length ?? 0) > 0,
      supported: (p.support?.length ?? 0) > 0,
    })),
  };
}

const env = readEnv();
const golden = await loadGolden();

const user = await mintUser(env);
const transcripts: Array<{ id: string; question: string; response: AskResponse | { __error: string } }> = [];
const scored: ScoredAnswer[] = [];

try {
  // enterprise entitlement → 1000/day, so the `/ask` burst doesn't 429-false-fail.
  await grantEnterprise(env, user.userId);

  for (const item of golden) {
    await sleep(PACE_MS);
    const response = await ask(env, user.jwt, item.question);
    transcripts.push({ id: item.id, question: item.question, response });
    scored.push(toScored(item, response));

    // TODO(a) — temperature-0 LLM-judge groundedness + relevance scoring.
    //   Pending the judge-model choice (OPEN DECISION). When chosen, judge:
    //     - groundedness: is every claim in `answer_sections` supported by the
    //       retrieved context as a whole? (context-level — what PR0 scopes),
    //     - relevance: does the answer actually address `item.question`?
    //   Anti-flake rules (see eval/README.md): temperature 0, pinned model+prompt,
    //   aggregate-with-margin. Must NOT gate until those are in place.

    // TODO(b) — strict per-citation faithfulness (NLI support-check).
    //   BLOCKED on the Answer Engine persisting a `{tag -> chunk_id}` map in the
    //   trace/response. Today `citations` has `chunk_tag` + `source_id` but no
    //   `chunk_id` / chunk text, so a specific citation can't be traced to the
    //   exact chunk it claims to cite. Once the map lands, per-citation
    //   faithfulness can check whether each cited chunk entails its sentence.
  }

  // Deterministic answer-quality scorecard (no LLM judge — see TODO a/b for the semantic layer).
  // grounding_coverage is the headline: fraction of cited claims backed by a verbatim source span.
  const scorecard = scoreAnswers(scored);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.error(
    `\nAnswer-quality scorecard (deterministic) — ${env.SB_URL}\n` +
      `  answered_rate       ${pct(scorecard.answered_rate)}  (${scorecard.delivered}/${scorecard.answerable_total} answerable delivered)\n` +
      `  grounding_coverage  ${pct(scorecard.grounding_coverage)}  (claims with a verbatim support span, of ${scorecard.claims_scored})\n` +
      `  citation_coverage   ${pct(scorecard.citation_coverage)}\n` +
      `  clean_refusal_rate  ${pct(scorecard.clean_refusal_rate)}  (${scorecard.unanswerable_refused}/${scorecard.unanswerable_total} unanswerable refused)\n`,
  );
  console.log(JSON.stringify({
    generated_for: env.SB_URL,
    golden_total: golden.length,
    note: "deterministic scorecard; LLM-judge faithfulness/relevance/completeness still TODO (a/b)",
    scorecard,
    transcripts,
  }, null, 2));
} finally {
  await teardownUser(env, user.userId);
}
