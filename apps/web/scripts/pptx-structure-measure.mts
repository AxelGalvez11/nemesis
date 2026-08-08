/**
 * What the PPTX structure work recovered, and what it cost — on real decks.
 *
 * 🔴 THE REGRESSION GATE IS A CHARACTER MULTISET, NOT A TOTAL. "Total characters
 * did not fall" is satisfied by a run that drops a table cell and gains a pipe.
 * So the deck's flat text is reduced to its CONTENT characters — everything that
 * is not markdown scaffolding — and the before/after multisets are compared per
 * deck. A cell that vanished shows up as a missing letter, wherever it went.
 *
 * The three parts nothing in this change touches — speaker notes, chart text and
 * SmartArt text — are compared BYTE FOR BYTE instead, because for them anything
 * other than equality is a bug rather than a reshaping.
 *
 * Run from apps/web:
 *   npx tsx scripts/pptx-structure-measure.mts <manifest.txt> <out.json>
 *   npx tsx scripts/pptx-structure-measure.mts --diff <before.json> <after.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { documentToText } from "../../../packages/shared/src/document-model.ts";
import { readPptxSlides, pptxTextWithFigures } from "../lib/notebooks/office.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";

/** Everything that is markdown scaffolding rather than the deck's own words.
 *  Stripped from BOTH sides identically, so a bullet becoming a grid cell is not
 *  counted as a change while a lost word still is. */
const SCAFFOLD = /[|\-#*_>\s]/g;

function contentHistogram(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of text.replace(SCAFFOLD, "")) out[ch] = (out[ch] ?? 0) + 1;
  return out;
}

/** Every bracketed block from a path this change does not touch. Exact strings. */
function bracketed(text: string, label: string): string[] {
  const out: string[] = [];
  const open = `[${label}: `;
  let at = text.indexOf(open);
  while (at >= 0) {
    // These blocks run to the end of the slide's part, and speaker notes contain
    // newlines, so the terminator is the closing bracket at the end of a line.
    const end = text.indexOf("]\n", at);
    out.push(text.slice(at, end < 0 ? text.length : end + 1));
    at = text.indexOf(open, at + 1);
  }
  return out;
}

interface Row {
  name: string;
  ok: boolean;
  error?: string;
  slides: number;
  flatChars: number;
  modelChars: number;
  blocks: number;
  tables: number;
  tableCells: number;
  tableHeaderCells: number;
  blocksWithRect: number;
  figures: number;
  figuresWithRect: number;
  /** Figure blocks when every planned picture has a (synthetic) description. */
  figuresAll: number;
  figuresAllWithRect: number;
  /** The same count with the structure withheld — the pre-change shaping. */
  figuresNoStructure: number;
  figuresNoStructureWithRect: number;
  unitsWithSize: number;
  linesLostVsFlat: number;
  content: Record<string, number>;
  notes: string[];
  charts: string[];
  diagrams: string[];
}

