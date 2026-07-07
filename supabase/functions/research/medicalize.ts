// Plain-English → biomedical-search-terminology rewrite for deep-research retrieval.
//
// The deep-research engine (../ask/research/orchestrate.ts, FROZEN) retrieves per sub-question and, when
// the caller hands it a non-empty sub_questions list, uses that list VERBATIM (resolveSubQuestions →
// provided wins, engine planning skipped). So we can sharpen retrieval WITHOUT touching the frozen engine:
// take the plain-English sub-questions the planner produced and rewrite each into precise MeSH-style search
// terminology (controlled vocabulary, drug/condition synonyms, standard qualifiers). Better search phrasing
// → better recall of the right sources; it shapes retrieval only and asserts no facts.
//
// This is a light, cheap LLM call (scope-tier model), and it is NON-LOAD-BEARING: on ANY failure — no key,
// model error, malformed output, or a count/shape that doesn't match the input — it returns the INPUT
// sub-questions unchanged. It NEVER throws and NEVER blocks a run.

import { callTool, type Tool } from "../ask/llm.ts";
import { modelFor } from "../ask/model-router.ts";

// Same bounds the research fn applies to caller-provided sub_questions (index.ts): each ≤ 300 chars.
const MAX_SUB_QUESTION_LEN = 300;

export const MEDICALIZE_TOOL: Tool = {
  name: "medicalize_sub_questions",
  description:
    "Rewrite each plain-English research sub-question into precise biomedical SEARCH terminology: " +
    "MeSH-style controlled vocabulary, standard drug/condition synonyms and qualifiers. Preserve the " +
    "count and order exactly — one rewrite per input, same position.",
  parameters: {
    type: "object",
    properties: {
      medicalized: {
        type: "array",
        items: { type: "string" },
        description:
          "One rewritten sub-question per input, SAME order and SAME count. Use controlled biomedical " +
          "vocabulary (e.g. 'metformin AND (neoplasms/prevention and control) AND diabetes mellitus, " +
          "type 2'). Keep the clinical meaning identical — do NOT add, drop, or reorder items, and do " +
          "NOT answer the question. Name the drug/compound explicitly (never 'it' / 'this').",
      },
    },
    required: ["medicalized"],
  },
};

const MEDICALIZE_SYSTEM = [
  "You are the query-expansion step of a conservative, source-grounded medical research engine.",
  "You do NOT answer questions. You rewrite each plain-English sub-question into precise biomedical",
  "SEARCH terminology so a downstream evidence-retrieval step finds the right cited sources.",
  "",
  "Rules:",
  "- Return EXACTLY one rewrite per input sub-question, in the SAME order. Never add, drop, merge, or",
  "  reorder items — the count of outputs must equal the count of inputs.",
  "- Use MeSH-style controlled vocabulary, standard drug/condition synonyms, and qualifiers",
  "  (e.g. 'metformin AND (neoplasms/prevention and control) AND diabetes mellitus, type 2').",
  "- Preserve the exact clinical meaning of each sub-question. Name the drug/compound explicitly.",
  "- Stay strictly informational: never rewrite into a sourcing, dosing-instruction, or personal",
  "  medical-advice query.",
  "- Record the result with medicalize_sub_questions.",
].join("\n");

/**
 * Clamp + validate a raw medicalized list against the input contract: it must be a 1:1 rewrite —
 * same count as the input, every entry a non-empty string. Each entry is trimmed and clamped to
 * MAX_SUB_QUESTION_LEN. If the shape does not match (wrong count, a non-string/empty entry, or a
 * non-array), the ORIGINAL input list is returned unchanged. PURE: no I/O, fully unit-testable.
 */
export function normalizeMedicalized(raw: unknown, input: readonly string[]): string[] {
  if (!Array.isArray(raw) || raw.length !== input.length) return [...input];
  const cleaned: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return [...input];
    const q = item.trim();
    if (!q) return [...input];
    cleaned.push(q.length > MAX_SUB_QUESTION_LEN ? q.slice(0, MAX_SUB_QUESTION_LEN) : q);
  }
  return cleaned;
}

/**
 * Rewrite each plain-English sub-question into biomedical search terminology. One cheap forced-tool LLM
 * call (scope-tier model). Degrades to the INPUT list unchanged on ANY failure (empty input, no key,
 * model error, malformed / count-mismatched output). Never throws.
 */
export async function medicalizeSubQuestions(subQuestions: string[], apiKey: string): Promise<string[]> {
  if (subQuestions.length === 0) return subQuestions;
  try {
    const { input } = await callTool<{ medicalized?: unknown }>(
      {
        model: modelFor("scope"),
        max_tokens: 1024,
        temperature: 0,
        system: MEDICALIZE_SYSTEM,
        tools: [MEDICALIZE_TOOL],
        messages: [{
          role: "user",
          content:
            `Rewrite each of these ${subQuestions.length} sub-questions into biomedical search ` +
            `terminology with medicalize_sub_questions (same order, same count):\n\n` +
            subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
        }],
      },
      "medicalize_sub_questions",
      apiKey,
    );
    return normalizeMedicalized(input.medicalized, subQuestions);
  } catch (e) {
    console.error("research medicalize failed; using plain-English sub-questions:", (e as Error).message);
    return subQuestions;
  }
}
