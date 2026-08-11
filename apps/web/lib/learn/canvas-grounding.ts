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

import { blockToText, type DocumentModel } from "@nemesis/shared";

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
 */
export function buildExcerptsFromModel(sourceId: string, model: DocumentModel): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];

  const push = (text: string, label: string | null) => {
    excerpts.push({ id: `${sourceId}:e${excerpts.length + 1}`, label, text });
  };

  for (const block of model.blocks) {
    // A heading names what follows; it is not itself a quotable claim. It already lives in
    // the `headingPath` of every block beneath it, so dropping it here loses nothing.
    if (block.kind === "heading") continue;

    if (block.kind === "figure") {
      const caption = block.text.trim();
      const seen = block.figure?.description?.trim();
      if (!caption && !seen) continue;
    }

    const text = blockToText(block).trim();
    if (!text) continue;

    const label = labelFor(model, block.unit, block.headingPath);

    // 🔴 A TABLE IS NEVER SPLIT, WHATEVER ITS SIZE — the same rule the chunker follows, for
    // the same reason: a grid with some of its rows is a different grid, and its cells only
    // mean anything beside their headers. An oversized table stays whole and is quoted whole.
    if (block.kind === "table") {
      push(text, label);
      continue;
    }

    for (const piece of splitLong(text)) push(piece, label);
  }

  return excerpts;
}

/**
 * What to call where an excerpt sat.
 *
 * The innermost enclosing heading, or — when the block sits under none — the unit's own
 * name, which is a slide's title placeholder or a sheet's name. Never generated: a unit with
 * no label and no heading above it gets `null`, exactly as the text path would.
 */
function labelFor(model: DocumentModel, unit: number, headingPath: readonly string[]): string | null {
  const innermost = headingPath.at(-1)?.trim();
  if (innermost) return innermost;
  return model.units[unit]?.label?.trim() || null;
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