function measure(files: string[]): Row[] {
  const rows: Row[] = [];
  for (const file of files) {
    const name = file.split("/").pop() ?? file;
    try {
      const bytes = new Uint8Array(readFileSync(file));
      const deck = readPptxSlides(bytes);
      // No descriptions: this measures the SHAPING, not the vision provider.
      const flat = pptxTextWithFigures(deck, new Map());
      // 🔴 ONE SCRIPT, BOTH RUNS. `structure` does not exist on the deck before
      // this change and does exist after; reading it defensively and casting is
      // what lets the SAME file produce the before and the after numbers, so a
      // difference cannot be an artefact of a differently-written measurement.
      const input = {
        deckTitle: deck.deckTitle,
        images: deck.media.images,
        slides: deck.slides,
        slideTitles: deck.slideTitles,
        structure: (deck as { structure?: unknown }).structure,
      } as unknown as Parameters<typeof pptxToModel>[0];
      const model = pptxToModel(input, new Map());
      const modelText = documentToText(model);

      // 🔴 SYNTHETIC DESCRIPTIONS, NEVER A VISION CALL. Whether a figure block
      // can carry the box of the picture it describes is a question about the
      // plumbing, and the plumbing does not care what the sentence says. Asking
      // a provider for 698 real descriptions to answer it would be the most
      // expensive number in this repo.
      const pretend = new Map(deck.media.images.map((i) => [i.name, "a placeholder description"]));
      const withFigures = pptxToModel(input, pretend).blocks.filter((b) => b.kind === "figure");
      // 🔴 THE CONTROL. Withholding the structure is exactly the model the old
      // code built — it had none — so this is what the figure count WAS. Stated
      // as a measurement rather than as "it should be unchanged", because the
      // before file predates this column and a missing field reads as zero.
      const withheld = pptxToModel({ ...input, structure: undefined }, pretend)
        .blocks.filter((b) => b.kind === "figure");

      const tables = model.blocks.filter((b) => b.kind === "table");
      const figures = model.blocks.filter((b) => b.kind === "figure");
      let tableCells = 0;
      let tableHeaderCells = 0;
      for (const b of tables) {
        const t = b.table;
        if (!t) continue;
        tableCells += t.rows.reduce((n, r) => n + r.length, 0);
        tableHeaderCells += (t.rows[0]?.length ?? 0) * t.headerRows;
      }

      // Line-for-line, the same bar phase3-pptx-check.mts holds the model to.
      const present = new Set(modelText.split("\n").map((l) => l.trim()).filter(Boolean));
      const lost = flat.text.split("\n").map((l) => l.trim()).filter((l) => l && !present.has(l));

      rows.push({
        blocks: model.blocks.length,
        blocksWithRect: model.blocks.filter((b) => b.rect).length,
        charts: bracketed(flat.text, "Chart"),
        content: contentHistogram(flat.text),
        diagrams: bracketed(flat.text, "Diagram"),
        figures: figures.length,
        figuresAll: withFigures.length,
        figuresAllWithRect: withFigures.filter((b) => b.rect).length,
        figuresNoStructure: withheld.length,
        figuresNoStructureWithRect: withheld.filter((b) => b.rect).length,
        figuresWithRect: figures.filter((b) => b.rect).length,
        flatChars: flat.text.length,
        linesLostVsFlat: lost.length,
        modelChars: modelText.length,
        name,
        notes: bracketed(flat.text, "Speaker notes"),
        ok: true,
        slides: model.units.length,
        tableCells,
        tableHeaderCells,
        tables: tables.length,
        unitsWithSize: model.units.filter((u) => u.size).length,
      });
    } catch (error) {
      rows.push({
        blocks: 0, blocksWithRect: 0, charts: [], content: {}, diagrams: [],
        error: (error as Error).message.slice(0, 200), figures: 0, figuresAll: 0,
        figuresAllWithRect: 0, figuresNoStructure: 0, figuresNoStructureWithRect: 0,
        figuresWithRect: 0,
        flatChars: 0, linesLostVsFlat: 0, modelChars: 0, name, notes: [], ok: false,
        slides: 0, tableCells: 0, tableHeaderCells: 0, tables: 0, unitsWithSize: 0,
      });
    }
  }
  return rows;
}

