import assert from "node:assert/strict";
import { test } from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  coreTitle,
  DOCX_PARSER_VERSION,
  FALLBACK_OVERLAP_TOKENS,
  FALLBACK_UNIT_TOKENS,
  parseDocx,
  readDocumentRels,
  readParagraphXml,
  readTableXml,
} from "./docx-parse";
import { estimateTokens, type DocBlock, type DocUnit, type ParsedDocument } from "@nemesis/shared";

/** A PNG whose header states its real size (see ./pptx-parse.test.ts). */
function png(width: number, height: number, salt = 0): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const be = (value: number, at: number): void => {
    bytes[at] = (value >>> 24) & 0xff;
    bytes[at + 1] = (value >>> 16) & 0xff;
    bytes[at + 2] = (value >>> 8) & 0xff;
    bytes[at + 3] = value & 0xff;
  };
  be(width, 16);
  be(height, 20);
  bytes[31] = salt;
  return bytes;
}

const STYLES =
  "<w:styles>" +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="SubClause"><w:name w:val="Sub Clause"/><w:basedOn w:val="Heading3"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>' +
  '<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>' +
  "</w:styles>";

const NUMBERING =
  "<w:numbering>" +
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>' +
  '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="none"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num>' +
  "</w:numbering>";

const RELS =
  '<?xml version="1.0"?><Relationships>' +
  '<Relationship Id="rId1" Type="x/hyperlink" Target="https://example.org/spec" TargetMode="External"/>' +
  '<Relationship Id="rId2" Type="x/image" Target="media/image1.png"/>' +
  "</Relationships>";

const FOOTNOTES =
  "<w:footnotes>" +
  '<w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:t>separator rule</w:t></w:r></w:p></w:footnote>' +
  '<w:footnote w:id="2"><w:p><w:r><w:t>Measured at 20 degrees.</w:t></w:r></w:p></w:footnote>' +
  "</w:footnotes>";

// Row 0: [Stage] [Duty gridSpan=2]
// Row 1: [One gridSpan=2] [Note vMerge=restart]   <- the merge starts at COLUMN 2,
// Row 2: [a] [b] [c vMerge]                          which is the SECOND cell of row 1
//                                                     and the THIRD of row 2.
const TABLE =
  "<w:tbl>" +
  "<w:tr><w:trPr><w:tblHeader/></w:trPr>" +
  "<w:tc><w:p><w:r><w:t>Stage</w:t></w:r></w:p></w:tc>" +
  '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Duty</w:t></w:r></w:p></w:tc>' +
  "</w:tr>" +
  "<w:tr>" +
  '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>One</w:t></w:r></w:p></w:tc>' +
  '<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:tc>' +
  "</w:tr>" +
  "<w:tr>" +
  "<w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc>" +
  "<w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc>" +
  "<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>" +
  "</w:tr>" +
  "</w:tbl>";

const DOCUMENT =
  "<w:document><w:body>" +
  "<w:p><w:r><w:t>Cover page</w:t></w:r></w:p>" +
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Scope</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">Kept </w:t></w:r>' +
  "<w:del><w:r><w:delText>deleted words </w:delText></w:r></w:del>" +
  '<w:r><w:instrText> PAGE \\* MERGEFORMAT </w:instrText></w:r>' +
  "<w:r><w:t>after.</w:t></w:r></w:p>" +
  '<w:p><w:hyperlink r:id="rId1"><w:r><w:t>the spec</w:t></w:r></w:hyperlink></w:p>' +
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nested</w:t></w:r></w:p>' +
  TABLE +
  "<w:p><w:r><w:drawing><wp:inline>" +
  '<wp:docPr id="1" name="Picture 1" descr="Cutaway of the impeller"/>' +
  '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
  "</wp:inline></w:drawing></w:r></w:p>" +
  '<w:p><w:pPr><w:pStyle w:val="SubClause"/></w:pPr><w:r><w:t>Impeller</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Rated flow</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Terms</w:t></w:r></w:p>' +
  '<w:p><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t>Head</w:t></w:r>' +
  '<w:r><w:t xml:space="preserve"> means pressure.</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:t>Body text is not a heading.</w:t></w:r></w:p>' +
  "</w:body></w:document>";

