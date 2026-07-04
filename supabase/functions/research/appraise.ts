// Journal-club appraisal pipeline (research edge fn, mode "appraisal"). Grounds a structured critical
// appraisal of ONE uploaded paper in verbatim quotes, then shapes it into a ResearchReport.
//
// Safety posture (see plan §Task 3): preScreen runs on the SHORT derived title only (never the 200KB
// body — its distress-channel patterns misfire on academic prose); detectViolations runs on the
// ASSEMBLED appraisal prose (the same load-bearing check the deep-research synthesis path uses). Both
// come from the FROZEN ../ask/safety.ts, imported verbatim.
import { callTool, type Tool } from "../ask/llm.ts";
import { modelFor } from "../ask/model-router.ts";
import { detectViolations, preScreen } from "../ask/safety.ts";
import { shapeAppraisalReport } from "../../../packages/shared/src/appraisal-report.ts";
import type {
  AppraisalDimension,
  AppraisalDimensionKey,
  AppraisalInput,
  AppraisalVerdict,
  PaperMeta,
  ResearchReport,
} from "../../../packages/shared/src/research.ts";
import type { EvidenceGrade } from "../../../packages/shared/src/answer.ts";

const DIMENSION_KEYS: readonly AppraisalDimensionKey[] = [
  "design", "population", "endpoints", "statistics", "risk_of_bias", "applicability",
];
const VERDICTS: readonly AppraisalVerdict[] = ["strong", "adequate", "weak", "unclear"];
const GRADES: readonly EvidenceGrade[] = [
  "very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable",
];

// How much of the paper the model sees. Kept under a comfortable context budget; the extractor already
// caps at 200KB, and the report's paper_meta.truncated tells the reader when the paper was longer.
const APPRAISAL_TEXT_BUDGET = 120_000;

const APPRAISAL_TOOL: Tool = {
  name: "record_appraisal",
  description:
    "Record a structured critical appraisal of the paper: a plain-English bottom line, per-dimension " +
    "verdicts with grounded findings, the paper's own limitations, and open discussion questions.",
  parameters: {
    type: "object",
    properties: {
      bottom_line: { type: "string", description: "One-paragraph plain-English verdict a clinician could read aloud." },
      evidence_grade: { type: "string", enum: [...GRADES], description: "Overall strength of the paper's evidence." },
      dimensions: {
        type: "array",
        description: "One entry per appraisal dimension you can judge. Omit a dimension entirely if the paper says nothing about it.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: [...DIMENSION_KEYS] },
            heading: { type: "string", description: "Human heading, e.g. 'Study design' or 'Statistical validity'." },
            verdict: { type: "string", enum: [...VERDICTS] },
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "The finding, in your own words." },
                  quote: { type: "string", description: "A VERBATIM sentence copied from the paper that supports the finding. Copy exactly; leave empty if none applies." },
                },
                required: ["text"],
              },
            },
          },
          required: ["key", "heading", "verdict"],
        },
      },
      limitations: { type: "array", items: { type: "string" }, description: "Honest limitations of the paper." },
      questions: { type: "array", items: { type: "string" }, description: "Open discussion questions for a journal club." },
    },
    required: ["bottom_line", "evidence_grade", "dimensions"],
  },
};

const APPRAISAL_SYSTEM = [
  "You are the critical-appraisal step of a conservative, source-grounded medical research tool.",
  "You appraise ONE paper for a journal club. You do NOT give clinical advice.",
  "",
  "Rules:",
  "- Judge the paper across: design, population, endpoints, statistics, risk_of_bias, applicability.",
  "- For EVERY finding, copy a VERBATIM sentence from the paper into `quote`. Copy it exactly, letter",
  "  for letter. If no sentence in the paper supports a finding, leave `quote` empty — never invent one.",
  "- If the paper does not report something, mark that dimension's verdict `unclear`. Never guess.",
  "- Limitations must be the PAPER's limitations, not generic caveats.",
  "- Questions should be substantive things a journal club would debate.",
  "- Record everything with record_appraisal.",
].join("\n");

/** NFKC + lowercase + whitespace-collapse for the substring check (mirrors ground.ts's `norm`). */
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Trim leading/trailing whitespace + punctuation so a model-added period doesn't defeat the check;
 *  interior text is untouched, so this can only make the needle SHORTER — never match a fabrication. */
