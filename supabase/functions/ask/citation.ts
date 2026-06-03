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

import type { AnswerSections, Citation } from "../../../packages/shared/src/answer.ts";

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

  const bottomTags = validTags(input.bottom_line.citations, valid);
  const refusedUnsupported = bottomTags.length === 0;

  const what_we_know = keepCited(input.what_we_know);
  const safety_notes = keepCited(input.safety_notes);
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
      };
    });

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