function document(): Uint8Array {
  return zipSync({
    "docProps/core.xml": strToU8("<cp:coreProperties><dc:title>Pump specification</dc:title></cp:coreProperties>"),
    "word/_rels/document.xml.rels": strToU8(RELS),
    "word/document.xml": strToU8(DOCUMENT),
    "word/footnotes.xml": strToU8(FOOTNOTES),
    "word/media/image1.png": png(900, 700, 1),
    "word/numbering.xml": strToU8(NUMBERING),
    "word/styles.xml": strToU8(STYLES),
  });
}

const textOf = (blocks: DocBlock[], kind: DocBlock["kind"]): string[] =>
  blocks.filter((block) => block.kind === kind).map((block) => block.text);

test("units are sections, split at the SHALLOWEST heading depth the document uses", () => {
  const { doc } = parseDocx(document(), "spec.docx");
  assert.equal(doc.kind, "docx");
  assert.equal(doc.parserVersion, DOCX_PARSER_VERSION);
  assert.equal(doc.contentHash.length, 64);
  assert.equal(doc.title, "Pump specification");
  // Heading 2 is the top level here; splitting on depth 1 would return one unit.
  assert.equal(doc.units.length, 3);
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.label),
    [undefined, "Scope", "Terms"],
  );
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.headingPath),
    [undefined, ["Scope"], ["Terms"]],
  );
  assert.equal(doc.units[0]?.locator.kind, "section");
  assert.deepEqual(textOf(doc.units[0]?.blocks ?? [], "paragraph"), ["Cover page"]);
});

test("a heading deeper than the split level stays inside its section", () => {
  const { doc } = parseDocx(document());
  const scope = doc.units[1];
  assert.ok(scope);
  const headings = scope.blocks.filter((block) => block.kind === "heading");
  assert.deepEqual(
    headings.map((block) => [block.depth, block.text]),
    [
      [2, "Scope"],
      // SubClause is BASED ON Heading3 and carries no outline level of its own.
      [3, "Impeller"],
    ],
  );
});

test("tracked deletions and field instructions never reach the text", () => {
  const { doc } = parseDocx(document());
  const paragraphs = textOf(doc.units[1]?.blocks ?? [], "paragraph");
  assert.ok(paragraphs.includes("Kept after."), `got: ${paragraphs.join(" | ")}`);
  const all = JSON.stringify(doc);
  assert.ok(!all.includes("deleted words"), "a struck-out clause must not be indexed as surviving text");
  assert.ok(!all.includes("MERGEFORMAT"), "field instruction text is not the author's words");
  // One deletion, counted once: the whole <w:del> subtree is skipped, so its
  // <w:delText> is never even reached.
  assert.equal(doc.meta?.trackedDeletionsDropped, 1);
  assert.equal(doc.meta?.fieldCodesSkipped, 1);
  assert.ok(doc.coverage.notes?.some((note) => /tracked deletions/.test(note)));
  assert.ok(doc.coverage.notes?.some((note) => /field codes/.test(note)));
});

test("a hyperlink keeps its target and a character style keeps its emphasis", () => {
  const { doc } = parseDocx(document());
  const scope = textOf(doc.units[1]?.blocks ?? [], "paragraph");
  assert.ok(scope.includes("[the spec](https://example.org/spec)"));
  const terms = textOf(doc.units[2]?.blocks ?? [], "paragraph");
  assert.deepEqual(terms, ["**Head** means pressure.", "Body text is not a heading."]);
});

test("list items keep their nesting depth", () => {
  const { doc } = parseDocx(document());
  const items = (doc.units[1]?.blocks ?? []).filter((block) => block.kind === "listItem");
  assert.deepEqual(
    items.map((block) => [block.depth, block.text]),
    [
      [1, "First"],
      [2, "Nested"],
    ],
  );
});

test("a table is a grid, reachable from the block stream", () => {
  const { doc } = parseDocx(document());
  assert.equal(doc.tables.length, 1);
  const table = doc.tables[0];
  assert.ok(table);
  assert.equal(table.locator.index, 2);
  assert.equal(table.title, "Scope");
  const block = (doc.units[1]?.blocks ?? []).find((candidate) => candidate.kind === "table");
  assert.equal(block?.tableId, table.id);
  assert.match(block?.text ?? "", /Stage\tDuty/);
});

