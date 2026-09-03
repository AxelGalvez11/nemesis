// Rebuild public/reader-sample.pptx — the deck the signed-out reader preview opens.
//
// 🔴🔴 IT NOW CARRIES REAL GEOMETRY, WHICH IS THE WHOLE REASON THIS SCRIPT EXISTS. The old fixture
// was hand-written with no `p:spPr`, no `a:xfrm`, no layout and no master, so every slide in it
// took the reader's FALLBACK path — the template arrangement, title on top and bullets down the
// left. That made the preview harness structurally unable to show the lane real decks take, and a
// change to how slides are placed could not be reviewed anywhere but production.
//
// The deck below is what a deck actually looks like: a title slide whose placeholders inherit their
// boxes from the layout, a content slide that moves one shape by hand, a slide whose text sits in
// two columns distinguished only by `idx`, and one shape inside a group so the group's own
// coordinate space (`a:chOff`/`a:chExt`) is exercised. Each of those is a case that silently ruins
// the feature on its own — see pptx-geometry.test.ts.
//
// Run: pnpm --filter @nemesis/web exec tsx scripts/make-deck-fixture.mts

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { zipSync, strToU8 } from "fflate";

/** 13.333in x 7.5in, PowerPoint's own default. */
const W = 12192000;
const H = 6858000;

const XMLNS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm>`;

interface Line {
  text: string;
  level?: number;
  size?: number;
  bold?: boolean;
  align?: string;
  bullet?: boolean;
}

function body(lines: readonly Line[]): string {
  return `<p:txBody><a:bodyPr/>${lines
    .map((line) => {
      const bullet = line.bullet === false ? "<a:buNone/>" : line.bullet ? '<a:buChar char="•"/>' : "";
      const properties = `<a:pPr lvl="${line.level ?? 0}"${line.align ? ` algn="${line.align}"` : ""}>${bullet}</a:pPr>`;
      const run = `<a:rPr${line.size ? ` sz="${line.size * 100}"` : ""}${line.bold ? ' b="1"' : ""}/>`;
      return `<a:p>${properties}<a:r>${run}<a:t>${line.text}</a:t></a:r></a:p>`;
    })
    .join("")}</p:txBody>`;
}

/** A shape. Omit `box` to make it a placeholder that INHERITS its geometry from the layout. */
function shape(id: number, lines: readonly Line[], options: { ph?: string; box?: string } = {}): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="sp${id}"/><p:cNvSpPr/>` +
    `<p:nvPr>${options.ph ?? ""}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${options.box ?? ""}</p:spPr>${body(lines)}</p:sp>`
  );
}

