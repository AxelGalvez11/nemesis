import assert from "node:assert/strict";
import { test } from "node:test";

import { docxXmlToText } from "./office-text";
import {
  headingLevel,
  markerFor,
  paragraphEmphasis,
  paragraphText,
  pictureRefs,
  readDocumentRels,
  readDocxStructure,
  readNumbering,
  renderDocx,
  renderTable,
} from "./docx-structure";

const p = (inner: string, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r><w:t>${inner}</w:t></w:r></w:p>`;
const body = (inner: string) => `<w:document><w:body>${inner}</w:body></w:document>`;
const mathRun = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
const fraction = (num: string, den: string) => `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;

test("Word run properties survive as explicit emphasis evidence", () => {
  const xml = `<w:p>
    <w:r><w:rPr><w:b/><w:highlight w:val="yellow"/></w:rPr><w:t>Mass is conserved</w:t></w:r>
    <w:r><w:t> in the system.</w:t></w:r>
  </w:p>`;
  assert.deepEqual(paragraphEmphasis(xml), [
    { kind: "bold", text: "Mass is conserved" },
    { kind: "highlight", text: "Mass is conserved" },
  ]);
  assert.deepEqual(readDocxStructure(body(xml)).blocks[0]?.emphasis, paragraphEmphasis(xml));
});

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

// ── Equations: kind `equation`, and the formula the right way up ──────────

test("🔴 a formula is spliced in where it was written, not appended", () => {
  // The equation sat in the middle of the sentence. Collecting `<m:t>` after the
  // `<w:t>` runs would move it to the end and change what the sentence says.
  const para =
    `<w:p><w:r><w:t>Half-life is </w:t></w:r>` +
    `<m:oMath>${fraction(mathRun("0.693"), mathRun("k"))}</m:oMath>` +
    `<w:r><w:t> for a first-order drug.</w:t></w:r></w:p>`;
  assert.equal(paragraphText(para), "Half-life is 0.693/k for a first-order drug.");
});

test("🔴 the glued form is gone: the fraction's bar survives", () => {
  // Measured on a real file. `Equations.docx` wrote zero-order half-life as
  // C₀ over 2k; the old reader emitted "Co2k", which reads as C₀ × 2k — the
  // formula INVERTED, with every character present and nothing to signal it.
  const para =
    `<w:p><w:r><w:t>zero order t</w:t></w:r>` +
    `<m:oMath><m:sSub><m:e>${mathRun("")}</m:e><m:sub>${fraction(mathRun("1"), mathRun("2"))}</m:sub></m:sSub>` +
    `${mathRun(" = ")}${fraction(`<m:sSub><m:e>${mathRun("C")}</m:e><m:sub>${mathRun("o")}</m:sub></m:sSub>`, mathRun("2k"))}</m:oMath></w:p>`;
  const text = paragraphText(para);
  assert.match(text, /C_o\/\(2k\)/, "the denominator must be bracketed");
  assert.doesNotMatch(text, /Co2k/, "the glued reading must not survive");
});

test("🔴 a paragraph holding math is kind `equation`, so a consumer can tell", () => {
  // Every block used to be `paragraph`. A formula and a sentence about a formula
  // were indistinguishable, so nothing downstream could weight one differently
  // or refuse to paraphrase it.
  const doc = readDocxStructure(body(
    `<w:p><w:r><w:t>Clearance: </w:t></w:r><m:oMath>${fraction(mathRun("Dose"), mathRun("AUC"))}</m:oMath></w:p>` +
    p("Ordinary prose."),
  ));
  assert.equal(doc.blocks[0]?.kind, "equation");
  // The brackets are deliberate even where a human would not need them: nothing
  // here can tell the single symbol `AUC` from the product `2k`, and guessing
  // wrong in the other direction turns a division into a multiplication.
  assert.equal(doc.blocks[0]?.text, "Clearance: Dose/(AUC)");
  assert.equal(doc.blocks[1]?.kind, "paragraph");
  assert.equal(doc.counts.equations, 1);
  assert.equal(doc.counts.paragraphs, 1);
});

test("🔴 a NUMBERED STEP containing a formula stays a list item", () => {
  // Precedence is heading > listItem > equation > paragraph, and this rung is
  // load-bearing: promoting the step to `equation` would drop its marker, and
  // the marker is the only reason "what is step 4?" can be answered. 2,497
  // markers across the real corpus depend on it.
  const numbering = `<w:numbering>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const step =
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
    `<w:r><w:t>Compute </w:t></w:r><m:oMath>${fraction(mathRun("D"), mathRun("V"))}</m:oMath></w:p>`;
  const doc = readDocxStructure(body(step), numbering);
  assert.equal(doc.blocks[0]?.kind, "listItem");
  assert.equal(doc.blocks[0]?.marker, "1.");
  assert.match(doc.blocks[0]?.text ?? "", /D\/V/);
});

test("a heading containing math is still a heading", () => {
  const heading =
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Deriving </w:t></w:r>` +
    `<m:oMath>${fraction(mathRun("a"), mathRun("b"))}</m:oMath></w:p>`;
  const doc = readDocxStructure(body(heading + p("Body.")));
  assert.equal(doc.blocks[0]?.kind, "heading");
  assert.equal(doc.blocks[1]?.headingPath[0], "Deriving a/b");
});

// ── Pictures: 207 placements across 46 of 158 real files, all invisible ───

test("relationship ids resolve to the zip part the picture lives in", () => {
  const rels = readDocumentRels(
    `<Relationships><Relationship Id="rId7" Target="media/image3.png"/>` +
    `<Relationship Id="rId9" Target="../media/image9.emf"/>` +
    `<Relationship Id="rId4" Target="https://example.edu/x.png" TargetMode="External"/></Relationships>`,
  );
  assert.equal(rels.get("rId7"), "word/media/image3.png");
  assert.equal(rels.get("rId9"), "word/media/image9.emf");
  // An external picture is a reference to a file that is not in the archive.
  assert.equal(rels.get("rId4"), "https://example.edu/x.png");
});

test("🔴 a <w:drawing> is NOT a picture", () => {
  // Over 158 real course files there are 300 `<w:drawing>` elements and 140
  // embedded pictures. Keying detection on the drawing inflates the count by
  // more than half with charts, SmartArt and text boxes that hold no image.
  const rels = new Map([["rId7", "word/media/image3.png"]]);
  const chart = `<w:drawing><wp:inline><a:graphic><c:chart r:id="rId2"/></a:graphic></wp:inline></w:drawing>`;
  assert.deepEqual(pictureRefs(chart, rels), []);
  const picture = `<w:drawing><wp:inline><a:graphic><pic:pic><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphic></wp:inline></w:drawing>`;
  assert.deepEqual(pictureRefs(picture, rels), ["word/media/image3.png"]);
});

test("🔴 the older VML picture form counts too", () => {
  // 67 of this corpus's pictures are `<v:imagedata>`, concentrated in 5 files
  // that a reader ignoring VML would report as having no figures whatsoever.
  const rels = new Map([["rId5", "word/media/image1.jpeg"]]);
  const vml = `<w:pict><v:shape><v:imagedata r:id="rId5" o:title="scan"/></v:shape></w:pict>`;
  assert.deepEqual(pictureRefs(vml, rels), ["word/media/image1.jpeg"]);
});

test("🔴 an image-only paragraph becomes a figure instead of disappearing", () => {
  // The old reader dropped any paragraph whose text was empty, which is exactly
  // the shape of a paragraph that holds nothing but a diagram.
  const rels = `<Relationships><Relationship Id="rId7" Target="media/image3.png"/></Relationships>`;
  const doc = readDocxStructure(
    body(`<w:p><w:r><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:r></w:p>` + p("Caption-ish line.")),
    null,
    rels,
  );
  assert.equal(doc.blocks[0]?.kind, "figure");
  assert.equal(doc.blocks[0]?.ref, "word/media/image3.png");
  assert.equal(doc.counts.figures, 1);
  // …and the ordinary paragraph after it is untouched.
  assert.equal(doc.blocks[1]?.kind, "paragraph");
});

test("a figure sits after the paragraph it was anchored in, keeping reading order", () => {
  const rels = `<Relationships><Relationship Id="rId7" Target="media/image3.png"/></Relationships>`;
  const doc = readDocxStructure(
    body(`<w:p><w:r><w:t>See below.</w:t></w:r><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:p>`),
    null,
    rels,
  );
  assert.deepEqual(doc.blocks.map((b) => b.kind), ["paragraph", "figure"]);
});

test("🔴 a picture inside a table cell is kept, after the grid", () => {
  // 30 of the corpus's 207 placements sit inside a table, and the canonical
  // model's table is a grid of strings with nowhere to put one. Emitting it
  // after the table loses which cell it was in; dropping it loses the picture.
  const rels = `<Relationships><Relationship Id="rId7" Target="media/image3.png"/></Relationships>`;
  const cell = `<w:tc><w:p><w:r><w:t>x</w:t></w:r><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:p></w:tc>`;
  const doc = readDocxStructure(body(`<w:tbl><w:tr>${cell}</w:tr></w:tbl>`), null, rels);
  assert.deepEqual(doc.blocks.map((b) => b.kind), ["table", "figure"]);
});

test("a picture with no relationships part keeps its id rather than being dropped", () => {
  const doc = readDocxStructure(body(`<w:p><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:p>`), null, null);
  assert.equal(doc.blocks[0]?.kind, "figure");
  assert.equal(doc.blocks[0]?.ref, "rId7");
});

test("the same picture placed twice is two placements pointing at one part", () => {
  // A real template in the corpus places one icon five times. Both facts have to
  // survive: five positions in the document, one thing to describe.
  const rels = `<Relationships><Relationship Id="rId7" Target="media/image3.png"/></Relationships>`;
  const shot = `<w:p><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:p>`;
  const doc = readDocxStructure(body(shot + shot), null, rels);
  assert.equal(doc.counts.figures, 2);
  assert.equal(new Set(doc.blocks.map((b) => b.ref)).size, 1);
});

test("a figure is announced in the rendered text, never silently skipped", () => {
  const rels = `<Relationships><Relationship Id="rId7" Target="media/image3.png"/></Relationships>`;
  const doc = readDocxStructure(body(`<w:p><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:p>`), null, rels);
  assert.match(renderDocx(doc), /\[Figure — not examined\]/);
});

// ── Table headers: what Word states, and only that ────────────────────────

test("🔴 a row that says it is NOT a header is not one", () => {
  // `<w:tblHeader w:val="false"/>` is a row switching the property off — a bare
  // `<w:tblHeader` test reads that as the opposite of what the file says, and
  // then every value in row 0 is renamed to a column title.
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const off = `<w:tr><w:trPr><w:tblHeader w:val="false"/></w:trPr>${cell("Criterion")}${cell("Points")}</w:tr>`;
  const doc = readDocxStructure(body(`<w:tbl>${off}${`<w:tr>${cell("Accuracy")}${cell("10")}</w:tr>`}</w:tbl>`));
  assert.equal(doc.blocks[0]?.headerRows, 0);

  const on = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("Criterion")}${cell("Points")}</w:tr>`;
  const marked = readDocxStructure(body(`<w:tbl>${on}</w:tbl>`));
  assert.equal(marked.blocks[0]?.headerRows, 1);
});

test("🔴 a NESTED table's header does not promote the row that contains it", () => {
  // The row properties searched must be the row's OWN. Scanning the whole
  // `<w:tr>` finds the inner table's `<w:trPr>` when the outer row declares
  // none, and an inner header then renames the outer row's data.
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const inner = `<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("inner header")}</w:tr></w:tbl>`;
  const outer = `<w:tbl><w:tr><w:tc>${inner}</w:tc>${cell("data")}</w:tr></w:tbl>`;
  const doc = readDocxStructure(body(outer));
  assert.equal(doc.blocks[0]?.headerRows, 0, "the outer row declared nothing");
});

test("🔴 nothing infers a header from the first row", () => {
  // Measured over 158 real course files: 232 tables, and `<w:tblHeader/>` on
  // FOUR rows. `<w:tblLook w:firstRow="1">` is on 189 of them — because Word
  // writes it on every table it inserts. Honouring it would be the forbidden
  // guess in a different costume, and it would rename the first criterion of
  // every rubric that opens with data.
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const look = `<w:tblPr><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0"/></w:tblPr>`;
  const doc = readDocxStructure(body(
    `<w:tbl>${look}<w:tr>${cell("Take 2 tablets")}${cell("daily")}</w:tr><w:tr>${cell("Take 1")}${cell("nightly")}</w:tr></w:tbl>`,
  ));
  assert.equal(doc.blocks[0]?.headerRows, 0);
});

