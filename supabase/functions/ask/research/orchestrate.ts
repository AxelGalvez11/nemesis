// Deep Research — the ORCHESTRATOR.
//
//   preScreen → classify (frozen safety short-circuits) → plan sub-questions →
//   gather per sub-question (retrieve + live, reranked against THAT sub-question) →
//   merge into ONE namespace → synthesize ONE report → detectViolations (one scan) →
//   enforce citations → faithfulness judge → assemble.
//
// Reuses the exact /ask safety machinery: preScreen + classify-flag routing + detectViolations are the
// SAME deterministic layer that guards /ask, so Deep Research cannot bypass it. The one-namespace,
// one-synthesis, one-safety-scan shape is preserved end to end.
//
// This module is the pure engine. The HTTP endpoint, async/background execution, progress persistence,
// Pro gating, and the research_report_runs migration are a SEPARATE, owner-gated deploy.

import { classify } from "../classify.ts";
import { detectViolations, preScreen } from "../safety.ts";
import { retrieve } from "../retrieve.ts";
import { rerankChunks } from "../rerank.ts";
import { gatherLiveCandidates, liveToChunk } from "../live-sources.ts";
import { citationMeta, type RetrievedChunk } from "../citation.ts";
import {
  CONSERVATIVE_FALLBACK_COPY,
  EMERGENCY_COPY,
  NO_SOURCE_COPY,
  SOURCING_COPY,
} from "../templates.ts";
import type {
  AnswerPoint,
  AnswerTemplate,
  Citation,
  EvidenceGrade,
  SafetyFlag,
} from "../../../../packages/shared/src/answer.ts";
import type {
  GapStatement,
  ReportMode,
  ResearchProgressStep,
  ResearchReport,
  ResearchSection,
  RetrievalCounts,
  SearchMethod,
} from "../../../../packages/shared/src/research.ts";
import { detectForbiddenPhrases } from "../../../../packages/shared/src/forbidden-phrases.ts";
import { poolRiskRatio } from "../../../../packages/shared/src/meta-analysis.ts";
import type { MetaAnalysisResult } from "../../../../packages/shared/src/meta-analysis.ts";
import { planSubQuestions } from "./plan.ts";
import { deriveGaps } from "./gaps.ts";
import { assembleSections, type RawReportPoint, synthesizeReport } from "./synthesize.ts";
import { parsePico } from "./pico.ts";
import { extractStudyArms } from "./extract.ts";
import { groundStudies } from "./ground.ts";
import { buildMetaProse, noComparisonProse } from "./meta-prose.ts";
import {
  checkFaithfulness,
  type EnforcedReport,
  enforceReportCitations,
} from "./faithfulness.ts";

// Tuning. Recall-first per sub-question (broad retrieve, no provider/entity filter), then the reranker
// and faithfulness judge are the precision gates — a research report wants breadth the reranker prunes.
const SUB_RETRIEVE_THRESHOLD = 0.5; // matches /ask's ASK_MATCH_THRESHOLD (AC3 floor)
const SUB_MATCH_COUNT = 8; // dense candidates pulled per sub-question
const SUB_TOP_M = 6; // kept per sub-question after reranking against that sub-question
const REPORT_MAX_CHUNKS = 24; // cap on the merged single-namespace pool
const LIVE_PER_SOURCE_MAX = 6; // live candidates per source per sub-question

/** Human-readable database labels for each live/corpus provider key. */
const PROVIDER_DB_LABELS: Record<string, string> = {
  pubmed_oa: "PubMed / PubMed Central",
  clinicaltrials: "ClinicalTrials.gov",
  openfda: "openFDA drug labels",
  faers: "FDA FAERS adverse-event reports",
  europepmc: "Europe PMC",
  corpus: "PharmaBro curated evidence corpus",
};

/**
 * Build the code-authored, deterministic method section for a structured-review report.
 * PURE: takes searchDate as an argument (caller supplies new Date().toISOString()).
 * Output strings are fixed, honest copy — they must never trip detectForbiddenPhrases.
 */