const slide = (inner: string) => `${head}<p:sld ${XMLNS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;

/** The layout every slide points at. Its placeholder boxes are what the slides inherit. */
const LAYOUT =
  `${head}<p:sldLayout ${XMLNS}><p:cSld><p:spTree>` +
  shape(1, [], { ph: '<p:ph type="title"/>', box: xfrm(W * 0.06, H * 0.07, W * 0.88, H * 0.17) }) +
  shape(2, [], { ph: '<p:ph idx="1" type="body"/>', box: xfrm(W * 0.06, H * 0.3, W * 0.42, H * 0.6) }) +
  shape(3, [], { ph: '<p:ph idx="2" type="body"/>', box: xfrm(W * 0.52, H * 0.3, W * 0.42, H * 0.6) }) +
  `</p:spTree></p:cSld></p:sldLayout>`;

/** The master, so the inheritance chain has a second rung to walk. */
const MASTER =
  `${head}<p:sldMaster ${XMLNS}><p:cSld><p:spTree>` +
  shape(1, [], { ph: '<p:ph type="ftr"/>', box: xfrm(W * 0.06, H * 0.9, W * 0.88, H * 0.06) }) +
  `</p:spTree></p:cSld></p:sldMaster>`;

const SLIDE_1 = slide(
  // Both placeholders carry NO box: this slide is the inheritance case, which is what a slide built
  // straight from a template looks like and is the majority of every real deck.
  shape(2, [{ text: "What a deck actually contains", size: 34, bold: true }], { ph: '<p:ph type="title"/>' }) +
    shape(
      3,
      [
        { text: "A slide is text, pictures and notes in a zip file", level: 0 },
        { text: "Not a picture of a slide", level: 0 },
        { text: "Which is why this view says what it is", level: 1 },
      ],
      { ph: '<p:ph idx="1" type="body"/>' },
    ),
);

const SLIDE_2 = slide(
  // Two columns that differ ONLY by placeholder index. Match on `type` first and the right column's
  // text lands in the left column's box, which looks like a layout bug and is a matching bug.
  shape(2, [{ text: "Order comes from the deck, not the filenames", size: 30, bold: true }], {
    ph: '<p:ph type="title"/>',
  }) +
    shape(
      3,
      [
        { text: "slide10.xml sorts before slide2.xml", level: 0 },
        { text: "so the order is read from presentation.xml", level: 0 },
      ],
      { ph: '<p:ph idx="1" type="body"/>' },
    ) +
    shape(
      4,
      [
        { text: "A deck whose slides were reordered", level: 0 },
        { text: "has filenames that mean nothing at all", level: 0 },
      ],
      { ph: '<p:ph idx="2" type="body"/>' },
    ),
);

const SLIDE_3 = slide(
  // A hand-placed banner across the foot, and a shape inside a group written in the group's own
  // 1000x1000 child space. Reading that child's raw x as a slide coordinate puts it in the corner.
  shape(2, [{ text: "Speaker notes are the lecturer's own words", size: 30, bold: true }], {
    ph: '<p:ph type="title"/>',
  }) +
    shape(3, [{ text: "They are usually where the exam hints live", level: 0 }], {
      ph: '<p:ph idx="1" type="body"/>',
    }) +
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="g"/></p:nvGrpSpPr><p:grpSpPr>` +
    `<a:xfrm><a:off x="${Math.round(W * 0.06)}" y="${Math.round(H * 0.76)}"/>` +
    `<a:ext cx="${Math.round(W * 0.88)}" cy="${Math.round(H * 0.12)}"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></p:grpSpPr>` +
    shape(10, [{ text: "In a group, and still in the right place", align: "ctr", size: 18, bullet: false }], {
      box: xfrm(0, 0, 1000, 1000),
    }) +
    `</p:grpSp>`,
);

const NOTES =
  `${head}<p:notes ${XMLNS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="n"/>` +
  `<p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>` +
  body([{ text: "This deck is a fixture. Every slide in it carries the geometry a real deck carries." }]) +
  `</p:sp></p:spTree></p:cSld></p:notes>`;

const rel = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

const RELS = (inner: string) =>
  `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;

const files: Record<string, Uint8Array> = {
  "[Content_Types].xml": strToU8(
    `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      [1, 2, 3]
        .map(
          (n) =>
            `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
        )
        .join("") +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>' +
      "</Types>",
  ),
  "_rels/.rels": strToU8(RELS(rel("rId1", "officeDocument", "ppt/presentation.xml"))),
  "ppt/presentation.xml": strToU8(
    `${head}<p:presentation ${XMLNS}><p:sldIdLst>` +
      [1, 2, 3].map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("") +
      `</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/></p:presentation>`,
  ),
  "ppt/_rels/presentation.xml.rels": strToU8(
    RELS([1, 2, 3].map((n) => rel(`rId${n}`, "slide", `slides/slide${n}.xml`)).join("")),
  ),
  "ppt/slideLayouts/slideLayout1.xml": strToU8(LAYOUT),
  "ppt/slideLayouts/_rels/slideLayout1.xml.rels": strToU8(
    RELS(rel("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")),
  ),
  "ppt/slideMasters/slideMaster1.xml": strToU8(MASTER),
  "ppt/slides/slide1.xml": strToU8(SLIDE_1),
  "ppt/slides/slide2.xml": strToU8(SLIDE_2),
  "ppt/slides/slide3.xml": strToU8(SLIDE_3),
  "ppt/slides/_rels/slide1.xml.rels": strToU8(
    RELS(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") + rel("rId2", "notesSlide", "../notesSlides/notesSlide1.xml")),
  ),
  "ppt/slides/_rels/slide2.xml.rels": strToU8(RELS(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"))),
  "ppt/slides/_rels/slide3.xml.rels": strToU8(RELS(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"))),
  "ppt/notesSlides/notesSlide1.xml": strToU8(NOTES),
};

const out = join(import.meta.dirname, "..", "public", "reader-sample.pptx");
writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`wrote ${out}`);
