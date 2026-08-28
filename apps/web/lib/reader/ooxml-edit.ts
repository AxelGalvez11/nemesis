// Changing ONE line inside a Word file or a PowerPoint deck, without rewriting the file.
//
// 🔴🔴 THE OWNER REJECTED THE OTHER SHAPE, AND WAS RIGHT TO. Offered "Nemesis reads your deck and
// writes you a new one", 2026-08-28: *"why would it need to make an entirely new PowerPoint file
// for... if it's just asking for a edit on one slide, then does that make sense? I want users to
// edit, like, specifically one thing, not just that nemesis reads what they want and invents an
// entirely new one. That seems inefficient."*
//
// A .pptx is a zip of small XML parts, one per slide. Changing a line on slide 4 is a change to a
// few characters inside `ppt/slides/slide4.xml`. So an edit here is a STRING SPLICE into the
// original part: the master template, the fonts, the pictures, the animations and the other
// thirty-nine slides are carried across as the bytes they already were, never read and never
// re-decided. The same is true of the parts of the format this codebase does not understand, which
// is most of it.
//
// 🔴 THE TREE IS NEVER SERIALISED BACK, and that is the safety property. `xml-tree.ts` is 150 lines
// written to READ enough structure for a reader; asking it to write would put every namespace
// declaration, attribute order and whitespace decision in the file at its mercy, where a bug
// corrupts a document instead of damaging a sentence. It is used only to find offsets.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { isText, type Span, type XmlElement } from "./xml-tree";

/** Matches lib/reader/office-zip.ts, for the same reason: a zip can be a bomb. */
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

/**
 * One editable line: the part it lives in, and every text span that makes it up.
 *
 * A paragraph's words are usually spread over several runs, because a run is a stretch of ONE
 * formatting. "The **rate** constant" is three runs, and its three text spans are what this holds.
 */
export interface EditableLine {
  /** Zip entry, e.g. `ppt/slides/slide4.xml`. */
  part: string;
  /** In document order. Empty means the line has no text to replace and cannot be edited. */
  runs: readonly Span[];
}

/** The five characters a text node may not carry raw. Nothing else is escaped: OOXML text is UTF-8
 *  and a smart quote or an accent belongs in the file as itself. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The new text, written into a line's runs.
 *
 * 🔴 IT ALL GOES INTO THE FIRST RUN AND THE REST ARE EMPTIED, WHICH LOSES FORMATTING INSIDE A LINE.
 * A run carries its own bold, colour and size, so a line with one bold word is three runs, and
 * replacing the whole line has to choose which run's formatting the new words inherit. The first is
 * the only defensible answer — it is where the line starts. Whole-line formatting (the font, the
 * size, the colour, the bullet level, the placeholder it sits in) is on the SHAPE and the
 * PARAGRAPH, not the run, so none of that is touched.
 *
 * 🔴 THE TEXT IS TRIMMED. `w:t` drops leading and trailing spaces unless its element carries
 * `xml:space="preserve"`, so writing them would produce an edit that silently loses characters in
 * Word and keeps them in Nemesis. Trimming is the same result, arrived at honestly.
 */
export function spliceLine(xml: string, runs: readonly Span[], text: string): string {
  if (runs.length === 0) return xml;
  // Back to front, so a splice never moves the offsets of the ones still to come.
  const ordered = [...runs].sort((left, right) => left.start - right.start);
  let out = xml;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const span = ordered[index]!;
    const replacement = index === 0 ? escapeText(text.trim()) : "";
    out = out.slice(0, span.start) + replacement + out.slice(span.end);
  }
  return out;
}

/**
 * The whole file back, with one part replaced.
 *
 * 🔴 EVERY OTHER PART IS THE BYTES IT ALREADY WAS. They are not parsed, not decoded and not
 * re-encoded — `unzipSync` hands back the inflated bytes and they go straight back in. The zip
 * CONTAINER is rebuilt (compression is redone, so the file's own bytes differ), which is what makes
 * this a rewrite of the archive and not of the document.
 *
 * 🔴 `[Content_Types].xml` GOES FIRST. The format requires it to be the first entry; `unzipSync`
 * preserves archive order in its keys, so this normally happens by itself, and this is the belt.
 */
export function replacePart(bytes: ArrayBuffer, part: string, xml: string): Uint8Array | null {
  try {
    let total = 0;
    let entries = 0;
    const files = unzipSync(new Uint8Array(bytes), {
      filter: (file) => {
        entries += 1;
        total += file.originalSize ?? 0;
        if (entries > MAX_ENTRIES) throw new Error("This file has too many parts to open safely.");
        if (total > MAX_TOTAL_BYTES) throw new Error("This file unpacks to more than Nemesis will open.");
        return true;
      },
    });
    if (!files[part]) return null;
    files[part] = strToU8(xml);
    const ordered: Record<string, Uint8Array> = {};
    const first = "[Content_Types].xml";
    if (files[first]) ordered[first] = files[first];
    for (const [name, data] of Object.entries(files)) if (name !== first) ordered[name] = data;
    return zipSync(ordered);
  } catch {
    return null;
  }
}

/** A part's text, as it currently stands in the archive. Null when the part is not there. */
export function partText(bytes: ArrayBuffer, part: string): string | null {
  try {
    const files = unzipSync(new Uint8Array(bytes), { filter: (file) => file.name === part });
    const data = files[part];
    return data ? strFromU8(data) : null;
  } catch {
    return null;
  }
}

/** Every text span inside an element, in document order — the runs of one paragraph.
 *
 *  🔴 EMPTY RUNS ARE SKIPPED RATHER THAN COUNTED. `<a:t/>` has no text node to splice into, and a
 *  line whose only run is empty has nothing to edit; returning a zero-length span for it would put
 *  the whole new line inside a `<a:t/>` that has no closing tag. */
export function textSpansIn(element: XmlElement): Span[] {
  const spans: Span[] = [];
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (isText(child)) {
        if (child.end > child.start) spans.push({ start: child.start, end: child.end });
      } else walk(child);
    }
  };
  walk(element);
  return spans;
}

/**
 * Whether an edit makes a line meaningfully longer than it was.
 *
 * 🔴 NEMESIS CANNOT SEE WHETHER TEXT STILL FITS, and saying so is the only honest option. PowerPoint
 * decides how big a text box is and whether words still fit inside it; that needs a layout engine
 * this app does not host (`pptx-slides.ts` records the same constraint for rendering). So a longer
 * line can look right here and spill off the slide when it is opened in PowerPoint. A fifth again
 * is the threshold: shorter than that and reflow rarely gains a line.
 */
export function mayOverflow(before: string, after: string): boolean {
  const was = before.trim().length;
  return was > 0 && after.trim().length > was * 1.2;
}
