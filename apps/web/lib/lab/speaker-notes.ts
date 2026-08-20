/**
 * Slide content versus what the lecturer says out loud — Nemesis Lab §4.
 *
 * 🔴 THE PARSER DOES NOT MODEL SPEAKER NOTES AS A KIND, AND THE LAB MUST NOT PRETEND IT DOES.
 * `office.ts` recovers `ppt/notesSlides/notesSlideN.xml` and emits it into the slide's TEXT as
 * `[Speaker notes: …]`; `pptx-model.ts` then splits that text into ordinary `paragraph` blocks. So
 * there is no `kind: "note"` to filter on, and a Lab that invented one would be reporting a
 * structure the pipeline does not have — which is exactly the class of flattery this whole
 * environment exists to catch.
 *
 * What this file does instead is read the marker the parser ACTUALLY writes, and say plainly, on
 * screen, that the split is recovered from a text marker rather than from document structure. That
 * is a real finding about the parser, and hiding it behind a tidy split would lose it.
 *
 * 🔴 A MULTI-LINE NOTE BECOMES SEVERAL BLOCKS. The marker opens on the first line and the `]`
 * closes on the last, so continuation lines carry no marker at all. Treating only the marked line
 * as the note would silently drop everything the lecturer said after the first sentence.
 *
 * PURE. No React, no I/O.
 */

import type { DocBlock } from "@nemesis/shared";

/** The exact opening the PowerPoint reader writes. Changing it in `office.ts` must change it here. */
export const SPEAKER_NOTES_MARKER = "[Speaker notes:";

export interface SlideSplit {
  /** What is on the slide itself. */
  content: DocBlock[];
  /** What the notes pane held, in order. */
  notes: DocBlock[];
  /**
   * Whether this split came from the parser's marker at all.
   *
   * `false` means either the deck has no notes on this slide or the parser recovered none — two
   * different facts that the surface must not merge, so it says "none recovered" rather than
   * "no notes".
   */
  recovered: boolean;
}

/**
 * Split one slide's blocks.
 *
 * The marker opens a run that continues until a block whose text ends with `]`, because that is how
 * a note spanning several lines actually arrives.
 */
export function splitSlideContent(blocks: readonly DocBlock[]): SlideSplit {
  const content: DocBlock[] = [];
  const notes: DocBlock[] = [];
  let inNote = false;
  for (const block of blocks) {
    const text = block.text.trimStart();
    if (!inNote && text.startsWith(SPEAKER_NOTES_MARKER)) {
      inNote = !block.text.trimEnd().endsWith("]");
      notes.push(block);
      continue;
    }
    if (inNote) {
      notes.push(block);
      if (block.text.trimEnd().endsWith("]")) inNote = false;
      continue;
    }
    content.push(block);
  }
  return { content, notes, recovered: notes.length > 0 };
}

/** The note text with the parser's own wrapper removed, for reading beside the slide. */
export function speakerNotesText(notes: readonly DocBlock[]): string {
  const joined = notes.map((block) => block.text).join("\n");
  const opened = joined.startsWith(SPEAKER_NOTES_MARKER) ? joined.slice(SPEAKER_NOTES_MARKER.length) : joined;
  return (opened.trimEnd().endsWith("]") ? opened.trimEnd().slice(0, -1) : opened).trim();
}
