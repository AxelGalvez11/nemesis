// eval/answer-eval.ts
//
// SCAFFOLD ONLY — NOT A GATE IN PR0. This file is intentionally NOT wired into
// `.github/workflows/eval.yml`. It exercises the live `/ask` answer engine (LLM +
// quota), so unlike the retrieval harness it is neither cheap nor deterministic
// yet, and must not block merges until the judge model is chosen (see OPEN
// DECISIONS in the plan) and the `{tag -> chunk_id}` map lands (see eval/README.md).
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

import { loadGolden } from "./golden/schema.ts";
import { grantEnterprise, mintUser, readEnv, teardownUser } from "./lib/corpus.ts";

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
    what_we_know: Array<{ text: string; citation_ids: string[] }>;
    what_we_do_not_know: Array<{ text: string }>;
    safety_notes: Array<{ text: string; citation_ids: string[] }>;
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

const env = readEnv();
const golden = await loadGolden();

const user = await mintUser(env);
const transcripts: Array<{ id: string; question: string; response: AskResponse | { __error: string } }> = [];

try {
  // enterprise entitlement → 1000/day, so the `/ask` burst doesn't 429-false-fail.
  await grantEnterprise(env, user.userId);

  for (const item of golden) {
    await sleep(PACE_MS);
    const response = await ask(env, user.jwt, item.question);
    transcripts.push({ id: item.id, question: item.question, response });

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

  // SCAFFOLD: no scoring / no gate yet. Emit the raw transcripts so the judging
  // TODOs above have something to consume once implemented.
  console.log(JSON.stringify({
    generated_for: env.SB_URL,
    golden_total: golden.length,
    note: "SCAFFOLD — no judge scoring yet (see TODO a/b); not a gate, not in eval.yml",
    transcripts,
  }, null, 2));
} finally {
  await teardownUser(env, user.userId);
}
