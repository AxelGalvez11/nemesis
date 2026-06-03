// Step 5: generate the structured answer (Claude Sonnet, forced tool_use). The
// retrieved chunks are the ONLY grounding; the model cites them by [n] tag.

import { callTool } from "./llm.ts";
import { GENERATE_TOOL, generateSystem } from "./prompts.ts";
import type { EvidenceGrade, Intent } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";

const GENERATE_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "deepseek-chat";

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

  const { input, model } = await callTool<RawAnswer>(
    {
      model: GENERATE_MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      system: generateSystem(opts.intent),
      tools: [GENERATE_TOOL],
      messages: [{ role: "user", content: userContent }],
    },
    "compose_answer",
    opts.apiKey,
  );

  return {
    raw: {
      bottom_line: input.bottom_line ?? { text: "", citations: [] },
      what_we_know: input.what_we_know ?? [],
      what_we_do_not_know: input.what_we_do_not_know ?? [],
      safety_notes: input.safety_notes ?? [],
      questions_to_ask: input.questions_to_ask ?? [],
      evidence_grade: input.evidence_grade ?? "unknown",
    },
    model,
  };
}
