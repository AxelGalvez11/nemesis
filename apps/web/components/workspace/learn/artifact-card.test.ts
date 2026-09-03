import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { docFilename, markdownBlob } from "@/lib/export/doc-file";

// The hand-over card and the reader behind it, for the one kind of output that is already the file.
//
// 🔴🔴 A NOTE DOWNLOADED AS A WORD FILE. Owner, 2026-09-03: *"for me personally, when I study, I
// like to make a markdown file of all the points that I should be able to recall from memory
// myself."* The note is Markdown from the moment the model writes it, and the reader ran it through
// the .docx writer on the way out, under a card that showed no extension at all.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
/** Source with its comments removed, so a guard reads the code and never the reasoning beside it. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴 a note is handed over as a .md, by name on the card and by writer in the reader", () => {
  const card = strip(read("./artifact-card.tsx"));
  assert.match(card, /note: \{ extension: "md", \.\.\.KIND_MARKS\.text \}/, "the note card no longer names a Markdown file");
  // The name on the card is the name of the file in Downloads: same function, same arguments.
  assert.match(card, /docFilename\(output\.title, kind\.extension\)/, "the card names the file by some other route than the download does");
  assert.equal(docFilename("Contract law: offer and acceptance", "md"), "Contract law offer and acceptance.md");

  const preview = strip(read("./output-preview.tsx"));
  assert.match(preview, /note: "Download \.md"/, "the download button still promises a Word file for a note");
  assert.match(preview, /if \(output\.kind === "note"\) return void downloadMarkdown\(markdown, output\.title\)/, "a note still goes through the .docx writer");
  // 🔴 `document`, `report` and `pdf` KEEP THEIR WRITERS: those are the formats they were asked for as.
  assert.match(preview, /document: "Download \.docx"/, "the document stopped being a Word file");
  assert.match(preview, /report: "Download \.docx"/, "the report stopped being a Word file");
  assert.match(preview, /pdf: "Download \.pdf"/, "the PDF stopped being a PDF");
  assert.match(
    preview,
    /output\.kind === "pdf" \? downloadPdf\(markdown, output\.title\) : downloadDocx\(markdown, output\.title\)/,
    "the document and report writers changed along with the note's",
  );
  // The guard that keeps a 0-byte download from firing is still in front of all three.
  assert.match(preview, /if \(!markdown\) return;\s*[\s\S]{0,600}?if \(output\.kind === "note"\)/, "a note may download before its body has arrived");
});

test("🔴 the bytes of a Markdown download are the Markdown, untouched, with no BOM", async () => {
  // The one writer whose output can be compared for equality: the check is that nothing was done.
  const text = "# Beam deflection\n\n## Recall\n- Midspan deflection under a uniform load: **5wL^4 / 384EI**\n";
  const blob = markdownBlob(text);
  assert.equal(blob.type, "text/markdown;charset=utf-8");
  assert.equal(await blob.text(), text, "the Markdown was transformed on the way out");
  // A BOM in front of `#` is not a heading to several Markdown parsers; the CSV needs one, this must not.
  assert.ok(!(await blob.text()).startsWith("\uFEFF"), "a BOM sits in front of the first heading");
});

test("🔴 the note keeps the glyph an attached .md draws, so what goes in and what comes out match", () => {
  // kind-mark.test.ts pins the card to `KIND_MARKS.text`; this pins what that is, from the card's side,
  // and that an attached .md lands on the same mark.
  const marks = read("../../../lib/learn/kind-mark.ts");
  assert.match(marks, /text: \{ icon: "note", label: "Note", tint: "--ui-kind-blue" \}/, "the note mark changed; the card and the shelf must still agree");
  assert.match(marks, /md: "text"/, "an attached .md no longer maps to the note mark");
});
