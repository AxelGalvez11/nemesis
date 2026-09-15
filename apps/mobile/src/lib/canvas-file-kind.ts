// What kind of file a title names — PURE, no React, no I/O. Feeds the attachment card's
// icon + subtitle in both places a canvas shows a filename: the learner's own attachment
// (above the bubble, before a reply exists) and a finished answer's deliverable row (item 3
// and item 9 of docs' iOS-parity pass). One inference function so the two cards can never
// disagree about what "Trinity_Care_Plan.docx" is.
//
// Structural, not subject-matter: this reads a FILE EXTENSION, never a word in the title, so
// it works the same for a law brief and a lab report (CLAUDE.md's field-agnostic rule).

export type CanvasFileKind = "word" | "pdf" | "slides" | "sheet" | "image" | "generic";

const EXTENSION_KIND: Readonly<Record<string, CanvasFileKind>> = {
  doc: "word",
  docx: "word",
  pdf: "pdf",
  ppt: "slides",
  pptx: "slides",
  key: "slides",
  xls: "sheet",
  xlsx: "sheet",
  csv: "sheet",
  numbers: "sheet",
  png: "image",
  jpg: "image",
  jpeg: "image",
  heic: "image",
  gif: "image",
  webp: "image",
};

const KIND_LABEL: Readonly<Record<CanvasFileKind, string>> = {
  word: "Word document",
  pdf: "PDF",
  slides: "PowerPoint",
  sheet: "Spreadsheet",
  image: "Image",
  generic: "File",
};

/** The extension on a title, lowercased, no dot — "" when there isn't one. */
function extensionOf(title: string): string {
  const trimmed = title.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || dot === trimmed.length - 1) return "";
  return trimmed.slice(dot + 1).toLowerCase();
}

/** The kind a title's extension implies — "generic" for no extension or one not in the table. */
export function fileKindFromTitle(title: string): CanvasFileKind {
  return EXTENSION_KIND[extensionOf(title)] ?? "generic";
}

/** The card's second line — "Word document", "PDF", etc. — for a title. A title with no extension
 *  at all is a Library note (files always carry one), so it reads "Note" rather than "File". */
export function fileKindLabel(title: string): string {
  if (!extensionOf(title)) return "Note";
  return KIND_LABEL[fileKindFromTitle(title)];
}
