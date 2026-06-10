// Deep Research — step 3: FAITHFULNESS.
//
// Two layers of claim validity, both narrower-is-safer:
//   (a) deterministic existence check  (enforceReportCitations, PURE): drop any body/safety point
//       whose citations don't map to a real retrieved chunk — the same guarantee citation.ts gives /ask.
//   (b) semantic support check          (checkFaithfulness, LLM judge): for each surviving load-bearing
//       claim, confirm its cited source TEXT actually supports it; drop the ones it doesn't. This is the
//       NLI/2nd-pass verifier citation.ts explicitly DEFERS — it is what makes a deep report trustworthy.
//
// On judge failure we DO NOT silently ship an existence-only report dressed as verified: the caller marks
// claims_verified=false and surfaces it, so an unverified report is never presented as fully checked.

import { callTool, type Tool } from "../llm.ts";
import type { RetrievedChunk } from "../citation.ts";

const FAITH_MODEL = Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini";

export interface EnforcedBodyPoint {
  section: string;
  text: string;
  citation_ids: string[];
}

export interface EnforcedReportPoint {
  text: string;
  citation_ids: string[];
}

export interface EnforcedReport {
  summary: string;
  body: EnforcedBodyPoint[];
  safety_notes: EnforcedReportPoint[];
  uncertainties: EnforcedReportPoint[];
}

interface RawPoint {
  text: string;
  citations: string[];
}

export interface RawReportLike {
  summary: string;
  points: Array<{ section: string; text: string; citations: string[] }>;
  uncertainties: RawPoint[];
  safety_notes: RawPoint[];
}

// "[1]" / " 1 " -> "1". Mirrors citation.ts normTag; replicated (not imported) to keep this a small
// pure module with no coupling to the /ask enforcement internals.
function normTag(t: unknown): string {
  return String(t).replace(/[\[\]\s]/g, "");
}

function validTags(citations: string[], valid: Set<string>): string[] {
  if (!Array.isArray(citations)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of citations) {
    const t = normTag(raw);
    if (valid.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Deterministic existence check (PURE). Keeps only body + safety points that cite >=1 real chunk;
 * uncertainties are non-asserting (kept verbatim, no citations). No I/O — fully unit-testable.
 */
export function enforceReportCitations(raw: RawReportLike, chunks: RetrievedChunk[]): EnforcedReport {
  const valid = new Set(chunks.map((c) => c.tag));
  const body = raw.points
    .map((p) => ({ section: p.section, text: p.text, citation_ids: validTags(p.citations, valid) }))
    .filter((p) => p.citation_ids.length > 0 && p.text.trim().length > 0);
  const safety_notes = raw.safety_notes
    .map((p) => ({ text: p.text, citation_ids: validTags(p.citations, valid) }))
    .filter((p) => p.citation_ids.length > 0 && p.text.trim().length > 0);
  const uncertainties = raw.uncertainties
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({ text: p.text, citation_ids: [] as string[] }));
  return { summary: raw.summary, body, safety_notes, uncertainties };
}

/** A load-bearing claim flattened for the judge: body points first, then safety notes (stable order). */
export interface FaithClaim {
  index: number;
  kind: "body" | "safety";
  localIndex: number;
  text: string;
  citation_ids: string[];
}

/** Flatten the load-bearing claims (body + safety) into one indexed list. PURE. */
export function collectClaims(report: EnforcedReport): FaithClaim[] {
  const claims: FaithClaim[] = [];
  report.body.forEach((p, i) => {
    claims.push({ index: claims.length, kind: "body", localIndex: i, text: p.text, citation_ids: p.citation_ids });
  });
  report.safety_notes.forEach((p, i) => {
    claims.push({ index: claims.length, kind: "safety", localIndex: i, text: p.text, citation_ids: p.citation_ids });
  });
  return claims;
}

export interface ClaimVerdict {
  index: number;
  supported: boolean;
}

/**
 * Apply judge verdicts (PURE): drop body/safety claims the judge marked unsupported. A claim with NO
 * verdict is KEPT — it already passed the deterministic existence check, so absence of a verdict must
 * not over-prune. Returns a new report (no mutation).
 */
export function applyVerdicts(report: EnforcedReport, verdicts: ClaimVerdict[]): EnforcedReport {
  const claims = collectClaims(report);
  const verdictByIndex = new Map(verdicts.map((v) => [v.index, v.supported]));
  const dropped = new Set<string>(); // "kind:localIndex" of unsupported claims
  for (const c of claims) {
    if (verdictByIndex.get(c.index) === false) dropped.add(`${c.kind}:${c.localIndex}`);
  }
  return {
    summary: report.summary,
    body: report.body.filter((_, i) => !dropped.has(`body:${i}`)),
    safety_notes: report.safety_notes.filter((_, i) => !dropped.has(`safety:${i}`)),
    uncertainties: report.uncertainties,
  };
}

/**
 * Coverage gate for claims_verified (PURE). The flag may be true ONLY when the judge returned a verdict
 * for EVERY judged item (a partial / under-emitted response leaves some claims unjudged — and
 * applyVerdicts deliberately keeps unjudged claims, so without this check an under-emitted response
 * would ship unverified claims dressed as verified) AND it did not mark the summary unsupported.
 */
export function isFullyVerified(
  expectedIndices: number[],
  summaryIndex: number | null,
  verdicts: ClaimVerdict[],
): boolean {
  const byIndex = new Map(verdicts.map((v) => [v.index, v.supported]));
  const allCovered = expectedIndices.every((i) => byIndex.has(i));
  const summaryOk = summaryIndex === null || byIndex.get(summaryIndex) !== false;
  return allCovered && summaryOk;
}

export const FAITH_TOOL: Tool = {
  name: "record_support",
  description: "Record, for each numbered claim, whether the provided source excerpts directly support it.",
  parameters: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "The claim's number." },
            supported: {
              type: "boolean",
              description: "true if the source excerpts directly state or clearly imply the claim; " +
                "false if they do not (off-topic, weaker, or contradicting).",
            },
          },
          required: ["index", "supported"],
        },
      },
    },
    required: ["verdicts"],
  },
};

