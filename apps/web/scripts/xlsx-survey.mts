/**
 * What is ACTUALLY inside these workbooks — measured before the parser exists.
 *
 * 🔴 THE FIELDS THE MODEL CARRIES SHOULD BE TRACEABLE TO SOMETHING A REAL FILE
 * DOES. Designing the cell type from a proposal and then finding fixtures that
 * agree with it is the wrong order: it produces a model that describes the
 * proposal. This reads the raw sheet XML and reports only what is there.
 *
 * Deliberately NOT a parser. No DocumentModel, no interpretation — counts and
 * examples, so the design argument can be made from evidence.
 *
 *   npx tsx scripts/xlsx-survey.mts lib/notebooks/fixtures/xlsx
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";

const dir = process.argv[2] ?? "lib/notebooks/fixtures/xlsx";

/** Every occurrence of a tag, with its attributes and inner text. */
function tags(xml: string, name: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = [];
  const re = new RegExp(`<${name}(\\s[^>]*?)?(/>|>([\\s\\S]*?)</${name}>)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push({ attrs: m[1] ?? "", inner: m[3] ?? "" });
  return out;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1]! : null;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".xlsx")).sort()) {
  const zip = unzipSync(new Uint8Array(readFileSync(join(dir, file))));
  const entries = Object.keys(zip).sort();
  console.log(`\n${"═".repeat(74)}\n${file}\n${"═".repeat(74)}`);

  // Which parts exist at all — this is what tells us whether a feature is even
  // exposed in a tool-generated file.
  const notable = entries.filter((e) => /sharedStrings|tables\/|workbook\.xml$|styles|calcChain/.test(e));
  console.log(`  parts: ${notable.join(", ") || "(none notable)"}`);

  const workbook = zip["xl/workbook.xml"] ? strFromU8(zip["xl/workbook.xml"]!) : "";
  const sheets = tags(workbook, "sheet").map((s) => ({
    name: attr(s.attrs, "name"),
    state: attr(s.attrs, "state") ?? "visible",
  }));
  console.log(`  sheets: ${sheets.map((s) => `${s.name}${s.state !== "visible" ? ` [${s.state}]` : ""}`).join(" | ")}`);

  const sharedCount = zip["xl/sharedStrings.xml"] ? tags(strFromU8(zip["xl/sharedStrings.xml"]!), "si").length : 0;
  console.log(`  sharedStrings: ${sharedCount}`);

  for (const part of entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e))) {
    const xml = strFromU8(zip[part]!);
    const cells = tags(xml, "c");
    let withF = 0, withV = 0, withBoth = 0, withNeither = 0, inline = 0;
    const disagreements: string[] = [];
    for (const cell of cells) {
      const hasF = /<f[ >/]/.test(cell.inner);
      const hasV = /<v>/.test(cell.inner);
      if (/<is>/.test(cell.inner)) inline += 1;
      if (hasF && hasV) withBoth += 1;
      else if (hasF) withF += 1;
      else if (hasV) withV += 1;
      else withNeither += 1;
      if (hasF && hasV && disagreements.length < 3) {
        const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cell.inner)?.[1] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(cell.inner)?.[1] ?? "";
        disagreements.push(`${attr(cell.attrs, "r")}: =${f} cached ${v}`);
      }
    }
    const dimension = tags(xml, "dimension")[0];
    const merges = tags(xml, "mergeCell").map((m) => attr(m.attrs, "ref"));
    const hiddenRows = tags(xml, "row").filter((r) => attr(r.attrs, "hidden") === "1").map((r) => attr(r.attrs, "r"));
    const hiddenCols = tags(xml, "col").filter((c) => attr(c.attrs, "hidden") === "1")
      .map((c) => `${attr(c.attrs, "min")}-${attr(c.attrs, "max")}`);
    const tableParts = tags(xml, "tablePart").length;

    console.log(`  ── ${part.replace("xl/worksheets/", "")}`);
    console.log(`     dimension=${dimension ? attr(dimension.attrs, "ref") : "(none)"}   cells=${cells.length}`);
    console.log(`     formula-only=${withF}  value-only=${withV}  BOTH=${withBoth}  neither=${withNeither}  inlineStr=${inline}`);
    if (merges.length) console.log(`     merges: ${merges.join(", ")}`);
    if (hiddenRows.length) console.log(`     hidden rows: ${hiddenRows.join(", ")}`);
    if (hiddenCols.length) console.log(`     hidden cols (min-max): ${hiddenCols.join(", ")}`);
    if (tableParts) console.log(`     tableParts: ${tableParts}`);
    for (const d of disagreements) console.log(`     e.g. ${d}`);
  }

  for (const part of entries.filter((e) => e.startsWith("xl/tables/"))) {
    const t = tags(strFromU8(zip[part]!), "table")[0];
    if (t) console.log(`  TABLE ${attr(t.attrs, "displayName")} ref=${attr(t.attrs, "ref")} headerRow=${attr(t.attrs, "headerRowCount") ?? "1"}`);
  }
}