test("a picture becomes a visual with its alt text, and a figure block points at it", () => {
  const { doc, imageBytes } = parseDocx(document());
  assert.equal(doc.visuals.length, 1);
  const visual = doc.visuals[0];
  assert.ok(visual);
  assert.equal(visual.id, "word/media/image1.png");
  assert.equal(visual.caption, "Cutaway of the impeller");
  assert.equal(visual.width, 900);
  assert.equal(visual.height, 700);
  assert.equal(visual.role, "content");
  assert.equal(visual.locator.index, 2);
  const figure = (doc.units[1]?.blocks ?? []).find((block) => block.kind === "figure");
  assert.equal(figure?.visualId, visual.id);
  assert.deepEqual([...imageBytes.keys()], ["word/media/image1.png"]);
  assert.equal(doc.coverage.visualsFound, 1);
  assert.equal(doc.coverage.visualsKept, 1);
});

test("a footnote is read where it is referenced, and the separator rule is not", () => {
  const { doc } = parseDocx(document());
  const notes = textOf(doc.units[1]?.blocks ?? [], "footnote");
  assert.deepEqual(notes, ["Measured at 20 degrees."]);
  assert.equal(doc.meta?.footnotesRead, 1);
  assert.ok(!JSON.stringify(doc).includes("separator rule"));
});

test("ordinals are dense within each unit and block ids are unique", () => {
  const { doc } = parseDocx(document());
  const ids = new Set<string>();
  for (const unit of doc.units) {
    unit.blocks.forEach((block, index) => {
      assert.equal(block.ordinal, index);
      assert.ok(!ids.has(block.id), `duplicate block id ${block.id}`);
      ids.add(block.id);
    });
  }
  assert.equal(doc.coverage.unitsFound, 3);
  assert.equal(doc.coverage.unitsRead, 3);
  assert.equal(doc.coverage.tablesFound, 1);
});

test("a document with no headings is one unit, and claims no heading trail", () => {
  const flat = zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Dear Sir</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Yours faithfully</w:t></w:r></w:p></w:body></w:document>",
    ),
  });
  const { doc } = parseDocx(flat);
  assert.equal(doc.units.length, 1);
  assert.equal(doc.units[0]?.locator.label, undefined);
  assert.equal(doc.units[0]?.locator.headingPath, undefined);
  assert.equal(doc.units[0]?.blocks.length, 2);
  assert.equal(doc.title, undefined, "a file with no title of its own is not given the storage key as one");
});

test("the same picture in two sections is one visual with alsoAt", () => {
  const drawing = (relId: string): string =>
    "<w:p><w:r><w:drawing><wp:inline><wp:docPr id='1' name='Picture 1'/>" +
    `<a:graphic><a:graphicData><a:blip r:embed="${relId}"/></a:graphicData></a:graphic>` +
    "</wp:inline></w:drawing></w:r></w:p>";
  const twice = zipSync({
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId2" Target="media/logo.png"/>' +
        '<Relationship Id="rId3" Target="media/copy-of-logo.png"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      "<w:document><w:body>" +
        "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>One</w:t></w:r></w:p>" +
        drawing("rId2") +
        "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>" +
        drawing("rId3") +
        "</w:body></w:document>",
    ),
    // Identical bytes under two entry names: one picture, two places.
    "word/media/copy-of-logo.png": png(400, 300, 9),
    "word/media/logo.png": png(400, 300, 9),
  });
  const { doc } = parseDocx(twice);
  assert.equal(doc.units.length, 2);
  assert.equal(doc.visuals.length, 1);
  const visual = doc.visuals[0];
  assert.equal(visual?.id, "word/media/copy-of-logo.png", "the earliest entry name wins, so the choice is stable");
  assert.equal(visual?.locator.index, 1);
  assert.deepEqual(
    visual?.alsoAt?.map((locator) => locator.index),
    [2],
  );
  // Both figure blocks point at the one visual.
  const figures = doc.units.flatMap((unit) => unit.blocks.filter((block) => block.kind === "figure"));
  assert.deepEqual(
    figures.map((block) => block.visualId),
    [visual?.id, visual?.id],
  );
});

test("a picture whose bytes are missing leaves no dangling figure block", () => {
  const broken = zipSync({
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId2" Target="media/gone.png"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p>" +
        "<w:p><w:r><w:drawing><wp:inline><wp:docPr id='1'/>" +
        '<a:graphic><a:graphicData><a:blip r:embed="rId2"/></a:graphicData></a:graphic>' +
        "</wp:inline></w:drawing></w:r></w:p></w:body></w:document>",
    ),
  });
  const { doc } = parseDocx(broken);
  assert.equal(doc.visuals.length, 0);
  assert.equal(
    doc.units.flatMap((unit) => unit.blocks).filter((block) => block.kind === "figure").length,
    0,
    "a figure block pointing at nothing is worse than no block",
  );
  assert.equal(doc.coverage.visualsFound, 1, "…but the reference is still reported as found");
  assert.equal(doc.coverage.visualsKept, 0, "nothing is retrievable, and coverage says so");
  assert.ok(doc.coverage.notes?.some((note) => /not stored in the file/.test(note)));
});

