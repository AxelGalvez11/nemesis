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

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { mergeImageDescriptions, type SlideImage } from "./slide-media";

export interface PptxModelInput {
  slides: readonly string[];
  slideTitles: readonly (string | null)[];
  deckTitle: string | null;
  images: readonly SlideImage[];
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
  const blocks: Omit<DocBlock, "id">[] = [];

  merged.forEach((slideText, index) => {
    const title = input.slideTitles[index]?.trim() || null;
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

    for (const raw of slideText.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      const figure = FIGURE_LINE.exec(line);
      if (figure) {
        slideBlocks.push({
          // The description is a `figure` block's description, never its text.
          // A generated sentence sitting in `text` becomes quotable as the
          // deck's own words, and citations search text.
          figure: {
            description: figure[2]!.trim(),
            ref: `slide-${index + 1}-figure-${slideBlocks.length}`,
          },
          headingPath,
          kind: "figure",
          text: "",
          unit: index,
        });
        continue;
      }

      // The title placeholder appears in the slide's text as well. Emitting it
      // once as a heading and again as a paragraph would double it in every
      // rendering and in every chunk.
      if (!seenTitle && title && line === title) {
        seenTitle = true;
        slideBlocks.push({ headingPath: [], kind: "heading", level: 1, text: line, unit: index });
        continue;
      }

      slideBlocks.push({ headingPath, kind: "paragraph", text: line, unit: index });
    }

    // A slide whose title never appeared in its body still deserves its heading,
    // or the slide's blocks would be filed under a heading that is in no block.
    if (title && !seenTitle) {
      slideBlocks.unshift({ headingPath: [], kind: "heading", level: 1, text: title, unit: index });
    }
    blocks.push(...slideBlocks);
  });

  return buildDocument({
    blocks,
    format: "pptx",
    title: input.deckTitle,
    units: input.slides.map((_, index) => ({
      index,
      kind: "slide",
      label: input.slideTitles[index]?.trim() || undefined,
    })),
  });
}
