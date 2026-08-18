/**
 * The Office corpus the DOCX/PPTX routing decision is calibrated on.
 *
 * 🔴 REAL FILES, WRITTEN BY REAL WRITERS. `pptxgenjs` and `docx` are already dependencies of this
 * app (the export lane uses them), so these fixtures are genuine OOXML produced by libraries that
 * do not know this parser exists — not zips assembled to match what the parser happens to read.
 * A fixture built by the thing it is testing proves nothing.
 *
 *   npx tsx scripts/make-office-corpus.mts lib/notebooks/fixtures/office
 *
 * Writes one file per class the owner named:
 *
 *   plain-lecture.pptx      12 slides of bulleted text. The ordinary deck.
 *   notes-lecture.pptx      10 slides carrying the lecturer's spoken explanation in speaker notes.
 *   diagram-lecture.pptx    8 slides, each with a real picture.
 *   table-lecture.pptx      6 slides of tables.
 *   large-lecture.pptx      60 slides, notes throughout — the shape a real course deck has.
 *   plain-report.docx       headings and prose, no grids and no pictures.
 *   table-report.docx       12 declared tables.
 *   figure-report.docx      prose with four embedded pictures.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "lib/notebooks/fixtures/office";
mkdirSync(outDir, { recursive: true });

const SENTENCES = [
  "A document states what it contains before anything reads it.",
  "The structure of a page is separate from the words printed on it.",
  "Every locator must point at something that existed before the parse began.",
  "A measurement recorded without its method is a number nobody can check.",
  "Content that was seen and not converted is a gap, not an absence.",
  "The cheapest correct answer is still the correct answer.",
];
const line = (n: number) => SENTENCES[n % SENTENCES.length]!;

/** A real PNG, big enough to clear the media filter's glyph floor. */
async function png(width: number, height: number, seed: number): Promise<Buffer> {
  const { deflateSync } = await import("node:zlib");
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      const v = (x * 3 + y * 5 + seed * 17) % 256;
      raw[i] = v;
      raw[i + 1] = 255 - v;
      raw[i + 2] = (v * 2) % 256;
    }
  }
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc = (buf: Buffer) => {
    let c = -1;
    for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function deck(options: {
  slides: number;
  notes?: boolean;
  picture?: boolean;
  table?: boolean;
}): Promise<Buffer> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  for (let n = 0; n < options.slides; n += 1) {
    const slide = pptx.addSlide();
    slide.addText(`Topic ${n + 1}`, { fontSize: 28, x: 0.5, y: 0.3 });
    slide.addText([line(n), line(n + 1), line(n + 2)].map((text) => ({ text, options: { breakLine: true } })), {
      fontSize: 14,
      w: 6,
      x: 0.5,
      y: 1.2,
    });
    if (options.table) {
      slide.addTable(
        [
          [{ text: "Term" }, { text: "Meaning" }],
          [{ text: `Term ${n}A` }, { text: line(n) }],
          [{ text: `Term ${n}B` }, { text: line(n + 3) }],
        ],
        { w: 8, x: 0.5, y: 3.2 },
      );
    }
    if (options.picture) {
      slide.addImage({ data: `image/png;base64,${(await png(240, 180, n)).toString("base64")}`, h: 1.8, w: 2.4, x: 6.8, y: 1.2 });
    }
    if (options.notes) {
      slide.addNotes(
        `${line(n)} ${line(n + 2)} ${line(n + 4)} The point to make here is the one the slide does not print, ` +
          "which is why it is written down as a note rather than shown.",
      );
    }
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

async function report(options: { tables?: number; pictures?: number }): Promise<Buffer> {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } =
    await import("docx");

  const children: unknown[] = [];
  for (let section = 0; section < 6; section += 1) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: `Section ${section + 1}` }));
    for (let p = 0; p < 4; p += 1) {
      children.push(new Paragraph({ children: [new TextRun(line(section * 4 + p))] }));
    }
    for (let t = 0; t < Math.ceil((options.tables ?? 0) / 6); t += 1) {
      if (children.filter((child) => child instanceof Table).length >= (options.tables ?? 0)) break;
      children.push(
        new Table({
          rows: [0, 1, 2].map(
            (row) =>
              new TableRow({
                children: ["A", "B", "C"].map(
                  (col) => new TableCell({ children: [new Paragraph(row === 0 ? `Header ${col}` : `${col}${row}`)] }),
                ),
              }),
          ),
        }),
      );
      // A table must not be the last element of a section in Word.
      children.push(new Paragraph({ children: [new TextRun(line(section + t))] }));
    }
    if ((options.pictures ?? 0) > section) {
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: await png(300, 220, section),
              transformation: { height: 220, width: 300 },
              type: "png",
            }),
          ],
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children: children as never[] }] });
  return await Packer.toBuffer(doc);
}

const BUILDERS: Record<string, () => Promise<Buffer>> = {
  "diagram-lecture.pptx": () => deck({ picture: true, slides: 8 }),
  "figure-report.docx": () => report({ pictures: 4 }),
  "large-lecture.pptx": () => deck({ notes: true, slides: 60 }),
  "notes-lecture.pptx": () => deck({ notes: true, slides: 10 }),
  "plain-lecture.pptx": () => deck({ slides: 12 }),
  "plain-report.docx": () => report({}),
  "table-lecture.pptx": () => deck({ slides: 6, table: true }),
  "table-report.docx": () => report({ tables: 12 }),
};

for (const [name, build] of Object.entries(BUILDERS)) {
  const bytes = await build();
  writeFileSync(join(outDir, name), bytes);
  console.log(`${name}\t${bytes.length} bytes`);
}
