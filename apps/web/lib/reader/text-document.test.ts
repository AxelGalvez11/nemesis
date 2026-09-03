import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeText, documentFlavour, htmlText, markdownOutline } from "./text-document";
import { at } from "./test-helpers";

// Markdown, plain text and HTML open instead of failing.
//
// 🔴🔴 THE DEFECT THESE GUARD, AND IT WAS INVISIBLE FROM THE CHAT. `reader-source.ts` routes `md`
// and `txt` onto the `document` lane and an `.html` file reaches it through `text/*`. That lane
// held exactly one reader — the Word one — which opens the bytes as a zip and throws *"This
// doesn't look like a Word (.docx) file"* when it cannot find `word/document.xml`. So every
// Markdown, text and HTML file a learner attached showed a red failure page in the reader while the
// chat answered questions about the same file perfectly well, which is why nothing upstream caught
// it. Owner, 2026-09-03: *"anything from Markdown, HTML should be able to be viewed."*

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

test("each format is routed to the reader that can actually open it", () => {
  assert.equal(documentFlavour("notes.md", null), "markdown");
  assert.equal(documentFlavour("NOTES.MARKDOWN", null), "markdown");
  assert.equal(documentFlavour("syllabus.txt", null), "plain");
  assert.equal(documentFlavour("page.html", null), "html");
  assert.equal(documentFlavour("page.htm", null), "html");
  assert.equal(documentFlavour("essay.docx", null), "word");
});

test("🔴 a file with no extension is decided by its BYTES, not by a guess", () => {
  // Canvases written before source titles kept their file names have no extension at all — the
  // title was prettified to "08 insulin" and the extension is gone for good (`kind-mark.ts` carries
  // the same problem). A Word file IS a zip and a text file is not, so the signature is a fact.
  assert.equal(documentFlavour("08 insulin", bytesOf("PKrest of a zip")), "word");
  assert.equal(documentFlavour("08 insulin", bytesOf("# A heading\n\nSome prose.")), "plain");
  // Nothing to read at all: the lane it has always taken.
  assert.equal(documentFlavour("08 insulin", null), "word");
});

test("🔴 a byte-order mark is stripped, because it silently costs a document its outline", () => {
  // A Windows editor writes EF BB BF at the head of the file. `TextDecoder` turns it into U+FEFF,
  // a zero-width character, which then sits inside the first heading's `#` run and stops it being
  // a heading. Invisible on screen; the whole table of contents goes with it.
  const marked = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("# Title")]);
  assert.equal(decodeText(marked.buffer as ArrayBuffer), "# Title");
  assert.equal(at(markdownOutline(decodeText(marked.buffer as ArrayBuffer)), 0).title, "Title");
});

test("a Markdown file's own headings become its contents rail", () => {
  const outline = markdownOutline("# One\n\ntext\n\n## Two\n\n### Three ###\n");
  assert.deepEqual(outline, [
    { depth: 0, title: "One" },
    { depth: 1, title: "Two" },
    { depth: 2, title: "Three" },
  ]);
});

test("🔴 a `#` inside a fenced code block is a comment, not a chapter", () => {
  // Calibration: delete the fence tracking and this reddens with two shell comments in the contents
  // rail. On a technical document that is most of the table of contents.
  const outline = markdownOutline("# Real\n\n```bash\n# install\n# build\n```\n\n## Also real\n");
  assert.deepEqual(
    outline.map((entry) => entry.title),
    ["Real", "Also real"],
  );
});

test("HTML is reduced to its words for the search box", () => {
  const text = htmlText("<h1>Title</h1><script>alert('x')</script><p>First &amp; second</p><p>Third</p>");
  assert.match(text, /Title/);
  assert.match(text, /First & second/);
  assert.ok(!/alert/.test(text), "a script body leaked into the document's text");
});

test("🔴🔴 an HTML file is shown in a sandboxed frame, never injected into the page", () => {
  // `docx-blocks.ts` says why the Word reader returns a block model rather than an HTML string:
  // `dangerouslySetInnerHTML` turns every document a student uploads into a scripting surface in
  // the app's own origin, with their session sitting right there. An HTML file has to be shown AS
  // HTML — that is the request — so it goes in an `<iframe sandbox srcdoc>`: a fresh opaque origin
  // with scripts, forms, popups, top-level navigation and same-origin access all off.
  //
  // 🔴 THE COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT TIDINESS. A "must not appear" guard read
  // against the raw file matches the very comment that explains the ban — this test failed on its
  // own prose the first time it ran. It is a recurring trap in this repo; see the note in
  // `capabilities-are-live.test.ts`.
  const raw = readFileSync(new URL("../../components/workspace/reader/text-document-view.tsx", import.meta.url), "utf8");
  const view = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/dangerouslySetInnerHTML/.test(view), "an uploaded document is being injected into the app's own origin");
  assert.match(view, /sandbox=""/, "the HTML frame lost its sandbox");
  assert.match(view, /srcDoc=/, "the HTML frame is no longer fed the file's own bytes");
});
