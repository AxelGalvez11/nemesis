/**
 * Two PDF fixtures the degradation characterization needs and the tree lacks.
 *
 * 🔴 GENERATED, FOR THE SAME REASON `make-image-only-pdf.mjs` IS. The real
 * documents that exhibit these shapes are third-party benchmark PDFs or the
 * owner's own records, and neither belongs in this repository. What matters here
 * is structural and reproducible from first principles: where glyphs sit on a
 * page, and whether a page also draws an image.
 *
 *   node scripts/make-degradation-pdfs.mjs lib/notebooks/fixtures
 *
 * Writes:
 *   text-with-figure.pdf  a page with REAL TEXT and a picture nobody described —
 *                         the case where content is recovered and a figure is
 *                         found, located, and deliberately not examined.
 *   two-column.pdf        two columns of text, which the reading-order repair
 *                         has to interleave correctly or the sentences fragment.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "lib/notebooks/fixtures";
mkdirSync(outDir, { recursive: true });

const PAGE_W = 612;
const PAGE_H = 792;

/** A small raw-RGB picture, stretched by the `cm` matrix so it is not decorative. */
function picture() {
  const W = 48;
  const H = 64;
  const pixels = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      const v = Math.round((255 * (x + y)) / (W + H));
      pixels[i] = v;
      pixels[i + 1] = y > H / 3 && y < (2 * H) / 3 ? 40 : 255 - v;
      pixels[i + 2] = 200 - Math.round(v / 2);
    }
  }
  return { H, W, pixels };
}

/** PDF string escaping — a stray paren would corrupt the content stream. */
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** One line of text at an absolute position, 11pt Helvetica. */
const line = (x, y, text) => `BT /F1 11 Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET\n`;

function build(out, { objects, note }) {
  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [];
  let at = chunks[0].length;

  objects.forEach((object, index) => {
    const parts = [Buffer.from(`${index + 1} 0 obj\n`, "latin1")];
    if (typeof object === "string") {
      parts.push(Buffer.from(`${object}\nendobj\n`, "latin1"));
    } else {
      parts.push(
        Buffer.from(`${object.dict}\nstream\n`, "latin1"),
        object.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      );
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
  writeFileSync(out, bytes);
  console.log(`wrote ${out} — ${bytes.length} bytes, ${note}`);
}

// ── 1. text AND a figure nobody looked at ──────────────────────────────────
// 🔴 THE CASE WHERE "PARTIAL" IS ABOUT A PICTURE, NOT ABOUT WORDS. Every line of
// text is recovered; a real figure is found and located and never described.
// Whether that counts as degraded depends entirely on what a consumer wants,
// which is the distinction this fixture exists to make visible.
{
  const { H, W, pixels } = picture();
  let content = "";
  content += line(72, 720, "Structural Geology of the Eastern Range");
  content += line(72, 690, "The exposed strata record three distinct depositional periods,");
  content += line(72, 674, "each separated by an unconformity visible in the field.");
  content += line(72, 658, "Figure 1 shows the type section measured at the north face.");
  // The picture occupies the middle of the page, large enough not to be furniture.
  content += `q 300 0 0 260 156 340 cm /Im0 Do Q\n`;
  content += line(72, 300, "Bed thicknesses were measured with a Jacob staff at one metre");
  content += line(72, 284, "intervals; the lower contact is sharp and locally erosional.");
  const stream = Buffer.from(content, "latin1");
  build(join(outDir, "text-with-figure.pdf"), {
    note: "1 page, 6 text lines, 1 figure (never described)",
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 4 0 R >> /XObject << /Im0 5 0 R >> >> /Contents 6 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      {
        dict:
          `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>`,
        stream: pixels,
      },
      { dict: `<< /Length ${stream.length} >>`, stream },
    ],
  });
}

// ── 2. two columns ─────────────────────────────────────────────────────────
// 🔴 READING ORDER IS THE WHOLE POINT. The glyphs are emitted LEFT COLUMN FIRST
// then right, but a naive top-to-bottom sweep interleaves them and produces
// sentences that are individually well-formed and collectively nonsense — the
// "fragmented sentences" failure, reproducible without a third-party file.
{
  const left = [
    "Sediment transport begins when the",
    "bed shear stress exceeds the critical",
    "value for the grain size present. Below",
    "that threshold the bed is immobile and",
    "no net transport occurs at any depth.",
  ];
  const right = [
    "Suspension becomes dominant once the",
    "shear velocity approaches the settling",
    "velocity of the particle. The transition",
    "is gradual and depends on turbulence",
    "intensity near the bed as well as size.",
  ];
  let content = "";
  content += line(72, 720, "Chapter 4: Transport Regimes");
  left.forEach((text, i) => (content += line(72, 660 - i * 16, text)));
  right.forEach((text, i) => (content += line(330, 660 - i * 16, text)));
  const stream = Buffer.from(content, "latin1");
  build(join(outDir, "two-column.pdf"), {
    note: "1 page, 2 columns x 5 lines, 1 heading",
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      { dict: `<< /Length ${stream.length} >>`, stream },
    ],
  });
}
