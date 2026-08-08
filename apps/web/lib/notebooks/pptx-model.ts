/**
 * A deck as units and blocks, so a slide can be cited as a slide.
 *
 * 🔴 PPTX WAS THE STRONG LANE, AND THAT IS EXACTLY WHY THIS IS DELICATE. The
 * existing reader already recovers speaker notes, SmartArt, charts, tables,
 * EMF/TIFF pictures and glyph filtering — a real advantage over the PDF lane
 * before Phase 2. Its measured baseline on the owner's own deck is 62,040
 * characters, 56 headings and 807 bullets, and **nothing here may cost a single
 * one of them.** `scripts/phase3-pptx-check.mts` asserts that against real
 * files rather than trusting this comment.
 *
 * So this is a re-SHAPING, not a re-EXTRACTION. Every character still comes from
 * `readPptxSlides` and `mergeImageDescriptions`; what changes is that the text
 * arrives as slide-numbered blocks instead of one string with blank lines in it.
 * Phases 4 and 5 need that: a chunk with no unit cannot carry a locator, and a
 * citation into a deck that has no slides can only say "somewhere in this file".
 *
 * Where a PDF fabricates nothing by refusing to name a page for a `.docx`, a
 * deck genuinely HAS slides — `unitKind: "slide"` is a fact the format supplies,
 * and `describeLocator` will print "slide 12" because that is true.
 */

import { buildDocument, type DocBlock, type DocRect, type DocumentModel } from "@nemesis/shared";

import type { DeckStructure, SlideBodyLine } from "./office-text";
import { figureNotesBySlide, mergeImageDescriptions, type SlideImage } from "./slide-media";

export interface PptxModelInput {
  slides: readonly string[];
  slideTitles: readonly (string | null)[];
  deckTitle: string | null;
  images: readonly SlideImage[];
  /**
   * The same slides as grids and boxes, from `readPptxSlides`.
   *
   * Optional because the text alone is still a valid deck — a caller with no
   * structure gets exactly the model it got before. What it cannot get is a
   * table that is a table or a locator finer than a slide number.
   */
  structure?: DeckStructure;
}

/**
 * A line that is a figure description the merge step inserted.
 *
 * Matched rather than tracked because `mergeImageDescriptions` is the one place
 * that formatting is decided, and re-deriving it here would be a second copy of
 * the same rule. The pattern is anchored to the whole line so a slide that
 * merely mentions a bracket in prose is untouched.
 */
const FIGURE_LINE = /^\[(Figure|Recurring graphic): ([\s\S]+)\]$/;

/**
 * Build the canonical model for a deck.
 *
 * `descriptions` is the same map the text renderer takes, so a deck rendered and
 * a deck modelled see identical figure text. Passing it separately — rather than
 * folding descriptions in afterwards — is what keeps the two representations
 * from drifting.
 */
