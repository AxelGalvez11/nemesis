// A Scene, written into a real .pptx.
//
// 🔴 THIS FILE DECIDES NOTHING. Every colour, size and position was already decided by
// deck-compose.ts, which knows nothing about PowerPoint. That separation is what lets the theme
// picker and the dev-preview board show a picture of a design that cannot drift from the file
// the learner downloads: both are the same Scene, drawn twice.
//
// 🔴 ISOMORPHIC ON PURPOSE. pptxgenjs builds in the browser (Blob) and in Node (nodebuffer);
// the product builds decks CLIENT-SIDE at download time — the deck's source of truth is the
// PLAN stored on the canvas output, and the file is a deterministic function of plan + design,
// so there is nothing to upload and no storage bucket to stand up. The Node path exists for
// the tests, which unzip a real build and look inside.

import { deckArtPng, deckScrimPng } from "./deck-art";
import { composeReferences, composeSlide, type DeckDesign } from "./deck-compose";
import { deckDesign } from "./deck-designs";
import type { DeckPlan } from "./deck-plan";
import { SLIDE_H, SLIDE_W, type Scene, type SceneItem } from "./deck-scene";

interface DeckMeta {
  /** Printed small on the cover and closing, e.g. "Made with Nemesis". */
  credit: string;
  /** Which of DECK_DESIGNS to wear; unknown or missing falls back to the house design. */
  designId?: string | null;
}

type Pptx = import("pptxgenjs").default;
type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;

function draw(slide: Slide, item: SceneItem): void {
  switch (item.kind) {
    case "shape": {
      const { box: b } = item;
      slide.addShape(item.shape as never, {
        fill: item.fill ? { color: item.fill, ...(item.alpha ? { transparency: item.alpha } : {}) } : undefined,
        h: b.h,
        line: item.line ? { color: item.line.color, width: item.line.width * 72 } : { type: "none" },
        ...(item.radius === undefined ? {} : { rectRadius: item.radius }),
        ...(item.rotate === undefined ? {} : { rotate: item.rotate }),
        w: b.w,
        x: b.x,
        y: b.y,
      });
      return;
    }
    case "text": {
      const { box: b } = item;
      slide.addText(item.caps ? item.text.toUpperCase() : item.text, {
        align: item.align ?? "left",
        bold: item.bold,
        ...(item.spacing ? { charSpacing: item.spacing } : {}),
        color: item.color,
        fontFace: item.font,
        fontSize: item.size,
        h: b.h,
        italic: item.italic,
        lineSpacingMultiple: item.lineSpacing ?? 1.18,
        valign: item.valign ?? "top",
        w: b.w,
        x: b.x,
        y: b.y,
      });
      return;
    }
    case "bullets": {
      if (!item.items.length) return;
      const { box: b } = item;
      slide.addText(
        item.items.map((line, i) => ({
          options: {
            breakLine: true,
            ...(item.bullet === "none"
              ? {}
              : { bullet: { characterCode: item.bullet === "dot" ? "2022" : "2013", indent: 14 } }),
            paraSpaceAfter: i === item.items.length - 1 ? 0 : (item.gap ?? 10),
          },
          text: line,
        })),
        {
          align: "left",
          color: item.color,
          fontFace: item.font,
          fontSize: item.size,
          h: b.h,
          lineSpacingMultiple: item.lineSpacing ?? 1.24,
          valign: "top",
          w: b.w,
          x: b.x,
          y: b.y,
        },
      );
      return;
    }
    default: {
      const { box: b } = item;
      // Fill the box and crop the overflow — see the note in deck-svg.ts. Without this a
      // photograph in a tall column is letterboxed into a band.
      slide.addImage({ data: item.data, h: b.h, sizing: { h: b.h, type: "cover", w: b.w }, w: b.w, x: b.x, y: b.y });
    }
  }
}

