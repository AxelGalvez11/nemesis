import assert from "node:assert/strict";
import { test } from "node:test";

import { docxXmlToText } from "./office-text";
import {
  headingLevel,
  markerFor,
  paragraphText,
  readDocxStructure,
  readNumbering,
  renderDocx,
  renderTable,
} from "./docx-structure";

const p = (inner: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r><w:t>${inner}</w:t></w:r></w:p>`;
const body = (inner: string) => `<w:document><w:body>${inner}</w:body></w:document>`;

// ── Headings: the hierarchy the tag strip deleted ──────────────────────────

test("a heading is recognised and carries its level", () => {
  assert.equal(headingLevel('<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr></w:p>'), 2);
  // Some producers write "heading 2" rather than "Heading2".
  assert.equal(headingLevel('<w:p><w:pPr><w:pStyle w:val="heading 3"/></w:pPr></w:p>'), 3);
  assert.equal(headingLevel('<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr></w:p>'), null);
});

test("🔴 every block knows which headings enclose it", () => {
  // This is what makes a locator finer than "the file" possible at all. The tag
  // strip produced a flat list of lines with no way to say where one came from.
  const doc = readDocxStructure(body(
    p("Assessment", '<w:pStyle w:val="Heading1"/>') +
    p("Late work", '<w:pStyle w:val="Heading2"/>') +
    p("Ten percent per day.") +
    p("Grading", '<w:pStyle w:val="Heading1"/>') +
    p("Curved at the end."),
  ));
  const late = doc.blocks.find((b) => b.text.startsWith("Ten percent"));
  assert.deepEqual(late?.headingPath, ["Assessment", "Late work"]);
  // A new H1 must clear the stale H2 beneath it, or every later paragraph
  // inherits a section it is not in.
  const curved = doc.blocks.find((b) => b.text.startsWith("Curved"));
  assert.deepEqual(curved?.headingPath, ["Grading"]);
});

// ── Numbering: 2,266 paragraphs in 61% of real files ──────────────────────

test("markers are drawn in the format the definition asks for", () => {
  assert.equal(markerFor("decimal", 4), "4.");
  assert.equal(markerFor("lowerLetter", 3), "c.");
  assert.equal(markerFor("upperRoman", 4), "IV.");
  assert.equal(markerFor("bullet", 9), "-");
  // `none` is a real, unmarked level — not a reason to fall back to a number.
  assert.equal(markerFor("none", 2), "");
});

test("🔴 numbering.xml is resolved through BOTH indirections", () => {
  // A paragraph names a numId; w:num maps it to an abstractNumId; the abstract
  // definition holds the formats. Skipping a hop is why a naive reader shows
  // bullets for a numbered list.
  const numbering = readNumbering(`
    <w:numbering>
      <w:abstractNum w:abstractNumId="7">
        <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl>
        <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num>
    </w:numbering>`);
  assert.equal(numbering.get("3:0")?.format, "decimal");
  assert.equal(numbering.get("3:1")?.format, "lowerLetter");
  // The abstract id is NOT the numId — reading one as the other is the bug.
  assert.equal(numbering.get("7:0"), undefined);
});

test("🔴 'what is step 4' becomes answerable", () => {
  const numbering = `<w:numbering>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const list = ["Weigh the powder", "Dissolve it", "Filter", "Label the bottle"]
    .map((t) => p(t, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'))
    .join("");
  const doc = readDocxStructure(body(list), numbering);

  const step4 = doc.blocks.find((b) => b.marker === "4.");
  assert.equal(step4?.text, "Label the bottle");

  // And the old extractor genuinely could not answer it — the number is not in
  // the paragraph at all, so no amount of re-reading the text recovers it.
  const old = docxXmlToText(body(list));
  assert.match(old, /Label the bottle/, "the text survived");
  assert.doesNotMatch(old, /\b4\./, "but nothing said it was the fourth step");
});

test("a nested level restarts when its parent advances", () => {
  const numbering = `<w:numbering>
    <w:abstractNum w:abstractNumId="1">
      <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl>
      <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl>
    </w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const item = (t: string, lvl: number) => p(t, `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="1"/></w:numPr>`);
  const doc = readDocxStructure(
    body(item("One", 0) + item("One A", 1) + item("One B", 1) + item("Two", 0) + item("Two A", 1)),
    numbering,
  );
  const markers = doc.blocks.map((b) => `${b.marker}${b.text}`);
  assert.deepEqual(markers, ["1.One", "1.One A", "2.One B", "2.Two", "1.Two A"]);
});

test("a list whose definition is missing degrades to a bullet, never to nothing", () => {
  const doc = readDocxStructure(body(p("Orphan", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="99"/></w:numPr>')), null);
  assert.equal(doc.blocks[0]?.kind, "listItem");
  assert.equal(doc.blocks[0]?.text, "Orphan");
});

// ── Tables: 8,355 cells that became orphan lines ──────────────────────────

test("🔴 a grid keeps its rows and columns", () => {
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const row = (...cells: string[]) => `<w:tr>${cells.map(cell).join("")}</w:tr>`;
  const doc = readDocxStructure(body(`<w:tbl>${row("Component", "Weight")}${row("Midterm", "30%")}${row("Final", "45%")}</w:tbl>`));

  const table = doc.blocks[0];
  assert.equal(table?.kind, "table");
  assert.deepEqual(table?.rows, [["Component", "Weight"], ["Midterm", "30%"], ["Final", "45%"]]);
  assert.equal(doc.counts.tableCells, 6);
  // 🔴 The rendering keeps the association. A cell on its own line loses which
  // column it was in, and "45%" then reads as a fact about whatever preceded it.
  assert.match(table?.text ?? "", /\| Final \| 45% \|/);
});

test("🔴 a table's paragraphs are not ALSO emitted as loose text", () => {
  // The measured defect: cells survive as text, so a grid arrives looking like
  // ordinary content and is answered confidently and wrongly. Emitting them
  // twice would keep that failure alongside the fix.
  const doc = readDocxStructure(body(
    `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Midterm</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` + p("After the table."),
  ));
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks.filter((b) => b.kind === "paragraph").length, 1);
  assert.equal(doc.counts.paragraphs, 1, "the cell must not count as a body paragraph");
});

test("a nested table does not invent columns in its parent", () => {
  const inner = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>inner</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const outer = `<w:tbl><w:tr><w:tc>${inner}</w:tc><w:tc><w:p><w:r><w:t>beside</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const doc = readDocxStructure(body(outer));
  // One block, two columns — not three, and not two separate tables.
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0]?.rows?.[0]?.length, 2);
});

