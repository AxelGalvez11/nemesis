// Deep Research — step 2: SYNTHESIZE.
//
// ONE generation produces the whole multi-section report from ONE merged, reranked evidence pool with
// ONE citation namespace (tags 1..N). This is the deliberate scale-up of the /ask `augmentWithLive`
// shape: parallel gather -> merge -> rerank -> ONE generate. It preserves the frozen guarantees —
// exactly one deterministic safety scan and one citation namespace per synthesized unit — that
// open-ended per-section agent loops would break.
//
// The wire schema is FLAT (a single points[] array, each point labeled with its section heading),
// reassembled into ResearchSection[] in pure code (assembleSections). Flat-as-compose_answer keeps the
// structured-output reliable (llm.ts warns nesting depth is where tool JSON goes malformed), and a
// large max_tokens leaves headroom so the bigger report JSON does not truncate mid-string.

import { callTool, type Tool } from "../llm.ts";
import { modelFor } from "../model-router.ts";
import { BASE_GENERATE_SYSTEM } from "../prompts.ts";
import type { EvidenceGrade } from "../../../../packages/shared/src/answer.ts";
import type { ReportMode, ResearchSection } from "../../../../packages/shared/src/research.ts";
import type { RetrievedChunk } from "../citation.ts";

// A report is summary + several cited sections + uncertainties + safety_notes — multiples of a single
// /ask answer, whose own tool JSON truncated at 2048 and uses 4096. Give the report real headroom.
const SYNTH_MAX_TOKENS = 8192;

const EVIDENCE_GRADES: EvidenceGrade[] = [
  "very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable",
];

/** One cited point with its section label (the flat wire shape the model emits). */
export interface RawReportPoint {
  section: string;
  text: string;
  citations: string[];
}

interface RawPoint {
  text: string;
  citations: string[];
}

export interface RawReport {
  summary: string;
  points: RawReportPoint[];
  uncertainties: RawPoint[];
  safety_notes: RawPoint[];
  evidence_grade: EvidenceGrade;
}

export interface SynthesizeResult {
  raw: RawReport;
  model: string;
}

export interface SynthesizeOpts {
  question: string;
  subQuestions: string[];
  chunks: RetrievedChunk[];
  apiKey: string;
  /** Rigor mode. 'lab_draft' swaps in the study-design-scaffold system prompt; all else uses REPORT_SYSTEM. */
  mode?: ReportMode;
}

const POINT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "One plain-English sentence." },
    citations: {
      type: "array",
      items: { type: "string" },
      description: "The [n] source tags that DIRECTLY support this sentence. Only tags from the " +
        "sources block. Empty if no source supports it.",
    },
  },
  required: ["text", "citations"],
};

export const REPORT_TOOL: Tool = {
  name: "compose_report",
  description: "Compose the structured, source-grounded research report.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "The bottom line in 2-4 plain-English sentences: the overall answer to the " +
          "user's question, understandable on first read. It summarizes the cited body below.",
      },
      points: {
        type: "array",
        description: "The body, as a FLAT list of cited points. Each point names the section it " +
          "belongs to via `section`; points sharing a section heading are grouped together, in order.",
        items: {
          type: "object",
          properties: {
            section: {
              type: "string",
              description: "A SHORT topic-label heading (2-4 words) this point belongs under — e.g. " +
                "'What it is', 'Human evidence', 'Safety', 'Approval status', 'Comparison'. NOT the " +
                "sub-question sentence. Reuse the exact same heading string for points in the same section.",
            },
            text: { type: "string", description: "One plain-English sentence." },
            citations: {
              type: "array",
              items: { type: "string" },
              description: "The [n] tags that DIRECTLY support this sentence. Only tags from the " +
                "sources block. A body point with no real support will be dropped.",
            },
          },
          required: ["section", "text", "citations"],
        },
      },
      uncertainties: {
        type: "array",
        description: "Honest gaps, conflicts, or limitations in the evidence. Need not be cited.",
        items: POINT_SCHEMA,
      },
      safety_notes: {
        type: "array",
        description: "Real safety cautions (interactions, personal-use risk, unknown long-term " +
          "safety, label warnings). Each should cite the source it comes from.",
        items: POINT_SCHEMA,
      },
      evidence_grade: {
        type: "string",
        enum: EVIDENCE_GRADES,
        description: "Your honest read of the strength of the HUMAN evidence behind the summary.",
      },
    },
    required: ["summary", "points", "evidence_grade"],
  },
};

