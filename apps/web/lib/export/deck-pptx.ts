// The deck builder: a validated DeckPlan in, a real .pptx out — every visual decision made
// HERE, by the theme, never by the model (see deck-plan.ts for the border control).
//
// 🔴 ISOMORPHIC ON PURPOSE. pptxgenjs builds in the browser (Blob) and in Node (nodebuffer);
// the product builds decks CLIENT-SIDE at download time — the deck's source of truth is the
// PLAN stored on the canvas output, and the file is a deterministic function of plan + theme,
// so there is nothing to upload and no storage bucket to stand up. The Node path exists for
// the tests, which unzip a real build and look inside.
//
// 🔴 DESIGN RULES, WRITTEN DOWN SO THEY SURVIVE EDITS:
//   - The reference register is a designed keynote, not a bullet dump: big left-aligned
//     titles, generous margins (0.62in), a 5-item ceiling per slide enforced upstream.
//   - No accent rule under every title — the known hallmark of AI-generated decks (the same
//     rule pptx.ts records for the report deck). The recurring motif is the gradient art on
//     the cover/section/closing and a single small accent tick beside body titles.
//   - Fonts are ones every machine has (theme.ts's argument): Georgia for display, Calibri
//     for body — no embedding, so the file opens as designed everywhere.
//   - Dark slides use the light ink and vice versa; icons pick their variant by background.

import type { DeckPlan, DeckSlide } from "./deck-plan";
import { EXPORT_FONTS } from "./theme";

/** The deck theme's palette. Hex without '#', as pptxgenjs wants. */
const T = {
  accent: "cc1f33",
  faintOnDark: "9a94a3",
  ink: "17151a",
  inkSoft: "43404a",
  lightInk: "f5f2f2",
  muted: "6b6773",
  paper: "f9f8f7",
} as const;

const W = 13.33;
const H = 7.5;
const MARGIN = 0.62;
const CONTENT_W = W - MARGIN * 2;

interface DeckMeta {
  /** Printed small on the closing slide, e.g. "Made with Nemesis". */
  credit: string;
}

type Pptx = import("pptxgenjs").default;
type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;

function title(slide: Slide, text: string, opts: { color: string; y: number; size: number; w?: number }): void {
  slide.addText(text, {
    align: "left",
    bold: true,
    color: opts.color,
    fontFace: EXPORT_FONTS.serif,
    fontSize: opts.size,
    h: 1.2,
    valign: "top",
    w: opts.w ?? CONTENT_W,
    x: MARGIN,
    y: opts.y,
  });
}

function bullets(slide: Slide, points: string[], opts: { color: string; x: number; y: number; w: number; size?: number }): void {
  if (!points.length) return;
  slide.addText(
    points.map((point, index) => ({
      options: {
        breakLine: true,
        bullet: { characterCode: "2013", indent: 14 },
        paraSpaceAfter: index === points.length - 1 ? 0 : 10,
      },
      text: point,
    })),
    {
      align: "left",
      color: opts.color,
      fontFace: EXPORT_FONTS.sans,
      fontSize: opts.size ?? 16,
      h: H - opts.y - 0.7,
      lineSpacingMultiple: 1.12,
      valign: "top",
      w: opts.w,
      x: opts.x,
      y: opts.y,
    },
  );
}

/** The single accent tick beside a body title — the deck's quiet motif. */
function tick(slide: Slide, y: number): void {
  slide.addShape("rect", { fill: { color: T.accent }, h: 0.26, line: { type: "none" }, w: 0.055, x: MARGIN - 0.16, y: y + 0.09 });
}

function icon(slide: Slide, data: string | undefined, opts: { x: number; y: number; size?: number }): void {
  if (!data) return;
  const size = opts.size ?? 0.42;
  slide.addImage({ data, h: size, w: size, x: opts.x, y: opts.y });
}

/**
 * Build the .pptx. Returns a Blob in the browser and a Buffer under Node — the caller picks
 * by environment. Assets and pptxgenjs load lazily here so nothing about decks weighs on the
 * app until someone actually makes one.
 */
