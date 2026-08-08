import assert from "node:assert/strict";
import { test } from "node:test";

import { nativeTextMap, probePdfNativeText } from "./native-probe";
import { THIN_PAGE_CHARS } from "./pages";

/**
 * A real PDF, built byte by byte, so the probe is exercised through pdf.js
 * rather than through a stub of it. A fixture file would have been easier and
 * would have proved nothing about the parser we actually ship.
 *
 * `pages` is one content-stream text string per page — an empty string means a
 * page with no text operators at all, which is what a scanned page looks like
 * from inside the file.
 */
function buildPdf(pages: readonly { text: string; landscape?: boolean }[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // 1-based object numbers

  // 1 = catalog, 2 = page tree, 3 = font, then two objects per page.
  const firstPageObject = 4;
  const kids = pages.map((_, i) => `${firstPageObject + i * 2} 0 R`).join(" ");
  add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  pages.forEach((page, i) => {
    const contents = firstPageObject + i * 2 + 1;
    const box = page.landscape ? "[0 0 792 612]" : "[0 0 612 792]";
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /Resources << /Font << /F1 3 0 R >> >> /Contents ${contents} 0 R >>`,
    );
    // Wrapped into short lines on purpose: pdf.js drops glyphs drawn past the
    // right edge of the MediaBox, so one 250-character Tj would silently come
    // back as 102 characters and the fixture, not the probe, would be wrong.
    const lines = (page.text.match(/.{1,60}/gs) ?? []).map((line) => `(${line}) Tj 0 -14 Td`);
    const stream = page.text ? `BT /F1 12 Tf 72 720 Td ${lines.join(" ")} ET` : "";
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

/** Comfortably over THIN_PAGE_CHARS, in plain ASCII a PDF string can hold. */
const FULL_PAGE = "the lecture text continues for long enough to clear the floor ".repeat(4);

test("a page with its own words is native; a page with none is not", async () => {
  const probe = await probePdfNativeText(buildPdf([{ text: FULL_PAGE }, { text: "" }]));
  assert.equal(probe.declaredPages, 2);
  assert.deepEqual(probe.pages.map((p) => p.native), [true, false]);
  assert.equal(probe.pages[0]!.index, 0);
  assert.ok(probe.pages[0]!.chars >= THIN_PAGE_CHARS);
  assert.equal(probe.pages[1]!.chars, 0);
});

test("a heading over a screenshot is NOT native — the floor is characters, not zero", async () => {
  // The measured case from the native lane: a page whose whole text layer is
  // one short heading and whose content is inside the picture underneath it.
  const heading = "Breastfeeding Considerations";
  const probe = await probePdfNativeText(buildPdf([{ text: heading }]));
  assert.equal(probe.pages[0]!.chars, heading.length);
  assert.ok(heading.length < THIN_PAGE_CHARS);
  assert.equal(probe.pages[0]!.native, false);
});

test("the character count is the same measure the native lane uses", async () => {
  // pageTextLength collapses runs of whitespace and trims, so layout padding
  // must not push a blank page over the floor.
  const padded = `  a${" ".repeat(40)}b  `;
  const probe = await probePdfNativeText(buildPdf([{ text: padded }]));
  assert.equal(probe.pages[0]!.chars, 3, "'a b', not 47 characters of layout");
  assert.equal(probe.pages[0]!.native, false);
});

test("page size comes back at scale 1, with rotation applied", async () => {
  const probe = await probePdfNativeText(
    buildPdf([{ text: FULL_PAGE }, { text: FULL_PAGE, landscape: true }]),
  );
  assert.deepEqual(
    probe.pages.map((p) => [p.width, p.height]),
    [[612, 792], [792, 612]],
  );
});

test("the cap bounds what is looked at without renaming the document", async () => {
  const probe = await probePdfNativeText(
    buildPdf([{ text: FULL_PAGE }, { text: FULL_PAGE }, { text: FULL_PAGE }]),
    { maxPages: 2 },
  );
  assert.equal(probe.pages.length, 2);
  // The third page is not "not native"; it was never looked at. A probe that
  // reported declaredPages: 2 would silently shorten the file.
  assert.equal(probe.declaredPages, 3);
});

test("a page beyond the cap is ABSENT from the map, not false", async () => {
  const probe = await probePdfNativeText(
    buildPdf([{ text: FULL_PAGE }, { text: "" }, { text: FULL_PAGE }]),
    { maxPages: 2 },
  );
  const map = nativeTextMap(probe);
  assert.equal(map.get(0), true);
  assert.equal(map.get(1), false);
  assert.equal(map.has(2), false, "unknown must not be expressible as a lane");
});
