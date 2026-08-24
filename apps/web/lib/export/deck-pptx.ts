// The deck builder: a validated DeckPlan in, a real .pptx out — every visual decision made
// HERE, by the chosen theme, never by the model (see deck-plan.ts for the border control).
//
// 🔴 ISOMORPHIC ON PURPOSE. pptxgenjs builds in the browser (Blob) and in Node (nodebuffer);
// the product builds decks CLIENT-SIDE at download time — the deck's source of truth is the
// PLAN stored on the canvas output, and the file is a deterministic function of plan + theme,
// so there is nothing to upload and no storage bucket to stand up. The Node path exists for
// the tests, which unzip a real build and look inside.
//
// 🔴 ONE ENGINE, TWENTY LOOKS. Nothing below names a colour or a font: it asks the theme (see
// deck-themes.ts). That is what makes a new colourway a dozen numbers rather than a new file.
//
// 🔴 DESIGN RULES, WRITTEN DOWN SO THEY SURVIVE EDITS:
//   - The reference register is a designed keynote, not a bullet dump: big left-aligned
//     titles, generous margins (0.62in), a 5-item ceiling per slide enforced upstream.
//   - No accent rule under every title — the known hallmark of AI-generated decks (the same
//     rule pptx.ts records for the report deck). The recurring motif is the painted art on the
//     cover/section/closing and one small accent mark beside body titles.
//   - Fonts come from the theme's own pairing and are drawn from SAFE_FONTS, which every
//     machine or Office install has — nothing is embedded, so the file opens as designed.
//   - Dark slides use the theme's light inks and vice versa; icons pick their variant to match.

import { deckArtPng } from "./deck-art";
import type { DeckPlan, DeckSlide } from "./deck-plan";
import { deckTheme, type DeckTheme } from "./deck-themes";

const W = 13.33;
const H = 7.5;
const MARGIN = 0.62;
const CONTENT_W = W - MARGIN * 2;

interface DeckMeta {
  /** Printed small on the closing slide, e.g. "Made with Nemesis". */
  credit: string;
  /** Which of DECK_THEMES to wear; unknown or missing falls back to the house look. */
  themeId?: string | null;
}

type Pptx = import("pptxgenjs").default;
type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;

function title(slide: Slide, text: string, opts: { color: string; font: string; y: number; size: number; w?: number }): void {
  slide.addText(text, {
    align: "left",
    bold: true,
    color: opts.color,
    fontFace: opts.font,
    fontSize: opts.size,
    h: 1.2,
    valign: "top",
    w: opts.w ?? CONTENT_W,
    x: MARGIN,
    y: opts.y,
  });
}