export function buildSearchMethod(
  providerKeys: string[],
  queries: string[],
  searchDate: string,
): SearchMethod {
  const databases = providerKeys.map((k) => PROVIDER_DB_LABELS[k] ?? k);
  return {
    databases,
    queries,
    inclusion_notes:
      "Sources were retrieved automatically by relevance and capped per source — a bounded, " +
      "top-ranked sample, not an exhaustive census. Each claim was checked against its cited source.",
    exclusion_notes:
      "This is an automated, single-pass evidence review: no registered protocol, no exhaustive " +
      "search, no dual independent screening, and no per-study risk-of-bias or GRADE appraisal. " +
      "Non-open-access full text was not read (abstracts/metadata only).",
    search_date: searchDate,
  };
}

export interface OrchestrateConfig {
  apiKey: string;
  sbUrl: string;
  serviceKey: string;
  liveOn: boolean;
  /** Optional: drives structured-review mode (extended plan, code-authored method section). Default "standard". */
  mode?: ReportMode;
  /** Optional progress sink for the future async/Realtime layer. Best-effort; never affects the run. */
  onProgress?: (step: ResearchProgressStep) => void;
}

// ---------------------------------------------------------------------------
// Pure helpers (the unit-test targets)
// ---------------------------------------------------------------------------

/**
 * Merge per-sub-question reranked candidate lists into ONE deduped pool with a single citation
 * namespace. Round-robin across the lists (rank 0 of every list, then rank 1, …) so each sub-question
 * contributes its top hit before any contributes a second — no sub-question is starved by a global
 * rerank against the broad original question. Dedupe by chunk_id across lists (first/highest-ranked
 * occurrence wins). Cap at maxChunks and retag 1..N. PURE.
 */
export function mergeEvidence(perSubQuestion: RetrievedChunk[][], maxChunks: number): RetrievedChunk[] {
  const seen = new Set<string>();
  const merged: RetrievedChunk[] = [];
  const maxLen = perSubQuestion.reduce((m, l) => Math.max(m, l.length), 0);
  for (let rank = 0; rank < maxLen && merged.length < maxChunks; rank++) {
    for (const list of perSubQuestion) {
      if (merged.length >= maxChunks) break;
      const c = list[rank];
      if (!c || seen.has(c.chunk_id)) continue;
      seen.add(c.chunk_id);
      merged.push(c);
    }
  }
  return merged.map((c, i) => ({ ...c, tag: String(i + 1) }));
}

/** Build citations[] from the union of surviving tags, numeric order, deduped. PURE. */
export function buildCitations(tags: string[], chunks: RetrievedChunk[]): Citation[] {
  const byTag = new Map(chunks.map((c) => [c.tag, c]));
  const used = [...new Set(tags)].filter((t) => byTag.has(t));
  return used
    .sort((a, b) => Number(a) - Number(b))
    .map((tag) => {
      const c = byTag.get(tag)!;
      return {
        chunk_tag: tag,
        source_id: c.source_id,
        source_type: c.provider,
        title: c.title,
        section: c.section,
        url: c.url,
        license: c.license,
        published_date: c.published_date,
        retrieved_at: c.retrieved_at,
        ...citationMeta(c),
      };
    });
}

const UNVERIFIED_NOTE: AnswerPoint = {
  text:
    "These findings passed an automated check that each cited source exists, but the deeper " +
    "claim-by-claim fact-check could not run this time, so treat the report with extra caution.",
  citation_ids: [],
};

/**
 * Assemble the final ResearchReport from the enforced (and faithfulness-pruned) content. PURE.
 * When claimsVerified is false, an explicit caution is appended to uncertainties so an unverified
 * report is never presented as fully verified.
 */
