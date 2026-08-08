/**
 * What a Word file CONTAINS versus what our reader DELIVERS, over real course files.
 *
 * 🔴 THE LEFT-HAND COLUMN IS READ FROM THE ZIP, NOT FROM THE PARSER. Counting our
 * own output against our own output proves nothing: if the reader cannot see a
 * picture, a parser-derived "pictures found" is 0 and the file looks empty of
 * them. So every "contains" number here comes from the raw OOXML — `<m:oMath>`,
 * `<a:blip r:embed>`, `<v:imagedata r:id>`, `<w:tblHeader/>` — and the parser is
 * then asked, separately, what it produced. The gap between the two columns is
 * the finding.
 *
 * It is run twice, before and after a change, and the two JSON files differenced.
 * The guard that matters most is the one that must NOT move: list markers and
 * character totals. A fidelity fix that quietly loses text is a regression, and
 * the only way to know is to count the same corpus both times.
 *
 * Run from apps/web:
 *   npx tsx scripts/docx-fidelity-audit.mts <manifest.txt> <out.json> [label]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

import { documentToText } from "../../../packages/shared/src/document-model.ts";
import { extractDocxModel } from "../lib/notebooks/office.ts";

/**
 * Files whose equation text may be printed.
 *
 * 🔴 AN ALLOWLIST, NOT A DENYLIST. The corpus is the owner's real downloads and
 * holds personal records; a sample is a quotation from a private file unless it
 * is named here, so the default is to print nothing.
 */
const QUOTABLE = new Set([
  "Equations.docx",
  "PHCY 1202 Other Equation Sheet.docx",
  "In-Class 9_Dilution and Concentration_2025_BLANK.docx",
]);

const count = (xml: string, re: RegExp): number => (xml.match(re) ?? []).length;

/** Rows Word MARKED as repeating headers, read straight out of the XML. */
function markedHeaderRows(xml: string): number {
  let n = 0;
  for (const m of xml.matchAll(/<w:trPr>([\s\S]*?)<\/w:trPr>/g)) {
    const props = m[1] ?? "";
    const tag = props.match(/<w:tblHeader\b[^>]*>/)?.[0];
    if (!tag) continue;
    if (/w:val="(?:false|0|off)"/.test(tag)) continue;
    n += 1;
  }
  return n;
}

/** Equations that sit inside a numbered paragraph — the precedence case. */
function mathInsideNumbering(xml: string): number {
  let n = 0;
  for (const p of xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    const para = p[0];
    if (!/<w:numPr>/.test(para)) continue;
    n += count(para, /<m:oMath[\s>]/g);
  }
  return n;
}

interface Row {
  name: string;
  error?: string;
  /** What the file contains, read from the zip. */
  raw: Record<string, number>;
  /** What our reader produced. */
  got: Record<string, number>;
  samples?: string[];
}

