/**
 * Build the golden acceptance SOURCE as a real Word document.
 *
 * Run: node apps/web/acceptance/build-acceptance-docx.mjs [revision]
 *
 * 🔴 WHY .DOCX AND NOT A PDF. The PDF acceptance document proved something real and discouraging:
 * its ruled table came back from production as one run-on paragraph, so association extraction had
 * no acceptance case at all. Word states its tables outright in markup — `<w:tbl>`, `<w:tr>`,
 * `<w:tc>` — instead of leaving them to be inferred from drawn lines. That separates two questions
 * this repo kept answering together: "does the knowledge chain work end to end" and "can the PDF
 * parser recover a grid from geometry". This file answers the first. The second is #470's problem.
 *
 * 🔴 WHY IT IS HAND-BUILT XML RATHER THAN A LIBRARY. Full control over the exact markup, no
 * dependency, and a file of about three kilobytes — small enough to hand to the page directly when
 * the sandbox refuses to share a path with the browser, which is the only way an agent can drive
 * the real upload here.
 *
 * 🔴 `<w:tblHeader/>` IS SET DELIBERATELY, AND IT IS LOAD-BEARING. It is the ONLY thing the parser
 * accepts as "this row is a header" — measured across 232 real tables, it appears on four rows in
 * three of them, and the tempting substitute `<w:tblLook w:firstRow="1">` is present on almost
 * everything and means nothing. Without it the grid reports `headerRows: 0`, every row including
 * `Generic | Brand` becomes a pair, and the extracted relation kind is `unstated`. Both outcomes
 * would be correct behaviour on an unmarked table and neither is what this document is testing.
 *
 * 🔴 A UNIQUE REVISION PER BUILD IS ALSO LOAD-BEARING. Ingestion keys on the file's content hash,
 * so re-uploading identical bytes is answered from the existing parse and tests nothing.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REVISION = process.argv[2] ?? new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A paragraph. `heading` picks a built-in style the parser reads as an outline level. */
const p = (text, { heading = 0 } = {}) =>
  `<w:p><w:pPr>${heading ? `<w:pStyle w:val="Heading${heading}"/>` : ""}</w:pPr>` +
  `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

const cell = (text) =>
  `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>` +
  `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;

/** One row. `header` emits `<w:tblHeader/>`, the only marker the parser trusts. */
const row = (cells, { header = false } = {}) =>
  `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map(cell).join("")}</w:tr>`;

const table = (header, rows) =>
  `<w:tbl><w:tblPr><w:tblBorders>` +
  ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="auto"/>`)
    .join("") +
  `</w:tblBorders></w:tblPr>` +
  row(header, { header: true }) +
  rows.map((cells) => row(cells)).join("") +
  `</w:tbl>`;

// ── the document ─────────────────────────────────────────────────────────────

const body = [
  p("Nemesis Acceptance Source", { heading: 1 }),
  p(`Acceptance revision ${REVISION}`),

  // A 2-COLUMN KNOWLEDGE TABLE. Expected: two association objects, relation kind `brand|generic`.
  p("Associations", { heading: 2 }),
  p("Learn each generic name and the brand it is sold under."),
  table(["Generic", "Brand"], [["losartan", "Cozaar"], ["valsartan", "Diovan"]]),

  // A 3-COLUMN NON-ASSOCIATION TABLE. Expected: zero objects, refused as `table-not-pairs`.
  // 🔴 The refusal must come from the COLUMN COUNT, not from the table failing to parse. Those
  // look identical in the output, so the stored row is checked for a 3-wide grid before the
  // extractor's answer is believed.
  p("Schedule", { heading: 2 }),
  table(["Date", "Event", "Location"], [["Sep 12, 2026", "Exam 1", "Room 102"]]),

  // CAUSAL PROSE. Unused by the association lane on purpose; it is the second knowledge type's
  // acceptance case, and its presence here proves the lane ignores what it does not claim.
  p("Causal relationship", { heading: 2 }),
  p("Increasing resistance decreases current when voltage is held constant."),
].join("");

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const documentRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// Heading styles have to EXIST as styles for a reader to treat them as an outline rather than as
// paragraphs that happen to be named "Heading1".
const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/>` +
        `<w:pPr><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
        `<w:rPr><w:b/><w:sz w:val="${32 - n * 4}"/></w:rPr></w:style>`,
    )
    .join("") +
  `</w:styles>`;

const stage = mkdtempSync(join(tmpdir(), "acceptance-docx-"));
try {
  mkdirSync(join(stage, "_rels"));
  mkdirSync(join(stage, "word", "_rels"), { recursive: true });
  writeFileSync(join(stage, "[Content_Types].xml"), contentTypes);
  writeFileSync(join(stage, "_rels", ".rels"), rels);
  writeFileSync(join(stage, "word", "document.xml"), documentXml);
  writeFileSync(join(stage, "word", "styles.xml"), stylesXml);
  writeFileSync(join(stage, "word", "_rels", "document.xml.rels"), documentRels);

  const out = join(HERE, `acceptance-source-${REVISION}.docx`);
  rmSync(out, { force: true });
  // `[Content_Types].xml` added first: some readers expect it as the archive's first entry.
  execFileSync("zip", ["-q", "-X", out, "[Content_Types].xml"], { cwd: stage });
  execFileSync("zip", ["-q", "-X", "-r", out, "_rels", "word"], { cwd: stage });
  console.log(`${out}\n${readFileSync(out).length} bytes, revision ${REVISION}`);
} finally {
  rmSync(stage, { force: true, recursive: true });
}