export function assembleReport(args: {
  question: string;
  subQuestions: string[];
  enforced: EnforcedReport;
  chunks: RetrievedChunk[];
  evidenceGrade: EvidenceGrade;
  safetyFlags: SafetyFlag[];
  claimsVerified: boolean;
  gaps: GapStatement[];
  counts: RetrievalCounts;
  mode?: ReportMode;
  searchMethod?: SearchMethod;
  /** Code-generated "Pooled analysis" points (meta mode). Already safety-scanned by the caller and
   *  verified by construction, so they bypass the citation-enforcement / faithfulness judge and are
   *  appended here as a trailing section. Their study tags fold into the citation list. */
  metaPoints?: RawReportPoint[];
  /** The computed pooled result the forest table renders (meta mode). */
  metaAnalysis?: MetaAnalysisResult;
}): ResearchReport {
  const { enforced, chunks } = args;
  const bodySections: ResearchSection[] = assembleSections(
    enforced.body.map((p) => ({ section: p.section, point: { text: p.text, citation_ids: p.citation_ids } })),
  );
  const metaSections: ResearchSection[] = args.metaPoints?.length
    ? assembleSections(args.metaPoints.map((p) => ({ section: p.section, point: { text: p.text, citation_ids: p.citations } })))
    : [];
  const sections: ResearchSection[] = [...bodySections, ...metaSections];
  const safety_notes: AnswerPoint[] = enforced.safety_notes.map((p) => ({
    text: p.text,
    citation_ids: p.citation_ids,
  }));
  const uncertainties: AnswerPoint[] = enforced.uncertainties.map((p) => ({
    text: p.text,
    citation_ids: p.citation_ids,
  }));
  if (!args.claimsVerified) uncertainties.push(UNVERIFIED_NOTE);

  const allTags = [
    ...sections.flatMap((s) => s.points.flatMap((p) => p.citation_ids)),
    ...safety_notes.flatMap((p) => p.citation_ids),
  ];

  return {
    question: args.question,
    summary: enforced.summary,
    sub_questions: args.subQuestions,
    sections,
    uncertainties,
    safety_notes,
    citations: buildCitations(allTags, chunks),
    evidence_grade: args.evidenceGrade,
    safety_flags: args.safetyFlags,
    claims_verified: args.claimsVerified,
    gaps: args.gaps,
    counts: args.counts,
    mode: args.mode ?? "standard",
    search_method: args.searchMethod,
    citation_style: "vancouver",
    meta_analysis: args.metaAnalysis,
  };
}

/** A report carries real synthesized content only if some load-bearing claim survived. PURE. */
export function hasSupportedContent(enforced: EnforcedReport): boolean {
  return enforced.body.length > 0 || enforced.safety_notes.length > 0;
}