export function pptxToModel(
  input: PptxModelInput,
  descriptions: ReadonlyMap<string, string> = new Map(),
): DocumentModel {
  const merged = mergeImageDescriptions(input.slides, descriptions, input.images);
  // The same grouping `mergeImageDescriptions` used, so the picture behind each
  // appended line is known rather than guessed at from the line's own text.
  const figureNotes = figureNotesBySlide(descriptions, input.images);
  const blocks: Omit<DocBlock, "id">[] = [];

  merged.forEach((slideText, index) => {
    const title = input.slideTitles[index]?.trim() || null;
    // 🔴 THE FACTS ARE ONLY TRUSTED FOR A LINE THAT IS STILL THE SAME LINE.
    // `mergeImageDescriptions` appends figure lines to the slide's own text, so
    // the first N lines are the slide's and the rest are not. Re-checking each
    // line against the text the facts were built from is what makes that
    // boundary exact instead of arithmetic — and if anything ever shifts, the
    // block loses its rect rather than inheriting the shape above's.
    const original = (input.slides[index] ?? "").split("\n");
    const facts = input.structure?.lines[index] ?? [];
    const tables = input.structure?.tables[index] ?? [];
    const pictures = input.structure?.pictures[index];
    const titleRect = input.structure?.titleRects[index];
    const pending = [...(figureNotes.get(index + 1) ?? [])];
    const factAt = (at: number, raw: string): SlideBodyLine =>
      facts.length === original.length && original[at] === raw ? (facts[at] ?? {}) : {};
    // 🔴 THIS SLIDE'S BLOCKS, NOT THE DOCUMENT'S. An earlier version pushed
    // straight into `blocks` and used `unshift` for a title that never appeared
    // in the body — which put slide 19's heading at the front of the DECK.
    // Every locator would still have said "slide 19", and the reading order,
    // the chunker and every "what comes next" question would have been wrong.
    const slideBlocks: Omit<DocBlock, "id">[] = [];
    // 🔴 THE HEADING PATH IS THE SLIDE'S OWN TITLE, AND IT DOES NOT NEST.
    // A deck is a flat sequence of slides; carrying slide 3's title down onto
    // slide 4 would file every later block under a heading it does not belong
    // to, and retrieval would return slide 40 as if it sat under slide 3.
    const headingPath = title ? [title] : [];
    let seenTitle = false;

    slideText.split("\n").forEach((raw, at) => {
      const line = raw.trim();
      if (!line) return;
      const fact = factAt(at, raw);

      // 🔴 A GRID IS ONE BLOCK, NOT ONE BLOCK PER ROW. Its rendered lines are
      // already in the slide's text; the first of them becomes the table and the
      // rest are skipped, because `blockToText` re-renders the whole grid from
      // `table` and emitting the rows again would double every cell.
      if (fact.table !== undefined) {
        if (!fact.tableStart) return;
        const table = tables[fact.table];
        if (table) {
          slideBlocks.push({
            headingPath,
            kind: "table",
            // A table's text is its grid, and the grid is derived from `table`.
            // Carrying a second, pre-rendered copy here is how the string a
            // model reads and the cells a citation points at come apart.
            table,
            text: "",
            unit: index,
            ...(fact.rect ? { rect: fact.rect } : {}),
          });
          return;
        }
      }

      const figure = FIGURE_LINE.exec(line);
      if (figure) {
        // Which picture this line is about, from the same grouping that wrote
        // it. Only a line that matches exactly consumes a note, so a slide whose
        // own words happen to look like a figure line cannot steal one.
        const note = pending[0]?.line === line ? pending.shift() : undefined;
        const rect = note && pictures ? pictures.get(note.name) : undefined;
        slideBlocks.push({
          // The description is a `figure` block's description, never its text.
          // A generated sentence sitting in `text` becomes quotable as the
          // deck's own words, and citations search text.
          figure: {
            description: figure[2]!.trim(),
            ref: note?.name ?? `slide-${index + 1}-figure-${slideBlocks.length}`,
          },
          headingPath,
          kind: "figure",
          text: "",
          unit: index,
          ...(rect ? { rect } : {}),
        });
        return;
      }

      // The title placeholder appears in the slide's text as well. Emitting it
      // once as a heading and again as a paragraph would double it in every
      // rendering and in every chunk.
      if (!seenTitle && title && line === title) {
        seenTitle = true;
        slideBlocks.push(heading(title, index, titleRect));
        return;
      }

      slideBlocks.push({
        headingPath,
        kind: "paragraph",
        text: line,
        unit: index,
        ...(fact.rect ? { rect: fact.rect } : {}),
      });
    });

    // A slide whose title never appeared in its body still deserves its heading,
    // or the slide's blocks would be filed under a heading that is in no block.
    if (title && !seenTitle) slideBlocks.unshift(heading(title, index, titleRect));
    blocks.push(...slideBlocks);
  });

  // The slide box, so a relative rect can become a crop. Every slide in a deck
  // is the same size — PowerPoint has one `<p:sldSz>` for the presentation.
  const size = input.structure?.slideSize ?? null;
  return buildDocument({
    blocks,
    format: "pptx",
    title: input.deckTitle,
    units: input.slides.map((_, index) => ({
      index,
      kind: "slide",
      label: input.slideTitles[index]?.trim() || undefined,
      ...(size ? { size } : {}),
    })),
  });
}

/** A slide's own title, as its heading. It does not nest — see above. */
function heading(text: string, unit: number, rect: DocRect | undefined): Omit<DocBlock, "id"> {
  return { headingPath: [], kind: "heading", level: 1, text, unit, ...(rect ? { rect } : {}) };
}
