// Turning an extracted document into something a generated block can honestly cite.
//
// 🔴 WHY EXCERPTS AND NOT PAGE NUMBERS.
//
// Nemesis cannot cite inside a document today. The reader can consume `&page=N`, but no
// AI-facing path anywhere ever produces a locator — every citation the model is taught to
// emit is file-level. Word documents have no internal units at all, and recording transcripts
// are one undifferentiated column with no timestamps.
//
// Asking a model for a page number it cannot know produces a confident invention. So instead
// we split the text ourselves, give each piece an id we minted, and require the model to cite
// those ids. "Where did this come from?" then shows the learner the actual sentences the
// block was built from — real provenance, nothing fabricated.
//
// Labels are only ever copied from headings the extractor genuinely emitted (it writes
// "## Slide 12" for decks). No heading, no label.

import type { DocumentModel } from "@nemesis/shared";

import {
  readableUnits,
  resolveQuote,
  sectionOf,
  sourceContextFromModel,
  type CanonicalSourceAnchor,
  type SourceContext,
} from "@/lib/sources/source-context";

import type { CanvasSource, SourceExcerpt, SourceRef } from "./canvas-model";

/** Longer than this and one excerpt stops being a quotable unit. */
const MAX_EXCERPT_CHARS = 2400;
/** Total grounding sent to the model. Well under the 150k the chat lane already tolerates,
 *  because the lesson prompt and the answer have to fit alongside it. */
const MAX_GROUNDING_CHARS = 120_000;

/** A markdown-style heading line, which is what the extractor emits for slide/section units. */
const HEADING = /^#{1,6}\s+(.+?)\s*$/;

/** Split extracted text into citable excerpts with stable ids.
 *
 *  Deterministic: the same text always produces the same ids, so a canvas reloaded from
 *  storage still resolves the citations it saved. */
export function buildExcerpts(sourceId: string, text: string): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];
  let label: string | null = null;

  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const heading = HEADING.exec(trimmed);
    if (heading) {
      // A heading names what follows; it is not itself a quotable claim.
      label = heading[1]?.trim() || null;
      continue;
    }

    // One paragraph is one excerpt. Short ones are kept separate rather than glued to a
    // neighbour: on a slide deck the short lines ARE the content, and merging them would make
    // a citation point at text the block did not use.
    for (const piece of splitLong(trimmed)) {
      excerpts.push({ id: `${sourceId}:e${excerpts.length + 1}`, label, text: piece });
    }
  }

  return excerpts;
}

/**
 * The same excerpts, built from the document's STRUCTURE instead of its flattened text.
 *
 * 🔴 WHY THIS EXISTS BESIDE `buildExcerpts` RATHER THAN REPLACING IT. The parser has always
 * produced a real document model — typed blocks, heading paths, tables kept as grids — and
 * every consumer received `documentToText(model)`, a string. `buildExcerpts` then re-derived
 * the structure back out of that string with a regular expression. Two things were lost in
 * the round trip, and both are live defects rather than theory:
 *
 *   * A TABLE ARRIVED AS PIPE-SOUP. `blockToText` renders a grid to markdown; splitting on
 *     blank lines then cuts it wherever it happens to land, so a dosing table or a grading
 *     rubric reached the lesson as a paragraph of `|` characters, and a citation could point
 *     at a row separated from its own headers. The chunker has always protected tables
 *     (`ATOMIC`); this path did not. Here a table is exactly one excerpt, always.
 *   * A LABEL WAS A GUESS. The regex `/^#{1,6}\s+(.+?)\s*$/` recovers a heading only when the
 *     renderer happened to emit one, and it cannot tell a heading from a line of prose that
 *     starts with a hash. `headingPath` is the exact ancestor trail the parser recorded.
 *
 * 🔴 A FIGURE NOBODY LOOKED AT IS NOT EVIDENCE. `blockToText` renders such a block as the
 * literal string "[Figure — not examined]", which the text path turned into a citable
 * excerpt — so a model could cite our own disclosure as though it were the document's
 * content. A figure is included here only when it carries a caption or a description; the
 * fact that it exists and was not examined is already carried by `coverage`, which is where
 * a disclosure belongs.
 *
 * Ids use the same `${sourceId}:e${n}` scheme and are assigned in reading order, so this is a
 * drop-in for the string version.
 *
 * 🔴 IT IS NOW A WRAPPER, AND THE INDIRECTION IS THE POINT. This function used to carry its own
 * copy of the splitting rules — skip headings, never cut a table, break a long paragraph on
 * sentences, take the label from the heading path or else the unit's own name — and so does the
 * canonical path. Two copies of a rule are two rules the moment one is edited, and the failure
 * would be silent and specific: a citation made from an upload response would point somewhere
 * slightly different from the same citation made after a reload, with every test on both sides
 * still green. There is one implementation, and both callers go through it.
 */
