// Step 5: generate the structured answer (Claude Sonnet, forced tool_use). The
// retrieved chunks are the ONLY grounding; the model cites them by [n] tag.

import { callTool, type ChatParams, chatToolArgsStream, parseToolArguments } from "./llm.ts";
import { LeadFieldExtractor } from "./stream-extract.ts";
import { modelFor } from "./model-router.ts";
import { type AnswerStyle, generateSystem, generateTool } from "./prompts.ts";
import type { EvidenceGrade, Intent } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

interface RawPoint {
  text: string;
  citations: string[];
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
  /** Streaming hook: receives decoded bottom_line.text deltas AS THE MODEL WRITES THEM (raw model
   * output — the caller is responsible for safety-gating before anything reaches a client). When
   * set, generation tries the streaming transport first and silently falls back to the normal
   * non-streaming call on any stream failure, so the result is never less reliable than today. */
  onLead?: (delta: string) => void;
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

  const params: ChatParams = {
    model: modelFor("generate"),
    // Multi-point cited answers can be long; 2048 truncated the JSON mid-string (DeepSeek then
    // returned malformed tool arguments). 4096 leaves headroom for Fast/standard; THOROUGH is
    // explicitly fuller (more what_we_know points + what_we_do_not_know), so give it more room to
    // avoid truncated tool-call JSON on a long answer.
    max_tokens: opts.style === "thorough" ? 6144 : 4096,
    // Deterministic generation: more reliable structured output + reproducible
    // answers for a medical app (and lower malformed-JSON rate from DeepSeek).
    temperature: 0,
    system: generateSystem(opts.intent, opts.style),
    tools: [generateTool(opts.intent)],
    messages: [{ role: "user", content: userContent }],
  };

  // Streaming-first when a lead hook is provided (SSE clients): decode bottom_line.text deltas
  // out of the tool-arguments stream as they arrive. STRICTLY best-effort — a failed stream, a
  // malformed final payload, or an empty answer falls back to the exact non-streaming callTool
  // path below (its 5x re-roll retries included), so streaming can only ever ADD earlier bytes,
  // never a worse answer. The partial lead a client may have shown is superseded by the terminal
  // "complete" event either way.
  let input: Record<string, unknown> | null = null;
  let model = "";
  if (opts.onLead) {
    try {
      const extractor = new LeadFieldExtractor();
      const streamed = await chatToolArgsStream(params, "compose_answer", opts.apiKey, (chunk) => {
        const text = extractor.push(chunk);
        if (text) opts.onLead!(text);
      });
      input = parseToolArguments(streamed.argumentsText) as Record<string, unknown>;
      model = streamed.model;
    } catch (e) {
      console.error("ask streaming generate failed; falling back to non-streaming:", (e as Error).message);
      input = null;
    }
  }
  if (!input) {
    ({ input, model } = await callTool<Record<string, unknown>>(params, "compose_answer", opts.apiKey));
  }

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
  const o = (p ?? {}) as { text?: unknown; citations?: unknown };
  return {
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