test("a file with no word/document.xml is refused", () => {
  assert.throws(() => parseDocx(zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld/>") })), /Word/);
});

// ── documents that never divide themselves ──────────────────────────────────
//
// A contract, a form, a filing, a manual and a long plain report routinely carry
// no heading style at all. Before the fallback each of them arrived as ONE unit,
// so every citation into a sixty-page file said the same thing. These tests are
// about that class of document, and about the promise that documents which DO
// have headings were not disturbed on the way.

/** A .docx that is nothing but a body — the shape most of these fixtures need. */
function bodyDocx(body: string, numbering?: string): Uint8Array {
  return zipSync({
    "word/document.xml": strToU8(`<w:document><w:body>${body}</w:body></w:document>`),
    ...(numbering ? { "word/numbering.xml": strToU8(numbering) } : {}),
  });
}

const para = (text: string): string => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Decimal auto-numbering, which is how a contract's clauses are actually
 *  written — the numbers are Word's, not characters the author typed. */
const DECIMAL_NUMBERING =
  "<w:numbering>" +
  '<w:abstractNum w:abstractNumId="4"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="4"/></w:num>' +
  "</w:numbering>";

const numbered = (text: string): string =>
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>' +
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** How Word actually writes a page break: an OTHERWISE-EMPTY paragraph. A
 *  fixture that puts text in the breaking paragraph passes against a parser that
 *  never sees the break at all, which is the failure this shape exists to catch. */
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** A section break: `w:sectPr` in a paragraph's properties ENDS that section. */
const SECTION_BREAK = '<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr></w:p>';

/** ~470 characters of ordinary contract prose, unique per clause number. The
 *  clause NUMBER is left to Word: these paragraphs carry `w:numPr`, so the
 *  digits a reader sees were never in the text at all. */
function clause(n: number): string {
  const sentence =
    `Each obligation set out in clause ${n} survives termination of this agreement and remains ` +
    "enforceable against the parties and their successors in every jurisdiction named in the schedule. ";
  return sentence.repeat(3).trim();
}

const allBlocks = (doc: ParsedDocument): DocBlock[] => doc.units.flatMap((unit) => unit.blocks);

/** The block kinds that carry a paragraph's own words, and so the ones a
 *  conservation check can compare against the fixture. A `table` block carries
 *  the tab-joined grid and a `figure` block carries a caption; neither is a
 *  paragraph, and neither belongs in this comparison. */
const PROSE_KINDS: ReadonlySet<DocBlock["kind"]> = new Set<DocBlock["kind"]>(["paragraph", "listItem", "footnote"]);

/**
 * NOTHING WAS SILENTLY DROPPED, AND NOTHING WAS INVENTED.
 *
 * Checked in both directions, because each catches a different failure and
 * neither catches the other's. Forwards: every text the fixture wrote reaches
 * some unit, and first appearances are in document order — that is the drop.
 * Backwards: every prose block a unit carries is one of those texts, whole —
 * that is the truncation, the mangling, and the half-paragraph a future cut
 * might leave behind, none of which the forwards check can see.
 *
 * Forwards is "at least once" rather than set equality on purpose: a window
 * seam deliberately REPEATS its tail. A repetition is visible and intended; a
 * drop is neither.
 */
function assertConserved(doc: ParsedDocument, texts: readonly string[]): void {
  const seen = allBlocks(doc).map((block) => block.text);
  let cursor = -1;
  for (const text of texts) {
    const at = seen.indexOf(text);
    assert.ok(at >= 0, `dropped from the parse: ${text.slice(0, 48)}`);
    assert.ok(at > cursor, `out of reading order: ${text.slice(0, 48)}`);
    cursor = at;
  }
  const expected = new Set(texts);
  for (const block of allBlocks(doc)) {
    if (!PROSE_KINDS.has(block.kind)) continue;
    assert.ok(expected.has(block.text), `not a paragraph the fixture wrote: ${block.text.slice(0, 48)}`);
  }
}

/** How many blocks the head of `next` repeats from the tail of `previous` — the
 *  overlap a window seam carried, measured rather than assumed to be one. */
function overlapSize(previous: DocUnit | undefined, next: DocUnit): number {
  if (!previous) return 0;
  const before = previous.blocks.map((block) => block.text);
  const after = next.blocks.map((block) => block.text);
  // Compared as JSON rather than as a joined string: on a space separator
  // ["a", "b c"] and ["a b", "c"] read as equal, and a seam that carried
  // nothing would look like one that did.
  for (let size = Math.min(before.length, after.length); size > 0; size -= 1) {
    if (JSON.stringify(before.slice(before.length - size)) === JSON.stringify(after.slice(0, size))) return size;
  }
  return 0;
}

/** No unit is unbounded. A unit holding a single block is exempt: an item bigger
 *  than the whole budget — a long table — is kept WHOLE on purpose. */
function assertBounded(doc: ParsedDocument): void {
  for (const unit of doc.units) {
    const tokens = estimateTokens(unit.blocks.map((block) => block.text).join("\n\n"));
    assert.ok(
      tokens <= FALLBACK_UNIT_TOKENS + FALLBACK_OVERLAP_TOKENS || unit.blocks.length === 1,
      `unit ${unit.locator.index} is unbounded at ${tokens} tokens across ${unit.blocks.length} blocks`,
    );
  }
}

test("a contract of numbered clauses with no heading styles is not one unbounded unit", () => {
  const clauses = Array.from({ length: 60 }, (_, index) => clause(index + 1));
  const { doc } = parseDocx(bodyDocx(clauses.map(numbered).join(""), DECIMAL_NUMBERING));

  // Auto-numbered clauses are list items, and a list is not an outline: nothing
  // here is a heading, so this is exactly the document the fallback is for.
  assert.deepEqual(new Set(allBlocks(doc).map((block) => block.kind)), new Set(["listItem"]));
  assert.ok(doc.units.length >= 3, `expected several units, got ${doc.units.length}`);
  assertBounded(doc);
  assertConserved(doc, clauses);
  // Measured, never inferred: the only thing known about a windowed unit is
  // which one it is. No label, no heading trail, and no invented page number.
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.kind),
    doc.units.map(() => "section"),
  );
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.index),
    doc.units.map((_, index) => index + 1),
  );
  for (const unit of doc.units) {
    assert.equal(unit.locator.label, undefined);
    assert.equal(unit.locator.headingPath, undefined);
    assert.equal(unit.locator.printedLabel, undefined);
  }
  assert.equal(doc.coverage.unitsFound, doc.units.length);
  assert.equal(doc.coverage.unitsRead, doc.units.length, "no unit was minted empty");
});