export function buildExcerptsFromModel(sourceId: string, model: DocumentModel): SourceExcerpt[] {
  // `sourceKind` only ever feeds parse QUALITY, which nothing downstream of here reads, so the
  // model's own format is the honest answer rather than a guess about the file it came from.
  const context = sourceContextFromModel({ model, sourceId, sourceKind: model.format });
  return excerptsFromSourceContext(sourceId, context);
}

/**
 * The same excerpts again, built from the CANONICAL BOUNDARY rather than from a document model
 * handed over in an upload response.
 *
 * 🔴 WHY A THIRD BUILDER RATHER THAN A THIRD COPY OF THE RULES. `buildExcerptsFromModel` reads a
 * `DocumentModel` — which Canvas only ever has for a file it just uploaded, in the seconds before
 * the response is discarded. Everything that has to work later reads the PERSISTED parse instead:
 * a canvas reopened tomorrow, a second canvas built on the same lecture, an extractor asked what
 * this source teaches. Those must not re-derive structure from a different input than the one that
 * survived, or "what the canvas cites" and "what actually got stored" drift apart with nothing
 * able to notice.
 *
 * So this takes a `SourceContext`, which is read out of `parsed_documents` through the real
 * envelope validator. The splitting rules are identical on purpose — a table is one excerpt, a
 * heading is not itself quotable, a long paragraph breaks on sentences — because a citation made
 * on one path has to mean the same thing as a citation made on the other.
 *
 * 🔴 AND EVERY EXCERPT REMEMBERS ITS UNIT. `unitId` is what later lets a durable
 * `CanonicalSourceAnchor` be resolved into a canvas citation without anyone assuming a block id
 * and an excerpt id are the same string.
 */
export function excerptsFromSourceContext(sourceId: string, context: SourceContext): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];

  const push = (text: string, label: string | null, unitId: string) => {
    excerpts.push({ id: `${sourceId}:e${excerpts.length + 1}`, label, text, unitId });
  };

  for (const unit of readableUnits(context)) {
    // A heading names what follows; it is not itself a quotable claim. It already lives in the
    // `headingPath` of every unit beneath it, so dropping it here loses nothing.
    if (unit.type === "heading") continue;

    const text = (unit.text ?? "").trim();
    if (!text) continue;

    // The innermost enclosing heading, else what the document itself calls the page or slide.
    // Never generated: a unit with neither gets `null`, exactly as the other two builders do.
    const label = sectionOf(unit) ?? unit.unitLabel ?? null;

    // 🔴 A TABLE IS NEVER SPLIT, WHATEVER ITS SIZE — the same rule the chunker follows, for the
    // same reason: a grid with some of its rows is a different grid, and its cells only mean
    // anything beside their headers.
    if (unit.type === "table") {
      push(text, label, unit.id);
      continue;
    }

    for (const piece of splitLong(text)) push(piece, label, unit.id);
  }

  return excerpts;
}

