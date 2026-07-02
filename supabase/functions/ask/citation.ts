// Citation enforcement (§7 step 6). Pure, deterministic.
//
// The generator is told to tag every load-bearing sentence with the [n] of the
// chunk that supports it. Here we (1) drop any [n] that isn't a real retrieved
// chunk (hallucinated cite), (2) refuse the whole answer when the bottom line
// has no valid support (AC3 "unsupported claims refused"), (3) drop unsupported
// load-bearing points, and (4) build citations[] from the survivors.
//
// SCOPE NOTE (deferred): we verify a cited chunk EXISTS, not that it
// SEMANTICALLY SUPPORTS the sentence (NLI / 2nd-pass verifier). The plan marks
// that optional for Phase 3; logged for the §9/Phase-4 work so a green suite is
// not misread as semantic-support verification.

import type { AnswerSections, Citation, SourceText } from "../../../packages/shared/src/answer.ts";
import { isDoajVetted } from "./doaj-registry.ts";

export interface RetrievedChunk {
  tag: string; // retrieval-local "1".."N" shown to the generator
  chunk_id: string;
  /** The chunk body shown to the generator for grounding. Unused by enforcement. */
  chunk_text?: string;
  source_id: string;
  provider: string;
  title: string | null;
  section: string | null;
  url: string | null;
  license: string | null;
  published_date: string | null;
  retrieved_at: string | null;
  similarity: number;
  // ── Optional bibliographic + study-type metadata (publishable-reports). Live results carry
  //    these from the provider's NormalizedSource.metadata; library results from core_sources.
  //    Absent on most chunks; consumers degrade gracefully. ──
  authors?: string[];
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  /** PubMed PublicationType list (for gap study-type classification). */
  publication_types?: string[];
  /** ClinicalTrials.gov study type (INTERVENTIONAL | OBSERVATIONAL | ...) for gap classification. */
  study_type?: string;
  trial_status?: string;
  trial_phase?: string;
  /** The journal's ISSN(s) (print + online). Used to flag DOAJ-listed journals; not displayed. */
  issn?: string[];
  /** Free-to-read full-text LINK (open-access PDF/article), when the source exposes one. A pointer the
   *  reader can follow — NOT text we retrieved or grounded. Live OA providers (OpenAlex, Europe PMC) only. */
  oa_url?: string;
}

/** Copy the optional bibliographic + study-type fields from a chunk onto a Citation, plus the DOAJ
 *  credibility flag derived from the journal ISSN. PURE. doaj_vetted is omitted (undefined) unless the
 *  journal is confirmed DOAJ-listed — a positive-only signal. The study-type fields are carried verbatim
 *  so the UI can derive a study-type badge (studyTypeLabel) without the LLM ever guessing the design. */
export function citationMeta(c: RetrievedChunk): Pick<Citation, "authors" | "journal" | "year" | "volume" | "issue" | "pages" | "doaj_vetted" | "publication_types" | "study_type" | "trial_phase" | "oa_url"> {
  return {
    authors: c.authors,
    journal: c.journal,
    year: c.year,
    volume: c.volume,
    issue: c.issue,
    pages: c.pages,
    doaj_vetted: c.issn && isDoajVetted(c.issn) ? true : undefined,
    publication_types: c.publication_types,
    study_type: c.study_type,
    trial_phase: c.trial_phase,
    oa_url: c.oa_url,
  };
}

/** Map a retrieved chunk to a resolved Citation (the §8 citations[] shape). Used for both the cited
 *  set and the "also reviewed" breadth set surfaced in the evidence panel. PURE. */
