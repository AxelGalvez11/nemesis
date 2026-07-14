// PURE shaper: turn a structured journal-club AppraisalInput into a ResearchReport, so the Library,
// the ResearchReportView, and all three exports render an appraisal with ZERO new plumbing. No I/O.
//
// Mapping:
//   bottom_line          -> report.summary
//   each dimension       -> a ResearchSection ("Heading — verdict"), its points -> AnswerPoint[]
//   a point WITH a quote -> cites [1] and carries the verbatim quote as ClaimSupport
//   a point WITHOUT      -> no citation (shown as a lower-confidence observation)
//   limitations          -> report.uncertainties
//   questions            -> report.appraisal_questions
//   the paper itself     -> citation [1] (synthetic source_type "uploaded_paper")
//
// The paper is the ONLY citation: an appraisal is grounded in the uploaded document, not the live web.

import type { AnswerPoint, Citation, ClaimSupport } from "./answer.ts";
import type { AppraisalInput, ResearchReport, ResearchSection } from "./research.ts";

/** Appended (like the deep-research UNVERIFIED_NOTE) when the verbatim-quote check could not confirm
 *  every load-bearing point, so an appraisal is never presented as fully verified when it is not. */
const UNVERIFIED_NOTE = "Not fully verified: some appraisal points could not be matched to a verbatim quote in the paper — treat those with extra caution.";

const PAPER_TAG = "1";

/** Build the single synthetic citation representing the uploaded paper. */
function paperCitation(title: string | null): Citation {
  return {
    chunk_tag: PAPER_TAG,
    source_id: "uploaded-paper",
    source_type: "uploaded_paper",
    title: title ?? "Uploaded paper",
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
  };
}

/** One appraisal point -> one AnswerPoint. A quote grounds it (cite [1] + support); no quote = no cite.
 *  Note: ClaimSupport's tag field is `citation_tag` (verified against answer.ts), not `chunk_tag`. */
function toAnswerPoint(text: string, quote: string | null): AnswerPoint {
  if (!quote) return { text, citation_ids: [] };
  const support: ClaimSupport = { citation_tag: PAPER_TAG, quote };
  return { text, citation_ids: [PAPER_TAG], support: [support] };
}

export function shapeAppraisalReport(input: AppraisalInput): ResearchReport {
  const title = input.paper_meta.title;
  const question = title ? `Appraisal of "${title}"` : "Appraisal of the uploaded paper";

  const sections: ResearchSection[] = input.dimensions.map((d) => ({
    heading: `${d.heading} — ${d.verdict}`,
    points: d.points.map((p) => toAnswerPoint(p.text, p.quote)),
  }));

  const uncertainties: AnswerPoint[] = input.limitations.map((text) => ({ text, citation_ids: [] }));
  if (!input.claims_verified) uncertainties.push({ text: UNVERIFIED_NOTE, citation_ids: [] });

  return {
    question,
    summary: input.bottom_line,
    // The dimension headings double as the "what was appraised" list.
    sub_questions: input.dimensions.map((d) => d.heading),
    sections,
    uncertainties,
    safety_notes: [],
    citations: [paperCitation(title)],
    evidence_grade: input.evidence_grade,
    safety_flags: input.safety_flags,
    claims_verified: input.claims_verified,
    mode: "appraisal",
    citation_style: "vancouver",
    appraisal_questions: input.questions,
    paper_meta: input.paper_meta,
  };
}