test("a long form of label and value lines is divided, and its grid stays whole", () => {
  const fields = Array.from(
    { length: 160 },
    (_, index) =>
      `Field ${index + 1} — applicant declaration of prior registrations, disposals and encumbrances ` +
      `recorded against entry ${index + 1} of the register, stated in full and without abbreviation.`,
  );
  const grid =
    "<w:tbl>" +
    "<w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Declared</w:t></w:r></w:p></w:tc></w:tr>" +
    "<w:tr><w:tc><w:p><w:r><w:t>Freehold</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Yes</w:t></w:r></w:p></w:tc></w:tr>" +
    "</w:tbl>";
  const half = fields.length / 2;
  const { doc } = parseDocx(
    bodyDocx(fields.slice(0, half).map(para).join("") + grid + fields.slice(half).map(para).join("")),
  );

  assert.ok(doc.units.length >= 3, `expected several units, got ${doc.units.length}`);
  assertBounded(doc);
  assertConserved(doc, fields);
  assert.equal(doc.tables.length, 1);
  const tableBlocks = allBlocks(doc).filter((block) => block.kind === "table");
  assert.equal(tableBlocks.length, 1, "a grid appears once, in one unit");
  assert.equal(doc.tables[0]?.rows.length, 2);
  assert.equal(tableBlocks[0]?.text, "Item\tDeclared\nFreehold\tYes");
});