function bullets(
  slide: Slide,
  points: string[],
  opts: { color: string; font: string; x: number; y: number; w: number; size?: number },
): void {
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
      fontFace: opts.font,
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

/** The theme's quiet mark beside a body title — a tick, a heavier bar, a dot, or nothing. */
function motif(slide: Slide, theme: DeckTheme, y: number): void {
  const fill = { color: theme.accent };
  const line = { type: "none" } as const;
  switch (theme.motif) {
    case "none":
      return;
    case "dot":
      slide.addShape("ellipse", { fill, h: 0.12, line, w: 0.12, x: MARGIN - 0.26, y: y + 0.16 });
      return;
    case "bar":
      slide.addShape("rect", { fill, h: 0.32, line, w: 0.075, x: MARGIN - 0.2, y: y + 0.06 });
      return;
    default:
      slide.addShape("rect", { fill, h: 0.26, line, w: 0.055, x: MARGIN - 0.16, y: y + 0.09 });
  }
}

function icon(slide: Slide, data: string | undefined, opts: { x: number; y: number; size?: number }): void {
  if (!data) return;
  const size = opts.size ?? 0.42;
  slide.addImage({ data, h: size, w: size, x: opts.x, y: opts.y });
}

/**
 * Draw a plan's slides into an existing deck, wearing `meta.themeId`.
 *
 * Separate from `buildDeckPptx` so more than one plan — or the same plan in more than one
 * theme — can share a file: that is how the theme catalogue is built, by the real renderer
 * rather than by a lookalike that could drift from it.
 */
export async function renderDeckInto(pptx: Pptx, plan: DeckPlan, meta: DeckMeta): Promise<void> {
  const assets = await import("./deck-theme-assets");
  const theme = deckTheme(meta.themeId);
  const display = theme.fonts.display;
  const body = theme.fonts.body;
  const pickIcon = (slide: DeckSlide, dark: boolean): string | undefined => {
    if (!slide.icon) return undefined;
    const pair = assets.DECK_ICONS[slide.icon];
    return pair ? (dark ? pair.light : pair.ink) : undefined;
  };

  for (const s of plan.slides) {
    const slide = pptx.addSlide();
    switch (s.layout) {
      case "cover": {
        slide.background = { data: await deckArtPng(theme.cover.art) };
        title(slide, s.title || plan.title, { color: theme.cover.title, font: display, size: 40, y: 2.55 });
        if (s.subtitle || plan.subtitle) {
          slide.addText(s.subtitle || plan.subtitle, {
            color: theme.cover.subtitle,
            fontFace: body,
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
        slide.background = { data: await deckArtPng(theme.section.art) };
        icon(slide, pickIcon(s, theme.section.dark), { size: 0.5, x: MARGIN, y: 2.35 });
        title(slide, s.title, { color: theme.section.title, font: display, size: 32, y: 3.0 });
        break;
      }
      case "two_column": {
        slide.background = { color: theme.body.bg };
        motif(slide, theme, 0.72);
        title(slide, s.title, { color: theme.body.title, font: display, size: 24, y: 0.62 });
        const colW = (CONTENT_W - 0.6) / 2;
        const headOpts = { bold: true, color: theme.accent, fontFace: body, fontSize: 13, h: 0.4 } as const;
        if (s.leftHeading) slide.addText(s.leftHeading.toUpperCase(), { ...headOpts, w: colW, x: MARGIN, y: 1.75 });
        if (s.rightHeading) slide.addText(s.rightHeading.toUpperCase(), { ...headOpts, w: colW, x: MARGIN + colW + 0.6, y: 1.75 });
        bullets(slide, s.points, { color: theme.body.text, font: body, w: colW, x: MARGIN, y: 2.25 });
        bullets(slide, s.rightPoints, { color: theme.body.text, font: body, w: colW, x: MARGIN + colW + 0.6, y: 2.25 });
        break;
      }
      case "stat": {
        slide.background = { color: theme.body.bg };
        slide.addText(s.statValue, {
          align: "left",
          bold: true,
          color: theme.accent,
          fontFace: display,
          fontSize: 88,
          h: 2.0,
          w: CONTENT_W,
          x: MARGIN,
          y: 2.1,
        });
        slide.addText(s.statLabel || s.title, {
          color: theme.body.text,
          fontFace: body,
          fontSize: 18,
          h: 1.0,
          w: CONTENT_W * 0.7,
          x: MARGIN,
          y: 4.2,
        });
        break;
      }
      case "quote": {
        slide.background = { color: theme.body.bg };
        slide.addText(`“${s.title}”`, {
          align: "left",
          color: theme.body.title,
          fontFace: display,
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
            color: theme.body.muted,
            fontFace: body,
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
        slide.background = { data: await deckArtPng(theme.closing.art) };
        title(slide, s.title || "Thank you", { color: theme.closing.title, font: display, size: 34, y: 2.7 });
        bullets(slide, s.points, { color: theme.closing.text, font: body, size: 14, w: CONTENT_W * 0.8, x: MARGIN, y: 3.9 });
        slide.addText(meta.credit, {
          color: theme.closing.text,
          fontFace: body,
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
        slide.background = { color: theme.body.bg };
        motif(slide, theme, 0.72);
        title(slide, s.title, { color: theme.body.title, font: display, size: 24, w: CONTENT_W - 0.8, y: 0.62 });
        icon(slide, pickIcon(s, theme.body.dark), { x: W - MARGIN - 0.45, y: 0.68 });
        bullets(slide, s.points, { color: theme.body.text, font: body, w: CONTENT_W * 0.86, x: MARGIN, y: 1.9 });
      }
    }
  }

  // References, when the caller filled them from the canvas's own sources — never invented.
  if (plan.references.length) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.body.bg };
    motif(slide, theme, 0.72);
    title(slide, "References", { color: theme.body.title, font: display, size: 24, y: 0.62 });
    bullets(
      slide,
      plan.references.slice(0, 10).map((ref) => (ref.url ? `${ref.title} — ${ref.url}` : ref.title)),
      { color: theme.body.muted, font: body, size: 12, w: CONTENT_W, x: MARGIN, y: 1.9 },
    );
  }
}

/**
 * Build the .pptx. Returns a Blob in the browser and a Buffer under Node — the caller picks
 * by environment. Icons and pptxgenjs load lazily here so nothing about decks weighs on the
 * app until someone actually makes one.
 */
export async function buildDeckPptx(plan: DeckPlan, meta: DeckMeta): Promise<Blob | Buffer> {
  const { default: Pptxgen } = await import("pptxgenjs");
  const pptx: Pptx = new Pptxgen();
  pptx.defineLayout({ height: H, name: "NEMESIS_WIDE", width: W });
  pptx.layout = "NEMESIS_WIDE";
  pptx.title = plan.title;
  await renderDeckInto(pptx, plan, meta);
  const isNode = typeof window === "undefined";
  return (await pptx.write({ outputType: isNode ? "nodebuffer" : "blob" })) as Blob | Buffer;
}