const FAITH_SYSTEM = [
  "You are a strict fact-checking step for a conservative medical research engine. For each numbered",
  "claim you are given the exact source excerpts it cites. Decide ONLY whether those excerpts directly",
  "support the claim. Judge support, not truth: if the excerpts do not actually state or clearly imply",
  "the claim (off-topic, weaker than the claim, or contradicting it), mark it unsupported. When in",
  "doubt, mark unsupported. Record every claim's verdict with record_support.",
].join("\n");

/**
 * Semantic support check. Returns the pruned report and whether EVERY judged claim was confirmed.
 * The summary (the headline sentence) is judged too — against the chunks the body/safety points cite —
 * but is never pruned (a report needs a bottom line); an unsupported summary instead forces
 * verified=false. Body/safety claims the judge marks unsupported are dropped.
 * - verified=true  : the judge ran AND returned a verdict for every judged item AND the summary held.
 * - verified=false : the judge errored, under-emitted (some claim unjudged), or flagged the summary —
 *                    the caller marks claims_verified=false (never present such a report as verified).
 * Never throws.
 */
export async function checkFaithfulness(
  report: EnforcedReport,
  chunks: RetrievedChunk[],
  apiKey: string,
): Promise<{ report: EnforcedReport; verified: boolean }> {
  const claims = collectClaims(report);
  const byTag = new Map(chunks.map((c) => [c.tag, c]));

  // The summary summarizes the body, so its support set is the chunks the body+safety claims cite.
  const hasSummary = report.summary.trim().length > 0;
  const summaryIndex = hasSummary ? claims.length : null;
  const summaryTags = [...new Set(claims.flatMap((c) => c.citation_ids))];

  const judgeItems: Array<{ index: number; text: string; tags: string[] }> = [
    ...claims.map((c) => ({ index: c.index, text: c.text, tags: c.citation_ids })),
    ...(summaryIndex !== null ? [{ index: summaryIndex, text: report.summary, tags: summaryTags }] : []),
  ];
  if (judgeItems.length === 0) return { report, verified: true }; // nothing to check is trivially consistent

  const block = judgeItems
    .map((it) => {
      const evidence = it.tags
        .map((t) => byTag.get(t)?.chunk_text ?? "")
        .filter((s) => s.length > 0)
        .join("\n---\n");
      return `Claim ${it.index}: ${it.text}\nCited source excerpts:\n${evidence || "(none)"}`;
    })
    .join("\n\n");

  try {
    const { input } = await callTool<{ verdicts?: unknown }>(
      {
        model: FAITH_MODEL,
        max_tokens: 2048,
        temperature: 0,
        system: FAITH_SYSTEM,
        tools: [FAITH_TOOL],
        messages: [{ role: "user", content: `${block}\n\nRecord each claim's support with record_support.` }],
      },
      "record_support",
      apiKey,
    );
    const verdicts = normVerdicts(input.verdicts);
    // applyVerdicts only acts on body/safety (collectClaims indices); the summary index is ignored there.
    const pruned = applyVerdicts(report, verdicts);
    const verified = isFullyVerified(judgeItems.map((it) => it.index), summaryIndex, verdicts);
    return { report: pruned, verified };
  } catch (e) {
    console.error("research faithfulness check failed; marking unverified:", (e as Error).message);
    return { report, verified: false };
  }
}

function normVerdicts(a: unknown): ClaimVerdict[] {
  if (!Array.isArray(a)) return [];
  const out: ClaimVerdict[] = [];
  for (const v of a) {
    const o = (v ?? {}) as { index?: unknown; supported?: unknown };
    if (typeof o.index === "number" && typeof o.supported === "boolean") {
      out.push({ index: o.index, supported: o.supported });
    }
  }
  return out;
}
