import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴🔴 THE READER DOES NOT LET YOU TYPE INTO A DOCUMENT, AND THAT IS A PRODUCT DECISION, NOT A
// GAP. It was built, it worked, and the owner cut it a day later.
//
// The history matters, because the feature is easy to re-add by accident. Asked whether editing
// meant "Nemesis writes you a new deck" or "change one thing", the owner picked the second and I
// built typing-in-place: double-click a line on a slide or in a Word file, retype it, and the words
// were spliced back into the real file. Then, 2026-08-28:
//
//   *"I don't really care if it can allow you to write text. The point is not to type text inside
//   the PowerPoint to deliberately do edits inside of PowerPoint. Like, that's what PowerPoint is
//   for or slides is for. This is not supposed to be that. This is supposed to be more of an
//   annotate with a comment type of edit."*
//
// Claude Design draws the same line and draws it in the toolbar: **Comment** and **Edit** are two
// separate modes, and Edit is a full design editor with a layer tree and a pen tool. A reading
// surface that grows a text cursor is claiming to be the second one.
//
// So: the reader SHOWS documents and lets you annotate them. Changing what a document SAYS is the
// job of the application that made it.

const READER = readFileSync(new URL("./document-reader.tsx", import.meta.url), "utf8");
const SLIDES = readFileSync(new URL("./slides-document-view.tsx", import.meta.url), "utf8");
const DOCX = readFileSync(new URL("./docx-document-view.tsx", import.meta.url), "utf8");

test("🔴🔴🔴 no line in any document is typeable", () => {
  for (const [name, source] of [["reader", READER], ["slides", SLIDES], ["docx", DOCX]] as const) {
    assert.ok(!/EditableLine/.test(source), `${name} mounts a line editor again`);
    assert.ok(!/onEditLine/.test(source), `${name} offers a line-edit route again`);
    assert.ok(!/contentEditable/i.test(source), `${name} has made a document directly editable`);
  }
  // The splice engine went with it. What replaced typing is annotation, and a note about a line does
  // not need to know the byte positions of that line inside the zip.
  assert.ok(!existsSync(new URL("../../../lib/reader/ooxml-edit.ts", import.meta.url)), "the file-writing engine is back");
});

test("🔴🔴 nothing offers to save or download a CHANGED copy of a document", () => {
  // The bar that said "1 line changed, here only. Download to keep it." was the honest half of a
  // feature that no longer exists. If it comes back with nothing behind it, it is a promise about
  // changes the reader cannot make.
  assert.ok(!/lines? changed/.test(READER), "the edited-file bar is back");
  assert.ok(!/\(edited\)/.test(READER), "the reader is writing an edited copy again");
  assert.ok(!/Discard changes/.test(READER), "the discard control is back without an edit to discard");
});

test("🔴 the download still hands over the ORIGINAL, unconditionally", () => {
  // It briefly branched on whether there were unsaved edits. There is only one file now, and it is
  // the one in the Library.
  assert.match(READER, /const download = useCallback\(\(\) => \{\s*if \(!url\) return;/, "the download has grown a second source again");
});