function templateReport(
  question: string,
  template: AnswerTemplate,
  summary: string,
  flags: SafetyFlag[],
): ResearchReport {
  return {
    question,
    summary,
    sub_questions: [],
    sections: [],
    uncertainties: [],
    safety_notes: [],
    citations: [],
    evidence_grade: "not_applicable",
    safety_flags: flags,
    claims_verified: false,
    template,
  };
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Build the single string the one safety scan (detectViolations) runs over: EVERY client-facing
 * prose string in the report — the synthesized summary, section headings, body texts, safety notes,
 * uncertainties, deterministic gaps, code-authored method copy, AND the code-generated meta-analysis
 * section. Extracted as a PURE function so a test can prove that injected meta prose never escapes
 * the one-scan guarantee.
 */
export function buildScanInput(args: {
  summary: string;
  points: { section: string; text: string }[];
  safetyNotes: { text: string }[];
  uncertainties: { text: string }[];
  gapTexts: string[];
  methodStrings: string[];
  metaPoints: RawReportPoint[];
}): string {
  return [
    args.summary,
    ...args.points.map((p) => p.section),
    ...args.points.map((p) => p.text),
    ...args.safetyNotes.map((p) => p.text),
    ...args.uncertainties.map((p) => p.text),
    ...args.gapTexts,
    ...args.methodStrings,
    ...args.metaPoints.map((p) => p.section),
    ...args.metaPoints.map((p) => p.text),
  ].join("  ");
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export async function runResearch(question: string, cfg: OrchestrateConfig): Promise<ResearchReport> {
  const emit = (step: ResearchProgressStep["step"], detail: string, sources_found?: number) => {
    try {
      cfg.onProgress?.({ step, detail, sources_found, at: new Date().toISOString() });
    } catch { /* progress is best-effort; never let it affect the run */ }
  };

  // ---- 0. frozen deterministic pre-screen (no LLM) ----
  const pre = preScreen(question);
  if (pre.shortCircuit === "emergency_routing") {
    return templateReport(question, "emergency_routing", EMERGENCY_COPY, pre.flags);
  }
  if (pre.shortCircuit === "sourcing_refusal") {
    return templateReport(question, "sourcing_refusal", SOURCING_COPY, pre.flags);
  }

  // ---- 1. classify (frozen LLM safety routing, mirrors /ask) ----
  const cls = await classify(question, cfg.apiKey);
  const flags = unique<SafetyFlag>([...pre.flags, ...cls.safety_flags]);
  if (flags.some((f) => f === "emergency_possible" || f === "overdose_possible" || f === "self_harm")) {
    return templateReport(question, "emergency_routing", EMERGENCY_COPY, flags);
  }
  if (cls.intent === "drug_sourcing" || flags.includes("drug_sourcing")) {
    return templateReport(question, "sourcing_refusal", SOURCING_COPY, flags);
  }

  // ---- 2. plan ----
  emit("planning", "Breaking the question into focused sub-questions");
  const subQuestions = await planSubQuestions(question, cfg.apiKey, cfg.mode ?? "standard");
  if (subQuestions.length === 0) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 3. gather (bounded parallel; recall-first per sub-question, reranked against THAT question) ----
  emit("gathering", `Searching evidence for ${subQuestions.length} sub-questions`);
  const perSubQuestion = await Promise.all(
    subQuestions.map((sq) => gatherForSubQuestion(sq, cls.entity_mentions, cfg)),
  );

  // ---- 4. merge into ONE citation namespace ----
  const chunks = mergeEvidence(perSubQuestion, REPORT_MAX_CHUNKS);
  const { gaps, counts } = deriveGaps(chunks, subQuestions);
  emit("gathering", "Merged and deduplicated the evidence pool", chunks.length);
  if (chunks.length === 0) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 4b. build code-authored method section for structured_review (PURE, no LLM) ----
  // Uses chunk providers present in the merged pool + the sub-questions as the query list.
  // The resulting copy is deterministic and PRISMA-overclaim-safe by design, but we guard
  // it here anyway to preserve the one-scan guarantee even if PROVIDER_DB_LABELS changes.
  const providerKeys = [...new Set(chunks.map((c) => c.provider).filter(Boolean))];
  const searchMethod: SearchMethod | undefined = cfg.mode === "structured_review"
    ? buildSearchMethod(providerKeys, subQuestions, (counts.retrieved_at ?? new Date().toISOString()).slice(0, 10))
    : undefined;

  // ---- 5. synthesize ONE report ----
  emit("writing", "Writing the cited report");
  let synth: Awaited<ReturnType<typeof synthesizeReport>>;
  try {
    synth = await synthesizeReport({ question, subQuestions, chunks, apiKey: cfg.apiKey });
  } catch (e) {
    console.error("research synthesis failed after retries:", (e as Error).message);
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 5b. meta-analysis (meta mode only): pin the comparison, extract counts, GROUND them, pool ----
  // The LLM only transcribes 2x2 counts (extract); ground.ts re-verifies every number against the real
  // source before poolRiskRatio (pure code) computes the estimate. The pooled PROSE is code-generated
  // (never the LLM) and injected into the safety scan + report below, so it rides the SAME one-scan and
  // one-citation-namespace machinery as the synthesized body. It is verified by construction, so it
  // bypasses the citation-enforcement / faithfulness judge (which would flag a multi-cite computed claim
  // as unsupported). Zero behavior change for non-meta modes.
  let metaResult: MetaAnalysisResult | undefined;
  let metaPoints: RawReportPoint[] = [];
  if (cfg.mode === "meta") {
    emit("checking", "Extracting and pooling comparable study results");
    const pico = await parsePico(question, cfg.apiKey);
    if (!pico) {
      metaPoints = noComparisonProse();
    } else {
      const rawStudies = await extractStudyArms(question, pico, chunks, cfg.apiKey);
      const grounding = groundStudies(rawStudies, chunks, pico);
      metaResult = poolRiskRatio(grounding.studies);
      metaPoints = buildMetaProse(pico, grounding, metaResult);
    }
  }

  // ---- 6. one deterministic safety scan over the whole synthesized report (the doc-20 guarantee) ----
  // Scan the section HEADINGS too: unlike /ask (fixed field names), report headings are model-authored
  // free text that ships to the client, so a forbidden string placed in a heading must also be caught.
  // Also include the code-authored method copy and the code-generated meta-analysis section so nothing
  // client-facing escapes the one scan.
  const methodStrings: string[] = searchMethod
    ? [...searchMethod.databases, ...searchMethod.queries, searchMethod.inclusion_notes, searchMethod.exclusion_notes]
    : [];
  const assembled = buildScanInput({
    summary: synth.raw.summary,
    points: synth.raw.points,
    safetyNotes: synth.raw.safety_notes,
    uncertainties: synth.raw.uncertainties,
    gapTexts: gaps.map((g) => g.text),
    methodStrings,
    metaPoints,
  });
  const violations = detectViolations(assembled);
  if (violations.length > 0) {
    console.error("research safety_fallback — discarded synthesis:", JSON.stringify(violations));
    return templateReport(question, "safety_fallback", CONSERVATIVE_FALLBACK_COPY, flags);
  }

  // ---- 6b. PRISMA-overclaim guard: separate from detectViolations, only checks method copy ----
  // detectForbiddenPhrases catches words like "systematic review", "PRISMA", "records identified"
  // that imply a formal methodology we do NOT claim. Code-authored copy should never trip this,
  // but guard here defensively so a label change in PROVIDER_DB_LABELS cannot ship overclaiming copy.
  if (searchMethod) {
    const methodCopy = methodStrings.join("  ");
    const overclaims = detectForbiddenPhrases(methodCopy);
    if (overclaims.length > 0) {
      console.error("research PRISMA-overclaim guard triggered on method copy:", JSON.stringify(overclaims));
      return templateReport(question, "safety_fallback", CONSERVATIVE_FALLBACK_COPY, flags);
    }
  }

  // ---- 7. enforce citations (existence) then faithfulness (semantic support) ----
  // A successful pool keeps the report alive even if the synthesized narrative pruned to empty: the
  // pooled estimate is a real, verified-by-construction result the user asked for, and it lives in
  // metaPoints/metaResult (not in `enforced`), so the no_source gates below must not discard it.
  const pooled = metaResult?.poolable === true;
  const enforced = enforceReportCitations(synth.raw, chunks);
  if (!hasSupportedContent(enforced) && !pooled) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }
  emit("checking", "Fact-checking each claim against its cited source");
  const { report: verifiedContent, verified } = await checkFaithfulness(enforced, chunks, cfg.apiKey);
  if (!hasSupportedContent(verifiedContent) && !pooled) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 8. assemble ----
  const report = assembleReport({
    question,
    subQuestions,
    enforced: verifiedContent,
    chunks,
    evidenceGrade: synth.raw.evidence_grade,
    safetyFlags: flags,
    claimsVerified: verified,
    gaps,
    counts,
    mode: cfg.mode ?? "standard",
    searchMethod,
    metaPoints,
    metaAnalysis: metaResult,
  });
  emit("done", "Report ready", report.citations.length);
  return report;
}

/**
 * Gather + rerank one sub-question's evidence. Broad dense retrieval (no provider/entity filter) for
 * recall, plus flag-gated live sources, reranked against THIS sub-question; top SUB_TOP_M kept. Fault
 * tolerant: any failure yields the best partial result (or []), never throws — one weak sub-question
 * must not sink the report.
 */
async function gatherForSubQuestion(
  subQuestion: string,
  mentions: string[],
  cfg: OrchestrateConfig,
): Promise<RetrievedChunk[]> {
  let dense: RetrievedChunk[] = [];
  try {
    const ret = await retrieve({
      question: subQuestion,
      providers: null,
      entityId: null,
      threshold: SUB_RETRIEVE_THRESHOLD,
      matchCount: SUB_MATCH_COUNT,
      sbUrl: cfg.sbUrl,
      serviceKey: cfg.serviceKey,
    });
    dense = ret.chunks;
  } catch (e) {
    console.error(`research retrieve failed for sub-question; continuing:`, (e as Error).message);
  }

  let pool = dense;
  if (cfg.liveOn) {
    try {
      const term = mentions.length ? mentions.join(" ") : subQuestion;
      const live = await gatherLiveCandidates({ query: term, mentions, perSourceMax: LIVE_PER_SOURCE_MAX });
      if (live.length > 0) {
        pool = [...dense, ...live.map((c, i) => liveToChunk(c, String(dense.length + i + 1)))];
      }
    } catch (e) {
      console.error(`research live gather failed for sub-question; using dense only:`, (e as Error).message);
    }
  }

  if (pool.length === 0) return [];
  let ordered = pool;
  try {
    ordered = await rerankChunks(subQuestion, pool);
  } catch (e) {
    console.error(`research rerank failed for sub-question; using dense order:`, (e as Error).message);
  }
  return ordered.slice(0, SUB_TOP_M);
}