// ── Merged cells: the spans Word states outright ───────────────────────────

const tc = (text: string, props = "") =>
  `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}<w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;

test("🔴 a horizontally merged header spans its columns instead of shortening the row", () => {
  // THE DEFECT, MEASURED: `gridSpan` was ignored, so a header covering three of
  // three columns produced a ONE-cell row beside three-cell rows. 56 of 231
  // tables across 158 real Word documents came out ragged that way, and a
  // ragged table is one where no column index means the same thing twice.
  const doc = readDocxStructure(body(
    `<w:tbl>` +
    `<w:tr>${tc("Assessment", '<w:gridSpan w:val="3"/>')}</w:tr>` +
    `<w:tr>${tc("Midterm")}${tc("30%")}${tc("Week 6")}</w:tr>` +
    `</w:tbl>`,
  ));
  const table = doc.blocks.find((b) => b.kind === "table")!;
  assert.deepEqual(table.rows, [["Assessment", "", ""], ["Midterm", "30%", "Week 6"]]);
  assert.equal(table.cells![0]!.colSpan, 3);
  assert.equal(table.rows![0]!.length, table.rows![1]!.length, "every row is the same width");
});

test("🔴 a vertically merged cell governs the rows beneath it, which are not blank", () => {
  // Word writes the text once and leaves each continuation row an empty `w:tc`.
  // Read as rows alone, sessions two and three report no instructor — which
  // downstream means "the document does not say", about the one thing it states.
  const doc = readDocxStructure(body(
    `<w:tbl>` +
    `<w:tr>${tc("Dr. Farrar", '<w:vMerge w:val="restart"/>')}${tc("Session A")}</w:tr>` +
    `<w:tr>${tc("", "<w:vMerge/>")}${tc("Session B")}</w:tr>` +
    `<w:tr>${tc("", '<w:vMerge w:val="continue"/>')}${tc("Session C")}</w:tr>` +
    `</w:tbl>`,
  ));
  const table = doc.blocks.find((b) => b.kind === "table")!;
  const owner = table.cells!.find((c) => c.text === "Dr. Farrar")!;
  assert.equal(owner.rowSpan, 3, "one cell covering three rows, as the file says");
  assert.deepEqual(table.rows, [["Dr. Farrar", "Session A"], ["", "Session B"], ["", "Session C"]]);
});

test("a bare <w:vMerge/> means continue — the default, and the common case", () => {
  const doc = readDocxStructure(body(
    `<w:tbl><w:tr>${tc("x", '<w:vMerge w:val="restart"/>')}${tc("a")}</w:tr>` +
    `<w:tr>${tc("", "<w:vMerge/>")}${tc("b")}</w:tr></w:tbl>`,
  ));
  assert.equal(doc.blocks.find((b) => b.kind === "table")!.cells!.find((c) => c.text === "x")!.rowSpan, 2);
});

test("🔴 a nested table's own gridSpan is not read as the outer cell's", () => {
  // `tcPr` must be read from this cell's properties, not from its whole XML: a
  // nested table's cells carry their own, and a grandchild's span applied to the
  // parent would silently widen the outer grid.
  const inner = `<w:tbl><w:tr>${tc("inner", '<w:gridSpan w:val="4"/>')}</w:tr></w:tbl>`;
  const doc = readDocxStructure(body(
    `<w:tbl><w:tr><w:tc>${inner}</w:tc>${tc("beside")}</w:tr></w:tbl>`,
  ));
  const table = doc.blocks.find((b) => b.kind === "table")!;
  assert.equal(table.rows![0]!.length, 2, "the outer row still has two columns");
});

test("an ordinary table is unchanged and carries a cell per position", () => {
  const doc = readDocxStructure(body(
    `<w:tbl><w:tr>${tc("A")}${tc("B")}</w:tr><w:tr>${tc("1")}${tc("2")}</w:tr></w:tbl>`,
  ));
  const table = doc.blocks.find((b) => b.kind === "table")!;
  assert.deepEqual(table.rows, [["A", "B"], ["1", "2"]]);
  assert.equal(table.cells!.length, 4);
  assert.ok(table.cells!.every((c) => !c.rowSpan && !c.colSpan), "no spans invented");
});

// ── Heading paths: the hole that deleted whole documents ───────────────────

test("🔴 a document starting at Heading 2 does not put a hole in every heading path", () => {
  // THE BUG THAT DELETED THREE DOCUMENTS. `headingPath[level - 1] = text` on a
  // plain array leaves the skipped slots as array HOLES, which serialise to
  // `null`. `readDocumentModel` then rejects the block — correctly — and
  // rejecting one block rejects the model, so a perfectly parsed 217-block
  // document read back as having no structure at all, silently.
  const doc = readDocxStructure(body(
    p("Section", '<w:pStyle w:val="Heading2"/>') + p("Body text."),
  ));
  for (const block of doc.blocks) {
    assert.ok(
      block.headingPath.every((entry) => typeof entry === "string"),
      `every heading path entry must be a string, got ${JSON.stringify(block.headingPath)}`,
    );
  }
  assert.deepEqual(doc.blocks.find((b) => b.text === "Body text.")!.headingPath, ["Section"]);
});

test("skipping a heading level shortens the path rather than padding it", () => {
  const doc = readDocxStructure(body(
    p("Top", '<w:pStyle w:val="Heading1"/>') +
    p("Deep", '<w:pStyle w:val="Heading3"/>') +
    p("Under deep."),
  ));
  // Level 2 was never opened, so it contributes no ancestor. Two real names.
  assert.deepEqual(doc.blocks.find((b) => b.text === "Under deep.")!.headingPath, ["Top", "Deep"]);
});

test("a sibling heading replaces its predecessor rather than nesting under it", () => {
  const doc = readDocxStructure(body(
    p("One", '<w:pStyle w:val="Heading1"/>') +
    p("Two", '<w:pStyle w:val="Heading1"/>') +
    p("Under two."),
  ));
  assert.deepEqual(doc.blocks.find((b) => b.text === "Under two.")!.headingPath, ["Two"]);
});
