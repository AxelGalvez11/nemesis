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

import { deckArtPng } from "./deck-art";
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
      slide.addImage({ data: item.data, h: b.h, w: b.w, x: b.x, y: b.y });
    }
  }
}

async function paint(pptx: Pptx, scene: Scene): Promise<void> {
  const slide = pptx.addSlide();
  slide.background = scene.background.art
    ? { data: await deckArtPng(scene.background.art) }
    : { color: scene.background.color };
  for (const item of scene.items) draw(slide, item);
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