test("a filing is cut at its section breaks, and page breaks inside a short section do not add cuts", () => {
  const { doc } = parseDocx(
    bodyDocx(
      para("Cover sheet of the filing") +
        SECTION_BREAK +
        para("Part I opens here") +
        PAGE_BREAK +
        para("Part I continues after the page turns") +
        SECTION_BREAK +
        para("Part II opens here"),
    ),
  );

  // Three sections, not four: the section break is the stronger signal, so the
  // page break inside a section that already fits divides nothing.
  assert.equal(doc.units.length, 3);
  assert.deepEqual(
    doc.units.map((unit) => unit.blocks.map((block) => block.text)),
    [
      ["Cover sheet of the filing"],
      ["Part I opens here", "Part I continues after the page turns"],
      ["Part II opens here"],
    ],
  );
  assert.deepEqual(
    doc.units.map((unit) => unit.locator.index),
    [1, 2, 3],
  );
});

test("an explicit page break divides, even written as an empty paragraph", () => {
  const { doc } = parseDocx(
    bodyDocx(
      para("First page, opening line") +
        para("First page, closing line") +
        PAGE_BREAK +
        para("Second page, opening line") +
        '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Third page, opening line</w:t></w:r></w:p>' +
        para("Third page, closing line"),
    ),
  );

  assert.deepEqual(
    doc.units.map((unit) => unit.blocks.map((block) => block.text)),
    [
      ["First page, opening line", "First page, closing line"],
      ["Second page, opening line"],
      ["Third page, opening line", "Third page, closing line"],
    ],
  );
  // A boundary is known; a page NUMBER is not. `index` is the unit's ordinal.
  for (const unit of doc.units) assert.equal(unit.locator.kind, "section");
});

test("a run of page breaks with nothing between them mints no empty unit", () => {
  const { doc } = parseDocx(bodyDocx(PAGE_BREAK + para("Only line") + PAGE_BREAK + PAGE_BREAK + para("Last line")));
  assert.equal(doc.units.length, 2);
  assert.equal(doc.coverage.unitsRead, 2);
  assert.equal(doc.coverage.unitsUnread, undefined);
});

test("a long plain report is windowed, and a seam repeats its tail so nothing falls between units", () => {
  const paragraphs = Array.from(
    { length: 100 },
    (_, index) =>
      `Observation ${index + 1}. The measured value drifted within the stated tolerance across the ` +
      "period under review, and the reviewer recorded no departure from the documented procedure.",
  );
  const { doc } = parseDocx(bodyDocx(paragraphs.map(para).join("")));

  assert.ok(doc.units.length >= 3, `expected several units, got ${doc.units.length}`);
  assertBounded(doc);
  assertConserved(doc, paragraphs);

  // The overlap: the unit after a window seam opens with the text the previous
  // unit ended with, so a point made across the seam is retrievable whole.
  const seams = doc.units.slice(1).map((unit, index) => overlapSize(doc.units[index], unit));
  assert.ok(
    seams.some((size) => size > 0),
    "no window seam carried an overlap",
  );
  doc.units.slice(1).forEach((unit, index) => {
    const carried = unit.blocks.slice(0, seams[index] ?? 0).map((block) => block.text);
    assert.ok(
      estimateTokens(carried.join("\n\n")) <= FALLBACK_OVERLAP_TOKENS,
      `the overlap into unit ${unit.locator.index} is not bounded`,
    );
  });
  // A repeated paragraph is still its OWN block: ids stay unique across the doc.
  const ids = allBlocks(doc).map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const unit of doc.units) unit.blocks.forEach((block, at) => assert.equal(block.ordinal, at));
});

test("a table larger than the whole budget becomes its own unit rather than being split", () => {
  const rows = Array.from(
    { length: 160 },
    (_, index) =>
      `<w:tr><w:tc><w:p><w:r><w:t>Row ${index + 1} description of the item as entered on the schedule</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>Value ${index + 1} recorded at the date of the survey</w:t></w:r></w:p></w:tc></w:tr>`,
  ).join("");
  const { doc } = parseDocx(bodyDocx(para("Before the schedule") + `<w:tbl>${rows}</w:tbl>` + para("After the schedule")));

  assert.equal(doc.tables.length, 1);
  assert.equal(doc.tables[0]?.rows.length, 160, "every row survived");
  const tableBlocks = allBlocks(doc).filter((block) => block.kind === "table");
  assert.equal(tableBlocks.length, 1, "one grid, one block — a table is one flow item and cannot be cut");
  assert.equal(tableBlocks[0]?.text.split("\n").length, 160, "the block carries the whole grid, not a slice of it");
  const home = doc.units.find((unit) => unit.blocks.some((block) => block.kind === "table"));
  // An item bigger than the whole budget is the last thing in its unit: nothing
  // after it was packed alongside it, and the grid was never cut to make room.
  assert.equal(home?.blocks.at(-1)?.kind, "table");
  assertConserved(doc, ["Before the schedule", "After the schedule"]);
});

