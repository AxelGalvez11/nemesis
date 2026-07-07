// Gated typo-intent normalization for the research search string (QUERY_NORMALIZE, default OFF).
//
// WHY: general chatbots need no spell-checker — the LLM reads intent through typos natively. Our
// retrieval path is the opposite: the research string goes verbatim to strict literal-match APIs,
// and the NCBI espell helper only understands medical tokens (it MANGLES conversational text:
// "why is my skin itchy" -> "ho is my skin itchy"). When ON, this module supersedes espell with
// one cheap classify-tier LLM pass that fixes typos to the user's intended words — then a
// DETERMINISTIC gate (acceptNormalized) rejects any rewrite that changes the query's shape, so
// the model can never expand, truncate, answer, or otherwise hijack what gets searched.
//
// SCOPE (deliberate): rewrites ONLY the research search string handed to live retrieval. The
// literal `term`/entityMentions the fabrication guard checks, the deterministic safety scan, and
// the question the generator grounds on are all untouched. Fail-safe: any error, missing key, or
// rejected rewrite returns the original query unchanged.

import { callTool, hasLlmKey, llmApiKey, type Tool } from "./llm.ts";
import { modelFor } from "./model-router.ts";
import { isSafetyCriticalQuery } from "./live-sources.ts";

export function queryNormalizeEnabled(): boolean {
  return Deno.env.get("QUERY_NORMALIZE") === "on";
}

// Skip degenerate inputs (nothing to fix) and long ones (a well-formed long query doesn't sink
// literal retrieval over one typo, and a large rewrite is where latency + drift risk live).
const MIN_LEN = 3;
const MAX_LEN = 400;

export function shouldAttemptNormalize(researchQuery: string): boolean {
  const len = researchQuery.trim().length;
  return len >= MIN_LEN && len <= MAX_LEN;
}

// Typos change how words are SPELLED, not how many there are (small merge/split tolerance) and
// not the query's length class. Anything outside these bounds is an expansion, a truncation, or
// an attempted answer — return the original.
const MAX_WORD_DELTA = 3;
const MAX_LEN_RATIO = 1.6;
const MAX_LEN_SLACK = 12;
const MIN_LEN_RATIO = 0.4;

/**
 * Deterministic accept/reject gate on the model's rewrite. Strips wrapper junk (code fences,
 * surrounding quotes, newlines), then only passes a candidate whose shape matches the original.
 * Two content guards on top of shape:
 *   - `mustKeep` terms (the classifier's literal drug/entity mentions) that appear in the
 *     original must survive verbatim — the model may fix the words AROUND a drug name but can
 *     never "correct" the drug itself into a different one.
 *   - a rewrite may not paraphrase away the safety-critical trigger (isSafetyCriticalQuery is
 *     the exact predicate that gates the FDA-enforcement + toxicology live sources downstream,
 *     so an original that trips it must still trip it after normalization).
 * Pure — this is the entire trust boundary between the LLM and the retrieval query.
 */
export function acceptNormalized(
  original: string,
  candidate: string,
  mustKeep: readonly string[] = [],
): string {
  let out = candidate.trim();
  const fenced = out.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fenced) out = fenced[1].trim();
  if (out.length >= 2 && /^["'].*["']$/.test(out)) out = out.slice(1, -1).trim();
  out = out.replace(/\s+/g, " ");
  if (!out) return original;

  const originalWords = original.trim().split(/\s+/).length;
  const outWords = out.split(/\s+/).length;
  if (Math.abs(originalWords - outWords) > MAX_WORD_DELTA) return original;
  if (out.length > original.length * MAX_LEN_RATIO + MAX_LEN_SLACK) return original;
  if (out.length < original.length * MIN_LEN_RATIO) return original;

  const originalLower = original.toLowerCase();
  const outLower = out.toLowerCase();
  for (const term of mustKeep) {
    const t = term.trim().toLowerCase();
    if (t && originalLower.includes(t) && !outLower.includes(t)) return original;
  }

  if (isSafetyCriticalQuery(original) && !isSafetyCriticalQuery(out)) return original;
  return out;
}

const NORMALIZE_TOOL: Tool = {
  name: "submit_corrected_query",
  description: "Submit the search query with spelling and typing mistakes corrected.",
  parameters: {
    type: "object",
    properties: {
      corrected: {
        type: "string",
        description:
          "The query with obvious spelling/typing mistakes fixed to the words the user intended. Exactly unchanged if there are no mistakes.",
      },
    },
    required: ["corrected"],
  },
};

const NORMALIZE_SYSTEM =
  `You fix typos in a health research search query so literal-match medical databases can find it.
Rules:
- Correct obvious spelling/typing mistakes to the words the user intended (e.g. "metfrmin" -> "metformin", "skn itchey" -> "skin itchy").
- Keep every drug name, gene, and medical term as the user's INTENDED real term; never substitute a different drug or concept.
- Do not add, remove, or reorder concepts. Do not answer the question. Do not expand abbreviations.
- If nothing is misspelled, return the query exactly unchanged.`;

type CallToolFn = typeof callTool;

/**
 * One classify-tier LLM pass over the research search string. `mustKeep` carries the
 * classifier's literal drug/entity mentions so the gate can reject any rewrite that loses one.
 * Best-effort by contract: every failure mode (no key, API error, malformed output, rejected
 * rewrite) returns the original query, so with the flag ON a broken normalizer degrades to
 * today's behavior minus espell — never to a worse query. `callToolFn` is injectable for tests
 * only; production callers never pass it.
 */
export async function normalizeResearchQuery(
  researchQuery: string,
  mustKeep: readonly string[] = [],
  callToolFn: CallToolFn = callTool,
): Promise<string> {
  if (!hasLlmKey() || !shouldAttemptNormalize(researchQuery)) return researchQuery;
  try {
    const { input } = await callToolFn<{ corrected?: string }>(
      {
        model: modelFor("classify"),
        max_tokens: 300,
        temperature: 0,
        system: NORMALIZE_SYSTEM,
        tools: [NORMALIZE_TOOL],
        messages: [{ role: "user", content: researchQuery }],
      },
      "submit_corrected_query",
      llmApiKey(),
    );
    return acceptNormalized(researchQuery, String(input.corrected ?? ""), mustKeep);
  } catch (e) {
    console.error("query-normalize failed; using original query:", (e as Error).message);
    return researchQuery;
  }
}
