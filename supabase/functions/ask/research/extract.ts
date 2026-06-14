// Deep Research — meta-mode step: EXTRACT effect-size counts.
//
// The ONLY place the LLM touches the numbers. Given the fixed PICO and the merged source pool, it
// reads each source and copies the 2x2 event counts (events/total in the intervention arm and the
// comparator arm) for the target outcome, ALONG WITH the exact sentence it read them from. It does
// NOT compute, derive, or guess — it transcribes. Everything it returns is then independently
// re-verified against the real source text by the PURE grounding gate (ground.ts) before any number
// reaches the pure pooling math; a number the model cannot back with a verbatim quote is dropped.
//
// BEST-EFFORT: any failure returns [] → no studies → "not poolable" (honest), never a crash.

import { callTool, type Tool } from "../llm.ts";
import type { Pico } from "../../../../packages/shared/src/research.ts";
import type { RetrievedChunk } from "../citation.ts";

const EXTRACT_MODEL = Deno.env.get("LLM_GENERATE_MODEL") ?? "gpt-4.1-mini";
const EXTRACT_MAX_TOKENS = 2048;

/** A raw extracted 2x2 as the model returned it — UNTRUSTED until ground.ts verifies it. */
export interface RawExtractedStudy {
  citation_tag: string;
  label: string;
  source_quote: string;
  outcome_label: string;
  events_treatment: number;
  total_treatment: number;
  events_control: number;
  total_control: number;
}

export const EXTRACT_TOOL: Tool = {
  name: "extract_counts",
  description:
    "Transcribe the 2x2 outcome counts for the target comparison from each source that explicitly " +
    "reports them. Copy numbers verbatim; never compute, infer, or estimate.",
  parameters: {
    type: "object",
    properties: {
      studies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            citation_tag: { type: "string", description: "The [n] tag of the source these numbers came from." },
            label: { type: "string", description: "Short study name if stated (e.g. 'SUSTAIN-6'); else empty." },
            source_quote: {
              type: "string",
              description: "The exact sentence(s) from the source containing ALL FOUR numbers. Copy verbatim; keep it short (<= ~400 chars).",
            },
            outcome_label: { type: "string", description: "The outcome these counts measure, as the source names it." },
            events_treatment: { type: "number", description: "Patients with the outcome in the INTERVENTION arm." },
            total_treatment: { type: "number", description: "Total patients in the INTERVENTION arm." },
            events_control: { type: "number", description: "Patients with the outcome in the COMPARATOR arm." },
            total_control: { type: "number", description: "Total patients in the COMPARATOR arm." },
          },
          required: ["citation_tag", "source_quote", "outcome_label", "events_treatment", "total_treatment", "events_control", "total_control"],
        },
        description: "One entry per source that explicitly reports the 2x2 for the target outcome. Empty if none do.",
      },
    },
    required: ["studies"],
  },
};

function extractSystem(pico: Pico): string {
  return [
    "You are the data-extraction step of a conservative, source-grounded meta-analysis engine.",
    "You transcribe outcome counts; you do NOT analyse, compute, or guess.",
    "",
    `Target comparison (PICO): intervention = "${pico.intervention}"; comparator = "${pico.comparator}";`,
    `outcome = "${pico.outcome}".`,
    "",
    "For EACH source that EXPLICITLY reports, for this comparison and this outcome, the number of",
    "patients with the outcome and the arm size in BOTH the intervention and comparator arms, emit one",
    "study with:",
    "- events_treatment / total_treatment: outcome count and arm size in the intervention arm.",
    "- events_control / total_control: outcome count and arm size in the comparator arm.",
    "- source_quote: the exact sentence(s) from that source that contain ALL FOUR numbers, copied",
    "  verbatim. If the four numbers are not all stated in the source text, DO NOT emit the study.",
    "- citation_tag: the [n] of that source. outcome_label: the outcome as the source names it.",
    "",
    "HARD RULES:",
    "- Copy numbers that literally appear in the source. Never derive a count from a percentage, a",
    "  hazard ratio, or a figure. If you would have to calculate it, omit the study.",
    "- Only the intervention-vs-comparator contrast above. Skip other arms, other outcomes, other drugs.",
    "- A source with no explicit 2x2 for this outcome contributes nothing. Returning an empty list is",
    "  the correct, expected answer when the sources do not report counts.",
    "- Record with extract_counts.",
  ].join("\n");
}

const stripTag = (v: unknown): string => (typeof v === "string" ? v.replace(/[[\]\s]/g, "") : "");

function cleanCount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Shape the raw tool output into clean RawExtractedStudy[]. Drops any item missing a quote/outcome or
 * with a non-integer/negative count. This is SHAPE validation only — grounding (does the quote come
 * from the cited source, do the numbers appear in it) happens in ground.ts. PURE: unit-testable.
 */
export function normalizeExtracted(raw: unknown): RawExtractedStudy[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: RawExtractedStudy[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const citation_tag = stripTag(obj.citation_tag);
    const source_quote = typeof obj.source_quote === "string" ? obj.source_quote.trim() : "";
    const outcome_label = typeof obj.outcome_label === "string" ? obj.outcome_label.trim() : "";
    if (!citation_tag || !source_quote || !outcome_label) continue;
    const et = cleanCount(obj.events_treatment);
    const nt = cleanCount(obj.total_treatment);
    const ec = cleanCount(obj.events_control);
    const nc = cleanCount(obj.total_control);
    if (et === null || nt === null || ec === null || nc === null || nt === 0 || nc === 0) continue;
    const label = typeof obj.label === "string" ? obj.label.trim() : "";
    out.push({ citation_tag, label, source_quote, outcome_label, events_treatment: et, total_treatment: nt, events_control: ec, total_control: nc });
  }
  return out;
}

/**
 * Extract candidate 2x2 counts for the PICO from the merged source pool. One LLM call. Degrades to []
 * on ANY failure — extraction is best-effort and feeds a hard grounding gate downstream.
 */
export async function extractStudyArms(question: string, pico: Pico, chunks: RetrievedChunk[], apiKey: string): Promise<RawExtractedStudy[]> {
  try {
    const sourcesBlock = chunks
      .map((c) => {
        const head = `[${c.tag}] (${c.provider}${c.section ? `, ${c.section}` : ""})${c.title ? ` ${c.title}` : ""}`;
        return `${head}\n${c.chunk_text ?? ""}`.trim();
      })
      .join("\n\n");
    const { input } = await callTool<{ studies?: unknown }>(
      {
        model: EXTRACT_MODEL,
        max_tokens: EXTRACT_MAX_TOKENS,
        temperature: 0,
        system: extractSystem(pico),
        tools: [EXTRACT_TOOL],
        messages: [{
          role: "user",
          content:
            `Research question: ${question}\n\n` +
            `Sources (cite by [n]; use ONLY these):\n${sourcesBlock}\n\n` +
            `Extract the 2x2 counts for the target comparison with extract_counts.`,
        }],
      },
      "extract_counts",
      apiKey,
    );
    return normalizeExtracted(input.studies);
  } catch (e) {
    console.error("research effect-size extraction failed; meta mode will report no poolable data:", (e as Error).message);
    return [];
  }
}
