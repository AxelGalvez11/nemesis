/**
 * The PDF corpus the routing decision is calibrated on.
 *
 * 🔴 GENERATED, FOR THE REASON `make-degradation-pdfs.mjs` IS GENERATED. The real documents that
 * exhibit these shapes are the owner's own coursework and third-party benchmark files, and neither
 * belongs in this repository. What matters for a ROUTING decision is structural and reproducible
 * from first principles: how dense a page's text is, whether its glyphs decode, whether its tables
 * are ruled, whether its content is pixels.
 *
 * 🔴 WHAT IT SIMULATES, STATED PLAINLY, BECAUSE A FIXTURE THAT OVERSTATES ITSELF IS WORSE THAN NO
 * FIXTURE. `preflightPdf` consumes EXTRACTED TEXT. A broken ligature font and a file whose author
 * typed `ac1on` produce byte-identical extracted text, so a fixture that writes the corrupted
 * spelling reproduces the router's input exactly — it does not reproduce the CAUSE, and nothing
 * here claims to. The private-use and replacement-character classes cannot be written with the
 * standard fonts pdf-lib embeds; those are covered in `lib/pdf/preflight.test.ts`, where the
 * extracted text is supplied directly and the boundary can be pinned from both sides.
 *
 *   node scripts/make-preflight-corpus.mjs lib/notebooks/fixtures/preflight
 *
 * Writes one PDF per class the owner named:
 *
 *   clean-lecture.pdf      12 pages of ordinary prose. The case that must never pay a vendor.
 *   dense-textbook.pdf     6 pages of heavy prose. Same verdict, much more text.
 *   broken-font.pdf        8 pages whose words carry the digit-inside-word scar.
 *   scanned.pdf            5 pages that are pictures, with no text layer at all.
 *   mixed-scan.pdf         10 pages, 3 of them pictures inside an otherwise readable document.
 *   ruled-tables.pdf       4 pages of ruled grids that the deterministic lattice recovers.
 *   diagram-heavy.pdf      6 pages, each with a large figure beside real prose.
 *   thin-divider.pdf       6 pages where 2 are section dividers with a handful of words.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const outDir = process.argv[2] ?? "lib/notebooks/fixtures/preflight";
mkdirSync(outDir, { recursive: true });

const W = 612;
const H = 792;

/**
 * Field-agnostic filler prose.
 *
 * 🔴 NO SUBJECT MATTER, ON PURPOSE. The router must behave the same on a statute, a stress-strain
 * derivation and a drug chart, so calibrating it on sentences from any one field would let a
 * subject-specific accident look like a threshold. These sentences are about documents.
 */
const SENTENCES = [
  "A document states what it contains before anything reads it.",
  "The structure of a page is separate from the words printed on it.",
  "Every locator must point at something that existed before the parse began.",
  "Where a figure sits is a fact about the page and not about its meaning.",
  "A measurement recorded without its method is a number nobody can check.",
  "Two readers of the same file should not disagree about how many pages it has.",
  "Content that was seen and not converted is a gap, not an absence.",
  "The cheapest correct answer is still the correct answer.",
  "A threshold chosen before the data is a preference wearing a number.",
  "Reading order is a claim about intent and should be labelled as one.",
  "An identifier that repeats is an identifier that cannot be trusted.",
  "What survives persistence is the only thing a later question can ask about.",
];

/** Turn a sentence into its broken-ligature spelling: `ti` inside a word becomes `1`. */
function scar(text) {
  return text.replace(/(\p{L})ti(\p{L})/gu, "$11$2");
}

function paragraphFor(page, line) {
  const pick = (n) => SENTENCES[(page * 7 + line * 3 + n) % SENTENCES.length];
  return `${pick(0)} ${pick(1)}`;
}

/** A small raster, so a "scanned" page carries pixels and no glyphs. */
async function greyPng(doc, w, h, seed) {
  // A minimal PNG built by hand would need a zlib stream; pdf-lib wants real PNG bytes, so this
  // uses the one encoder every Node has: a solid-colour bitmap through a tiny hand-rolled PNG.
  const { deflateSync } = await import("node:zlib");
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * (w * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x += 1) {
      // Bands of ink, so the page looks like a photographed sheet rather than a flat rectangle.
      const ink = (y + seed) % 17 < 6 && (x + seed) % 23 > 3 ? 40 : 235;
      const i = rowStart + 1 + x * 3;
      raw[i] = ink;
      raw[i + 1] = ink;
      raw[i + 2] = ink;
    }
  }
  const crcTable = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  const crc = (buf) => {
    let c = -1;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return await doc.embedPng(png);
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { bold, doc, font };
}