const REPORT_GUIDANCE = [
  "",
  "REPORT MODE (this is a multi-section research report, not a single chat answer):",
  "- Organize the body into a few clear sections via the `section` label on each point. Let the",
  "  planned sub-questions below guide the sections, but give each a SHORT topic-label heading",
  "  (2-4 words, e.g. 'What it is', 'Human evidence', 'Safety', 'Approval status') — never the full",
  "  sub-question sentence as the heading.",
  "- `summary` is the bottom line up front: 2-4 plain sentences answering the user's question.",
  "- Every body point and safety note must carry the [n] tag(s) that support it. Unsupported body",
  "  points are dropped, so do not assert what the sources do not show.",
  "- Put honest gaps and evidence conflicts in `uncertainties`. Keep the same conservative, plain-English,",
  "  non-prescriptive voice as always — the HARD RULES above apply in full to every section.",
].join("\n");

const REPORT_SYSTEM = `${BASE_GENERATE_SYSTEM}${REPORT_GUIDANCE}`;

// lab_draft mode — a literature-grounded study-DESIGN scaffold. Inherits every BASE_GENERATE_SYSTEM
// HARD RULE + phrasing rule (no "X is safe", no cure claims, no dose/inject INSTRUCTIONS, route personal
// decisions to a clinician). The design-only framing is the SECONDARY safety control behind the
// hazardous-scope guard: a legitimate study design is arms/endpoints/sample-size — it contains no
// synthesis route and no instruction to a person.
const LAB_DRAFT_GUIDANCE = [
  "",
  "LAB-DRAFT MODE — produce a LITERATURE-GROUNDED STUDY-DESIGN SCAFFOLD, not a chat answer and NOT an",
  "executable protocol. The reader is a researcher who will take this to their PI/IRB before any work.",
  "",
  "WHAT TO PRODUCE — organize the body into these sections via each point's `section` label (use only",
  "the ones that apply): 'Objective', 'Hypothesis', 'Study design', 'Arms & groups', 'Controls',",
  "'Endpoints & readouts', 'Assays & instruments', 'Sample size', 'Known pitfalls'.",
  "- `summary` = a 2-4 sentence plain-English overview of the proposed design.",
  "",
  "TWO KINDS OF POINTS — this matters for how each is checked:",
  "- DESIGN PROPOSALS (Objective, Hypothesis, the design/arms/controls/sample-size you RECOMMEND) are",
  "  forward-looking choices. State them plainly; they need NOT carry a [n] tag. Leave citations empty.",
  "- EVIDENCE CLAIMS (anything you assert that an existing study DID — an endpoint it used, an assay or",
  "  instrument it ran, the enrollment it achieved, the design it employed) MUST carry the [n] tag(s)",
  "  that support it, drawn ONLY from the sources block. An uncited evidence claim is dropped. Prefer to",
  "  ground concrete choices in precedent: \"a prior trial measured outcome Y with instrument Z [n]\".",
  "",
  "NEVER (refuse-by-omission — these are out of scope for a design scaffold):",
  "- any chemical-synthesis route, reaction step, reagent/precursor recipe, or how to MAKE, extract, or",
  "  produce a substance. You design how to STUDY a compound, never how to make one.",
  "- any instruction to a person to take/apply/administer/inject a dose. Name a dose only as a DESIGN",
  "  parameter of an arm (\"Arm B: drug X 20 mg once daily\") or as what a cited study used (\"a prior",
  "  trial used 20 mg [n]\") — NEVER as \"take/apply/administer 20 mg\". Describe what to MEASURE,",
  "  COMPARE, and OBSERVE, not what to do to a person.",
  "- the BASE hard rules and phrasing rules above apply in full to every section.",
  "",
  "Put open design questions and evidence the literature does not settle in `uncertainties`. Put",
  "oversight/approval and real safety cautions in `safety_notes`.",
].join("\n");

const LAB_DRAFT_SYSTEM = `${BASE_GENERATE_SYSTEM}${LAB_DRAFT_GUIDANCE}`;

/** The system prompt for a synthesis, by mode. Exported so a test can assert the lab_draft prompt
 *  carries its design-only safety constraints (the secondary control behind the scope guard). */