function main(): void {
  const manifest = process.argv[2];
  const outPath = process.argv[3];
  const label = process.argv[4] ?? "run";
  if (!manifest || !outPath) throw new Error("usage: docx-fidelity-audit.mts <manifest> <out.json> [label]");

  const files = readFileSync(manifest, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.toLowerCase().endsWith(".docx"));

  const rows: Row[] = [];
  for (const file of files) {
    const name = file.split("/").pop() ?? file;
    try {
      const bytes = new Uint8Array(readFileSync(file));
      const zip = unzipSync(bytes);
      const docBytes = zip["word/document.xml"];
      if (!docBytes) throw new Error("no word/document.xml");
      const xml = strFromU8(docBytes);
      const relsBytes = zip["word/_rels/document.xml.rels"];
      const rels = relsBytes ? strFromU8(relsBytes) : "";

      const raw = {
        // Equations
        omath: count(xml, /<m:oMath[\s>]/g),
        omathInNumbering: mathInsideNumbering(xml),
        fractions: count(xml, /<m:f>/g),
        subscripts: count(xml, /<m:sSub>/g),
        superscripts: count(xml, /<m:sSup>/g),
        subsups: count(xml, /<m:sSubSup>/g),
        radicals: count(xml, /<m:rad>/g),
        delimiters: count(xml, /<m:d>/g),
        naries: count(xml, /<m:nary>/g),
        // Pictures. A `<w:drawing>` is NOT a picture — 160 of the corpus's 300 hold
        // a chart, SmartArt or a shape. A placed picture is a blip or a VML ref.
        drawings: count(xml, /<w:drawing>/g),
        blips: count(xml, /<a:blip\b[^>]*r:embed="/g),
        vmlImages: count(xml, /<v:imagedata\b[^>]*r:id="/g),
        mediaParts: Object.keys(zip).filter((k) => /^word\/media\//.test(k)).length,
        imageRels: count(rels, /Type="[^"]*\/image"/g),
        // Tables
        markedHeaderRows: markedHeaderRows(xml),
        tblLookFirstRow: (xml.match(/<w:tblLook\b[^>]*>/g) ?? []).filter(
          (t) => /w:firstRow="(?:1|true|on)"/.test(t) || /w:val="0[04]A0"/i.test(t),
        ).length,
        tables: count(xml, /<w:tbl>/g),
      };

      const model = extractDocxModel(bytes);
      const by = (kind: string) => model.blocks.filter((b) => b.kind === kind);
      const tables = by("table");
      const listItems = by("listItem");
      const figures = by("figure");
      const got = {
        blocks: model.blocks.length,
        equations: by("equation").length,
        figures: figures.length,
        figuresWithRef: figures.filter((b) => b.figure?.ref).length,
        headings: by("heading").length,
        listItems: listItems.length,
        listMarkers: listItems.filter((b) => b.marker).length,
        tables: tables.length,
        tableCells: tables.reduce((n, b) => n + (b.table?.rows ?? []).reduce((m, r) => m + r.length, 0), 0),
        tableHeaderCells: tables.reduce((n, b) => n + (b.table?.rows[0]?.length ?? 0) * (b.table?.headerRows ?? 0), 0),
        tableHeaderRows: tables.reduce((n, b) => n + (b.table?.headerRows ?? 0), 0),
        // Two different characters-delivered numbers, and they answer different
        // questions. `blockTextChars` is the sum of the blocks' own text and
        // EXCLUDES tables (a table's text is derived from its grid, not stored).
        // `renderedChars` is what a model actually receives.
        blockTextChars: model.blocks.reduce((n, b) => n + b.text.length, 0),
        renderedChars: documentToText(model).length,
      };

      const row: Row = { got, name, raw };
      if (QUOTABLE.has(name)) {
        row.samples = by("equation").map((b) => b.text).slice(0, 12);
      }
      rows.push(row);
    } catch (err) {
      rows.push({
        error: String(err instanceof Error ? err.message : err).slice(0, 200),
        got: {},
        name,
        raw: {},
      });
    }
  }

  const sum = (side: "raw" | "got", key: string) => rows.reduce((n, r) => n + (r[side][key] ?? 0), 0);
  const filesWith = (side: "raw" | "got", key: string) => rows.filter((r) => (r[side][key] ?? 0) > 0).length;
  const rawKeys = [...new Set(rows.flatMap((r) => Object.keys(r.raw)))];
  const gotKeys = [...new Set(rows.flatMap((r) => Object.keys(r.got)))];

  const totals = {
    got: Object.fromEntries(gotKeys.map((k) => [k, sum("got", k)])),
    raw: Object.fromEntries(rawKeys.map((k) => [k, sum("raw", k)])),
  };
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        failures: rows.filter((r) => r.error).map((r) => ({ error: r.error, name: r.name })),
        filesWith: {
          got: Object.fromEntries(gotKeys.map((k) => [k, filesWith("got", k)])),
          raw: Object.fromEntries(rawKeys.map((k) => [k, filesWith("raw", k)])),
        },
        fileCount: rows.length,
        label,
        rows,
        totals,
      },
      null,
      2,
    ),
  );

  const out: string[] = [`${label}: ${rows.length} docx, ${rows.filter((r) => r.error).length} failed`, ""];
  out.push("CONTAINS (read from the zip)");
  for (const k of rawKeys) out.push(`  ${k.padEnd(20)} ${String(totals.raw[k]).padStart(8)}  in ${filesWith("raw", k)} files`);
  out.push("", "DELIVERED (read from our model)");
  for (const k of gotKeys) out.push(`  ${k.padEnd(20)} ${String(totals.got[k]).padStart(8)}  in ${filesWith("got", k)} files`);
  const samples = rows.filter((r) => r.samples?.length);
  if (samples.length) {
    out.push("", "EQUATION SAMPLES (allowlisted academic files only)");
    for (const r of samples) {
      out.push(`  ${r.name}`);
      for (const s of r.samples ?? []) out.push(`    ${s}`);
    }
  }
  process.stdout.write(`${out.join("\n")}\n`);
}

main();