test("the token window is a token estimate, not a character count — a CJK document splits where a Latin one does not", () => {
  // Same character count in both, and the same paragraph count. Only the SCRIPT
  // differs: dense scripts cost about four times as much per character, so a
  // window sized by `String.length` would treat these two files as identical.
  const size = 120;
  const cjk = Array.from({ length: 25 }, (_, index) =>
    Array.from({ length: size }, (_, at) => String.fromCodePoint(0x4e00 + ((index * size + at) % 2000))).join(""),
  );
  const latin = Array.from({ length: 25 }, (_, index) =>
    `Paragraph ${index + 1}. `.padEnd(size, "abcdefghij ").slice(0, size),
  );
  assert.equal(cjk.join("").length, latin.join("").length, "the fixtures must differ only in script");

  const dense = parseDocx(bodyDocx(cjk.map(para).join(""))).doc;
  const plain = parseDocx(bodyDocx(latin.map(para).join(""))).doc;

  assert.equal(plain.units.length, 1, "3000 Latin characters is well inside one unit");
  assert.ok(dense.units.length > 1, "3000 CJK characters is not");
  assertConserved(dense, cjk);
  assertBounded(dense);
});

test("a heading document is cut ONLY at its headings, even when it also has section and page breaks", () => {
  const headed = (extra: { breaks: boolean }): string =>
    "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>Alpha</w:t></w:r></w:p>" +
    para("Alpha body") +
    (extra.breaks ? PAGE_BREAK : "") +
    para("Alpha second body") +
    (extra.breaks ? SECTION_BREAK : "") +
    "<w:p><w:pPr><w:outlineLvl w:val='0'/></w:pPr><w:r><w:t>Beta</w:t></w:r></w:p>" +
    para("Beta body");

  const shape = (doc: ParsedDocument): unknown =>
    doc.units.map((unit) => ({
      blocks: unit.blocks.map((block) => ({
        depth: block.depth,
        id: block.id,
        kind: block.kind,
        ordinal: block.ordinal,
        text: block.text,
      })),
      headingPath: unit.locator.headingPath,
      index: unit.locator.index,
      kind: unit.locator.kind,
      label: unit.locator.label,
    }));

  const withBreaks = parseDocx(bodyDocx(headed({ breaks: true }))).doc;
  assert.deepEqual(shape(withBreaks), shape(parseDocx(bodyDocx(headed({ breaks: false }))).doc));
  // …and against literals, so this cannot pass by both sides changing together.
  assert.deepEqual(shape(withBreaks), [
    {
      blocks: [
        { depth: 1, id: "b0", kind: "heading", ordinal: 0, text: "Alpha" },
        { depth: undefined, id: "b1", kind: "paragraph", ordinal: 1, text: "Alpha body" },
        { depth: undefined, id: "b2", kind: "paragraph", ordinal: 2, text: "Alpha second body" },
      ],
      headingPath: ["Alpha"],
      index: 1,
      kind: "section",
      label: "Alpha",
    },
    {
      blocks: [
        { depth: 1, id: "b3", kind: "heading", ordinal: 0, text: "Beta" },
        { depth: undefined, id: "b4", kind: "paragraph", ordinal: 1, text: "Beta body" },
      ],
      headingPath: ["Beta"],
      index: 2,
      kind: "section",
      label: "Beta",
    },
  ]);
});

// ── the walker, without a zip ────────────────────────────────────────────────

test("an outline level of 9 means body text, not depth 10", () => {
  const styles = "<w:styles><w:style w:styleId='Quote'><w:pPr><w:outlineLvl w:val='9'/></w:pPr></w:style></w:styles>";
  const read = readParagraphXml("<w:p><w:pPr><w:pStyle w:val='Quote'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>", {
    styles,
  });
  assert.equal(read.kind, "paragraph");
  assert.equal(read.depth, undefined);
});

test("a heading is found by its outline level in any language", () => {
  // No English "Heading" anywhere: the German style name and id, with the
  // outline level that every localisation of Word writes.
  const styles =
    "<w:styles><w:style w:styleId='berschrift2'><w:name w:val='Überschrift 2'/>" +
    "<w:pPr><w:outlineLvl w:val='1'/></w:pPr></w:style></w:styles>";
  const read = readParagraphXml("<w:p><w:pPr><w:pStyle w:val='berschrift2'/></w:pPr><w:r><w:t>Umfang</w:t></w:r></w:p>", {
    styles,
  });
  assert.deepEqual([read.kind, read.depth, read.text], ["heading", 2, "Umfang"]);
});