export async function buildDeckPptx(plan: DeckPlan, meta: DeckMeta): Promise<Blob | Buffer> {
  const [{ default: Pptxgen }, assets] = await Promise.all([import("pptxgenjs"), import("./deck-theme-assets")]);
  const pptx: Pptx = new Pptxgen();
  pptx.defineLayout({ height: H, name: "NEMESIS_WIDE", width: W });
  pptx.layout = "NEMESIS_WIDE";
  pptx.title = plan.title;

  const pickIcon = (slide: DeckSlide, dark: boolean): string | undefined => {
    if (!slide.icon) return undefined;
    const pair = assets.DECK_ICONS[slide.icon];
    return pair ? (dark ? pair.light : pair.ink) : undefined;
  };

  for (const s of plan.slides) {
    const slide = pptx.addSlide();
    switch (s.layout) {
      case "cover": {
        slide.background = { data: assets.DECK_BG_COVER };
        title(slide, s.title || plan.title, { color: T.lightInk, size: 40, y: 2.55 });
        if (s.subtitle || plan.subtitle) {
          slide.addText(s.subtitle || plan.subtitle, {
            color: T.faintOnDark,
            fontFace: EXPORT_FONTS.sans,
            fontSize: 16,
            h: 0.8,
            w: CONTENT_W,
            x: MARGIN,
            y: 3.85,
          });
        }
        break;
      }
      case "section": {
        slide.background = { data: assets.DECK_BG_SECTION };
        icon(slide, pickIcon(s, false), { size: 0.5, x: MARGIN, y: 2.35 });
        title(slide, s.title, { color: T.ink, size: 32, y: 3.0 });
        break;
      }
      case "two_column": {
        slide.background = { color: T.paper };
        tick(slide, 0.72);
        title(slide, s.title, { color: T.ink, size: 24, y: 0.62 });
        const colW = (CONTENT_W - 0.6) / 2;
        const headOpts = { bold: true, color: T.accent, fontFace: EXPORT_FONTS.sans, fontSize: 13, h: 0.4 } as const;
        if (s.leftHeading) slide.addText(s.leftHeading.toUpperCase(), { ...headOpts, w: colW, x: MARGIN, y: 1.75 });
        if (s.rightHeading) slide.addText(s.rightHeading.toUpperCase(), { ...headOpts, w: colW, x: MARGIN + colW + 0.6, y: 1.75 });
        bullets(slide, s.points, { color: T.inkSoft, w: colW, x: MARGIN, y: 2.25 });
        bullets(slide, s.rightPoints, { color: T.inkSoft, w: colW, x: MARGIN + colW + 0.6, y: 2.25 });
        break;
      }
      case "stat": {
        slide.background = { color: T.paper };
        slide.addText(s.statValue, {
          align: "left",
          bold: true,
          color: T.accent,
          fontFace: EXPORT_FONTS.serif,
          fontSize: 88,
          h: 2.0,
          w: CONTENT_W,
          x: MARGIN,
          y: 2.1,
        });
        slide.addText(s.statLabel || s.title, {
          color: T.inkSoft,
          fontFace: EXPORT_FONTS.sans,
          fontSize: 18,
          h: 1.0,
          w: CONTENT_W * 0.7,
          x: MARGIN,
          y: 4.2,
        });
        break;
      }
      case "quote": {
        slide.background = { color: T.paper };
        slide.addText(`“${s.title}”`, {
          align: "left",
          color: T.ink,
          fontFace: EXPORT_FONTS.serif,
          fontSize: 28,
          h: 3.0,
          italic: true,
          lineSpacingMultiple: 1.2,
          w: CONTENT_W * 0.85,
          x: MARGIN,
          y: 1.9,
        });
        if (s.quoteAttribution) {
          slide.addText(`— ${s.quoteAttribution}`, {
            color: T.muted,
            fontFace: EXPORT_FONTS.sans,
            fontSize: 14,
            h: 0.5,
            w: CONTENT_W * 0.85,
            x: MARGIN,
            y: 5.1,
          });
        }
        break;
      }
      case "closing": {
        slide.background = { data: assets.DECK_BG_CLOSING };
        title(slide, s.title || "Thank you", { color: T.lightInk, size: 34, y: 2.7 });
        bullets(slide, s.points, { color: T.faintOnDark, size: 14, w: CONTENT_W * 0.8, x: MARGIN, y: 3.9 });
        slide.addText(meta.credit, {
          color: T.faintOnDark,
          fontFace: EXPORT_FONTS.sans,
          fontSize: 10,
          h: 0.35,
          w: 4,
          x: MARGIN,
          y: H - 0.62,
        });
        break;
      }
      default: {
        // bullets — the workhorse
        slide.background = { color: T.paper };
        tick(slide, 0.72);
        title(slide, s.title, { color: T.ink, size: 24, y: 0.62, w: CONTENT_W - 0.8 });
        icon(slide, pickIcon(s, false), { x: W - MARGIN - 0.45, y: 0.68 });
        bullets(slide, s.points, { color: T.inkSoft, w: CONTENT_W * 0.86, x: MARGIN, y: 1.9 });
      }
    }
  }

  // References, when the caller filled them from the canvas's own sources — never invented.
  if (plan.references.length) {
    const slide = pptx.addSlide();
    slide.background = { color: T.paper };
    tick(slide, 0.72);
    title(slide, "References", { color: T.ink, size: 24, y: 0.62 });
    bullets(
      slide,
      plan.references.slice(0, 10).map((ref) => (ref.url ? `${ref.title} — ${ref.url}` : ref.title)),
      { color: T.muted, size: 12, w: CONTENT_W, x: MARGIN, y: 1.9 },
    );
  }

  const isNode = typeof window === "undefined";
  return (await pptx.write({ outputType: isNode ? "nodebuffer" : "blob" })) as Blob | Buffer;
}