/**
 * A .pptx cannot reference a URL: every picture has to be bytes inside the file. So a design's
 * texture or photograph is fetched and inlined at build time. It runs in the browser, where the
 * asset is same-origin and already in the HTTP cache from the deck view the learner was just
 * looking at; under Node the tests pass their own reader.
 *
 * A missing asset must never cost the learner their download, so a failure falls back to the
 * design's own background colour — a plainer slide, not a broken one.
 */
/** One copy per build. A design that lays material under every interior page asked for the same
 *  file ten times; the bytes are identical, so it is read once and reused. */
const inlined = new Map<string, string | null>();

async function inlineAsset(url: string): Promise<string | null> {
  const seen = inlined.get(url);
  if (seen !== undefined) return seen;
  const encoded = await readAsset(url);
  inlined.set(url, encoded);
  return encoded;
}

async function readAsset(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of buffer) binary += String.fromCharCode(byte);
    const encode =
      typeof btoa === "function"
        ? btoa
        : (raw: string) => (globalThis as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer!.from(raw, "binary").toString("base64");
    const type = response.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${encode(binary)}`;
  } catch {
    return null;
  }
}

async function paint(pptx: Pptx, scene: Scene): Promise<void> {
  const slide = pptx.addSlide();
  const picture = scene.background.image
    ? await inlineAsset(scene.background.image)
    : scene.background.art
      ? await deckArtPng(scene.background.art)
      : null;
  slide.background = picture ? { data: picture } : { color: scene.background.color };
  if (scene.overlay) {
    // Stretched over the whole slide, under everything else: PowerPoint draws in insertion
    // order, so this has to go on before the type does.
    const wash = await deckScrimPng(scene.overlay.color, scene.overlay.strength, scene.overlay.start);
    slide.addImage({ data: wash, h: SLIDE_H, w: SLIDE_W, x: 0, y: 0 });
  }
  for (const item of scene.items) {
    // A picture placed IN the content names an app asset the same way a background does, and a
    // .pptx cannot reference anything outside itself — so it is fetched and inlined here. A
    // failure drops the picture and keeps the slide, which is the same bargain as a background.
    if (item.kind === "image" && item.data.startsWith("/")) {
      const bytes = await inlineAsset(item.data);
      if (bytes) draw(slide, { ...item, data: bytes });
      continue;
    }
    draw(slide, item);
  }
}

/**
 * Draw a plan's slides into an existing deck, wearing `meta.designId`.
 *
 * Separate from `buildDeckPptx` so more than one plan — or the same plan in more than one
 * design — can share a file: that is how the design catalogue is built, by the real renderer
 * rather than by a lookalike that could drift from it.
 */
export async function renderDeckInto(pptx: Pptx, plan: DeckPlan, meta: DeckMeta): Promise<void> {
  const design: DeckDesign = deckDesign(meta.designId);
  for (const [i, slide] of plan.slides.entries()) {
    await paint(pptx, composeSlide(design, slide, { credit: meta.credit, index: i + 1, plan }));
  }
  // References, when the caller filled them from the canvas's own sources — never invented.
  if (plan.references.length) await paint(pptx, composeReferences(design, plan.references));
}

/**
 * Build the .pptx. Returns a Blob in the browser and a Buffer under Node — the caller picks
 * by environment. pptxgenjs loads lazily here so nothing about decks weighs on the app until
 * someone actually makes one.
 */
export async function buildDeckPptx(plan: DeckPlan, meta: DeckMeta): Promise<Blob | Buffer> {
  const { default: Pptxgen } = await import("pptxgenjs");
  const pptx: Pptx = new Pptxgen();
  pptx.defineLayout({ height: SLIDE_H, name: "NEMESIS_WIDE", width: SLIDE_W });
  pptx.layout = "NEMESIS_WIDE";
  pptx.title = plan.title;
  await renderDeckInto(pptx, plan, meta);
  const isNode = typeof window === "undefined";
  return (await pptx.write({ outputType: isNode ? "nodebuffer" : "blob" })) as Blob | Buffer;
}
