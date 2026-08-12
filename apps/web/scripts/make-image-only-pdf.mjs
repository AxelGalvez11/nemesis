/**
 * Build the image-only PDF fixture: one page, one picture, no text operators.
 *
 * 🔴 GENERATED RATHER THAN COPIED, AND THAT IS A LICENSING DECISION. The eight
 * documents that exposed #486 are third-party benchmark PDFs and the five real
 * ones are the owner's own scanned records — a health form, a CV, an
 * immunisation card. Neither belongs in this repository. What the parser
 * actually reacts to is structural: a content stream that draws an image and
 * emits no glyphs. That is reproducible from first principles, and the bytes
 * below are a genuine PDF read by the real pdf.js.
 *
 * The picture is scaled to fill the page by the `cm` matrix, because a scan
 * fills its page — a thumbnail would be classified decorative and would not
 * exercise the case at all.
 *
 *   node scripts/make-image-only-pdf.mjs lib/notebooks/fixtures/image-only-page.pdf
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] ?? "lib/notebooks/fixtures/image-only-page.pdf";
/**
 * 🔴 THE CALIBRATION FIXTURE. A guard that only ever sees the case it was built
 * for is untested in the direction that matters: `--blank` writes a page with no
 * image and no text, which must still be refused as `empty`. Without it, a rule
 * that returned `no-text` for everything would pass every other assertion here.
 */
const blank = process.argv.includes("--blank");

// A small raw-RGB image. Kept tiny on disk and stretched over the page, so the
// fixture stays a few kilobytes while the figure occupies the full MediaBox.
const W = 48;
const H = 64;
const pixels = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 3;
    // A soft diagonal ramp with a darker band, so the image is not a flat fill.
    const v = Math.round((255 * (x + y)) / (W + H));
    pixels[i] = v;
    pixels[i + 1] = y > H / 3 && y < (2 * H) / 3 ? 40 : 255 - v;
    pixels[i + 2] = 200 - Math.round(v / 2);
  }
}

const PAGE_W = 612;
const PAGE_H = 792;
// 🔴 NOT ONE TEXT-SHOWING OPERATOR. No BT/ET, no Tj, no TJ. This is the whole
// point of the fixture: pdf.js will report zero text items for this page.
const content = Buffer.from(blank ? "\n" : `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q\n`, "latin1");

const objects = blank
  ? [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << >> /Contents 4 0 R >>`,
      { dict: `<< /Length ${content.length} >>`, stream: content },
    ]
  : [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
      { dict: `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>`, stream: pixels },
      { dict: `<< /Length ${content.length} >>`, stream: content },
    ];

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
const offsets = [];
let at = chunks[0].length;

objects.forEach((object, index) => {
  const number = index + 1;
  const parts = [Buffer.from(`${number} 0 obj\n`, "latin1")];
  if (typeof object === "string") {
    parts.push(Buffer.from(`${object}\nendobj\n`, "latin1"));
  } else {
    parts.push(Buffer.from(`${object.dict}\nstream\n`, "latin1"), object.stream, Buffer.from("\nendstream\nendobj\n", "latin1"));
  }
  const body = Buffer.concat(parts);
  offsets.push(at);
  chunks.push(body);
  at += body.length;
});

const xrefAt = at;
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
chunks.push(Buffer.from(xref, "latin1"));

const bytes = Buffer.concat(chunks);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`wrote ${out} — ${bytes.length} bytes, 1 page, ${blank ? "no image" : "1 image"}, 0 text operators`);