export function chunkToCitation(c: RetrievedChunk): Citation {
  return {
    chunk_tag: c.tag,
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
}

interface RawPoint {
  text: string;
  citations: string[];
}

export interface EnforceInput {
  bottom_line: RawPoint;
  what_we_know: RawPoint[];
  what_we_do_not_know: RawPoint[];
  safety_notes: RawPoint[];
  questions_to_ask: string[];
  chunks: RetrievedChunk[];
}

export interface EnforceResult {
  refusedUnsupported: boolean;
  plain_english_summary: string;
  answer_sections: AnswerSections;
  citations: Citation[];
  oldest_source_date: string | null;
}

/** "[1]" / " 1 " -> "1". Models emit bracketed tags; our valid set is bare. */
function normTag(t: unknown): string {
  return String(t).replace(/[\[\]\s]/g, "");
}

/** Keep only tags that map to a real retrieved chunk; preserve order, dedupe. */
function validTags(citations: string[], valid: Set<string>): string[] {
  if (!Array.isArray(citations)) return []; // model may omit the array entirely
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

export function enforceCitations(input: EnforceInput): EnforceResult {
  const byTag = new Map(input.chunks.map((c) => [c.tag, c]));
  const valid = new Set(byTag.keys());

  // Load-bearing sections assert facts -> each kept point needs >=1 real cite.
  const keepCited = (points: RawPoint[]) =>
    points
      .map((p) => ({ text: p.text, citation_ids: validTags(p.citations, valid) }))
      .filter((p) => p.citation_ids.length > 0);

  const what_we_know = keepCited(input.what_we_know);
  const safety_notes = keepCited(input.safety_notes);

  // The bottom line is a SUMMARY of the body. Models routinely cite the detail
  // points and leave the summary bare, so requiring the bottom line to carry its
  // own [n] falsely refuses well-grounded answers. Attribute it to the body when
  // empty; refuse only when NOTHING in the answer is cited (AC3).
  let bottomTags = validTags(input.bottom_line.citations, valid);
  if (bottomTags.length === 0) {
    bottomTags = [...new Set([
      ...what_we_know.flatMap((p) => p.citation_ids),
      ...safety_notes.flatMap((p) => p.citation_ids),
    ])];
  }
  const refusedUnsupported = bottomTags.length === 0;
  // Limitations + questions don't assert sourced facts -> kept verbatim.
  const what_we_do_not_know = input.what_we_do_not_know.map((p) => ({
    text: p.text,
    citation_ids: [],
  }));

  const answer_sections: AnswerSections = {
    what_we_know,
    what_we_do_not_know,
    safety_notes,
    questions_to_ask: input.questions_to_ask,
  };

  // Build citations[] from the union of all surviving tags (bottom line + kept
  // load-bearing points), in numeric tag order, deduped.
  const used = new Set<string>([
    ...bottomTags,
    ...what_we_know.flatMap((p) => p.citation_ids),
    ...safety_notes.flatMap((p) => p.citation_ids),
  ]);
  const citations: Citation[] = [...used]
    .sort((a, b) => Number(a) - Number(b))
    .map((tag) => chunkToCitation(byTag.get(tag)!));

  const oldest_source_date = oldestDate(citations);

  return {
    refusedUnsupported,
    plain_english_summary: input.bottom_line.text,
    answer_sections,
    citations,
    oldest_source_date,
  };
}

/** Oldest YYYY-MM-DD across cited sources (prefer retrieved_at, else published). */
function oldestDate(citations: Citation[]): string | null {
  const dates = citations
    .map((c) => (c.retrieved_at ?? c.published_date ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

/** The differentiated source-class badge fields for a reviewed card (e.g. "official label",
 *  "randomized trial") — what the evidence panel reads as `Citation.evidence_role`. Deliberately
 *  narrow: it does NOT include `support_level`/`claim_relation`, which are tag-keyed (relative to a
 *  cited claim) and meaningless for a source no claim cited. Keeping this type narrow makes
 *  reintroducing those fields on reviewed cards a type error, not just a lint nit. */
export type ReviewedRating = Pick<Citation, "evidence_role" | "evidence_weight" | "support_reason">;

/**
 * Task 3: the "also reviewed" breadth set — the full reranked pool minus what the answer actually
 * cited, relevance-floored and capped. PURE (no network, no sort — `pool` is expected to already be
 * rank-ordered, e.g. the reranker's output or dense-similarity order).
 *
 * Exclusion is by `chunk_id` (stable identity), NOT by `tag`: `pool` (guardPool) carries pool-local
 * tags that can collide with the cited slice's retagged "1".."N" tags, so tag-based exclusion would
 * incorrectly drop or keep the wrong rows. Surviving rows are re-tagged `String(citedCount + i + 1)`
 * so their display tags start strictly after the cited namespace and the evidence-panel `ev-src-<tag>`
 * anchors never collide cited vs reviewed.
 *
 * `rate` is an OPTIONAL per-chunk rater (the caller wraps `evidenceRole()` from source-support.ts) that
 * derives the differentiated evidence-role badge from the chunk's own provider/publication_types/
 * study_type. It is called with the ORIGINAL chunk — never a tag, never a lookup keyed by
 * `ret.chunks`/`supportRatings` — so it stays collision-safe with the cited-tag namespace by
 * construction. Omit it and reviewed cards carry no evidence_role (today's behavior).
 */
export function buildReviewedSet(
  pool: readonly (RetrievedChunk & { rerank_score?: number })[],
  citedChunkIds: ReadonlySet<string>,
  citedCount: number,
  floor: number,
  cap: number,
  rate?: (chunk: RetrievedChunk) => Partial<ReviewedRating>,
): Citation[] {
  return pool
    .filter((c) => !citedChunkIds.has(c.chunk_id))
    .filter((c) => (c.rerank_score ?? c.similarity ?? 0) >= floor)
    .slice(0, cap)
    .map((c, i) => {
      const cite = chunkToCitation({ ...c, tag: String(citedCount + i + 1) });
      return rate ? { ...cite, ...rate(c) } : cite;
    });
}

/**
 * Verbatim per-tag source text for the `include_source_text` verification payload. At most one entry
 * per tag (first non-empty wins); a chunk with no usable body text is skipped — there is nothing to
 * verify a claim against. PURE. The tags returned match Citation.chunk_tag, so a consumer can resolve
 * each claim's cited [n] to the EXACT text it cited (faithful-vs-drift becomes a direct read, not a
 * lossy re-fetch). Built from the SAME reranked chunk set the answer was generated and cited from.
 */
export function collectSourceTexts(
  chunks: ReadonlyArray<Pick<RetrievedChunk, "tag" | "chunk_text">>,
): SourceText[] {
  const out: SourceText[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    if (seen.has(c.tag) || !c.chunk_text?.trim()) continue;
    seen.add(c.tag);
    out.push({ tag: c.tag, text: c.chunk_text });
  }
  return out;
}
