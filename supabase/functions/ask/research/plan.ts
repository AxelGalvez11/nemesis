// Deep Research — step 1: PLAN.
//
// Decompose the user's question into 3-6 focused sub-questions. Each becomes its own evidence-gather
// pass (retrieve + live, reranked against THAT sub-question), so the report covers distinct facets
// instead of collapsing onto the broad question's dominant facet. This is a light, cheap LLM call
// (classify-tier model); the decomposition is non-load-bearing — it shapes retrieval, it does NOT
// assert facts — so any failure degrades to the single original question rather than failing the run.

import { callTool, type Tool } from "../llm.ts";
import { modelFor } from "../model-router.ts";
import type { ReportMode } from "../../../../packages/shared/src/research.ts";

const MIN_SUB_QUESTIONS = 3;
const MAX_SUB_QUESTIONS = 6;

export const PLAN_TOOL: Tool = {
  name: "plan_research",
  description:
    "Break a medical/pharmacological research question into focused sub-questions, each answerable " +
    "from cited evidence.",
  parameters: {
    type: "object",
    properties: {
      sub_questions: {
        type: "array",
        items: { type: "string" },
        description:
          "3 to 6 distinct, self-contained sub-questions that together cover the user's question. " +
          "Each must read as a standalone question (name the drug/compound explicitly — do not write " +
          "'it' or 'this drug'). Cover complementary facets: what it is / mechanism, the human " +
          "evidence, safety and adverse effects, approval or development status, and key open " +
          "questions, as the question warrants. Do NOT include sourcing, dosing-instruction, or " +
          "personal-medical-advice sub-questions.",
      },
    },
    required: ["sub_questions"],
  },
};

const STRUCTURED_SUFFIX = [
  "",
  "STRUCTURED REVIEW MODE: ensure the sub-questions explicitly cover, where the question warrants:",
  "(1) identity/mechanism, (2) the human clinical evidence (trials), (3) safety/adverse effects,",
  "(4) comparators/alternatives, and (5) the key open questions / unknowns. Favor completeness of",
  "these facets over breadth of topic.",
].join("\n");

const PLAN_SYSTEM = [
  "You are the planning step of a conservative, source-grounded medical research engine.",
  "You do NOT answer the question. You decompose it into focused sub-questions that a downstream",
  "evidence-retrieval step will research independently against cited sources.",
  "",
  "Rules:",
  "- Produce 3 to 6 sub-questions. Each must be self-contained: name the drug/supplement/compound",
  "  explicitly (never 'it' / 'this'), because each is searched on its own.",
  "- Cover complementary facets, not restatements: identity/mechanism, human clinical evidence,",
  "  safety/adverse effects, approval or development status, comparisons, and open questions —",
  "  whichever the question genuinely warrants.",
  "- Stay strictly informational. Never produce a sub-question asking how to obtain/buy a substance,",
  "  what dose to take, or whether it is personally safe for the user.",
  "- Record the result with plan_research.",
].join("\n");

/**
 * Clamp + clean a raw sub-question list to the engine's contract: trimmed, deduped (case-insensitive),
 * non-empty, at most MAX_SUB_QUESTIONS. If fewer than MIN survive (or the model returned nothing
 * usable), fall back to the original question alone — the pipeline still runs as a single-facet report.
 * PURE: no I/O, fully unit-testable.
 */
export function normalizeSubQuestions(raw: unknown, original: string): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const q = item.trim();
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(q);
    if (cleaned.length >= MAX_SUB_QUESTIONS) break;
  }
  if (cleaned.length < MIN_SUB_QUESTIONS) {
    // Too sparse to be a multi-facet plan; degrade to the original question alone.
    const fallback = original.trim();
    return fallback ? [fallback] : [];
  }
  return cleaned;
}

/**
 * Resolve the sub-questions to run: a user-edited plan (from the research fn's action:"plan" step)
 * wins verbatim over the engine's own planning call — it is already validated (trimmed, bounded,
 * capped) at the fn boundary, so this does NOT re-normalize it. `planned` is a thunk (not a value) so
 * that when a valid plan is provided, the LLM planning call is never made. PURE aside from the thunk
 * it is handed: no I/O of its own, fully unit-testable.
 */
export async function resolveSubQuestions(
  provided: readonly string[] | undefined,
  planned: () => Promise<string[]>,
): Promise<string[]> {
  if (provided?.length) return [...provided];
  return planned();
}

/**
 * Plan the research: one cheap LLM call returning 3-6 sub-questions, normalized. Degrades to
 * `[question]` on ANY failure (no key, model error, malformed output) — planning is best-effort.
 */
export async function planSubQuestions(question: string, apiKey: string, mode: ReportMode = "standard"): Promise<string[]> {
  try {
    // Meta mode reuses the broader structured decomposition — wider recall finds more poolable studies.
    const system = mode === "structured_review" || mode === "meta" ? PLAN_SYSTEM + STRUCTURED_SUFFIX : PLAN_SYSTEM;
    const { input } = await callTool<{ sub_questions?: unknown }>(
      {
        model: modelFor("scope"),
        max_tokens: 1024,
        temperature: 0,
        system,
        tools: [PLAN_TOOL],
        messages: [{ role: "user", content: `Question: ${question}\n\nDecompose it with plan_research.` }],
      },
      "plan_research",
      apiKey,
    );
    return normalizeSubQuestions(input.sub_questions, question);
  } catch (e) {
    console.error("research plan failed; using single-question fallback:", (e as Error).message);
    const fallback = question.trim();
    return fallback ? [fallback] : [];
  }
}
