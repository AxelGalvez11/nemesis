// Deep Research — meta-mode pre-step: PICO.
//
// A pooled estimate is only meaningful for ONE fixed comparison. This step reads the user's question
// and pins that comparison — intervention vs comparator, on a single outcome — BEFORE any source is
// read, so the contrast can never be inferred post-hoc by mixing incommensurable studies. The
// extraction step is then told this PICO and targets only it.
//
// A cheap classify-tier LLM call. BEST-EFFORT: any failure, or a question with no clear
// intervention/outcome, returns null → the run reports it could not define a poolable comparison
// (and shows no pooled number). It NEVER blocks a run and asserts no facts.

import { callTool, type Tool } from "../llm.ts";
import type { Pico } from "../../../../packages/shared/src/research.ts";

const PICO_MODEL = Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini";
const DEFAULT_COMPARATOR = "placebo or standard care";

export const PICO_TOOL: Tool = {
  name: "define_comparison",
  description:
    "Extract the single comparison a meta-analysis of this question would pool around: the " +
    "intervention, the comparator it is weighed against, and the ONE clinical outcome of interest.",
  parameters: {
    type: "object",
    properties: {
      intervention: { type: "string", description: "The treatment/drug under study, e.g. 'semaglutide'." },
      comparator: {
        type: "string",
        description: "What the intervention is compared against, e.g. 'placebo'. Empty if the question implies the usual placebo/standard-care control.",
      },
      outcome: { type: "string", description: "The ONE outcome to pool, e.g. 'major adverse cardiovascular events' or 'all-cause mortality'." },
    },
    required: ["intervention", "comparator", "outcome"],
  },
};

const PICO_SYSTEM = [
  "You are the comparison-definition step of a conservative, source-grounded medical research engine.",
  "You do NOT answer the question. You identify the SINGLE pooled comparison it implies.",
  "",
  "Rules:",
  "- intervention = the treatment under study. outcome = the ONE clinical outcome to pool.",
  "- comparator = what it is weighed against; leave empty if the question implies the usual",
  "  placebo / standard-care control.",
  "- If the question has no clear single intervention or no clear outcome (e.g. it is a broad",
  "  overview), still fill your best guess — a later step decides whether pooling is possible.",
  "- Record the comparison with define_comparison.",
].join("\n");

/**
 * Clamp a raw PICO to the contract. Requires a non-empty intervention AND outcome (without both there
 * is no comparison to pool); an empty comparator defaults to placebo/standard care. Returns null when
 * a poolable comparison cannot be formed. PURE: unit-testable.
 */
export function normalizePico(raw: unknown): Pico | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const intervention = str(obj.intervention);
  const outcome = str(obj.outcome);
  if (!intervention || !outcome) return null;
  const comparator = str(obj.comparator) || DEFAULT_COMPARATOR;
  return { intervention, comparator, outcome };
}

/**
 * Parse the pooled comparison from a question. One cheap LLM call. Degrades to null on ANY failure
 * (no key, model error, malformed output) — meta mode then honestly reports it could not define a
 * comparison and pools nothing.
 */
export async function parsePico(question: string, apiKey: string): Promise<Pico | null> {
  try {
    const { input } = await callTool<{ intervention?: unknown; comparator?: unknown; outcome?: unknown }>(
      {
        model: PICO_MODEL,
        max_tokens: 512,
        temperature: 0,
        system: PICO_SYSTEM,
        tools: [PICO_TOOL],
        messages: [{ role: "user", content: `Question: ${question}\n\nDefine the comparison with define_comparison.` }],
      },
      "define_comparison",
      apiKey,
    );
    return normalizePico(input);
  } catch (e) {
    console.error("research PICO parse failed; meta mode will report no poolable comparison:", (e as Error).message);
    return null;
  }
}