export function synthesisSystemForMode(mode: ReportMode | undefined): string {
  return mode === "lab_draft" ? LAB_DRAFT_SYSTEM : REPORT_SYSTEM;
}

export async function synthesizeReport(opts: SynthesizeOpts): Promise<SynthesizeResult> {
  const sourcesBlock = opts.chunks
    .map((c) => {
      const head = `[${c.tag}] (${c.provider}${c.section ? `, ${c.section}` : ""})${c.title ? ` ${c.title}` : ""}`;
      return `${head}\n${c.chunk_text ?? ""}`.trim();
    })
    .join("\n\n");

  const outline = opts.subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");

  const closing = opts.mode === "lab_draft"
    ? `Compose a study-design scaffold using compose_report. Cite [n] for every claim about what an ` +
      `existing study did; design choices you propose need not be cited (leave citations empty).`
    : `Compose the report using compose_report. Every factual sentence must carry the [n] tag(s) that support it.`;

  const userContent =
    `Research question: ${opts.question}\n\n` +
    `Planned sub-questions to cover (guide your sections):\n${outline}\n\n` +
    `Sources (cite by [n]; use ONLY these — do not use outside knowledge):\n${sourcesBlock}\n\n` +
    closing;

  const { input, model } = await callTool<Record<string, unknown>>(
    {
      model: modelFor("research"),
      max_tokens: SYNTH_MAX_TOKENS,
      temperature: 0,
      system: synthesisSystemForMode(opts.mode),
      tools: [REPORT_TOOL],
      messages: [{ role: "user", content: userContent }],
    },
    "compose_report",
    opts.apiKey,
  );

  return {
    raw: {
      summary: typeof input.summary === "string" ? input.summary : "",
      points: normReportPoints(input.points),
      uncertainties: normPoints(input.uncertainties),
      safety_notes: normPoints(input.safety_notes),
      evidence_grade: normGrade(input.evidence_grade),
    },
    model,
  };
}

/**
 * Reassemble the flat points[] into ordered ResearchSection[]: group by section heading, preserving
 * first-appearance order of headings and point order within each heading. Blank headings collapse to
 * a single "Findings" section. PURE: no I/O, fully unit-testable.
 */
export function assembleSections(
  points: Array<{ section: string; point: { text: string; citation_ids: string[] } }>,
): ResearchSection[] {
  const order: string[] = [];
  const byHeading = new Map<string, ResearchSection>();
  for (const { section, point } of points) {
    const heading = section.trim() || "Findings";
    let sec = byHeading.get(heading);
    if (!sec) {
      sec = { heading, points: [] };
      byHeading.set(heading, sec);
      order.push(heading);
    }
    sec.points.push(point);
  }
  return order.map((h) => byHeading.get(h)!).filter((s) => s.points.length > 0);
}

const GRADE_SET = new Set<EvidenceGrade>(EVIDENCE_GRADES);

function normReportPoints(a: unknown): RawReportPoint[] {
  if (!Array.isArray(a)) return [];
  return a.map((p) => {
    // A bare string (no {section,text,citations}) degrades to an uncited point; enforceReportCitations
    // then drops it (no valid cite) — mirrors generate.ts's bare-string handling for /ask.
    if (typeof p === "string") return { section: "", text: p, citations: [] };
    const o = (p ?? {}) as { section?: unknown; text?: unknown; citations?: unknown };
    return {
      section: typeof o.section === "string" ? o.section : "",
      text: typeof o.text === "string" ? o.text : "",
      citations: Array.isArray(o.citations) ? o.citations.map((c) => String(c)) : [],
    };
  });
}

function normPoints(a: unknown): RawPoint[] {
  if (!Array.isArray(a)) return [];
  return a.map((p) => {
    if (typeof p === "string") return { text: p, citations: [] };
    const o = (p ?? {}) as { text?: unknown; citations?: unknown };
    return {
      text: typeof o.text === "string" ? o.text : "",
      citations: Array.isArray(o.citations) ? o.citations.map((c) => String(c)) : [],
    };
  });
}

function normGrade(g: unknown): EvidenceGrade {
  return typeof g === "string" && GRADE_SET.has(g as EvidenceGrade) ? (g as EvidenceGrade) : "unknown";
}