test("direct formatting outranks the style", () => {
  const styles =
    "<w:styles><w:style w:styleId='Heading1'><w:pPr><w:outlineLvl w:val='0'/></w:pPr></w:style></w:styles>";
  const promoted = readParagraphXml(
    "<w:p><w:pPr><w:outlineLvl w:val='2'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>",
    { styles },
  );
  assert.deepEqual([promoted.kind, promoted.depth], ["heading", 3]);
  const demoted = readParagraphXml(
    "<w:p><w:pPr><w:pStyle w:val='Heading1'/><w:outlineLvl w:val='9'/></w:pPr><w:r><w:t>x</w:t></w:r></w:p>",
    { styles },
  );
  assert.equal(demoted.kind, "paragraph");
});

test("numbering removed or formatted as none is not a list", () => {
  const cases: Array<[string, string]> = [
    ["1", "listItem"],
    ["0", "paragraph"],
    ["3", "paragraph"],
  ];
  for (const [numId, expected] of cases) {
    const read = readParagraphXml(
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>x</w:t></w:r></w:p>`,
      { numbering: NUMBERING },
    );
    assert.equal(read.kind, expected, `numId ${numId}`);
  }
});

test("runs split mid-word are merged before emphasis is marked", () => {
  // Word splits a word across runs at every edit boundary; marking each piece
  // separately gives `**C****max**`, which is neither valid nor searchable.
  const read = readParagraphXml(
    "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>C</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>max</w:t></w:r>" +
      '<w:r><w:t xml:space="preserve"> is the peak.</w:t></w:r></w:p>',
  );
  assert.equal(read.text, "**Cmax** is the peak.");
});

test("bold explicitly turned off inside a bold character style stays off", () => {
  const styles =
    "<w:styles><w:style w:type='character' w:styleId='Strong'><w:rPr><w:b/></w:rPr></w:style></w:styles>";
  const read = readParagraphXml(
    "<w:p><w:r><w:rPr><w:rStyle w:val='Strong'/><w:b w:val='0'/></w:rPr><w:t>plain</w:t></w:r></w:p>",
    { styles },
  );
  assert.equal(read.text, "plain");
});

test("a vertical merge is matched by COLUMN, not by cell ordinal", () => {
  const rows = readTableXml(TABLE);
  assert.deepEqual(
    rows[1]?.map((cell) => [cell.col, cell.text, cell.colSpan, cell.rowSpan]),
    [
      [0, "One", 2, undefined],
      [2, "Note", undefined, 2],
    ],
  );
  assert.deepEqual(
    rows[2]?.map((cell) => [cell.col, cell.text]),
    [
      [0, "a"],
      [1, "b"],
    ],
  );
  assert.equal(rows[0]?.every((cell) => cell.header), true);
});

test("a table nested in a cell is still that cell's content", () => {
  const rows = readTableXml(
    "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>outer</w:t></w:r></w:p>" +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>in1</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>in2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "</w:tc></w:tr></w:tbl>",
  );
  assert.equal(rows[0]?.[0]?.text, "outer\nin1\tin2");
});

test("relationships resolve to zip entry names, and external ones stay whole", () => {
  const map = readDocumentRels(
    '<Relationships><Relationship Id="a" Target="media/x.png"/>' +
      '<Relationship Id="b" Target="../customXml/item1.xml"/>' +
      '<Relationship Id="c" Target="https://example.org" TargetMode="External"/></Relationships>',
  );
  assert.deepEqual(map.get("a"), { external: false, target: "word/media/x.png" });
  assert.deepEqual(map.get("b"), { external: false, target: "customXml/item1.xml" });
  assert.deepEqual(map.get("c"), { external: true, target: "https://example.org" });
});

test("coreTitle reads the file's own title and nothing else", () => {
  assert.equal(coreTitle("<cp:coreProperties><dc:title>Lease</dc:title></cp:coreProperties>"), "Lease");
  assert.equal(coreTitle("<cp:coreProperties><dc:title>  </dc:title></cp:coreProperties>"), undefined);
  assert.equal(coreTitle(null), undefined);
});