function trimEnds(s: string): string {
  return s.replace(/^[\s"'([{.,;:]+/, "").replace(/[\s"')\]}.,;:]+$/, "");
}

/**
 * Return the quote iff (after trimming model-added edge punctuation) it is a VERBATIM substring of the
 * paper under NFKC + whitespace-normalization. Returns the trimmed quote — with interior whitespace runs
 * collapsed to a single space for display, case preserved — on success, null on failure. PURE +
 * deterministic — unit-tested. A too-short quote (< 12 chars) is rejected to avoid trivial matches.
 */
export function verbatimQuote(quote: string, paperText: string): string | null {
  const trimmed = trimEnds(typeof quote === "string" ? quote : "").replace(/\s+/g, " ");
  if (trimmed.length < 12) return null;
  const hay = norm(paperText);
  const needle = norm(trimmed);
  return hay.includes(needle) ? trimmed : null;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStrArray(v: unknown, cap: number): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, cap)
    : [];
}

/**
 * Clamp raw LLM output to the AppraisalInput contract. Verbatim-checks every quote (a failed quote
 * becomes null, and any load-bearing point that loses its quote flips claims_verified to false). Only
 * the six known dimension keys and four verdicts survive. PURE — never throws, never calls out.
 */
export function normalizeAppraisal(raw: unknown, meta: PaperMeta, paperText: string): AppraisalInput {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const grade = GRADES.includes(asStr(obj.evidence_grade) as EvidenceGrade)
    ? (asStr(obj.evidence_grade) as EvidenceGrade)
    : "unknown";

  let anyUnverified = false;
  const rawDims = Array.isArray(obj.dimensions) ? obj.dimensions : [];
  const dimensions: AppraisalDimension[] = [];
  const seen = new Set<AppraisalDimensionKey>();
  for (const d of rawDims) {
    if (!d || typeof d !== "object") continue;
    const dd = d as Record<string, unknown>;
    const key = asStr(dd.key) as AppraisalDimensionKey;
    if (!DIMENSION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const verdict = VERDICTS.includes(asStr(dd.verdict) as AppraisalVerdict)
      ? (asStr(dd.verdict) as AppraisalVerdict)
      : "unclear";
    const heading = asStr(dd.heading) || key;
    const rawPoints = Array.isArray(dd.points) ? dd.points : [];
    const points = rawPoints
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => {
        const text = asStr(p.text);
        const quote = verbatimQuote(asStr(p.quote), paperText);
        if (asStr(p.quote) && !quote) anyUnverified = true; // model offered a quote that didn't verify
        return { text, quote };
      })
      .filter((p) => p.text.length > 0)
      .slice(0, 8);
    dimensions.push({ key, heading, verdict, points });
  }
  // Order dimensions canonically so the report reads the same every time.
  dimensions.sort((a, b) => DIMENSION_KEYS.indexOf(a.key) - DIMENSION_KEYS.indexOf(b.key));

  return {
    paper_meta: meta,
    bottom_line: asStr(obj.bottom_line),
    dimensions,
    limitations: asStrArray(obj.limitations, 10),
    questions: asStrArray(obj.questions, 10),
    evidence_grade: grade,
    safety_flags: [],
    claims_verified: !anyUnverified,
  };
}

/** Concatenate the appraisal's user-visible prose so detectViolations can scan it in one pass. */
function appraisalProse(input: AppraisalInput): string {
  const parts: string[] = [input.bottom_line, ...input.limitations, ...input.questions];
  for (const d of input.dimensions) for (const p of d.points) parts.push(p.text);
  return parts.join("\n");
}

/**
 * Run the appraisal: preScreen the SHORT derived title (frozen safety, used as designed), one grounded
 * LLM appraisal pass, normalize + verbatim-check, then detectViolations on the ASSEMBLED prose. On a
 * safety violation the appraisal is discarded and a conservative report is returned (no fabricated body).
 */
export async function runAppraisal(paperText: string, meta: PaperMeta, apiKey: string): Promise<ResearchReport> {
  const title = meta.title ?? "the uploaded paper";

  // Frozen safety on the SHORT line only. If the title itself trips the deterministic gate, refuse.
  const screen = preScreen(title);
  if (screen.shortCircuit) {
    return shapeAppraisalReport({
      paper_meta: meta,
      bottom_line: "This upload could not be appraised.",
      dimensions: [],
      limitations: ["The paper's title triggered a safety route; upload a research paper for appraisal."],
      questions: [],
      evidence_grade: "not_applicable",
      safety_flags: screen.flags,
      claims_verified: true,
    });
  }

  const budget = paperText.slice(0, APPRAISAL_TEXT_BUDGET);
  const { input: raw } = await callTool<unknown>(
    {
      model: modelFor("research"),
      max_tokens: 4096,
      temperature: 0,
      system: APPRAISAL_SYSTEM,
      tools: [APPRAISAL_TOOL],
      messages: [{ role: "user", content: `Paper text:\n\n${budget}\n\nAppraise it with record_appraisal.` }],
    },
    "record_appraisal",
    apiKey,
  );

  const input = normalizeAppraisal(raw, meta, budget);

  // Load-bearing frozen-safety check on the ASSEMBLED prose (same posture as deep-research synthesis).
  const violations = detectViolations(appraisalProse(input));
  if (violations.length > 0) {
    return shapeAppraisalReport({
      paper_meta: meta,
      bottom_line: "The appraisal was withheld because it contained unsafe wording.",
      dimensions: [],
      limitations: ["The generated appraisal did not clear the safety check and was discarded."],
      questions: [],
      evidence_grade: "not_applicable",
      safety_flags: [],
      claims_verified: false,
    });
  }

  return shapeAppraisalReport(input);
}
