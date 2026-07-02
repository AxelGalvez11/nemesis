// Consensus-style "Study Snapshot": population / n / duration / design, extracted from the
// PubMed abstract by a forced tool call. Extraction-only: fields absent from the abstract
// come back null (never guessed). Cached with the rest of the enrichment payload.
import { callTool, hasLlmKey, llmApiKey, type Tool } from "../ask/llm.ts";
import { modelFor } from "../ask/model-router.ts";
import type { StudySnapshot } from "./providers.ts";

export const SNAPSHOT_TOOL: Tool = {
  name: "record_snapshot",
  description: "Record the study snapshot fields exactly as stated in the abstract.",
  parameters: {
    type: "object",
    properties: {
      population: { type: "string", description: "Who was studied, verbatim-close (e.g. 'healthy young adults'). Empty string if not stated." },
      sample_size: { type: "number", description: "Total participants (N). 0 if not stated." },
      duration: { type: "string", description: "Study length (e.g. '10 weeks'). Empty string if not stated." },
      design: { type: "string", description: "Study design as stated (e.g. 'randomized controlled trial', 'cohort'). Empty string if not stated." },
    },
    required: ["population", "sample_size", "duration", "design"],
  },
};

const NON_ANSWERS = /^(|not stated|unknown|n\/a|none|unclear)$/i;

// Upstream timeouts: misses resolve sequentially, so one stuck socket (NCBI) or a hung
// LLM call would stall the whole batch until the edge runtime kills it. Timeouts resolve
// into the existing "no data" (null) paths — never a thrown error. The snapshot is
// decoration on an otherwise-cacheable row (cacheability is keyed on the OpenAlex
// outcome; see resolveMiss in index.ts).
const ABSTRACT_TIMEOUT_MS = 8_000;
const LLM_TIMEOUT_MS = 20_000;

/** Resolve `p`, or null after `ms`. A rejection of `p` — even one that loses the race and
 * settles later — also maps to null, so no unhandled rejection can escape. Never throws. */
export function resolveWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

export function sanitizeSnapshot(raw: unknown): StudySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !NON_ANSWERS.test(s) ? s.slice(0, 120) : null;
  };
  const n = typeof r.sample_size === "number" && r.sample_size >= 1 && r.sample_size <= 10_000_000
    ? Math.round(r.sample_size) : null;
  return { population: str(r.population), sample_size: n, duration: str(r.duration), design: str(r.design) };
}

export async function fetchAbstract(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text` +
        (Deno.env.get("NCBI_API_KEY") ? `&api_key=${Deno.env.get("NCBI_API_KEY")}` : ""),
      { signal: AbortSignal.timeout(ABSTRACT_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 100 ? text.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

const SNAPSHOT_SYSTEM =
  "You extract study metadata from a medical abstract. Copy ONLY what the abstract states; use empty string / 0 for anything not stated. Never infer or estimate.";

export async function extractSnapshot(pmid: string): Promise<StudySnapshot | null> {
  if (!hasLlmKey()) return null;
  const abstract = await fetchAbstract(pmid);
  if (!abstract) return null;
  // resolveWithin caps a hung LLM call at LLM_TIMEOUT_MS and maps any rejection to null,
  // so this can neither stall the sequential miss loop nor throw to the caller.
  const result = await resolveWithin(
    callTool<Record<string, unknown>>(
      {
        model: modelFor("generate"),
        max_tokens: 512,
        temperature: 0,
        system: SNAPSHOT_SYSTEM,
        tools: [SNAPSHOT_TOOL],
        messages: [{ role: "user", content: abstract }],
      },
      SNAPSHOT_TOOL.name,
      llmApiKey(),
    ),
    LLM_TIMEOUT_MS,
  );
  return result ? sanitizeSnapshot(result.input) : null;
}
