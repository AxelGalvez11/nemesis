// Deep Research — pre-step: SCOPE (clarifying questions).
//
// Before a run, judge whether the question is too ambiguous to research well, and if so propose 1-3
// clarifying questions (each with quick-pick chips) that would focus the evidence search. A cheap
// classify-tier LLM call. BEST-EFFORT: any failure → no clarification ("just run it"). It NEVER
// blocks a run, asserts no facts, and consumes no deep-research quota.

import { callTool, type Tool } from "../llm.ts";
import type { ScopeQuestion, ScopeResult } from "../../../../packages/shared/src/research.ts";

const SCOPE_MODEL = Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini";
const MAX_QUESTIONS = 3;
const MAX_CHIPS = 5;

export const SCOPE_TOOL: Tool = {
  name: "scope_research",
  description:
    "Decide whether a medical research question is too ambiguous to research well as-is, and if so " +
    "propose 1-3 clarifying questions (each with a few quick-pick options) that would focus the search.",
  parameters: {
    type: "object",
    properties: {
      needs_clarification: {
        type: "boolean",
        description:
          "True ONLY if the question is genuinely underspecified (missing indication, population, or " +
          "focus). If it is already specific, return false with no questions.",
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "A short clarifying question, e.g. 'Which indication are you interested in?'" },
            chips: { type: "array", items: { type: "string" }, description: "2-5 short quick-pick answer options for this question." },
          },
          required: ["text", "chips"],
        },
        description: "0-3 clarifying questions. Empty when needs_clarification is false.",
      },
    },
    required: ["needs_clarification", "questions"],
  },
};

const SCOPE_SYSTEM = [
  "You are the scoping step of a conservative, source-grounded medical research engine.",
  "You do NOT answer the question. You judge whether it is specific enough to research well, and if",
  "not, propose a FEW clarifying questions that would sharpen the evidence search.",
  "",
  "Rules:",
  "- Set needs_clarification=true ONLY when the question is genuinely ambiguous (no indication, no",
  "  population, or unclear whether the user wants efficacy, safety, mechanism, etc.).",
  "- A specific question (clear drug + clear focus) → needs_clarification=false, questions=[].",
  "- Propose at most 3 questions. Give each 2-5 short quick-pick chips (e.g. 'Type 2 diabetes',",
  "  'Weight management', 'Both'). Keep chips concrete.",
  "- Never ask for the user's dosing, how to obtain a substance, or personal medical details.",
  "- Record the result with scope_research.",
].join("\n");

/**
 * Clamp + clean a raw scope result to the contract: at most MAX_QUESTIONS, each with non-empty text
 * and 0..MAX_CHIPS trimmed, unique chips. If needs_clarification is not literally true, or no usable
 * question survives, return a no-clarification result so the run proceeds. PURE: unit-testable.
 */
export function normalizeScope(rawNeeds: unknown, rawQuestions: unknown): ScopeResult {
  const list = Array.isArray(rawQuestions) ? rawQuestions : [];
  const questions: ScopeQuestion[] = [];
  for (const item of list) {
    if (questions.length >= MAX_QUESTIONS) break;
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    const rawChips = Array.isArray(obj.chips) ? obj.chips : [];
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const c of rawChips) {
      if (typeof c !== "string") continue;
      const chip = c.trim();
      if (!chip || seen.has(chip.toLowerCase())) continue;
      seen.add(chip.toLowerCase());
      chips.push(chip);
      if (chips.length >= MAX_CHIPS) break;
    }
    questions.push({ text, chips });
  }
  const needs = rawNeeds === true && questions.length > 0;
  return { needs_clarification: needs, questions: needs ? questions : [] };
}

/**
 * Scope a question: one cheap LLM call returning clarifying questions only when ambiguous. Degrades
 * to { needs_clarification: false, questions: [] } on ANY failure (no key, model error, malformed
 * output) — scoping is best-effort and must never block a run.
 */
export async function scopeQuestion(question: string, apiKey: string): Promise<ScopeResult> {
  try {
    const { input } = await callTool<{ needs_clarification?: unknown; questions?: unknown }>(
      {
        model: SCOPE_MODEL,
        max_tokens: 1024,
        temperature: 0,
        system: SCOPE_SYSTEM,
        tools: [SCOPE_TOOL],
        messages: [{ role: "user", content: `Question: ${question}\n\nScope it with scope_research.` }],
      },
      "scope_research",
      apiKey,
    );
    return normalizeScope(input.needs_clarification, input.questions);
  } catch (e) {
    console.error("research scope failed; proceeding without clarification:", (e as Error).message);
    return { needs_clarification: false, questions: [] };
  }
}