function prose(page, font, { pageNumber, lines = 30, transform = (s) => s, top = H - 72 }) {
  page.drawText(transform(`Section ${pageNumber + 1}`), {
    font,
    size: 14,
    x: 72,
    y: top,
  });
  for (let line = 0; line < lines; line += 1) {
    page.drawText(transform(paragraphFor(pageNumber, line)), {
      font,
      size: 10,
      x: 72,
      y: top - 24 - line * 14,
    });
  }
}

async function cleanLecture() {
  const { doc, font } = await newDoc();
  for (let n = 0; n < 12; n += 1) prose(doc.addPage([W, H]), font, { pageNumber: n });
  return await doc.save();
}

async function denseTextbook() {
  const { doc, font } = await newDoc();
  for (let n = 0; n < 6; n += 1) prose(doc.addPage([W, H]), font, { lines: 46, pageNumber: n });
  return await doc.save();
}

async function brokenFont() {
  const { doc, font } = await newDoc();
  for (let n = 0; n < 8; n += 1) prose(doc.addPage([W, H]), font, { pageNumber: n, transform: scar });
  return await doc.save();
}

async function scanned() {
  const { doc } = await newDoc();
  for (let n = 0; n < 5; n += 1) {
    const page = doc.addPage([W, H]);
    const image = await greyPng(doc, 160, 200, n);
    page.drawImage(image, { height: H - 96, width: W - 96, x: 48, y: 48 });
  }
  return await doc.save();
}

async function mixedScan() {
  const { doc, font } = await newDoc();
  const scannedPages = new Set([3, 4, 7]);
  for (let n = 0; n < 10; n += 1) {
    const page = doc.addPage([W, H]);
    if (scannedPages.has(n)) {
      const image = await greyPng(doc, 160, 200, n);
      page.drawImage(image, { height: H - 96, width: W - 96, x: 48, y: 48 });
      continue;
    }
    prose(page, font, { pageNumber: n });
  }
  return await doc.save();
}

async function ruledTables() {
  const { doc, font } = await newDoc();
  for (let n = 0; n < 4; n += 1) {
    const page = doc.addPage([W, H]);
    page.drawText(`Table ${n + 1}`, { font, size: 14, x: 72, y: H - 72 });
    const cols = [72, 220, 380, 540];
    const rows = 9;
    const top = H - 110;
    const rowHeight = 26;
    const bottom = top - rows * rowHeight;
    for (let r = 0; r <= rows; r += 1) {
      const y = top - r * rowHeight;
      page.drawLine({
        color: rgb(0, 0, 0),
        end: { x: cols[cols.length - 1], y },
        start: { x: cols[0], y },
        thickness: 0.8,
      });
    }
    for (const x of cols) {
      page.drawLine({ color: rgb(0, 0, 0), end: { x, y: bottom }, start: { x, y: top }, thickness: 0.8 });
    }
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols.length - 1; c += 1) {
        page.drawText(r === 0 ? `Column ${c + 1}` : `Value ${n + 1}-${r}-${c + 1}`, {
          font,
          size: 9,
          x: cols[c] + 6,
          y: top - r * rowHeight - 17,
        });
      }
    }
    // Prose underneath, so the page is not table-only and the lattice has to bound itself.
    for (let line = 0; line < 6; line += 1) {
      page.drawText(paragraphFor(n, line), { font, size: 10, x: 72, y: bottom - 24 - line * 14 });
    }
  }
  return await doc.save();
}

async function diagramHeavy() {
  const { doc, font } = await newDoc();
  for (let n = 0; n < 6; n += 1) {
    const page = doc.addPage([W, H]);
    prose(page, font, { lines: 8, pageNumber: n });
    const image = await greyPng(doc, 120, 90, n + 3);
    page.drawImage(image, { height: 320, width: 420, x: 96, y: 120 });
  }
  return await doc.save();
}

async function thinDivider() {
  const { doc, font } = await newDoc();
  const dividers = new Set([2, 5]);
  for (let n = 0; n < 6; n += 1) {
    const page = doc.addPage([W, H]);
    if (dividers.has(n)) {
      page.drawText(`Part ${n}`, { font, size: 28, x: 220, y: H / 2 });
      continue;
    }
    prose(page, font, { pageNumber: n });
  }
  return await doc.save();
}

const BUILDERS = {
  "broken-font.pdf": brokenFont,
  "clean-lecture.pdf": cleanLecture,
  "dense-textbook.pdf": denseTextbook,
  "diagram-heavy.pdf": diagramHeavy,
  "mixed-scan.pdf": mixedScan,
  "ruled-tables.pdf": ruledTables,
  "scanned.pdf": scanned,
  "thin-divider.pdf": thinDivider,
};

for (const [name, build] of Object.entries(BUILDERS)) {
  const bytes = await build();
  writeFileSync(join(outDir, name), bytes);
  console.log(`${name}\t${bytes.length} bytes`);
}
