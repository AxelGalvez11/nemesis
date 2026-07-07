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
import { detectViolations, preScreen, suppressEmergencyForGeneralToxicity } from "../safety.ts";
import { retrieve } from "../retrieve.ts";
import { rerankChunks } from "../rerank.ts";
import { gatherLiveCandidates, liveToChunk } from "../live-sources.ts";
import { citationMeta, type RetrievedChunk } from "../citation.ts";
import { modelFor } from "../model-router.ts";
import {
  CONSERVATIVE_FALLBACK_COPY,
  EMERGENCY_COPY,
  LAB_DRAFT_DISCLAIMER,
  LAB_DRAFT_REFUSAL_COPY,
  NO_SOURCE_COPY,
  SOURCING_COPY,
} from "../templates.ts";
import { assessLabDraftScope } from "../lab-draft-guard.ts";
import type {
  AnswerPoint,
  AnswerTemplate,
  Citation,
  EvidenceGrade,
  SafetyFlag,
} from "../../../../packages/shared/src/answer.ts";
import type {
  GapStatement,
  ModelSlotMap,
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
import { planSubQuestions, resolveSubQuestions } from "./plan.ts";
import { agenticResearchEnabled, runAgenticWebResearch, webLearningsToChunks } from "./web-research.ts";
import { deriveGaps } from "./gaps.ts";
import { assembleSections, type RawReportPoint, synthesizeReport } from "./synthesize.ts";
import { parsePico } from "./pico.ts";
import { extractStudyArms } from "./extract.ts";
import { groundStudies } from "./ground.ts";
import { buildMetaProse, noComparisonProse } from "./meta-prose.ts";
import { buildDiscoveryReport } from "./discovery.ts";
import {
  checkFaithfulness,
  type EnforcedReport,
  enforceReportCitations,
} from "./faithfulness.ts";

// Tuning. Recall-first per sub-question (broad retrieve, no provider/entity filter), then the reranker
// and faithfulness judge are the precision gates — a research report wants breadth the reranker prunes.
//
// BREADTH KNOBS (DEEP_RESEARCH_WIDE=on widens all four; default OFF = byte-identical to the old
// hard-coded 8/6/24/6). The old caps kept only 6 sources per sub-question and 24 total, so 5
// overlapping sub-questions deduped down to ~8 cited sources — thin for a "deep" report. Widening
// keeps more of the SAME reranked+faithfulness-gated evidence (the precision gates are unchanged),
// so a wider net only surfaces more real sources, never lowers the citation bar. Requires a
// deep-research faithfulness/guardrail re-check at deploy because the cited set shifts.
const DEEP_WIDE = Deno.env.get("DEEP_RESEARCH_WIDE") === "on";
const numEnv = (key: string, fallback: number): number => {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const SUB_RETRIEVE_THRESHOLD = 0.5; // matches /ask's ASK_MATCH_THRESHOLD (AC3 floor) — precision gate, unchanged
const SUB_MATCH_COUNT = DEEP_WIDE ? numEnv("DEEP_SUB_MATCH_COUNT", 16) : 8; // dense candidates pulled per sub-question
const SUB_TOP_M = DEEP_WIDE ? numEnv("DEEP_SUB_TOP_M", 14) : 6; // kept per sub-question after reranking against that sub-question
const REPORT_MAX_CHUNKS = DEEP_WIDE ? numEnv("DEEP_REPORT_MAX_CHUNKS", 48) : 24; // cap on the merged single-namespace pool
const LIVE_PER_SOURCE_MAX = DEEP_WIDE ? numEnv("DEEP_LIVE_PER_SOURCE_MAX", 10) : 6; // live candidates per source per sub-question

/** Human-readable database labels for each live/corpus provider key. */
const PROVIDER_DB_LABELS: Record<string, string> = {
  pubmed_oa: "PubMed / PubMed Central",
  clinicaltrials: "ClinicalTrials.gov",
  openfda: "openFDA drug labels",
  faers: "FDA FAERS adverse-event reports",
  europepmc: "Europe PMC",
  corpus: "PharmaBro curated evidence corpus",
  web: "Web sources (trusted journals, guidelines, and health authorities)",
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
  /** Pre-approved sub-questions from the user's edited plan (research fn action:"plan" → user edit). Non-empty ⇒ the plan step is skipped and these are used verbatim (already validated at the fn boundary). */
  subQuestions?: readonly string[];
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
  /** Uncited study-DESIGN proposals (lab_draft mode): the scaffold's skeleton. Already safety-scanned by
   *  the caller (they were part of synth.raw.points). They merge into the section list BY HEADING with the
   *  cited evidence so e.g. "Endpoints & readouts" holds both the proposed endpoint and its cited precedent. */
  designPoints?: RawReportPoint[];
  /** The computed pooled result the forest table renders (meta mode). */
  metaAnalysis?: MetaAnalysisResult;
  /** Optional audit map of configured model slots used by this report. */
  modelSlots?: ModelSlotMap;
}): ResearchReport {
  const { enforced, chunks } = args;
  // Merge the uncited design proposals (lab_draft) with the cited body in ONE assembleSections pass so a
  // shared heading is a single section. Design points lead (empty for non-lab_draft → unchanged behavior).
  const designInput = (args.designPoints ?? []).map((p) => ({
    section: p.section,
    point: { text: p.text, citation_ids: [] as string[] },
  }));
  const bodyInput = enforced.body.map((p) => ({ section: p.section, point: { text: p.text, citation_ids: p.citation_ids } }));
  const bodySections: ResearchSection[] = assembleSections([...designInput, ...bodyInput]);
  const metaSections: ResearchSection[] = args.metaPoints?.length
    ? assembleSections(args.metaPoints.map((p) => ({ section: p.section, point: { text: p.text, citation_ids: p.citations } })))
    : [];
  const sections: ResearchSection[] = [...bodySections, ...metaSections];
  const safety_notes: AnswerPoint[] = enforced.safety_notes.map((p) => ({
    text: p.text,
    citation_ids: p.citation_ids,
  }));
  // lab_draft carries a fixed, code-authored disclaimer as the FIRST safety note (the UI also renders it
  // as a prominent banner). Honest fixed copy → never trips the safety scan it bypasses (same as UNVERIFIED_NOTE).
  if (args.mode === "lab_draft") {
    safety_notes.unshift({ text: LAB_DRAFT_DISCLAIMER, citation_ids: [] });
  }
  const uncertainties: AnswerPoint[] = enforced.uncertainties.map((p) => ({
    text: p.text,
    citation_ids: p.citation_ids,
  }));
  if (!args.claimsVerified) uncertainties.push(UNVERIFIED_NOTE);

  const allTags = [
    ...sections.flatMap((s) => s.points.flatMap((p) => p.citation_ids)),
    ...safety_notes.flatMap((p) => p.citation_ids),
  ];

  const report: ResearchReport = {
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
    model_slots: args.modelSlots,
  };
  if (args.mode === "discovery") report.discovery = buildDiscoveryReport(report);
  return report;
}

/** A report carries real synthesized content only if some load-bearing claim survived. PURE. */
export function hasSupportedContent(enforced: EnforcedReport): boolean {
  return enforced.body.length > 0 || enforced.safety_notes.length > 0;
}

/** The step-7 no_source decision, extracted so the "a successful pool keeps the report alive" invariant
 *  is directly testable (not just implied by the inline `&& !pooled`). A report is discarded as no_source
 *  only when it has no supported synthesized content AND no computed pool — the pooled estimate is a real,
 *  verified-by-construction result that lives outside `enforced`, so it must survive an empty narrative. PURE. */
export function isNoSourceReport(hasContent: boolean, pooled: boolean): boolean {
  return !hasContent && !pooled;
}

/** In meta mode the evidence-grade badge represents the strength of the POOLED finding. When nothing
 *  pooled, showing a confident grade (e.g. "moderate") beside "No pooled estimate" is a self-contradiction
 *  the layperson reads first — so the report carries no grade ("not_applicable"). Non-meta modes, and
 *  successful pools, keep the synthesized grade untouched. PURE. */
export function metaEvidenceGrade(mode: string | undefined, pooled: boolean, synthesizedGrade: EvidenceGrade): EvidenceGrade {
  return mode === "meta" && !pooled ? "not_applicable" : synthesizedGrade;
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

/**
 * lab_draft hazardous-SCOPE gate. Returns a refusal report when the mode is lab_draft AND the question's
 * scope is chemical-synthesis/production, weaponization, or pathogen gain-of-function — decided by the
 * pure ask/lab-draft-guard BEFORE any retrieval. Returns null otherwise (the run proceeds). The frozen
 * preScreen/classify medical-safety layer runs FIRST and is unchanged; this is the lab_draft-only scope
 * control. PURE (the guard is a deterministic regex pass). `flags` carries the safety flags so far.
 */
export function labDraftScopeRefusal(
  mode: ReportMode | undefined,
  question: string,
  flags: SafetyFlag[],
): ResearchReport | null {
  if (mode !== "lab_draft") return null;
  if (assessLabDraftScope(question).allowed) return null;
  return templateReport(question, "lab_draft_refused", LAB_DRAFT_REFUSAL_COPY, flags);
}

/**
 * Split a lab_draft synthesis's flat points into the two lanes a study-design scaffold needs.
 * `design` = forward-looking proposals (Objective/Hypothesis/arms/controls/sample-size) the model left
 * UNCITED — legitimately uncited, they must BYPASS citation-existence + faithfulness or the scaffold's
 * skeleton gets pruned to nothing (the failure mode that would silently turn a valid design into a
 * no_source template). `evidence` = claims about what existing studies DID; they carry [n] tags and flow
 * through the normal enforce + faithfulness gates. BOTH lanes still ride the ONE safety scan, because the
 * caller scans the full synth.raw.points (design ∪ evidence) before this split. PURE.
 */
export function splitLabDraftPoints(
  points: RawReportPoint[],
): { design: RawReportPoint[]; evidence: RawReportPoint[] } {
  const design: RawReportPoint[] = [];
  const evidence: RawReportPoint[] = [];
  for (const p of points) {
    (p.citations.length === 0 ? design : evidence).push(p);
  }
  return { design, evidence };
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
  // Same educational-toxicity relax as /ask (shared safety machinery): drop a SOLO, classifier-added
  // emergency_possible on a general "is X lethal/toxic" inquiry; everything worse keeps full routing.
  const rawFlags = unique<SafetyFlag>([...pre.flags, ...cls.safety_flags]);
  const flags = suppressEmergencyForGeneralToxicity(question, rawFlags);
  if (rawFlags.includes("emergency_possible") && !flags.includes("emergency_possible")) {
    console.warn(`research toxicity carve-out — relaxed classifier emergency_possible on educational toxicity question: ${JSON.stringify(question.slice(0, 120))}`);
  }
  if (flags.some((f) => f === "emergency_possible" || f === "overdose_possible" || f === "self_harm")) {
    return templateReport(question, "emergency_routing", EMERGENCY_COPY, flags);
  }
  if (cls.intent === "drug_sourcing" || flags.includes("drug_sourcing")) {
    return templateReport(question, "sourcing_refusal", SOURCING_COPY, flags);
  }

  // ---- 1b. lab_draft hazardous-SCOPE gate — refuse synthesis/weaponization/biothreat scope BEFORE any
  // retrieval. Frozen preScreen/classify above are unaffected; this only adds the lab_draft-only control. ----
  const labRefusal = labDraftScopeRefusal(cfg.mode, question, flags);
  if (labRefusal) return labRefusal;

  // ---- 2. plan ----
  emit("planning", "Breaking the question into focused sub-questions");
  const subQuestions = await resolveSubQuestions(
    cfg.subQuestions,
    () => planSubQuestions(question, cfg.apiKey, cfg.mode ?? "standard"),
  );
  if (subQuestions.length === 0) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 3. gather (bounded parallel; recall-first per sub-question, reranked against THAT question) ----
  // 3a runs the medical-database gather (dense + live sources) per sub-question. 3b, when
  // DEEP_RESEARCH_AGENTIC=on, runs the ChatGPT-style agentic WEB loop in PARALLEL: iterative
  // search -> per-source learning extraction -> follow-up queries -> repeat. Its learnings become
  // provider:"web" chunks that MERGE into the same pool below, so the reranker, the per-claim
  // faithfulness judge, and the forbidden-phrase scan run on them UNCHANGED — web breadth in, the
  // citation bar untouched. Flag off: webChunks is [] and this is byte-identical to the DB-only path.
  emit("gathering", `Searching evidence for ${subQuestions.length} sub-questions`);
  const [perSubQuestion, webChunks] = await Promise.all([
    Promise.all(subQuestions.map((sq) => gatherForSubQuestion(sq, cls.entity_mentions, cfg))),
    gatherWebResearch(question, cfg, emit),
  ]);

  // ---- 4. merge into ONE citation namespace ----
  // Web chunks join as one more reranked list; mergeEvidence dedups by chunk_id (web synthetic ids
  // never collide with library ids), round-robins for fairness, caps at REPORT_MAX_CHUNKS, retags 1..N.
  const chunks = mergeEvidence(webChunks.length ? [...perSubQuestion, webChunks] : perSubQuestion, REPORT_MAX_CHUNKS);
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
    synth = await synthesizeReport({ question, subQuestions, chunks, apiKey: cfg.apiKey, mode: cfg.mode });
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

  // ---- 6c. lab_draft: split the just-scanned points into the design scaffold (uncited proposals) and
  // the cited evidence. Only the evidence flows through citation-existence + faithfulness — a
  // forward-looking design proposal cannot be entailed by a source, so running it through those gates
  // would prune the scaffold's skeleton to nothing (the silent no_source failure mode). The design lane
  // already rode the ONE safety scan above (it was part of synth.raw.points). ----
  const { design: designPoints, evidence: evidencePoints } = cfg.mode === "lab_draft"
    ? splitLabDraftPoints(synth.raw.points)
    : { design: [] as RawReportPoint[], evidence: synth.raw.points };
  const rawForGates = cfg.mode === "lab_draft" ? { ...synth.raw, points: evidencePoints } : synth.raw;
  // A lab_draft scaffold with a real design skeleton is a valid deliverable even if no cited evidence
  // survived (the disclaimer makes its unvalidated nature explicit) — keep it alive like a successful pool.
  const labScaffold = cfg.mode === "lab_draft" && designPoints.length > 0;

  // ---- 7. enforce citations (existence) then faithfulness (semantic support) ----
  // A successful pool keeps the report alive even if the synthesized narrative pruned to empty: the
  // pooled estimate is a real, verified-by-construction result the user asked for, and it lives in
  // metaPoints/metaResult (not in `enforced`), so the no_source gates below must not discard it.
  const pooled = metaResult?.poolable === true;
  const enforced = enforceReportCitations(rawForGates, chunks);
  if (isNoSourceReport(hasSupportedContent(enforced) || labScaffold, pooled)) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }
  emit("checking", "Fact-checking each claim against its cited source");
  const { report: verifiedContent, verified } = await checkFaithfulness(enforced, chunks, cfg.apiKey);
  if (isNoSourceReport(hasSupportedContent(verifiedContent) || labScaffold, pooled)) {
    return templateReport(question, "no_source", NO_SOURCE_COPY, unique<SafetyFlag>([...flags, "no_sources_found"]));
  }

  // ---- 8. assemble ----
  const report = assembleReport({
    question,
    subQuestions,
    enforced: verifiedContent,
    chunks,
    designPoints,
    evidenceGrade: metaEvidenceGrade(cfg.mode, pooled, synth.raw.evidence_grade),
    safetyFlags: flags,
    claimsVerified: verified,
    gaps,
    counts,
    mode: cfg.mode ?? "standard",
    searchMethod,
    metaPoints,
    metaAnalysis: metaResult,
    modelSlots: {
      classify: cls.model,
      scope: modelFor("scope"),
      research: synth.model,
      verify: modelFor("verify"),
    },
  });
  emit("done", "Report ready", report.citations.length);
  return report;
}

/**
 * Agentic WEB research (DEEP_RESEARCH_AGENTIC=on): run the iterative search->extract->follow-up loop,
 * convert its per-source learnings to provider:"web" chunks, and rerank them against the ORIGINAL
 * question so their internal order is by relevance before they merge into the evidence pool. Flag off
 * (or no search key) -> [] instantly, so the DB-only path is byte-identical. Never throws; a failed
 * web round just returns fewer/no chunks. Progress feeds the same activity trail the DB gather uses.
 */
async function gatherWebResearch(
  question: string,
  cfg: OrchestrateConfig,
  emit: (step: ResearchProgressStep["step"], detail: string, sources_found?: number) => void,
): Promise<RetrievedChunk[]> {
  if (!agenticResearchEnabled()) return [];
  try {
    const learnings = await runAgenticWebResearch(question, cfg.apiKey, {
      onQueries: (queries) => emit("gathering", `Searching the web: ${queries.slice(0, 3).join("; ")}`.slice(0, 200)),
      onSources: (count) => emit("gathering", "Reading and extracting from web sources", count),
    });
    if (learnings.length === 0) return [];
    const chunks = webLearningsToChunks(learnings, 1);
    try {
      return await rerankChunks(question, chunks);
    } catch {
      return chunks; // rerank failure -> trust-sorted order from the adapter
    }
  } catch (e) {
    console.error("agentic web research gather failed; using DB evidence only:", (e as Error).message);
    return [];
  }
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