/**
 * Resolve a durable canonical anchor into a citation this canvas can actually render.
 *
 * 🔴 THE EXPLICIT BOUNDARY THE TWO LOCATOR SYSTEMS MEET AT, AND THE REASON IT IS A FUNCTION RATHER
 * THAN A CAST. Extraction records where something sits in the SOURCE — durable, quote-based,
 * meaningful to any canvas and still valid after the document is reparsed by a better parser. A
 * canvas cites where something sits in ITS OWN excerpt list — `s1:e7`, meaningless anywhere else.
 * They are not the same identifier and converting between them by assuming they match would
 * produce a citation that resolves to real text from the wrong place, which is worse than no
 * citation at all: a broken locator that passes every check.
 *
 * Returns null rather than a best guess. A source that was never filed, an anchor from a document
 * this canvas does not hold, or a quote that no longer exists after a reparse all mean "we cannot
 * honestly point at this", and the caller must show no citation instead of a plausible one.
 */
export function groundCanonicalAnchor(
  sources: readonly CanvasSource[],
  anchor: CanonicalSourceAnchor,
): SourceRef | null {
  // Matched on the DURABLE id, never on the canvas-local one. Every canvas calls its first
  // attachment "s1", so matching on that would resolve an anchor from a different document.
  const source = sources.find((candidate) => candidate.librarySourceId === anchor.sourceId);
  if (!source) return null;

  const fromUnit = source.excerpts.filter((excerpt) => excerpt.unitId === anchor.unitId);
  if (fromUnit.length === 0) return null;

  // One unit can have been split into several excerpts, so the quote decides which. Without a
  // quote there is only one honest answer — the first piece of that unit — and it is right
  // whenever the unit was not split at all, which is the ordinary case.
  const quote = anchor.quote;
  if (!quote) return { excerptId: fromUnit[0]!.id, sourceId: source.id };

  const hit = fromUnit.find((excerpt) => resolveQuote(excerpt.text, quote) >= 0);
  return hit ? { excerptId: hit.id, sourceId: source.id } : null;
}

/** Break an over-long paragraph on sentence boundaries. A quote cut mid-word is unusable as
 *  evidence, so we never cut on a raw character count when a sentence end is available. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_EXCERPT_CHARS) return [text];

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_EXCERPT_CHARS) {
      out.push(current.trim());
      current = "";
    }
    // A single "sentence" over the cap has no punctuation to break on — transcripts and OCR
    // output routinely produce these. Fall back to word boundaries, never mid-word.
    if (sentence.length > MAX_EXCERPT_CHARS) {
      for (const chunk of splitOnWords(sentence)) out.push(chunk);
      continue;
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function splitOnWords(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > MAX_EXCERPT_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The grounding the model reads, with every excerpt tagged by the id it must cite. */
export function groundingBlock(sources: readonly CanvasSource[]): string {
  if (sources.length === 0) return "";

  const parts: string[] = [];
  let budget = MAX_GROUNDING_CHARS;
  let dropped = 0;

  for (const source of sources) {
    const header = `### SOURCE ${source.id} — ${source.title}${
      source.coverageNote ? `\n(Nemesis could not read all of this: ${source.coverageNote})` : ""
    }`;
    parts.push(header);
    budget -= header.length;

    for (const excerpt of source.excerpts) {
      const line = `[${excerpt.id}]${excerpt.label ? ` (${excerpt.label})` : ""} ${excerpt.text}`;
      if (line.length > budget) {
        dropped += 1;
        continue;
      }
      parts.push(line);
      budget -= line.length + 2;
    }
  }

  // 🔴 Silence about a truncation is the defect the coverage record exists to prevent. If we
  // had to leave material out, the model is told, so it can decline rather than confabulate.
  if (dropped > 0) {
    parts.push(
      `(${dropped} further excerpt${dropped === 1 ? "" : "s"} were not included because the material is long. Do not claim to have covered them.)`,
    );
  }

  return parts.join("\n\n");
}

/** Resolve a citation to the actual source and text behind it, or null. */
export function quotedExcerpt(
  sources: readonly CanvasSource[],
  ref: SourceRef,
): { source: CanvasSource; excerpt: SourceExcerpt } | null {
  const source = sources.find((candidate) => candidate.id === ref.sourceId);
  if (!source) return null;
  const excerpt = source.excerpts.find((candidate) => candidate.id === ref.excerptId);
  return excerpt ? { source, excerpt } : null;
}
