// One design system for the report exporters (PDF / Word / PowerPoint). The web UI themes with CSS
// custom properties in globals.css, which Node-side exporters can't read — so this mirrors the
// light-mode Nemesis brand values as plain, framework-free data. One source of truth so a PDF, a
// .docx, and a .pptx all read as the same product: academic-clean (near-black ink on white paper)
// with the Nemesis crimson accent. PURE data + pure helpers; no I/O, no dependencies.

/**
 * Brand palette. Hex values are stored WITHOUT a leading '#' because docx and pptxgenjs both want
 * bare hex; pdfRgb() converts to pdf-lib's 0..1 channels. Use withHash() when a '#'-prefixed value
 * is needed. Legibility is deliberate: brand crimson is the deep shade (readable as text/rules on
 * white — same contrast-guarded value as the app's light-mode accent); table headers use a
 * near-black fill so reversed white text always clears contrast.
 */
export const EXPORT_COLORS = {
  brand: "a81929", // deep Nemesis crimson — legible as heading text and accent rules on white
  brandBright: "cc1f33", // bright accent crimson (thin rules, ticks) — matches the app's light --acid
  ink: "141414", // primary body text
  inkSoft: "3a3a3a", // secondary text
  muted: "5d5d5d", // meta / captions
  faint: "8f8f8f", // footer credit / least-emphasis text
  hair: "dcdcdc", // hairline table + divider borders
  zebra: "f7f3f3", // alternating evidence-table row (a faint crimson-gray)
  headerFill: "1f1416", // table header background — near-black with a crimson cast; white text is safe on it
  tint: "f6ebec", // faint crimson wash for the cover band / callouts
  warn: "b5760a", // safety amber (matches the poster's --warn token)
  paper: "ffffff",
} as const;

export type ExportColorKey = keyof typeof EXPORT_COLORS;

/**
 * Fonts by role. Names must be ones a reader's Word / PowerPoint already has so the file renders as
 * intended without embedding: Georgia (serif) and Calibri (sans) are near-universal on Windows and
 * macOS. The PDF path can't reference these (no embedding), so pdf.ts maps these roles onto the
 * base-14 PDF fonts (Times / Helvetica), which every PDF viewer ships.
 */
export const EXPORT_FONTS = {
  serif: "Georgia",
  sans: "Calibri",
} as const;

/** Type scale in POINTS. docx consumers double these (docx sizes are half-points); pptx and pdf use
 *  the values as-is. */
export const EXPORT_TYPE = {
  title: 26,
  subtitle: 12,
  h1: 15,
  h2: 11.5,
  body: 10.5,
  small: 9,
  tiny: 8,
} as const;

/** Strip a leading '#', if present. PURE. */
export function hexNoHash(hex: string): string {
  return hex.startsWith("#") ? hex.slice(1) : hex;
}

/** '#'-prefixed form, for the rare consumer that wants it. PURE. */
export function withHash(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

/** Convert a bare hex color to pdf-lib's 0..1 RGB channels: `rgb(...pdfRgb(EXPORT_COLORS.brand))`.
 *  Accepts 3- or 6-digit hex, with or without '#'. PURE. */
export function pdfRgb(hex: string): [number, number, number] {
  const h = hexNoHash(hex);
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
