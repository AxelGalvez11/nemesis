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