test("ragged rows are padded so columns still line up", () => {
  assert.equal(
    renderTable([["a", "b", "c"], ["d"]]),
    "| a | b | c |\n| --- | --- | --- |\n| d |  |  |",
  );
  // A pipe inside a cell must not split it into two.
  assert.match(renderTable([["x|y"], ["z"]]), /x\\\|y/);
});

// ── Locators Word cannot provide ──────────────────────────────────────────

test("🔴 nothing here reports a page", () => {
  // Word paginates at layout time; the file has no page boundaries. A citation
  // that says "page 7" of a .docx is fabricated, and every later check of it
  // would pass while pointing at nothing.
  const doc = readDocxStructure(body(p("One") + p("Two")));
  for (const block of doc.blocks) {
    assert.ok(!("page" in block), "no block may carry a page");
    assert.equal(typeof block.index, "number", "the block index is the honest locator");
  }
});

// ── Text ──────────────────────────────────────────────────────────────────

test("runs, tabs and breaks join the way they were typed", () => {
  assert.equal(
    paragraphText("<w:p><w:r><w:t>Dose</w:t></w:r><w:tab/><w:r><w:t>5 mg</w:t></w:r></w:p>"),
    "Dose 5 mg",
  );
  // A break between runs is a word boundary; without it the words fuse.
  assert.equal(paragraphText("<w:p><w:r><w:t>Lecture 4</w:t></w:r><w:br/><w:r><w:t>Dosing</w:t></w:r></w:p>"), "Lecture 4 Dosing");
  assert.equal(paragraphText("<w:p><w:r><w:t>caf&#233; &amp; bar</w:t></w:r></w:p>"), "café & bar");
});

test("the rendered document reads as markdown with its structure intact", () => {
  const doc = readDocxStructure(body(p("Syllabus", '<w:pStyle w:val="Heading1"/>') + p("Read chapter 3.")));
  const text = renderDocx(doc);
  assert.match(text, /^# Syllabus/);
  assert.match(text, /Read chapter 3\./);
});
