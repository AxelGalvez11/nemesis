// Plain text, Markdown and HTML files, read as documents.
//
// 🔴🔴 THESE THREE FORMATS OPENED THE WORD READER AND CRASHED IN IT. `reader-source.ts` maps `md`
// and `txt` onto the `document` lane, and the `document` lane was `DocxDocumentView` alone — which
// opens the bytes as a zip and throws *"This doesn't look like a Word (.docx) file"* the moment it
// cannot find `word/document.xml`. An `.html` file reached the same place through its MIME type.
// So every Markdown, text and HTML file a learner attached showed a red failure page while the
// chat answered questions about it perfectly well. Owner, 2026-09-03: *"anything from Markdown,
// HTML should be able to be viewed."*
//
// 🔴 THE LANE IS STILL `document`, AND THAT IS DELIBERATE. Adding a fourth `ReaderKind` would have
// left every ALREADY-FILED `.md` broken: `library_sources.kind` stores `document` for these, and
// `STORAGE_TO_READER` answers from the stored kind before it ever looks at the file name. A
// document is a document; which parser reads it is a detail inside the lane, decided here.
//
// PURE. No React, no I/O — `text-document-view.tsx` renders what this decides.

/** How a `document` should actually be read. */
export type DocumentFlavour = "word" | "markdown" | "html" | "plain";

const BY_EXTENSION: Record<string, DocumentFlavour> = {
  doc: "word",
  docx: "word",
  htm: "html",
  html: "html",
  markdown: "markdown",
  md: "markdown",
  odt: "word",
  rtf: "word",
  text: "plain",
  txt: "plain",
  xhtml: "html",
};

/** The first bytes of every zip archive, which is what a .docx really is. */
function looksZipped(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return head[0] === 0x50 && head[1] === 0x4b;
}

/**
 * Which reader a `document` needs.
 *
 * 🔴 THE EXTENSION FIRST, THE BYTES ONLY WHEN THERE IS NO EXTENSION TO READ. A real file's
 * extension is right far more often than a guess — but a canvas written before source titles kept
 * their file names has no extension at all (see `kind-mark.ts` for the same problem), and for those
 * the zip signature is a fact rather than an opinion: a Word file IS a zip and a text file is not.
 */
export function documentFlavour(fileName: string, bytes: ArrayBuffer | null): DocumentFlavour {
  const lower = fileName.trim().toLocaleLowerCase();
  const extension = lower.split(".").pop() ?? "";
  if (extension && extension !== lower) {
    const known = BY_EXTENSION[extension];
    if (known) return known;
  }
  if (bytes && bytes.byteLength >= 2) return looksZipped(bytes) ? "word" : "plain";
  return "word";
}

/**
 * A file's text, decoded.
 *
 * 🔴 UTF-8 WITH THE BOM STRIPPED. A Windows editor writes `EF BB BF` at the head of the file and
 * `TextDecoder` faithfully turns it into U+FEFF, a zero-width character — which then sits inside
 * the first Markdown heading's `#` sequence and stops it being a heading at all. Invisible on
 * screen, and it silently costs the document its entire outline.
 */
export function decodeText(bytes: ArrayBuffer): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * The words inside an HTML file, for search and for what the reader reports it read.
 *
 * 🔴 NOT A SANITISER AND NEVER USED AS ONE. What gets DRAWN is the original markup inside a
 * sandboxed frame that cannot run it (see `text-document-view.tsx`); this is a text extraction for
 * the search box, and treating a regex over markup as a security boundary is exactly the mistake
 * that makes one. Script and style bodies are dropped because they are machinery, not prose.
 */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A Markdown file's own headings, in order, for the contents rail.
 *
 * 🔴 ATX HEADINGS ONLY (`#`, `##`, …), AND `setext` UNDERLINES ARE NOT READ. That is a real gap and
 * a deliberate one: a setext heading is a line of text followed by `===` or `---`, and `---` is
 * also a horizontal rule and also the fence of a YAML front-matter block. Reading them would turn
 * the first line of every front-matter block into a chapter title on documents written by tooling.
 *
 * 🔴 FENCED CODE IS SKIPPED. A shell block full of `# comments` is otherwise an entire table of
 * contents made of comments, which is how this reads on any technical document.
 */
export function markdownOutline(text: string): { depth: number; title: string }[] {
  const found: { depth: number; title: string }[] = [];
  let fence: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const opener = /^\s{0,3}(```+|~~~+)/.exec(line);
    if (opener) {
      const mark = opener[1]?.[0] ?? "";
      if (fence === null) fence = mark;
      else if (mark === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const title = (heading[2] ?? "").trim();
    if (title) found.push({ depth: (heading[1] ?? "#").length - 1, title });
  }
  return found;
}
