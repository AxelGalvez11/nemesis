import assert from "node:assert/strict";
import { test } from "node:test";

import { strFromU8, unzipSync, zipSync } from "fflate";

import { mayOverflow, partText, replacePart, spliceLine, textSpansIn } from "./ooxml-edit";
import { docxBlocks } from "./docx-blocks";
import { parseSlide, slideOrder } from "./pptx-slides";
import { at, ofKind } from "./test-helpers";
import { firstNamed, parseXml } from "./xml-tree";

const slide = (body: string) => `<p:sld><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
const shape = (runs: string, placeholder = "") =>
  `<p:sp><p:nvSpPr><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:txBody><a:p>${runs}</a:p></p:txBody></p:sp>`;
const run = (text: string, properties = "") => `<a:r>${properties}<a:t>${text}</a:t></a:r>`;

/** Read a line back out of an edited part, the way the reader would. */
function lineOf(xml: string, index = 0): string {
  return at(parseSlide(1, xml, null, "ppt/slides/slide1.xml", null).paragraphs, index).text;
}

test("🔴🔴 a line is replaced in place, and every other byte of the part survives", () => {
  // The whole point. `<a:r>` carries its own formatting, the shape carries the placeholder, the
  // paragraph carries the bullet level — none of it is read, re-decided or rewritten, because the
  // edit is a splice into the original string.
  const xml = slide(shape(run("Phase 0 is the upstroke"), '<p:ph type="body" idx="1"/>') + shape(run("Second line")));
  const parsed = parseSlide(1, xml, null, "ppt/slides/slide1.xml", null);
  const edited = spliceLine(xml, at(parsed.paragraphs, 0).runs, "Phase 0 is the fast upstroke");

  assert.equal(lineOf(edited, 0), "Phase 0 is the fast upstroke");
  assert.equal(lineOf(edited, 1), "Second line", "the untouched line moved or changed");
  assert.ok(edited.includes('<p:ph type="body" idx="1"/>'), "the placeholder was rewritten");
  // Only the words differ: put the old words back and the part is character-for-character itself.
  assert.equal(spliceLine(edited, parseSlide(1, edited, null, "ppt/slides/slide1.xml", null).paragraphs[0]!.runs, "Phase 0 is the upstroke"), xml);
});

test("🔴🔴 the new words go in the first run and the rest are emptied", () => {
  // A line with one bold word is three runs, each with its own `w:rPr`/`a:rPr`. Replacing the whole
  // line has to choose which run's formatting the new words inherit, and the first is the only
  // defensible answer. What must NOT happen is the text landing in all three, which would triple it.
  const xml = slide(shape(run("The ") + run("rate", "<a:rPr b=\"1\"/>") + run(" constant")));
  const parsed = parseSlide(1, xml, null, "ppt/slides/slide1.xml", null);
  assert.equal(at(parsed.paragraphs, 0).runs.length, 3, "the three runs were not found");

  const edited = spliceLine(xml, at(parsed.paragraphs, 0).runs, "The equilibrium constant");
  assert.equal(lineOf(edited), "The equilibrium constant");
  // The bold run is still there, still bold, and now empty — the formatting inside the line is what
  // was lost, and it is lost honestly rather than by dropping the element.
  assert.ok(edited.includes('<a:rPr b="1"/><a:t></a:t>'), edited);
});

test("🔴 the five special characters are escaped, and nothing else is", () => {
  const xml = slide(shape(run("plain")));
  const parsed = parseSlide(1, xml, null, "ppt/slides/slide1.xml", null);
  const edited = spliceLine(xml, at(parsed.paragraphs, 0).runs, "R&D <costs> rose 5° — naïve");
  // It has to survive a round trip through the parser, which is the real test of the escaping.
  assert.equal(lineOf(edited), "R&D <costs> rose 5° — naïve");
  assert.ok(edited.includes("&amp;"), "the ampersand was written raw and the part is now broken");
  assert.ok(edited.includes("5° — naïve"), "an accent or a dash was escaped for no reason");
});

test("🔴 a field is never spliced, because PowerPoint recomputes it", () => {
  // `a:fld` is a slide number or a date. Its `a:t` holds the last value PowerPoint happened to
  // render, so writing over it produces a change that vanishes the next time the deck is opened.
  const xml = slide(shape('<a:fld id="{1}" type="slidenum"><a:t>7</a:t></a:fld>'));
  const parsed = parseSlide(1, xml, null, "ppt/slides/slide1.xml", null);
  assert.equal(at(parsed.paragraphs, 0).text, "7", "the field's rendered value stopped being read");
  assert.deepEqual(at(parsed.paragraphs, 0).runs, [], "a field was offered as editable");
  // And an edit on a line with no runs is a no-op rather than an exception or a corrupted part.
  assert.equal(spliceLine(xml, [], "9"), xml);
});

test("🔴 a table row on a slide is not editable through this door", () => {
  // A row is several cells joined with a separator for READING. Splicing that joined string back
  // would need to know which cell each word came from, and guessing puts a whole row in one cell.
  const xml = slide(
    "<p:graphicFrame><a:tbl><a:tr>" +
      "<a:tc><a:txBody><a:p><a:r><a:t>Material</a:t></a:r></a:p></a:txBody></a:tc>" +
      "<a:tc><a:txBody><a:p><a:r><a:t>Yield</a:t></a:r></a:p></a:txBody></a:tc>" +
      "</a:tr></a:tbl></p:graphicFrame>",
  );
  const parsed = parseSlide(1, xml, null, "ppt/slides/slide1.xml", null);
  assert.equal(at(parsed.paragraphs, 0).text, "Material · Yield");
  assert.deepEqual(at(parsed.paragraphs, 0).runs, []);
});

test("🔴 the slide knows which part it came from, and filenames do not follow the order", () => {
  // `slide10.xml` sorts before `slide2.xml`, and a deck whose slides were reordered has filenames
  // that match nothing at all. An edit that guessed the part from the index would write to the
  // wrong slide.
  const parsed = parseSlide(2, slide(shape(run("x"))), null, "ppt/slides/slide17.xml", null);
  assert.equal(parsed.part, "ppt/slides/slide17.xml");
  assert.equal(parsed.index, 2);
});

test("🔴🔴 repacking replaces one part and carries every other one across untouched", () => {
  const media = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const original = zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>"),
    "ppt/media/image1.png": media,
    "ppt/slides/slide1.xml": Buffer.from("<p:sld>one</p:sld>"),
    "ppt/slides/slide2.xml": Buffer.from("<p:sld>two</p:sld>"),
  });

  const repacked = replacePart(original.buffer as ArrayBuffer, "ppt/slides/slide2.xml", "<p:sld>TWO</p:sld>");
  assert.ok(repacked, "the repack failed");
  const out = unzipSync(repacked);
  assert.equal(strFromU8(out["ppt/slides/slide2.xml"]!), "<p:sld>TWO</p:sld>");
  assert.equal(strFromU8(out["ppt/slides/slide1.xml"]!), "<p:sld>one</p:sld>", "an untouched slide changed");
  // 🔴 THE PICTURE IS THE POINT. Media is never decoded, so a repack cannot re-encode it lossily.
  assert.deepEqual([...out["ppt/media/image1.png"]!], [...media], "a picture came back different");
  // The format requires this entry first.
  assert.equal(Object.keys(out)[0], "[Content_Types].xml");
});

test("🔴 replacing a part that is not in the archive fails rather than adding one", () => {
  const original = zipSync({ "[Content_Types].xml": Buffer.from("<Types/>") });
  assert.equal(replacePart(original.buffer as ArrayBuffer, "ppt/slides/slide9.xml", "<x/>"), null);
  // And a file that is not a zip at all is a null, not a throw: the caller says "couldn't save".
  assert.equal(replacePart(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, "any", "<x/>"), null);
});

test("partText reads a part back out, and misses honestly", () => {
  const original = zipSync({ "ppt/slides/slide1.xml": Buffer.from("<p:sld>one</p:sld>") });
  assert.equal(partText(original.buffer as ArrayBuffer, "ppt/slides/slide1.xml"), "<p:sld>one</p:sld>");
  assert.equal(partText(original.buffer as ArrayBuffer, "nope"), null);
});

test("empty runs contribute no span, because there is nothing to splice into", () => {
  // `<a:t/>` has no text node. A zero-length span for it would put the whole new line inside an
  // element that has no closing tag.
  const root = parseXml("<a:r><a:t/></a:r>");
  assert.ok(root);
  assert.deepEqual(textSpansIn(firstNamed(root, "a:t") ?? root), []);
});

test("🔴 a longer line is flagged, because Nemesis cannot see whether it still fits", () => {
  // PowerPoint decides how big a text box is; that needs a layout engine this app does not host.
  // So the warning is the honest half of the feature, not decoration.
  assert.equal(mayOverflow("Phase 0", "Phase 0 is the rapid upstroke of the action potential"), true);
  assert.equal(mayOverflow("Phase 0 is the upstroke", "Phase 0 is the rise"), false);
  assert.equal(mayOverflow("", "anything at all"), false, "a line that was empty has nothing to overflow");
});

test("🔴🔴 a REAL deck survives the round trip: one line changes, everything else is what it was", async () => {
  // The unit tests above work on hand-written XML, which cannot prove the thing that actually
  // matters: that what comes out is still a PowerPoint file. This one edits `public/reader-sample.pptx`
  // — the same file the reader preview opens — and then reopens the result with the reader's own
  // code path, which is the only definition of "still a deck" this codebase has.
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(new URL("../../public/reader-sample.pptx", import.meta.url));
  const archive = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const order = slideOrderOf(archive);
  const first = at(order, 0);
  const xml = partText(archive, first);
  assert.ok(xml, "the first slide part is missing from the fixture");
  const parsed = parseSlide(1, xml, null, first, null);
  const line = at(parsed.paragraphs, 0);
  assert.ok(line.runs.length > 0, "the fixture's first line offers nothing to edit");

  const edited = replacePart(archive, first, spliceLine(xml, line.runs, "A line Nemesis wrote"));
  assert.ok(edited, "the deck could not be repacked");
  const out = edited.buffer.slice(edited.byteOffset, edited.byteOffset + edited.byteLength) as ArrayBuffer;

  // Reopened with the reader's own code: the deck still has the same slides in the same order…
  assert.deepEqual(slideOrderOf(out), order, "the slide order changed");
  // …the edited line reads back as the new words…
  const reopened = parseSlide(1, partText(out, first)!, null, first, null);
  assert.equal(at(reopened.paragraphs, 0).text, "A line Nemesis wrote");
  // …the title beside it is untouched…
  assert.equal(reopened.title, parsed.title, "the title changed on a line edit");
  // …and every OTHER part of the archive is byte-for-byte what it was, pictures included.
  const before = unzipSync(new Uint8Array(archive));
  const after = unzipSync(new Uint8Array(out));
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), "a part was added or lost");
  for (const [name, data] of Object.entries(before)) {
    if (name === first) continue;
    assert.deepEqual([...after[name]!], [...data], `${name} changed on a one-line edit`);
  }
});

/** The reader's own answer to "which parts are the slides, in order". */
function slideOrderOf(bytes: ArrayBuffer): string[] {
  const files = unzipSync(new Uint8Array(bytes));
  const names: Record<string, unknown> = {};
  for (const name of Object.keys(files)) names[name] = true;
  return slideOrder(names, partText(bytes, "ppt/presentation.xml"), partText(bytes, "ppt/_rels/presentation.xml.rels"));
}

test("🔴🔴 a Word line is spliced too, and deleted text is never written over", () => {
  // `w:del` is text the author removed with track-changes on and `w:instrText` is a field
  // instruction; neither is on screen, so a replacement line written across them would put the
  // learner's words into machinery they never saw. The exclusions match `runsOf`'s exactly, which
  // is what keeps "what I can see" and "what I can change" the same set.
  const paragraph =
    "<w:p>" +
    "<w:r><w:t>Consideration must be </w:t></w:r>" +
    '<w:del><w:r><w:delText>never </w:delText></w:r></w:del>' +
    "<w:r><w:t>sufficient</w:t></w:r>" +
    "</w:p>";
  const xml = `<w:document><w:body>${paragraph}</w:body></w:document>`;
  const blocks = docxBlocks(xml);
  const line = ofKind(blocks[0], "paragraph");
  assert.equal(line.runs.map((run) => run.text).join(""), "Consideration must be sufficient", "deleted text leaked into the reader");
  assert.equal(line.spans.length, 2, "the deleted run was offered as editable");

  const edited = spliceLine(xml, line.spans, "Consideration must be real");
  assert.equal(ofKind(docxBlocks(edited)[0], "paragraph").runs.map((run) => run.text).join(""), "Consideration must be real");
  // The deletion is still recorded in the file exactly as Word wrote it.
  assert.ok(edited.includes("<w:delText>never </w:delText>"), edited);
});