function sum(rows: Row[], key: keyof Row): number {
  return rows.reduce((n, r) => n + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
}

function diff(beforePath: string, afterPath: string): void {
  const before: Row[] = JSON.parse(readFileSync(beforePath, "utf8"));
  const after: Row[] = JSON.parse(readFileSync(afterPath, "utf8"));
  const byName = new Map(before.map((r) => [r.name, r]));

  const regressions: string[] = [];
  for (const a of after) {
    const b = byName.get(a.name);
    if (!b) { regressions.push(`${a.name}: not in the before run`); continue; }
    if (b.ok && !a.ok) { regressions.push(`${a.name}: now fails — ${a.error}`); continue; }
    if (!b.ok) continue;

    // 🔴 PER DECK, NEVER AVERAGED. One deck losing a cell is a regression even if
    // the corpus total goes up.
    for (const [ch, n] of Object.entries(b.content)) {
      const got = a.content[ch] ?? 0;
      if (got < n) regressions.push(`${a.name}: content char ${JSON.stringify(ch)} ${n} → ${got}`);
    }
    const exact = (label: string, x: string[], y: string[]) => {
      if (x.length !== y.length) regressions.push(`${a.name}: ${label} blocks ${x.length} → ${y.length}`);
      else for (let i = 0; i < x.length; i += 1) {
        if (x[i] !== y[i]) { regressions.push(`${a.name}: ${label} block ${i} changed`); break; }
      }
    };
    exact("speaker-notes", b.notes, a.notes);
    exact("chart", b.charts, a.charts);
    exact("SmartArt", b.diagrams, a.diagrams);
    if (a.flatChars < b.flatChars) regressions.push(`${a.name}: flat chars ${b.flatChars} → ${a.flatChars}`);
    if (a.linesLostVsFlat > b.linesLostVsFlat) {
      regressions.push(`${a.name}: model now misses ${a.linesLostVsFlat} rendered lines (was ${b.linesLostVsFlat})`);
    }
  }

  const noteChars = (rows: Row[]) => rows.reduce((n, r) => n + r.notes.join("").length, 0);
  const chartChars = (rows: Row[]) => rows.reduce((n, r) => n + r.charts.join("").length + r.diagrams.join("").length, 0);
  const line = (label: string, b: number, a: number) =>
    `  ${label.padEnd(26)} ${String(b).padStart(9)} → ${String(a).padStart(9)}  ${a === b ? "same" : a > b ? `+${a - b}` : `${a - b}`}`;

  console.log(`
DECKS   ${after.length} (${after.filter((r) => r.ok).length} read)

${line("table blocks", sum(before, "tables"), sum(after, "tables"))}
${line("table cells", sum(before, "tableCells"), sum(after, "tableCells"))}
${line("table header cells", sum(before, "tableHeaderCells"), sum(after, "tableHeaderCells"))}
${line("blocks carrying a rect", sum(before, "blocksWithRect"), sum(after, "blocksWithRect"))}
${line("figure blocks (synthetic)", sum(after, "figuresNoStructure"), sum(after, "figuresAll"))}
${line("…of those, with a rect", sum(after, "figuresNoStructureWithRect"), sum(after, "figuresAllWithRect"))}
${line("units carrying a size", sum(before, "unitsWithSize"), sum(after, "unitsWithSize"))}
${line("blocks", sum(before, "blocks"), sum(after, "blocks"))}
${line("flat text chars", sum(before, "flatChars"), sum(after, "flatChars"))}
${line("model text chars", sum(before, "modelChars"), sum(after, "modelChars"))}
${line("speaker-note chars", noteChars(before), noteChars(after))}
${line("chart+SmartArt chars", chartChars(before), chartChars(after))}
${line("rendered lines model lost", sum(before, "linesLostVsFlat"), sum(after, "linesLostVsFlat"))}

REGRESSIONS  ${regressions.length}`);
  for (const r of regressions.slice(0, 40)) console.log(`  ! ${r}`);

  console.log(`\nPER DECK (tables · cells · rects · flat chars)`);
  for (const a of after) {
    const b = byName.get(a.name)!;
    const d = a.flatChars - b.flatChars;
    console.log(
      `  ${(b.tables + "→" + a.tables).padStart(7)} ${(b.tableCells + "→" + a.tableCells).padStart(9)} ` +
      `${(b.blocksWithRect + "→" + a.blocksWithRect).padStart(11)} ${(d >= 0 ? "+" + d : String(d)).padStart(7)}  ${a.name.slice(0, 58)}`,
    );
  }
}

const args = process.argv.slice(2);
if (args[0] === "--diff") {
  diff(args[1]!, args[2]!);
} else {
  const files = readFileSync(args[0]!, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = measure(files);
  writeFileSync(args[1]!, JSON.stringify(rows, null, 1));
  console.log(`${rows.length} decks, ${rows.filter((r) => r.ok).length} read → ${args[1]}`);
}
