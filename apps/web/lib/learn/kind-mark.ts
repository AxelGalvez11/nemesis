// What a kind of file looks like: one glyph, one tint, one word.
//
// 🔴🔴 AN ATTACHED .docx AND A PRODUCED .docx MUST LOOK LIKE THE SAME KIND OF THING. Owner,
// 2026-09-03, about the sources panel: *"the inputs need to have a unique icon depending on whether
// it's a docx, PowerPoint, Excel etc."* Every attached source drew the same generic page glyph, so
// a shelf of thirty files was thirty identical rows — while `artifact-card.tsx` had already chosen
// a glyph and a colour for each kind of file the canvas MAKES.
//
// Rather than invent a second vocabulary that would agree with that one for about a week, the marks
// live here and both surfaces read them. What goes IN and what comes OUT of a canvas are the same
// kinds of object, and now they are drawn the same way.
//
// 🔴 STRUCTURAL, NEVER SUBJECT MATTER (CLAUDE.md). This reads a file extension and, failing that,
// what the extractor called the file. It reads the same for a law student's `Palsgraf.docx` and an
// engineer's `beam-deflection.xlsx`, and nothing here knows what either is about.
//
// PURE. No React, no I/O. Which glyph gets drawn is decided here; how big and where is the
// component's business.

import { readerKind } from "@/lib/reader/reader-source";

/**
 * The kinds a file can present itself as.
 *
 * 🔴 ONE MORE THAN THE READER HAS, AND THE EXTRA ONE IS `text`. `ReaderKind` folds Markdown and
 * plain text into `document` because they RENDER the same way, which is the right call for a
 * viewer and the wrong one for an icon: the whole point here is to tell a Word file and a notes
 * file apart at a glance. Everything else is the reader's own vocabulary, unchanged.
 */
export type FileKind = "pdf" | "slides" | "sheet" | "document" | "text" | "image" | "audio" | "file";

export interface KindMark {
  /** A codicon name — see `@/components/desktop-ui/codicon`. */
  readonly icon: string;
  /** One word for what this is, for a label or a tooltip. */
  readonly label: string;
  /** A CSS custom property NAME, without `var()`. `--ui-kind-*` are defined in desktop-ui.css and
   *  are checked against the resolved elevated background in both themes. */
  readonly tint: string;
}

/**
 * 🔴 THE FOUR OVERLAPPING ENTRIES ARE THE ARTIFACT CARD'S OWN, VALUE FOR VALUE. `document`, `pdf`,
 * `sheet` and `slides` are what a canvas can make as well as be given, and they were chosen there
 * first; `text` reuses the card's `note` mark for the same reason (a Markdown file and a note Nemesis
 * wrote are the same object arriving from two directions). `image` and `audio` have no produced
 * twin, so they take the two remaining tints.
 *
 * 🔴 `file` IS DELIBERATELY UNTINTED. An unrecognised extension must not be given a confident
 * colour, because a wrong colour is worse than no colour: it says "this is a spreadsheet" about
 * something nobody has identified. It draws in the same quiet grey the rows used before all of this.
 */
export const KIND_MARKS: Record<FileKind, KindMark> = {
  audio: { icon: "unmute", label: "Audio", tint: "--ui-kind-cyan" },
  // 🔴 A PAGE WITH WRITING ON IT, NOT A BLANK ONE. `document` and `file` both drew `file`, so a
  // Word document and a file nobody could identify were the same shape and differed only by
  // colour — which is the failure this whole table exists to fix, sitting inside the table itself.
  // Owner named DOCX by name (2026-09-03) while asking for per-format icons.
  document: { icon: "file-text", label: "Document", tint: "--ui-kind-blue" },
  file: { icon: "file", label: "File", tint: "--ui-text-quaternary" },
  image: { icon: "file-media", label: "Image", tint: "--ui-kind-purple" },
  pdf: { icon: "file-pdf", label: "PDF", tint: "--ui-kind-red" },
  sheet: { icon: "table", label: "Spreadsheet", tint: "--ui-kind-green" },
  // 🔴🔴 A SLIDE, NOT A VIDEO CAMERA. This was `device-camera-video` — the glyph of a camcorder —
  // for a .pptx, which is what the owner was looking at when he asked for *"the icon for like
  // PowerPoint slide"*. Compared on screen against every plausible codicon (device-desktop,
  // window, multiple-windows, layout-centered, screen-normal): `preview` is a frame with a block
  // of content inside it, which is how every slide app in the world draws a slide.
  slides: { icon: "preview", label: "Presentation", tint: "--ui-kind-amber" },
  text: { icon: "note", label: "Note", tint: "--ui-kind-blue" },
};

/** Extensions this file decides for itself, either because the reader has no opinion (`csv`) or
 *  because it deliberately folds them into something broader (`md`, `txt`). */
const OWN_EXTENSIONS: Record<string, FileKind> = {
  csv: "sheet",
  markdown: "text",
  md: "text",
  text: "text",
  tsv: "sheet",
  txt: "text",
};

/** What the extractor calls a file, in its own words, for the case where the name has no extension
 *  to read. `CanvasSource.kind` is documented as "whatever the extractor reported", so this is a
 *  translation rather than a second opinion. */
const DECLARED_KINDS: Record<string, FileKind> = {
  audio: "audio",
  doc: "document",
  docx: "document",
  document: "document",
  image: "image",
  pdf: "pdf",
  ppt: "slides",
  pptx: "slides",
  sheet: "sheet",
  slides: "slides",
  text: "text",
  xlsx: "sheet",
};

function extensionOf(fileName: string): string {
  const lower = fileName.trim().toLocaleLowerCase();
  const extension = lower.split(".").pop() ?? "";
  // `split(".").pop()` on a name with no dot returns the whole name, which would make
  // "insulin notes" an extension. A name IS its own extension only when there was no dot.
  return extension && extension !== lower ? extension : "";
}

/**
 * What kind of file this is.
 *
 * @param fileName the name it was attached under. Since 2026-09-03 a source's title IS its file
 *   name (see `document-title.ts`), so this is usually all that is needed.
 * @param declared what the extractor called it, used only when the name carries no extension —
 *   which is every canvas written before that change, where the title was prettified to
 *   "08 insulin" and the extension is gone for good.
 */
export function fileKind(fileName: string, declared?: string | null): FileKind {
  const extension = extensionOf(fileName);
  if (extension) {
    const own = OWN_EXTENSIONS[extension];
    if (own) return own;
    const reader = readerKind(fileName);
    if (reader !== "file") return reader;
  }
  return DECLARED_KINDS[(declared ?? "").trim().toLocaleLowerCase()] ?? "file";
}

/** The glyph and tint for a file, ready to draw. */
export function fileMark(fileName: string, declared?: string | null): KindMark {
  return KIND_MARKS[fileKind(fileName, declared)];
}
