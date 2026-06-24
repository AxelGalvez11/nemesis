// Step 5: generate the structured answer (Claude Sonnet, forced tool_use). The
// retrieved chunks are the ONLY grounding; the model cites them by [n] tag.

import { callTool } from "./llm.ts";
import { groundingEnabled, routeModel } from "./model-route.ts";
import { type AnswerStyle, generateSystem, generateTool } from "./prompts.ts";
import type { EvidenceGrade, Intent } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

const GENERATE_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "deepseek-chat";

interface RawPoint {
  text: string;
  citations: string[];
  /** Quote-grounding (Phase 1): the verbatim source span the model copied, when grounding is on. */
  source_quote?: string;
}

export interface RawAnswer {
  bottom_line: RawPoint;
  what_we_know: RawPoint[];
  what_we_do_not_know: RawPoint[];
  safety_notes: RawPoint[];
  questions_to_ask: string[];
  evidence_grade: EvidenceGrade;
}

export interface GenerateResult {
  raw: RawAnswer;
  model: string;
}

export interface GenerateOpts {
  question: string;
  intent: Intent;
  chunks: RetrievedChunk[];
  healthContext: string | null;
  apiKey: string;
  /** Answer register (Fast=plain / Thorough=technical). Undefined keeps the current default register. */
  style?: AnswerStyle;
}

export async function generate(opts: GenerateOpts): Promise<GenerateResult> {
  const sourcesBlock = opts.chunks
    .map((c) => {
      const head = `[${c.tag}] (${c.provider}${c.section ? `, ${c.section}` : ""})${c.title ? ` ${c.title}` : ""}`;
      return `${head}\n${c.chunk_text ?? ""}`.trim();
    })
    .join("\n\n");

  const healthBlock = opts.healthContext
    ? `\n\nPersonal health context (use ONLY to add caution categories and questions to ask a ` +
      `professional — never to diagnose, dose, or tell the user to change therapy):\n${opts.healthContext}`
    : "";

  const userContent =
    `Question: ${opts.question}\n\n` +
    `Sources (cite by [n]; use ONLY these — do not use outside knowledge):\n${sourcesBlock}` +
    healthBlock +
    `\n\nCompose the answer using compose_answer. Every factual sentence must carry the [n] tag(s) that support it.`;

  // Fast (plain)/standard -> non-thinking; Thorough -> thinking. No-op vs GENERATE_MODEL until routed.
  const route = routeModel("generate", { style: opts.style, legacyModel: GENERATE_MODEL });
  // Quote-as-you-cite grounding (Phase 1): off by default, so generateSystem is byte-identical in prod.
  const grounded = groundingEnabled();
  const { input, model } = await callTool<Record<string, unknown>>(
    {
      model: route.model,
      thinking: route.thinking,
      reasoningEffort: route.reasoningEffort,
      // Multi-point cited answers can be long; 2048 truncated the JSON mid-string (DeepSeek then
      // returned malformed tool arguments). 4096 leaves headroom for Fast/standard; THOROUGH is
      // explicitly fuller (more what_we_know points + what_we_do_not_know), so give it more room to
      // avoid truncated tool-call JSON on a long answer.
      max_tokens: opts.style === "thorough" ? 6144 : 4096,
      // Deterministic generation: more reliable structured output + reproducible
      // answers for a medical app (and lower malformed-JSON rate from DeepSeek).
      temperature: 0,
      system: generateSystem(opts.intent, opts.style, grounded),
      tools: [generateTool(opts.intent)],
      messages: [{ role: "user", content: userContent }],
    },
    "compose_answer",
    opts.apiKey,
  );

  // Normalize defensively: DeepSeek does not enforce the schema's `required`, so
  // a point can arrive without a citations array (or text). Guarantee the shape
  // here so downstream enforcement never sees a malformed field.
  return {
    raw: {
      bottom_line: normPoint(input.bottom_line),
      what_we_know: normPoints(input.what_we_know),
      what_we_do_not_know: normPoints(input.what_we_do_not_know),
      safety_notes: normPoints(input.safety_notes),
      questions_to_ask: normStrings(input.questions_to_ask),
      evidence_grade: normGrade(input.evidence_grade),
    },
    model,
  };
}

const GRADES = new Set<EvidenceGrade>([
  "very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable",
]);

function normPoint(p: unknown): RawPoint {
  // DeepSeek sometimes returns bottom_line (or a point) as a bare string instead
  // of {text, citations}; keep the text and let citation backfill attribute it.
  if (typeof p === "string") return { text: p, citations: [] };
  const o = (p ?? {}) as { text?: unknown; citations?: unknown; source_quote?: unknown };
  return {
    ...(typeof o.source_quote === "string" && o.source_quote ? { source_quote: o.source_quote } : {}),
    text: typeof o.text === "string" ? o.text : "",
    citations: Array.isArray(o.citations) ? o.citations.map((c) => String(c)) : [],
  };
}

function normPoints(a: unknown): RawPoint[] {
  return Array.isArray(a) ? a.map(normPoint) : [];
}

function normStrings(a: unknown): string[] {
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
}

function normGrade(g: unknown): EvidenceGrade {
  return typeof g === "string" && GRADES.has(g as EvidenceGrade) ? (g as EvidenceGrade) : "unknown";
}
