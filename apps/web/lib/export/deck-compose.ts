// How a slide is COMPOSED. This is the design work.
//
// 🔴 THE BAR, SET BY THE OWNER: *"it needs to look like it's from one of the top hedge funds,
// like one of the top data analyst presentations."* That register is not decoration — it is a
// set of habits, and they are all encoded below:
//
//   1. THE TITLE IS A FINDING, NOT A HEADING. "Photorespiration wastes a fifth of fixed carbon"
//      beats "Photorespiration". The plan asks the model for exactly that (deck-plan.ts), and
//      every content slide can carry a takeaway line under it, in a tinted action box.
//   2. NUMBERS ARE DRAWN, NOT DESCRIBED. kpi, chart and table layouts turn the model's figures
//      into column, bar and line exhibits, KPI rows and ruled tables — built from scene
//      primitives, so the preview and the .pptx agree to the pixel.
//   3. THE PAGE HAS FURNITURE. An eyebrow, a hairline under the header, a footer rule, a page
//      number, a footnote slot. Cheap, and the single biggest difference between a deck that
//      looks typed and one that looks published.
//   4. DENSITY. Institutional decks are set small and tight: 12.5pt body, 22pt titles, 0.72in
//      margins. Big friendly text reads as a school project.
//   5. NOTHING SITS ON TOP OF ANYTHING. Ghost numerals are sized FROM their box and confined to
//      a corner no text enters; a test asserts no two text boxes overlap on any slide of any
//      design, because "the shapes are blocking the text" is a defect the eye catches instantly
//      and code will not, unless it is asked to.
//
// Every function here turns (design, slide) into a Scene (deck-scene.ts). Nothing here knows
// about PowerPoint or SVG: deck-pptx.ts writes the scene into a real file, deck-svg.ts draws
// the same scene for review.

import type { DeckArt } from "./deck-art";
import { mark as drawMark, type MarkKind } from "./deck-marks";
import type { DeckDatum, DeckPlan, DeckSlide } from "./deck-plan";
import {
  box,
  cells,
  columns,
  crossBand,
  edgeBand,
  inset,
  ordinal,
  rows,
  SLIDE_H,
  SLIDE_W,
  type Box,
  type Scene,
  type SceneItem,
  type SceneMotion,
} from "./deck-scene";

export type CoverKind =
  | "band-left"
  | "band-bottom"
  | "split-diagonal"
  | "frame"
  | "numeral"
  | "stack-bars"
  | "circle"
  | "panel-right"
  | "editorial"
  | "corner-blocks"
  | "ribbon"
  | "grid-dots"
  | "arc-corner"
  | "half-split"
  | "photo"
  | "art-glow";

export type BodyKind =
  | "plain"
  | "cards"
  | "numbered"
  | "rail"
  | "panel-title"
  | "two-col-rule"
  | "chips"
  | "banner"
  | "boxed"
  | "hanging-rule";

export type SectionKind = "solid-numeral" | "band" | "split" | "rule" | "art";
export type StatKind = "panel" | "rule" | "circle" | "block";
export type QuoteKind = "mark" | "band" | "rule" | "panel";
/** How much page furniture a design wears: the institutional ones wear all of it. */
export type ChromeKind = "full" | "light" | "none";

/**
 * The INTERIOR page's own character.
 *
 * 🔴 THE OWNER'S SECOND VERDICT, AND WHY THIS TYPE EXISTS (2026-08-24): *"it pretty much just
 * looks like the same thing after the title slide… It looks pretty much like the same
 * PowerPoint, except just with different colors."* Correct, and the cause was structural: every
 * design shared one interior grid. The cover was recomposed thirty-four ways and then slide 4
 * of every deck was the same white page with the same margins and the same header in a
 * different colour.
 *
 * A page kind changes the GRID — where the margin is, what lives in it, what the ground is —
 * so two designs differ on the slides a reader actually spends their time on.
 *
 * Every one of these lives in the MARGINS. That is not a stylistic preference: page furniture
 * that wanders into the content column is how "the shapes are blocking the text" happens, and
 * a decorative rail cannot be allowed to reintroduce the defect the collision tests were
 * written to kill.
 */
export type PageKind =
  | "clean"
  | "rail"
  | "margin"
  | "corner"
  | "tint"
  | "tab"
  | "dots"
  | "frame"
  | "edge"
  | "foot"
  | "photo-side";

/** How an exhibit — a chart, a table, a row of figures — is dressed. The exhibits used to be
 *  identical across every design, which is most of why the interiors read as one deck. */
export type ExhibitKind = "open" | "framed" | "tinted" | "ruled" | "card";

/**
 * How the FIGURES THEMSELVES are drawn.
 *
 * 🔴 DRESSING AN IDENTICAL CHART IS NOT VARIETY. The first pass at this gave each design its
 * own frame, tint or rule around the exhibit — and every deck still drew the same five bars in
 * the same places, which is precisely the complaint. A plot style changes the marks on the
 * page: a bar, a bar over its own track, a stem topped with the design's mark, a solid block
 * with the figure set inside it, an outline.
 *
 * 🔴 AND IT NEVER CHANGES WHAT THE NUMBERS SAY. Every style is a faithful plot of the same
 * values against the same maximum, with the smallest value still visible. A style that flattered
 * the data would be a lie told in the product's own voice.
 */
export type PlotKind = "column" | "track" | "lollipop" | "block" | "outline";

export interface DeckDesign {
  id: string;
  name: string;
  blurb: string;
  fonts: { display: string; body: string };
  paper: string;
  ink: string;
  soft: string;
  muted: string;
  accent: string;
  accentInk: string;
  deep: string;
  deepInk: string;
  deepSoft: string;
  /** A second data colour, for the comparison series in an exhibit. */
  second: string;
  cover: CoverKind;
  section: SectionKind;
  body: BodyKind;
  stat: StatKind;
  quote: QuoteKind;
  chrome: ChromeKind;
  /** The interior grid and its furniture — see PageKind. */
  page: PageKind;
  /** How charts, tables and figure rows are dressed. */
  exhibit: ExhibitKind;
  /** How the figures inside an exhibit are drawn. */
  plot: PlotKind;
  /** The design's own mark, repeated wherever a list needs a marker (deck-marks.ts). */
  mark: MarkKind;
  /** How the deck moves when it is presented in the app. The .pptx export is always still. */
  motion?: SceneMotion;
  art?: { cover?: DeckArt; section?: DeckArt; closing?: DeckArt };
  /** Real material or photography, by app-relative URL. A design that sets `scrim` gets a wash
   *  of its own dark colour over the picture — the difference between a title that sits ON a
   *  photograph and one that disappears into it. */
  texture?: {
    cover?: string;
    section?: string;
    closing?: string;
    /** Material for the INTERIOR pages. Light materials only — paper, linen, canvas: the page
     *  ink is chosen for `paper`, so a dark interior material would swallow the words. */
    page?: string;
    /** Pictures a design may use INSIDE its content, chosen by slide number so two slides in a
     *  row are never the same photograph.
     *  🔴 A FAMILY, NOT A PICTURE. One image repeated down a deck is what a template looks like
     *  when nobody filled in the placeholders. A design that wants photography in its content
     *  has to supply enough of it to keep moving. */
    gallery?: readonly string[];
    /** How much of the design's own paper is laid OVER that interior material, 0-100.
     *  🔴 AN INTERIOR MATERIAL MUST BE A WHISPER. A cover carries six words and can take a
     *  photograph at full strength; an interior carries a title, a takeaway, five points, a
     *  footnote and a page number, and raw canvas at full strength buried every one of them.
     *  Declared per design because the right amount depends entirely on the material: a faint
     *  graph rule wants a light wash, a coarse weave wants a heavy one. */
    pageScrim?: number;
    scrim?: number;
    /** Whether the cover picture is DARK. A composition cannot see its own background, and a
     *  cover built for paper paints its title in the page ink — which is invisible on slate.
     *  Declared by the design, checked by a test. */
    dark?: boolean;
  };
  kicker?: boolean;
  scale?: number;
}

// ── the grid ─────────────────────────────────────────────────────────────────────────────────

const M = 0.72;
const TOP = 0.58;
const FOOT = 0.42;
const CONTENT_W = SLIDE_W - M * 2;

/** Type scale, in points. One place, so twenty designs cannot drift apart. */
const T = {
  action: 12,
  body: 12.5,
  cover: 44,
  eyebrow: 9.5,
  footer: 8.5,
  kpi: 46,
  label: 10.5,
  note: 9,
  sectionTitle: 34,
  title: 22,
  value: 11,
} as const;

/** Titles shrink as they lengthen, so a long one never crowds the composition. */
function fit(base: number, text: string): number {
  const n = text.length;
  if (n > 110) return base * 0.58;
  if (n > 78) return base * 0.7;
  if (n > 52) return base * 0.82;
  if (n > 34) return base * 0.92;
  return base;
}

/** A numeral sized FROM its box, never past it — the overflow that used to run a "01" straight
 *  through a title. Digits in the display faces run about 0.58em wide. */
function fitNumeral(text: string, widthIn: number, heightIn: number): number {
  const byWidth = (widthIn * 72) / Math.max(1, text.length * 0.58);
  const byHeight = heightIn * 72 * 0.92;
  return Math.min(byWidth, byHeight);
}

interface Ctx {
  plan: DeckPlan;
  /** 1-based position among the plan's slides — page numbers and section marks use it. */
  index: number;
  credit: string;
}

/** Blend two hex colours. Used for ghost type and tinted bands, because PowerPoint gives us
 *  transparent FILLS but not transparent TEXT, and a preview that faked it would be lying. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return [0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("");
}

// ── primitives ───────────────────────────────────────────────────────────────────────────────

const rect = (b: Box, fill: string, alpha?: number): SceneItem => ({ alpha, box: b, fill, kind: "shape", shape: "rect" });

const hair = (b: Box, color: string, width = 0.01): SceneItem => ({
  box: b,
  kind: "shape",
  line: { color, width },
  shape: "line",
});

interface TextOpts {
  align?: "left" | "center" | "right";
  bold?: boolean;
  caps?: boolean;
  italic?: boolean;
  lineSpacing?: number;
  spacing?: number;
  valign?: "top" | "middle" | "bottom";
}

const text = (t: string, b: Box, font: string, size: number, color: string, opts: TextOpts = {}): SceneItem => ({
  align: opts.align ?? "left",
  bold: opts.bold,
  box: b,
  caps: opts.caps,
  color,
  font,
  italic: opts.italic,
  kind: "text",
  lineSpacing: opts.lineSpacing ?? 1.16,
  size,
  spacing: opts.spacing,
  text: t,
  valign: opts.valign ?? "top",
});

/** Numbers as an exhibit prints them: 1,240 not 1240; 12.4 not 12.400000001. */
function figure(value: number, unit: string): string {
  const abs = Math.abs(value);
  const rounded = abs >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const shown = rounded.toLocaleString("en-US");
  return unit === "%" || unit === "x" ? `${shown}${unit}` : unit ? `${shown} ${unit}` : shown;
}

// ── the interior page ────────────────────────────────────────────────────────────────────────

/** The grid one design gives its interior slides, and the furniture that dresses it. */
interface Page {
  /** Drawn UNDER the content, always in the margins. */
  items: SceneItem[];
  left: number;
  width: number;
  /** Where the header may start. */
  top: number;
  /** How wide a title may run before it would reach the page's own furniture. */
  headWidth: number;
  background: string;
  image?: string;
  /** Designs whose footer sits inside a coloured band at the foot of the page. */
  foot?: { band: Box; ink: string; rule: string };
}

/**
 * The interior grid, per design. See PageKind for why this exists at all.
 *
 * Everything drawn here is margin furniture. The content column it returns is what the header,
 * the body and every exhibit are laid out against, so a design can move its own margin without
 * a single composition needing to know.
 */
function pageFrame(d: DeckDesign, ctx: Ctx, layout: DeckSlide["layout"] = "bullets"): Page {
  const base: Page = {
    background: d.paper,
    headWidth: CONTENT_W * 0.88,
    image: d.texture?.page,
    items: [],
    left: M,
    top: TOP,
    width: CONTENT_W,
  };
  const faint = mix(d.paper, d.ink, 0.13);
  // The wash over an interior material, before any furniture is drawn on top of it.
  if (base.image) base.items.push(rect(box(0, 0, SLIDE_W, SLIDE_H), d.paper, 100 - (d.texture?.pageScrim ?? 72)));
  switch (d.page) {
    case "rail": {
      // A rail down the binding edge. The oldest trick in report design and still the fastest
      // way to make a page look made rather than typed.
      base.items.push(rect(box(0, 0, 0.2, SLIDE_H), d.accent));
      base.items.push(rect(box(0.2, 0, 0.04, SLIDE_H), mix(d.paper, d.ink, 0.1)));
      base.left = M + 0.42;
      base.width = CONTENT_W - 0.42;
      break;
    }
    case "margin": {
      // An editorial margin column: a rule, and the page's own number set in it. Content moves
      // right, which is the single most legible way one design stops looking like another.
      const railX = M + 1.15;
      base.items.push(hair(box(railX, TOP - 0.1, 0, SLIDE_H - TOP - 1.0), faint, 0.006));
      // The design's mark, at the size the margin gives it. Setting the page NUMBER here read
      // as a stutter: the eyebrow two inches away already says which exhibit this is.
      base.items.push(...drawMark(d.mark, box(railX - 0.46, TOP + 0.02, 0.34, 0.34), d.accent));
      base.left = railX + 0.34;
      base.width = SLIDE_W - base.left - M;
      base.headWidth = base.width * 0.9;
      break;
    }
    case "corner": {
      // A wedge in the corner the content never reaches. The title is narrowed to guarantee it.
      base.items.push({ box: box(SLIDE_W - 1.6, 0, 1.6, 1.6), fill: d.accent, kind: "shape", rotate: 180, shape: "rtTriangle" });
      base.headWidth = CONTENT_W * 0.72;
      break;
    }
    case "tint": {
      // The whole page carries a breath of the accent. Warm, domestic, and completely safe:
      // nothing is drawn, so nothing can collide.
      base.background = mix(d.paper, d.accent, 0.07);
      break;
    }
    case "tab": {
      // A tab off the top edge, the way a printed report marks its section.
      base.items.push(rect(box(M, 0, 1.25, 0.26), d.accent));
      break;
    }
    case "dots": {
      for (let i = 0; i < 13; i += 1) {
        base.items.push({
          alpha: 62,
          box: box(SLIDE_W - 0.46, 1.05 + i * 0.42, 0.075, 0.075),
          fill: d.accent,
          kind: "shape",
          shape: "ellipse",
        });
      }
      base.width = CONTENT_W - 0.22;
      base.headWidth = base.width * 0.86;
      break;
    }
    case "frame": {
      base.items.push({ box: inset(box(0, 0, SLIDE_W, SLIDE_H), 0.3), kind: "shape", line: { color: faint, width: 0.006 }, shape: "rect" });
      base.left = M + 0.16;
      base.width = CONTENT_W - 0.32;
      break;
    }
    case "edge": {
      base.items.push(rect(edgeBand("right", 0.3), d.accent));
      base.width = CONTENT_W - 0.42;
      base.headWidth = base.width * 0.86;
      break;
    }
    case "photo-side": {
      // A full-bleed picture column, and the content set beside it.
      //
      // 🔴 ONLY WHERE THERE IS ROOM. A chart, a table or a row of figures needs the width of the
      // page; squeezing an exhibit into two-thirds of a slide to make space for decoration is a
      // worse deck, not a prettier one. On those layouts this page is simply a clean one.
      const wordy = layout === "bullets" || layout === "two_column" || layout === "agenda";
      const shots = d.texture?.gallery ?? [];
      if (!wordy || shots.length === 0) break;
      const column = 4.55;
      base.image = undefined;
      base.items.push({
        // Chosen by slide number: consecutive slides get different photographs.
        box: box(0, 0, column, SLIDE_H),
        data: shots[(ctx.index - 1) % shots.length] as string,
        kind: "image",
      });
      base.left = column + 0.72;
      base.width = SLIDE_W - base.left - M;
      base.headWidth = base.width;
      break;
    }
    case "foot": {
      // The footer moves INTO a band, which is why the page has to hand it down rather than let
      // footer() guess: the rule and the page number flip to the ink that band needs.
      const band = crossBand("bottom", 0.54);
      base.items.push(rect(band, d.deep));
      base.items.push(rect(box(0, band.y, SLIDE_W, 0.05), d.accent));
      base.foot = { band, ink: d.deepSoft, rule: mix(d.deep, d.deepInk, 0.25) };
      break;
    }
    default:
      break;
  }
  return base;
}

// ── page furniture ───────────────────────────────────────────────────────────────────────────

interface Head {
  items: SceneItem[];
  /** Where the content may start. */
  top: number;
}

/** Eyebrow, action title, action box and the rule under them. Returns where content begins. */
function header(d: DeckDesign, s: DeckSlide, ctx: Ctx, p: Page, opts: { eyebrow?: string; titleWidth?: number } = {}): Head {
  const items: SceneItem[] = [];
  const M = p.left;
  const CONTENT_W = p.width;
  const wide = opts.titleWidth ?? p.headWidth;
  let y = p.top;
  if (d.chrome !== "none") {
    const eyebrow = opts.eyebrow ?? `Exhibit ${ordinal(ctx.index)}`;
    items.push(
      text(eyebrow, box(M, y, CONTENT_W * 0.6, 0.22), d.fonts.body, T.eyebrow, d.accent, {
        bold: true,
        caps: d.kicker !== false,
        spacing: d.kicker === false ? 0 : 1.6,
      }),
    );
    y += 0.32;
  }
  items.push(text(s.title, box(M, y, wide, 1.0), d.fonts.display, fit(T.title, s.title), d.ink, { bold: true, lineSpacing: 1.08 }));
  y += s.title.length > 52 ? 1.02 : 0.72;
  if (s.takeaway && d.chrome === "full") {
    // The action box: consulting's one true habit. A tinted band carrying the "so what".
    const h = s.takeaway.length > 120 ? 0.72 : 0.52;
    items.push(rect(box(M, y, CONTENT_W, h), d.accent, 92));
    items.push(rect(box(M, y, 0.06, h), d.accent));
    items.push(
      text(s.takeaway, box(M + 0.22, y + 0.12, CONTENT_W - 0.5, h - 0.16), d.fonts.body, T.action, mix(d.ink, d.accent, 0.35), {
        lineSpacing: 1.14,
      }),
    );
    y += h + 0.28;
  } else if (s.takeaway) {
    items.push(text(s.takeaway, box(M, y, CONTENT_W * 0.8, 0.5), d.fonts.body, T.action, d.soft, { italic: true }));
    y += 0.6;
  } else {
    items.push(hair(box(M, y + 0.04, CONTENT_W, 0), d.chrome === "none" ? d.accent : mix(d.paper, d.ink, 0.18), d.chrome === "none" ? 0.028 : 0.008));
    y += 0.3;
  }
  return { items, top: y };
}

/** The footer rule, the page number, and the footnote line.
 *
 *  🔴 THE SOURCE LINE IS THE CANVAS'S, NOT THE MODEL'S. An exhibit with a "Source:" under it is
 *  the most institutional detail there is, and also the easiest to fake — so it is printed only
 *  from `plan.references`, which canvas-deliverables.ts fills from the canvas's real sources.
 *  A deck built from the model's own knowledge has no references and gets no source line. */
function footer(d: DeckDesign, s: DeckSlide, ctx: Ctx, p: Page, exhibit = false): SceneItem[] {
  if (d.chrome === "none") return [];
  const M = p.left;
  const CONTENT_W = p.width;
  // A design with a banded foot sets its footer INSIDE the band, in the band's own ink.
  const y = p.foot ? p.foot.band.y + 0.15 : SLIDE_H - FOOT - 0.18;
  const ink = p.foot ? p.foot.ink : d.muted;
  const items: SceneItem[] = p.foot ? [] : [hair(box(M, y, CONTENT_W, 0), mix(d.paper, d.ink, 0.14), 0.006)];
  const source = exhibit && ctx.plan.references.length ? ctx.plan.references[0] : undefined;
  const sourceLine = source
    ? `Source: ${source.title}${ctx.plan.references.length > 1 ? ` and ${ctx.plan.references.length - 1} other source${ctx.plan.references.length > 2 ? "s" : ""}` : ""}`
    : "";
  const foot = [sourceLine, s.note].filter(Boolean).join("   ·   ");
  if (foot) {
    items.push(text(foot, box(M, y + 0.1, CONTENT_W * 0.72, 0.3), d.fonts.body, T.note, ink));
  }
  items.push(
    text(`${ctx.credit}  ·  ${ctx.index}`, box(M + CONTENT_W - 3, y + 0.1, 3, 0.3), d.fonts.body, T.footer, ink, {
      align: "right",
    }),
  );
  return items;
}

/** The default grid, for the full-page compositions (stat, quote) that dress themselves and
 *  only need the footer to know where the margins are. */
const plainPage = (d: DeckDesign): Page => ({
  background: d.paper,
  headWidth: CONTENT_W * 0.88,
  items: [],
  left: M,
  top: TOP,
  width: CONTENT_W,
});

/** Where content lives on a chromed slide. */
const contentArea = (p: Page, top: number): Box =>
  box(p.left, top, p.width, SLIDE_H - top - FOOT - 0.42 - (p.foot ? 0.28 : 0));

// ── covers ───────────────────────────────────────────────────────────────────────────────────

function composeCover(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const heading = s.title || ctx.plan.title;
  const sub = s.subtitle || ctx.plan.subtitle;
  const items: SceneItem[] = [];
  let background = d.paper;
  let overlay: Scene["overlay"];
  const picture = d.texture?.cover;
  // A dark picture turns the whole cover into a dark field, so every ink on it flips.
  const onDark = Boolean(picture && d.texture?.dark);
  const pageInk = onDark ? d.deepInk : d.ink;
  const pageSoft = onDark ? d.deepSoft : d.soft;
  const pageRule = onDark ? d.deepSoft : d.ink;
  // The accent is chosen to sit on the PAGE; on a dark picture it goes dim, so kickers there
  // use the ink meant for dark ground instead.
  const pageAccent = onDark ? d.accentInk : d.accent;
  if (picture) {
    // 🔴 A SCRIM IS THE PAGE'S OWN GROUND, NOT ALWAYS A DARK ONE. The first version always
    // washed with `deep`, which is right over slate and wrong over raw canvas: a light material
    // under dark type needs PAPER laid over it to calm the weave down, or the title fights the
    // texture for every letter. Which one is used follows the same declaration as the ink.
    background = onDark ? d.deep : d.paper;
    if (d.texture?.scrim && d.cover !== "photo") {
      items.push(rect(box(0, 0, SLIDE_W, SLIDE_H), onDark ? d.deep : d.paper, 100 - d.texture.scrim));
    }
  }
  type Align = "left" | "center" | "right";
  const kick = (t: string, b: Box, color: string, align?: Align) =>
    text(t, b, d.fonts.body, T.eyebrow, color, { align, bold: true, caps: d.kicker !== false, spacing: d.kicker === false ? 0 : 1.7 });
  const titleAt = (b: Box, color: string, align?: Align, size: number = T.cover) =>
    text(heading, b, d.fonts.display, fit(size, heading), color, { align, bold: true, lineSpacing: 1.04 });
  const subAt = (b: Box, color: string, align?: Align) =>
    text(sub, b, d.fonts.body, 14.5, color, { align, lineSpacing: 1.25 });

  switch (d.cover) {
    case "band-left": {
      const band = edgeBand("left", SLIDE_W * 0.36);
      items.push(rect(band, d.accent));
      items.push(kick(ctx.credit, box(M, M, band.w - M * 1.4, 0.3), d.accentInk));
      items.push(kick("Prepared for the reader", box(M, SLIDE_H - M - 0.3, band.w - M * 1.4, 0.3), mix(d.accent, d.accentInk, 0.65)));
      items.push(titleAt(box(band.w + 0.85, 2.25, SLIDE_W - band.w - 0.85 - M, 2.6), pageInk));
      if (sub) items.push(subAt(box(band.w + 0.85, 4.65, SLIDE_W - band.w - 1.8, 1.4), pageSoft));
      break;
    }
    case "band-bottom": {
      background = d.deep;
      const band = crossBand("bottom", SLIDE_H * 0.3);
      items.push(rect(band, d.accent));
      items.push(kick(ctx.credit, box(M, 1.45, CONTENT_W, 0.3), mix(d.deep, d.accent, 0.75)));
      items.push(titleAt(box(M, 2.05, CONTENT_W * 0.82, 2.4), d.deepInk));
      if (sub) items.push(subAt(box(M, band.y + 0.7, CONTENT_W * 0.72, 1.3), d.accentInk));
      break;
    }
    case "split-diagonal": {
      background = d.deep;
      items.push({ box: box(0, 0, SLIDE_W, SLIDE_H), fill: d.accent, kind: "shape", shape: "rtTriangle" });
      items.push(titleAt(box(M, 4.15, CONTENT_W * 0.6, 2.1), d.deepInk, "left", 38));
      if (sub) items.push(subAt(box(M, 6.15, CONTENT_W * 0.5, 0.9), d.deepSoft));
      items.push(kick(ctx.credit, box(SLIDE_W - M - 3.4, M, 3.4, 0.3), d.accentInk, "right"));
      break;
    }
    case "frame": {
      const f = inset(box(0, 0, SLIDE_W, SLIDE_H), 0.5);
      items.push({ box: f, kind: "shape", line: { color: d.accent, width: 0.018 }, shape: "rect" });
      items.push(kick(ctx.credit, box(M, 1.55, CONTENT_W, 0.3), pageAccent, "center"));
      items.push(titleAt(box(M + 0.7, 2.6, CONTENT_W - 1.4, 2.3), pageInk, "center", 42));
      items.push(hair(box(SLIDE_W / 2 - 0.45, 5.2, 0.9, 0), d.accent, 0.022));
      if (sub) items.push(subAt(box(M + 1.3, 5.55, CONTENT_W - 2.6, 1), pageSoft, "center"));
      break;
    }
    case "numeral": {
      background = d.deep;
      const nb = box(SLIDE_W - 5.3, 0.5, 4.6, 3.2);
      items.push(
        text(ordinal(1), nb, d.fonts.display, fitNumeral("01", nb.w, nb.h), mix(d.deep, d.accent, 0.3), {
          align: "right",
          bold: true,
        }),
      );
      items.push(kick(ctx.credit, box(M, M, CONTENT_W * 0.5, 0.3), pageAccent));
      items.push(titleAt(box(M, 4.0, CONTENT_W * 0.66, 2.2), d.deepInk));
      if (sub) items.push(subAt(box(M, 6.0, CONTENT_W * 0.55, 0.9), d.deepSoft));
      break;
    }
    case "stack-bars": {
      [4.4, 2.9, 1.6].forEach((w, i) => items.push(rect(box(M, 1.3 + i * 0.3, w, 0.14), d.accent, i * 26)));
      items.push(titleAt(box(M, 2.85, CONTENT_W * 0.76, 2.4), pageInk));
      if (sub) items.push(subAt(box(M, 5.25, CONTENT_W * 0.6, 1.2), pageSoft));
      items.push(kick(ctx.credit, box(M, SLIDE_H - M - 0.3, CONTENT_W, 0.3), d.muted));
      break;
    }
    case "circle": {
      background = d.deep;
      items.push({ box: box(SLIDE_W - 4.9, -1.6, 6.2, 6.2), fill: d.accent, kind: "shape", shape: "ellipse" });
      items.push(kick(ctx.credit, box(M, M, 4.6, 0.3), d.deepSoft));
      items.push(titleAt(box(M, 3.5, CONTENT_W * 0.56, 2.3), d.deepInk));
      if (sub) items.push(subAt(box(M, 5.75, CONTENT_W * 0.46, 1), d.deepSoft));
      break;
    }
    case "panel-right": {
      const panel = edgeBand("right", SLIDE_W * 0.36);
      items.push(rect(panel, d.deep));
      items.push(titleAt(box(M, 2.45, SLIDE_W - panel.w - M - 0.85, 2.6), pageInk));
      items.push(hair(box(M, 2.1, 1.0, 0), d.accent, 0.028));
      items.push(kick(ctx.credit, box(panel.x + 0.75, 2.45, panel.w - 1.4, 0.3), d.accent));
      if (sub) items.push(subAt(box(panel.x + 0.75, 2.95, panel.w - 1.4, 2), d.deepSoft));
      break;
    }
    case "editorial": {
      items.push(hair(box(M, 1.75, CONTENT_W, 0), mix(background, pageRule, 0.45), 0.008));
      items.push(kick(ctx.credit, box(M, 2.05, CONTENT_W, 0.3), pageAccent, "center"));
      items.push(titleAt(box(M + 0.8, 2.8, CONTENT_W - 1.6, 2.5), pageInk, "center", 46));
      if (sub) items.push(subAt(box(M + 1.5, 5.35, CONTENT_W - 3, 1), pageSoft, "center"));
      items.push(hair(box(M, SLIDE_H - 1.75, CONTENT_W, 0), mix(background, pageRule, 0.45), 0.008));
      break;
    }
    case "corner-blocks": {
      items.push(rect(box(0, 0, 1.4, 1.4), d.accent));
      items.push(rect(box(SLIDE_W - 2.6, SLIDE_H - 0.5, 2.6, 0.5), d.deep));
      items.push(kick(ctx.credit, box(M, 2.3, CONTENT_W, 0.3), pageAccent));
      items.push(titleAt(box(M, 2.85, CONTENT_W * 0.68, 2.4), pageInk));
      if (sub) items.push(subAt(box(M, 5.25, CONTENT_W * 0.54, 1.2), pageSoft));
      break;
    }
    case "ribbon": {
      const ribbon = box(0, 2.5, SLIDE_W, 2.3);
      items.push(rect(ribbon, d.deep));
      items.push(rect(box(0, 2.36, SLIDE_W, 0.12), d.accent));
      items.push(titleAt(box(M, ribbon.y + 0.5, CONTENT_W * 0.78, 1.5), d.deepInk, "left", 38));
      items.push(kick(ctx.credit, box(M, 1.7, CONTENT_W, 0.3), d.muted));
      if (sub) items.push(subAt(box(M, ribbon.y + ribbon.h + 0.4, CONTENT_W * 0.6, 1), pageSoft));
      break;
    }
    case "grid-dots": {
      for (let r = 0; r < 6; r += 1) {
        for (let c = 0; c < 6; c += 1) {
          items.push({
            alpha: 55,
            box: box(SLIDE_W - 4.1 + c * 0.4, 1.0 + r * 0.4, 0.09, 0.09),
            fill: d.accent,
            kind: "shape",
            shape: "ellipse",
          });
        }
      }
      items.push(kick(ctx.credit, box(M, 2.4, CONTENT_W * 0.55, 0.3), pageAccent));
      items.push(titleAt(box(M, 2.95, CONTENT_W * 0.58, 2.3), pageInk));
      if (sub) items.push(subAt(box(M, 5.3, CONTENT_W * 0.48, 1.2), pageSoft));
      break;
    }
    case "arc-corner": {
      background = d.deep;
      items.push({ box: box(-2.6, SLIDE_H - 4.2, 6.2, 6.2), fill: d.accent, kind: "shape", shape: "ellipse" });
      items.push(kick(ctx.credit, box(SLIDE_W * 0.34, 2.1, 4, 0.3), d.accent));
      items.push(titleAt(box(SLIDE_W * 0.34, 2.65, SLIDE_W * 0.56, 2.5), d.deepInk));
      if (sub) items.push(subAt(box(SLIDE_W * 0.34, 5.1, SLIDE_W * 0.44, 1.2), d.deepSoft));
      break;
    }
    case "half-split": {
      const left = edgeBand("left", SLIDE_W / 2);
      items.push(rect(left, d.accent));
      items.push(kick(ctx.credit, box(M, 2.35, left.w - M * 2, 0.3), d.accentInk));
      items.push(titleAt(box(M, 2.85, left.w - M - 0.65, 2.6), d.accentInk, "left", 36));
      items.push(hair(box(left.w + 0.85, 2.7, 0.9, 0), d.accent, 0.028));
      if (sub) items.push(subAt(box(left.w + 0.85, 3.0, SLIDE_W / 2 - 1.7, 2), pageSoft));
      break;
    }
    case "photo": {
      // Built for a photograph and nothing else: no colour block competes with the picture, and
      // the type sits at the bottom where a stacked scrim makes it legible whatever the image
      // does up there. (A band-bottom cover over a photo reads as two designs arguing.)
      background = d.deep;
      overlay = { color: d.deep, start: 0.3, strength: 0.88 };
      items.push(kick(ctx.credit, box(M, SLIDE_H - 3.3, CONTENT_W * 0.6, 0.3), d.accentInk));
      items.push(titleAt(box(M, SLIDE_H - 2.85, CONTENT_W * 0.74, 1.7), d.deepInk, "left", 42));
      if (sub) items.push(subAt(box(M, SLIDE_H - 1.15, CONTENT_W * 0.62, 0.8), d.deepSoft));
      break;
    }
    default: {
      background = d.deep;
      items.push(kick(ctx.credit, box(M, M, CONTENT_W, 0.3), d.accent));
      items.push(titleAt(box(M, 3.1, CONTENT_W * 0.72, 2.4), d.deepInk));
      if (sub) items.push(subAt(box(M, 5.5, CONTENT_W * 0.58, 1.2), d.deepSoft));
    }
  }
  return {
    background: { art: d.cover === "art-glow" ? d.art?.cover : undefined, color: background, image: picture },
    items,
    motion: d.motion,
    overlay,
  };
}

// ── agenda ───────────────────────────────────────────────────────────────────────────────────

function composeAgenda(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const p = pageFrame(d, ctx, "agenda");
  const items: SceneItem[] = [...p.items];
  const entries = s.points.slice(0, 6);
  items.push(text(s.title || "Agenda", box(p.left, p.top, p.width * 0.7, 0.9), d.fonts.display, T.title, d.ink, { bold: true }));
  items.push(hair(box(p.left, p.top + 0.78, p.width, 0), mix(d.paper, d.ink, 0.2), 0.008));
  const area = box(p.left, p.top + 1.15, p.width, SLIDE_H - p.top - 1.15 - FOOT - 0.5 - (p.foot ? 0.3 : 0));
  const lines = rows(area, Math.max(entries.length, 1), 0.06);
  entries.forEach((entry, i) => {
    const r = lines[i];
    if (!r) return;
    items.push(text(ordinal(i + 1), box(r.x, r.y + 0.06, 0.8, r.h), d.fonts.display, 20, d.accent, { bold: true }));
    items.push(text(entry, box(r.x + 1.0, r.y + 0.1, r.w - 1.4, r.h), d.fonts.body, 15, i === 0 ? d.ink : d.soft, { bold: i === 0 }));
    items.push(hair(box(r.x, r.y + r.h - 0.02, r.w, 0), mix(d.paper, d.ink, 0.12), 0.006));
  });
  items.push(...footer(d, s, ctx, p));
  return { background: { color: p.background, image: p.image }, items, motion: d.motion };
}

// ── how an exhibit is dressed ────────────────────────────────────────────────────────────────

/**
 * The frame around a chart, a table or a row of figures.
 *
 * 🔴 THIS IS WHERE MOST OF "IT LOOKS LIKE THE SAME POWERPOINT" LIVED. Covers were recomposed
 * fifteen ways while every exhibit in every design was one bare plot on white — and exhibits
 * are most of a working deck. Returns the furniture plus the box the exhibit itself may use.
 */
function exhibitFrame(d: DeckDesign, area: Box): { items: SceneItem[]; inner: Box } {
  const edge = mix(d.paper, d.ink, 0.16);
  switch (d.exhibit) {
    case "framed":
      return {
        inner: inset(area, 0.3),
        items: [{ box: area, kind: "shape", line: { color: edge, width: 0.006 }, shape: "rect" }],
      };
    case "tinted":
      return { inner: inset(area, 0.3), items: [rect(area, d.accent, 95)] };
    case "ruled":
      return {
        inner: box(area.x, area.y + 0.22, area.w, area.h - 0.44),
        items: [
          hair(box(area.x, area.y, area.w, 0), d.accent, 0.02),
          hair(box(area.x, area.y + area.h, area.w, 0), mix(d.paper, d.ink, 0.25), 0.008),
        ],
      };
    case "card":
      return {
        inner: inset(area, 0.34),
        items: [
          { box: area, fill: d.paper, kind: "shape", radius: 0.04, shape: "roundRect" },
          { box: area, kind: "shape", line: { color: edge, width: 0.006 }, radius: 0.04, shape: "roundRect" },
          rect(box(area.x + 0.02, area.y, area.w - 0.04, 0.055), d.accent),
        ],
      };
    default:
      return { inner: area, items: [] };
  }
}

/** Whether this design's exhibits carry gridlines. A tinted or carded plot reads cleaner
 *  without them; an open one needs them or the eye has nothing to measure against. */
const griddy = (d: DeckDesign): boolean => d.exhibit === "open" || d.exhibit === "framed" || d.exhibit === "ruled";

/** A bar, in this design's idiom. */
function barOf(d: DeckDesign, b: Box, fill: string): SceneItem {
  return d.exhibit === "card" || d.exhibit === "tinted"
    ? { box: b, fill, kind: "shape", radius: 0.14, shape: "roundRect" }
    : rect(b, fill);
}

// ── exhibits: kpi, chart, table ──────────────────────────────────────────────────────────────

function composeKpi(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const p = pageFrame(d, ctx, "kpi");
  const head = header(d, s, ctx, p, { eyebrow: "Key figures" });
  const items = [...p.items, ...head.items];
  const area = contentArea(p, head.top);
  const figures = s.data.slice(0, 4);
  // The figures own the page: the block is as tall as it needs and sits a third down the slack.
  const blockH = Math.min(area.h, 3.0);
  const band = box(area.x, area.y + Math.max(0, (area.h - blockH) / 3), area.w, blockH);
  // Two ways to separate figures, and they look nothing alike: a tear sheet rules between its
  // columns, a dashboard puts each one on its own card.
  const carded = d.exhibit === "card" || d.exhibit === "tinted" || d.exhibit === "framed";
  const cols = columns(band, Math.max(figures.length, 1), carded ? 0.26 : 0.4);
  figures.forEach((datum, i) => {
    const c = cols[i];
    if (!c) return;
    let cell = c;
    if (carded) {
      if (d.exhibit === "framed") {
        items.push({ box: c, kind: "shape", line: { color: mix(d.paper, d.ink, 0.16), width: 0.006 }, shape: "rect" });
      } else if (d.exhibit === "tinted") {
        items.push(rect(c, d.accent, 94));
      } else {
        items.push({ box: c, fill: d.paper, kind: "shape", radius: 0.04, shape: "roundRect" });
        items.push({ box: c, kind: "shape", line: { color: mix(d.paper, d.ink, 0.14), width: 0.006 }, radius: 0.04, shape: "roundRect" });
        items.push(rect(box(c.x + 0.02, c.y, c.w - 0.04, 0.05), d.accent));
      }
      cell = inset(c, 0.28);
    } else if (i > 0) {
      items.push(hair(box(c.x - 0.2, c.y + 0.1, 0, c.h * 0.82), mix(d.paper, d.ink, 0.16), 0.006));
    }
    const value = figure(datum.value, s.unit);
    items.push(
      text(value, box(cell.x, cell.y + 0.1, cell.w, 1.3), d.fonts.display, fitNumeral(value, cell.w * 0.98, 1.0), d.accent, {
        bold: true,
      }),
    );
    if (d.exhibit === "card" || d.exhibit === "tinted") {
      items.push(...drawMark(d.mark, box(cell.x, cell.y + 1.42, 0.2, 0.2), d.accent));
    } else {
      items.push(hair(box(cell.x, cell.y + 1.35, Math.min(1.1, cell.w * 0.4), 0), d.accent, 0.022));
    }
    items.push(
      text(datum.label, box(cell.x, cell.y + 1.72, cell.w - 0.1, cell.h - 1.72), d.fonts.body, T.label, d.soft, {
        lineSpacing: 1.2,
      }),
    );
  });
  items.push(...footer(d, s, ctx, p, true));
  return { background: { color: p.background, image: p.image }, items, motion: d.motion };
}

/** The plot area's own furniture: two faint gridlines and a baseline. Designs that dress their
 *  exhibits in a tint or a card drop the gridlines — the panel already gives the eye an edge. */
function plotFrame(d: DeckDesign, plot: Box): SceneItem[] {
  const grid = mix(d.paper, d.ink, 0.1);
  const base = hair(box(plot.x, plot.y + plot.h, plot.w, 0), mix(d.paper, d.ink, 0.35), 0.008);
  if (!griddy(d)) return [base];
  return [
    hair(box(plot.x, plot.y + plot.h * 0.34, plot.w, 0), grid, 0.005),
    hair(box(plot.x, plot.y + plot.h * 0.67, plot.w, 0), grid, 0.005),
    base,
  ];
}

function columnChart(d: DeckDesign, data: DeckDatum[], unit: string, area: Box): SceneItem[] {
  const items: SceneItem[] = [];
  const plot = box(area.x, area.y + 0.3, area.w, area.h - 0.95);
  const top = Math.max(...data.map((p) => Math.abs(p.value)), 1);
  const band = plot.w / data.length;
  // A block plot fills its band; every other style leaves air around the mark.
  const barW = d.plot === "block" ? band * 0.94 : Math.min(1.15, band * 0.5);
  items.push(...plotFrame(d, plot));
  data.forEach((point, i) => {
    // Small values still have to be visible: a bar that rounds to nothing reads as missing data.
    const h = Math.max((Math.abs(point.value) / top) * (plot.h - 0.4), 0.07);
    const x = plot.x + band * i + (band - barW) / 2;
    const y = plot.y + plot.h - h;
    // The last bar is the point of most exhibits, so it wears the accent and the rest recede.
    const last = i === data.length - 1;
    const fill = last ? d.accent : d.second;
    // The track is drawn WIDER than its bar. Exactly as wide read as a rendering mistake, and
    // it also let the tests confuse a track for a bar.
    if (d.plot === "track") {
      items.push(rect(box(x - 0.07, plot.y + 0.12, barW + 0.14, plot.h - 0.12), mix(d.paper, d.ink, 0.055)));
    }
    if (d.plot === "lollipop") {
      // The stem runs the FULL height of the value and the mark caps it. Stopping the stem
      // short of the mark made the smallest value a negative-height rectangle, which drew
      // nothing at all — the one thing a plot may never do to a number it was given.
      items.push(rect(box(x + barW / 2 - 0.022, y, 0.044, h), mix(d.paper, fill, 0.5)));
      items.push(...drawMark(d.mark, box(x + barW / 2 - 0.15, y - 0.15, 0.3, 0.3), fill));
    } else if (d.plot === "outline") {
      items.push(rect(box(x, y, barW, h), fill, 86));
      items.push({ box: box(x, y, barW, h), kind: "shape", line: { color: fill, width: 0.018 }, shape: "rect" });
    } else {
      items.push(barOf(d, box(x, y, barW, h), fill));
    }
    // A block plot sets its figure INSIDE the bar — but only where the bar is tall enough to
    // hold it. The 4.5% bar on a 100% scale is a sliver, and a label inside it would be gone.
    const inside = d.plot === "block" && h > 0.62;
    items.push(
      text(
        figure(point.value, unit),
        inside
          ? box(x, y + 0.14, barW, 0.32)
          : box(x - band * 0.24, y - (d.plot === "lollipop" ? 0.55 : 0.32), barW + band * 0.48, 0.3),
        d.fonts.body,
        T.value,
        inside ? (last ? d.accentInk : d.ink) : d.ink,
        { align: "center", bold: true },
      ),
    );
    items.push(
      text(point.label, box(x - band * 0.24, plot.y + plot.h + 0.12, barW + band * 0.48, 0.5), d.fonts.body, T.label, d.soft, {
        align: "center",
        lineSpacing: 1.1,
      }),
    );
  });
  return items;
}

function barChart(d: DeckDesign, data: DeckDatum[], unit: string, area: Box): SceneItem[] {
  const items: SceneItem[] = [];
  const labelW = Math.min(3.2, area.w * 0.26);
  const plot = box(area.x + labelW + 0.25, area.y + 0.1, area.w - labelW - 1.15, area.h - 0.3);
  const top = Math.max(...data.map((p) => Math.abs(p.value)), 1);
  const lines = rows(plot, data.length, 0.16);
  data.forEach((point, i) => {
    const r = lines[i];
    if (!r) return;
    const h = Math.min(r.h, 0.46);
    const w = (Math.abs(point.value) / top) * plot.w;
    const y = r.y + (r.h - h) / 2;
    items.push(text(point.label, box(area.x, y - 0.02, labelW, h + 0.1), d.fonts.body, T.label, d.soft, { align: "right", valign: "middle" }));
    if (d.plot === "track") items.push(rect(box(plot.x, y - 0.05, plot.w, h + 0.1), mix(d.paper, d.ink, 0.055)));
    const fill = i === 0 ? d.accent : d.second;
    if (d.plot === "outline") {
      items.push(rect(box(plot.x, y, Math.max(w, 0.04), h), fill, 86));
      items.push({ box: box(plot.x, y, Math.max(w, 0.04), h), kind: "shape", line: { color: fill, width: 0.018 }, shape: "rect" });
    } else {
      items.push(barOf(d, box(plot.x, y, Math.max(w, 0.04), h), fill));
    }
    items.push(
      text(figure(point.value, unit), box(plot.x + w + 0.12, y - 0.02, 1.0, h + 0.1), d.fonts.body, T.value, d.ink, {
        bold: true,
        valign: "middle",
      }),
    );
  });
  items.push(hair(box(plot.x - 0.06, plot.y, 0, plot.h), mix(d.paper, d.ink, 0.35), 0.008));
  return items;
}

function lineChart(d: DeckDesign, data: DeckDatum[], unit: string, area: Box): SceneItem[] {
  const items: SceneItem[] = [];
  const plot = box(area.x + 0.1, area.y + 0.45, area.w - 0.5, area.h - 1.05);
  const values = data.map((p) => p.value);
  const top = Math.max(...values);
  const bottom = Math.min(...values, 0);
  const span = Math.max(top - bottom, 1);
  const step = data.length > 1 ? plot.w / (data.length - 1) : 0;
  const at = (i: number, v: number) => ({ x: plot.x + step * i, y: plot.y + plot.h - ((v - bottom) / span) * plot.h });
  items.push(...plotFrame(d, plot));
  for (let i = 0; i < data.length - 1; i += 1) {
    const a = at(i, values[i] ?? 0);
    const b = at(i + 1, values[i + 1] ?? 0);
    items.push({ box: box(a.x, a.y, b.x - a.x, b.y - a.y), kind: "shape", line: { color: d.accent, width: 0.032 }, shape: "line" });
  }
  data.forEach((point, i) => {
    const p = at(i, point.value);
    if (d.plot === "lollipop" || d.plot === "outline") {
      items.push(...drawMark(d.mark, box(p.x - 0.115, p.y - 0.115, 0.23, 0.23), d.accent));
    } else {
      items.push({ box: box(p.x - 0.075, p.y - 0.075, 0.15, 0.15), fill: d.accent, kind: "shape", shape: "ellipse" });
    }
    items.push(text(point.label, box(p.x - 0.8, plot.y + plot.h + 0.14, 1.6, 0.4), d.fonts.body, T.label, d.soft, { align: "center" }));
    if (i === 0 || i === data.length - 1) {
      items.push(
        text(figure(point.value, unit), box(p.x - 0.8, p.y - 0.42, 1.6, 0.3), d.fonts.body, T.value, d.ink, {
          align: "center",
          bold: true,
        }),
      );
    }
  });
  return items;
}

function composeChart(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const p = pageFrame(d, ctx, "chart");
  const head = header(d, s, ctx, p);
  const items = [...p.items, ...head.items];
  const dress = exhibitFrame(d, contentArea(p, head.top));
  items.push(...dress.items);
  const area = dress.inner;
  const data = s.data.slice(0, 8);
  if (data.length === 0) {
    items.push(text(s.points.join("  ·  "), box(area.x, area.y, area.w, area.h), d.fonts.body, T.body, d.soft));
  } else if (s.chart === "bar") {
    items.push(...barChart(d, data, s.unit, area));
  } else if (s.chart === "line") {
    items.push(...lineChart(d, data, s.unit, area));
  } else {
    items.push(...columnChart(d, data, s.unit, area));
  }
  items.push(...footer(d, s, ctx, p, true));
  return { background: { color: p.background, image: p.image }, items, motion: d.motion };
}

function composeTable(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const p = pageFrame(d, ctx, "table");
  const head = header(d, s, ctx, p);
  const items = [...p.items, ...head.items];
  const dress = exhibitFrame(d, contentArea(p, head.top));
  items.push(...dress.items);
  const area = dress.inner;
  // Two honest ways to rule a table: a hairline under every row, or banded rows and no rules.
  // Doing both is the look of a spreadsheet that got away from someone.
  const zebra = d.exhibit === "tinted" || d.exhibit === "card";
  const heads = s.columns.length ? s.columns : (s.rows[0] ?? []).map((_, i) => `Column ${i + 1}`);
  const bodyRows = s.rows.slice(0, 7);
  const cols = columns(area, Math.max(heads.length, 1), 0.28);
  const headH = 0.36;
  // A three-row table on a 7.5in page looks abandoned at the top. Rows stretch toward the
  // footer, and whatever slack is left pushes the block down a third of it — optically centred
  // against a page that has furniture at the bottom.
  const rowH = Math.max(0.44, Math.min(0.88, (area.h - headH - 0.25) / Math.max(bodyRows.length, 1)));
  const used = headH + 0.14 + rowH * bodyRows.length;
  const slack = Math.max(0, area.h - used);
  const top = area.y + slack / 3;
  // A number belongs on the right; text belongs on the left. Same rule every printed table obeys.
  const numeric = (cell: string): boolean => /^[^a-z]*\d/i.test(cell) && /\d/.test(cell) && cell.length <= 12;
  heads.forEach((heading, i) => {
    const c = cols[i];
    if (!c) return;
    items.push(
      text(heading, box(c.x, top, c.w, headH), d.fonts.body, T.label, d.ink, {
        align: i > 0 && bodyRows.every((r) => numeric(r[i] ?? "")) ? "right" : "left",
        bold: true,
        caps: true,
        spacing: 0.8,
      }),
    );
  });
  items.push(hair(box(area.x, top + headH, area.w, 0), d.accent, 0.022));
  bodyRows.forEach((row, r) => {
    const y = top + headH + 0.14 + r * rowH;
    if (zebra && r % 2 === 1) items.push(rect(box(area.x - 0.12, y - 0.02, area.w + 0.24, rowH - 0.02), d.accent, 95));
    row.forEach((cell, i) => {
      const c = cols[i];
      if (!c) return;
      items.push(
        text(cell, box(c.x, y + rowH / 2 - 0.14, c.w, 0.34), d.fonts.body, T.body, i === 0 ? d.ink : d.soft, {
          align: numeric(cell) && i > 0 ? "right" : "left",
          bold: i === 0,
        }),
      );
    });
    if (!zebra && r < bodyRows.length - 1) {
      items.push(hair(box(area.x, y + rowH - 0.06, area.w, 0), mix(d.paper, d.ink, 0.12), 0.006));
    }
  });
  items.push(...footer(d, s, ctx, p, true));
  return { background: { color: p.background, image: p.image }, items, motion: d.motion };
}

// ── section breaks ───────────────────────────────────────────────────────────────────────────

function composeSection(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  // Same rule as the cover: a section built on a dark picture cannot set its title in page ink.
  // (Quarry taught this on the cover; a chalkboard section break would have repeated it.)
  const onDark = Boolean(d.texture?.section && d.texture.dark);
  const pageInk = onDark ? d.deepInk : d.ink;
  const title = (b: Box, color: string) =>
    text(s.title, b, d.fonts.display, fit(T.sectionTitle, s.title), color, { bold: true, lineSpacing: 1.06 });
  const part = `Part ${ordinal(ctx.index)}`;
  switch (d.section) {
    case "solid-numeral": {
      background = d.accent;
      const nb = box(SLIDE_W - 4.9, 0.9, 4.2, 3.4);
      items.push(
        text(ordinal(ctx.index), nb, d.fonts.display, fitNumeral(ordinal(ctx.index), nb.w, nb.h), mix(d.accent, d.accentInk, 0.28), {
          align: "right",
          bold: true,
        }),
      );
      items.push(title(box(M, 3.3, CONTENT_W * 0.58, 2.4), d.accentInk));
      items.push(hair(box(M, 3.05, 1.0, 0), d.accentInk, 0.022));
      break;
    }
    case "band": {
      items.push(rect(crossBand("top", 2.4), d.deep));
      items.push(text(part, box(M, 1.0, 4, 0.3), d.fonts.body, T.eyebrow, d.accent, { bold: true, caps: true, spacing: 1.7 }));
      items.push(title(box(M, 3.05, CONTENT_W * 0.7, 2.2), pageInk));
      break;
    }
    case "split": {
      items.push(rect(edgeBand("left", SLIDE_W * 0.4), d.deep));
      const nb = box(M, 2.7, 2.6, 2.2);
      items.push(
        text(ordinal(ctx.index), nb, d.fonts.display, fitNumeral(ordinal(ctx.index), nb.w, nb.h), d.accent, { bold: true }),
      );
      items.push(title(box(SLIDE_W * 0.4 + 0.85, 3.1, SLIDE_W * 0.5, 2), pageInk));
      break;
    }
    case "rule": {
      items.push(...drawMark(d.mark, box(M, 2.28, 0.42, 0.42), d.accent));
      items.push(text(part, box(M, 2.85, 4, 0.3), d.fonts.body, T.eyebrow, d.accent, { bold: true, caps: true, spacing: 1.7 }));
      items.push(hair(box(M, 3.3, CONTENT_W, 0), d.accent, 0.026));
      items.push(title(box(M, 3.65, CONTENT_W * 0.78, 2), pageInk));
      break;
    }
    default: {
      background = d.deep;
      items.push(text(part, box(M, 2.85, 4, 0.3), d.fonts.body, T.eyebrow, d.accent, { bold: true, caps: true, spacing: 1.7 }));
      items.push(title(box(M, 3.35, CONTENT_W * 0.72, 2.2), d.deepInk));
    }
  }
  if (d.texture?.section && d.texture.scrim) {
    items.unshift(rect(box(0, 0, SLIDE_W, SLIDE_H), onDark ? d.deep : d.paper, 100 - d.texture.scrim));
  }
  return {
    background: {
      art: d.section === "art" ? d.art?.section : undefined,
      color: d.texture?.section ? (onDark ? d.deep : d.paper) : background,
      image: d.texture?.section,
    },
    items,
    motion: d.motion,
  };
}

// ── body slides ──────────────────────────────────────────────────────────────────────────────

/** A list set with the design's own mark in front of each line (deck-marks.ts). The mark sits
 *  in its own column: a marker that shares a box with the words is how text gets blocked. */
function markedList(d: DeckDesign, area: Box, points: string[], size = T.body): SceneItem[] {
  const items: SceneItem[] = [];
  const lines = rows(area, Math.max(points.length, 1), 0.14);
  const m = 0.18;
  points.forEach((point, i) => {
    const r = lines[i];
    if (!r) return;
    items.push(...drawMark(d.mark, box(r.x + 0.02, r.y + 0.035, m, m), d.accent));
    items.push(text(point, box(r.x + m + 0.26, r.y, r.w - m - 0.26, r.h), d.fonts.body, size, d.soft, { lineSpacing: 1.26 }));
  });
  return items;
}

function composeBody(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const points = s.points.slice(0, 5);
  const p = pageFrame(d, ctx, s.layout);
  const items: SceneItem[] = [...p.items];
  let background = p.background;

  // Designs whose body treatment owns the whole page draw their own header; the rest use the
  // shared one, which is what gives the set its institutional consistency.
  const ownsPage = d.body === "rail" || d.body === "panel-title" || d.body === "banner";

  if (!ownsPage) {
    const head = header(d, s, ctx, p);
    items.push(...head.items);
    const area = contentArea(p, head.top);
    switch (d.body) {
      case "cards": {
        const grid = cells(area, points.length || 1, 0.3);
        const tight = points.length > 3;
        points.forEach((point, i) => {
          const c = grid[i];
          if (!c) return;
          items.push({ alpha: 93, box: c, fill: d.accent, kind: "shape", radius: 0.05, shape: "roundRect" });
          items.push(rect(box(c.x, c.y, 0.055, c.h), d.accent));
          items.push(...drawMark(d.mark, box(c.x + 0.3, c.y + 0.24, 0.3, 0.3), d.accent));
          items.push(text(point, box(c.x + 0.3, c.y + 0.78, c.w - 0.6, c.h - 0.98), d.fonts.body, tight ? 12 : 13.5, d.soft, { lineSpacing: 1.2 }));
        });
        break;
      }
      case "numbered": {
        const lines = rows(area, Math.max(points.length, 1), 0.1);
        points.forEach((point, i) => {
          const r = lines[i];
          if (!r) return;
          items.push(text(ordinal(i + 1), box(r.x, r.y + 0.04, 0.8, r.h), d.fonts.display, 20, d.accent, { bold: true }));
          items.push(text(point, box(r.x + 0.95, r.y + 0.1, r.w - 1.1, r.h), d.fonts.body, T.body, d.soft, { lineSpacing: 1.2 }));
          if (i < points.length - 1) items.push(hair(box(r.x, r.y + r.h + 0.02, r.w, 0), mix(d.paper, d.ink, 0.12), 0.006));
        });
        break;
      }
      case "two-col-rule": {
        const half = Math.ceil(points.length / 2);
        const [left, right] = columns(area, 2, 0.85);
        if (left && right) {
          items.push(hair(box(left.x + left.w + 0.42, area.y, 0, area.h), mix(d.paper, d.ink, 0.14), 0.006));
          items.push({ box: left, bullet: "dash", color: d.soft, font: d.fonts.body, gap: 11, items: points.slice(0, half), kind: "bullets", size: T.body });
          items.push({ box: right, bullet: "dash", color: d.soft, font: d.fonts.body, gap: 11, items: points.slice(half), kind: "bullets", size: T.body });
        }
        break;
      }
      case "chips": {
        const lines = rows(area, Math.max(points.length, 1), 0.16);
        points.forEach((point, i) => {
          const r = lines[i];
          if (!r) return;
          const h = Math.min(r.h, 0.62);
          items.push({ alpha: 94, box: box(r.x, r.y, r.w, h), fill: d.accent, kind: "shape", radius: 0.5, shape: "roundRect" });
          items.push(...drawMark(d.mark, box(r.x + 0.32, r.y + h / 2 - 0.09, 0.18, 0.18), d.accent));
          items.push(text(point, box(r.x + 0.78, r.y + h / 2 - 0.15, r.w - 1.2, h), d.fonts.body, T.body, d.soft));
        });
        break;
      }
      case "boxed": {
        // A design whose PAGE already draws a frame does not draw a second one inside it.
        if (d.page !== "frame") {
          items.push({ box: inset(area, -0.06), kind: "shape", line: { color: mix(d.paper, d.ink, 0.16), width: 0.006 }, shape: "rect" });
        }
        items.push(...markedList(d, inset(area, 0.34), points));
        break;
      }
      case "hanging-rule": {
        items.push({
          box: box(area.x + area.w * 0.16, area.y, area.w * 0.8, area.h),
          bullet: "none",
          color: d.soft,
          font: d.fonts.body,
          gap: 14,
          items: points,
          kind: "bullets",
          size: T.body,
        });
        break;
      }
      default: {
        // 🔴 "plain" IS NOT A DASH ANY MORE. It is the design's own mark, set in its own column.
        // A dash is what a deck looks like when nobody chose anything.
        items.push(...markedList(d, area, points));
      }
    }
    items.push(...footer(d, s, ctx, p));
    return { background: { color: background, image: p.image }, items, motion: d.motion };
  }

  // ── the three treatments that take the whole page ──
  if (d.body === "rail") {
    const rail = edgeBand("left", 3.5);
    items.push(rect(rail, d.deep));
    items.push(rect(box(0, 0, 0.12, SLIDE_H), d.accent));
    items.push(
      text(`Exhibit ${ordinal(ctx.index)}`, box(0.6, TOP, rail.w - 1.1, 0.3), d.fonts.body, T.eyebrow, d.accent, {
        bold: true,
        caps: true,
        spacing: 1.6,
      }),
    );
    items.push(text(s.title, box(0.6, TOP + 0.42, rail.w - 1.1, 2.6), d.fonts.display, fit(19, s.title), d.deepInk, { bold: true, lineSpacing: 1.1 }));
    if (s.takeaway) {
      items.push(text(s.takeaway, box(0.6, SLIDE_H - 2.5, rail.w - 1.1, 1.9), d.fonts.body, 11, d.deepSoft, { lineSpacing: 1.24 }));
    }
    items.push(
      ...markedList(d, box(rail.w + 0.75, TOP + 0.3, SLIDE_W - rail.w - 0.75 - M, SLIDE_H - TOP - 1.5), points),
    );
    items.push(
      text(`${ctx.credit}  ·  ${ctx.index}`, box(SLIDE_W - M - 3, SLIDE_H - 0.62, 3, 0.3), d.fonts.body, T.footer, d.muted, {
        align: "right",
      }),
    );
    return { background: { color: background }, items, motion: d.motion };
  }

  if (d.body === "panel-title") {
    const panel = crossBand("top", 1.85);
    items.push(rect(panel, d.deep));
    items.push(rect(box(0, panel.h, SLIDE_W, 0.08), d.accent));
    items.push(
      text(`Exhibit ${ordinal(ctx.index)}`, box(M, 0.42, CONTENT_W * 0.6, 0.28), d.fonts.body, T.eyebrow, d.accent, {
        bold: true,
        caps: true,
        spacing: 1.6,
      }),
    );
    items.push(text(s.title, box(M, 0.78, CONTENT_W * 0.82, 0.9), d.fonts.display, fit(T.title, s.title), d.deepInk, { bold: true }));
    let y = panel.h + 0.45;
    if (s.takeaway) {
      items.push(text(s.takeaway, box(M, y, CONTENT_W * 0.78, 0.5), d.fonts.body, T.action, mix(d.ink, d.accent, 0.3), { italic: true }));
      y += 0.6;
    }
    items.push(...markedList(d, box(M, y, CONTENT_W * 0.86, SLIDE_H - y - 1.0), points));
    items.push(...footer(d, s, ctx, p));
    return { background: { color: background }, items, motion: d.motion };
  }

  // banner
  const bannerH = 1.15;
  items.push(
    text(`Exhibit ${ordinal(ctx.index)}`, box(M, 0.24, CONTENT_W * 0.6, 0.26), d.fonts.body, T.eyebrow, d.muted, {
      bold: true,
      caps: d.kicker !== false,
      spacing: 1.6,
    }),
  );
  items.push(rect(box(0, TOP, SLIDE_W * 0.66, bannerH), d.accent));
  items.push(text(s.title, box(M, TOP + 0.26, SLIDE_W * 0.66 - M - 0.35, 0.75), d.fonts.display, fit(T.title, s.title), d.accentInk, { bold: true }));
  let y = TOP + bannerH + 0.4;
  if (s.takeaway) {
    items.push(text(s.takeaway, box(M, y, CONTENT_W * 0.8, 0.5), d.fonts.body, T.action, d.ink, { italic: true }));
    y += 0.62;
  }
  items.push(...markedList(d, box(M, y, CONTENT_W * 0.84, SLIDE_H - y - 1.0), points));
  items.push(...footer(d, s, ctx, p));
  return { background: { color: background }, items, motion: d.motion };
}

// ── stat, quote, closing ─────────────────────────────────────────────────────────────────────

function composeStat(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  const label = s.statLabel || s.title;
  const value = s.statValue || "—";
  switch (d.stat) {
    case "panel": {
      const panel = edgeBand("left", SLIDE_W * 0.44);
      items.push(rect(panel, d.accent));
      const nb = box(M, 2.4, panel.w - M * 2, 2.2);
      items.push(text(value, nb, d.fonts.display, fitNumeral(value, nb.w, nb.h), d.accentInk, { bold: true }));
      items.push(text(label, box(panel.w + 0.85, 2.9, SLIDE_W * 0.42, 2), d.fonts.body, 17, d.ink, { lineSpacing: 1.25 }));
      if (s.takeaway) items.push(text(s.takeaway, box(panel.w + 0.85, 4.5, SLIDE_W * 0.4, 1.4), d.fonts.body, T.body, d.soft, { lineSpacing: 1.25 }));
      break;
    }
    case "circle": {
      background = d.deep;
      items.push({ box: box(SLIDE_W / 2 - 2.35, 1.2, 4.7, 4.7), fill: d.accent, kind: "shape", shape: "donut" });
      const nb = box(SLIDE_W / 2 - 1.9, 3.05, 3.8, 1.4);
      items.push(text(value, nb, d.fonts.display, fitNumeral(value, nb.w, nb.h), d.deepInk, { align: "center", bold: true }));
      items.push(text(label, box(SLIDE_W / 2 - 3.2, 6.3, 6.4, 0.8), d.fonts.body, T.body, d.deepSoft, { align: "center" }));
      break;
    }
    case "block": {
      background = d.deep;
      items.push(rect(box(M, 1.6, 1.9, 4.2), d.accent));
      const nb = box(M + 2.6, 2.2, CONTENT_W - 3.0, 2.4);
      items.push(text(value, nb, d.fonts.display, fitNumeral(value, nb.w, nb.h), d.deepInk, { bold: true }));
      items.push(text(label, box(M + 2.65, 4.8, CONTENT_W * 0.58, 1.4), d.fonts.body, 16, d.deepSoft, { lineSpacing: 1.25 }));
      break;
    }
    default: {
      const nb = box(M, 2.0, CONTENT_W * 0.7, 2.5);
      items.push(text(value, nb, d.fonts.display, fitNumeral(value, nb.w, nb.h), d.accent, { bold: true }));
      items.push(hair(box(M, 4.7, CONTENT_W * 0.45, 0), d.ink, 0.012));
      items.push(text(label, box(M, 4.95, CONTENT_W * 0.6, 1.4), d.fonts.body, 17, d.soft, { lineSpacing: 1.25 }));
    }
  }
  if (d.chrome !== "none" && d.stat !== "circle" && d.stat !== "block") items.push(...footer(d, s, ctx, plainPage(d)));
  return { background: { color: background }, items, motion: d.motion };
}

function composeQuote(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const items: SceneItem[] = [];
  let background = d.paper;
  const attribution = s.quoteAttribution;
  const quote = (b: Box, color: string, wrapped = true) =>
    text(wrapped ? `“${s.title}”` : s.title, b, d.fonts.display, fit(28, s.title), color, { italic: true, lineSpacing: 1.24 });
  switch (d.quote) {
    case "band": {
      background = d.deep;
      items.push(rect(box(0, 1.95, SLIDE_W, 0.08), d.accent));
      items.push(quote(box(M, 2.6, CONTENT_W * 0.84, 2.8), d.deepInk));
      if (attribution) items.push(text(attribution, box(M, 5.7, CONTENT_W * 0.6, 0.6), d.fonts.body, 13.5, d.deepSoft, { caps: true, spacing: 1.2 }));
      break;
    }
    case "panel": {
      items.push(rect(edgeBand("left", 0.75), d.accent));
      items.push(quote(box(1.6, 2.3, CONTENT_W - 1.0, 3), d.ink));
      if (attribution) items.push(text(attribution, box(1.6, 5.5, CONTENT_W * 0.6, 0.6), d.fonts.body, 13.5, d.muted, { caps: true, spacing: 1.2 }));
      break;
    }
    case "rule": {
      items.push(hair(box(M, 2.15, CONTENT_W, 0), d.accent, 0.026));
      items.push(quote(box(M, 2.65, CONTENT_W * 0.82, 3), d.ink, false));
      if (attribution) items.push(text(`— ${attribution}`, box(M, 5.65, CONTENT_W * 0.6, 0.6), d.fonts.body, 13.5, d.muted));
      break;
    }
    default: {
      // The mark HANGS: it sits in its own column to the left of the quote, never behind it.
      // (It used to be set at 145pt in a box the text also used, and it printed straight
      // through the first line — the defect the owner spotted as "shapes blocking the text".)
      const mb = box(M, 2.0, 1.5, 1.5);
      items.push(text("“", mb, d.fonts.display, 84, mix(d.paper, d.accent, 0.3), { bold: true }));
      const left = M + 1.55;
      items.push(quote(box(left, 2.45, SLIDE_W - left - M, 2.9), d.ink, false));
      if (attribution) items.push(text(`— ${attribution}`, box(left, 5.55, CONTENT_W * 0.6, 0.6), d.fonts.body, 13.5, d.muted));
    }
  }
  if (d.chrome === "full") items.push(...footer(d, s, ctx, plainPage(d)));
  return { background: { color: background }, items, motion: d.motion };
}

function composeClosing(d: DeckDesign, s: DeckSlide, ctx: Ctx): Scene {
  const heading = s.title || "Thank you";
  const items: SceneItem[] = [];
  // A closing picture used to be declarable and then silently ignored. If a design names one,
  // the last slide is built on it, on the same terms as the cover.
  const picture = d.texture?.closing;
  const dark = picture
    ? Boolean(d.texture?.dark)
    : d.cover !== "band-left" && d.cover !== "frame" && d.cover !== "editorial" && d.cover !== "stack-bars";
  const background = dark ? d.deep : d.paper;
  const ink = dark ? d.deepInk : d.ink;
  const soft = dark ? d.deepSoft : d.soft;
  if (picture && d.texture?.scrim) items.push(rect(box(0, 0, SLIDE_W, SLIDE_H), background, 100 - d.texture.scrim));
  items.push(rect(crossBand("bottom", 0.42), d.accent));
  items.push(
    text(ctx.credit, box(M, 2.15, CONTENT_W, 0.3), d.fonts.body, T.eyebrow, d.accent, {
      bold: true,
      caps: d.kicker !== false,
      spacing: 1.7,
    }),
  );
  items.push(text(heading, box(M, 2.65, CONTENT_W * 0.72, 1.7), d.fonts.display, fit(40, heading), ink, { bold: true }));
  if (s.points.length) {
    items.push({
      box: box(M, 4.35, CONTENT_W * 0.66, 2),
      bullet: "dash",
      color: soft,
      font: d.fonts.body,
      gap: 9,
      items: s.points.slice(0, 3),
      kind: "bullets",
      size: T.body,
    });
  }
  return {
    background: { art: d.cover === "art-glow" ? d.art?.closing : undefined, color: background, image: picture },
    items,
    motion: d.motion,
  };
}

/** The references slide: the canvas's own sources, never anything invented. */
export function composeReferences(d: DeckDesign, refs: Array<{ title: string; url?: string }>): Scene {
  const items: SceneItem[] = [];
  items.push(text("Sources", box(M, TOP, CONTENT_W * 0.6, 0.8), d.fonts.display, T.title, d.ink, { bold: true }));
  items.push(hair(box(M, TOP + 0.72, CONTENT_W, 0), d.accent, 0.022));
  items.push({
    box: box(M, TOP + 1.05, CONTENT_W, SLIDE_H - TOP - 2),
    bullet: "none",
    color: d.muted,
    font: d.fonts.body,
    gap: 9,
    items: refs.slice(0, 10).map((r, i) => (r.url ? `${i + 1}.  ${r.title}  —  ${r.url}` : `${i + 1}.  ${r.title}`)),
    kind: "bullets",
    size: 10.5,
  });
  return { background: { color: d.paper }, items };
}

/** One slide, composed for one design. */
export function composeSlide(design: DeckDesign, slide: DeckSlide, ctx: Ctx): Scene {
  switch (slide.layout) {
    case "cover":
      return composeCover(design, slide, ctx);
    case "agenda":
      return composeAgenda(design, slide, ctx);
    case "section":
      return composeSection(design, slide, ctx);
    case "kpi":
      return composeKpi(design, slide, ctx);
    case "chart":
      return composeChart(design, slide, ctx);
    case "table":
      return composeTable(design, slide, ctx);
    case "stat":
      return composeStat(design, slide, ctx);
    case "quote":
      return composeQuote(design, slide, ctx);
    case "closing":
      return composeClosing(design, slide, ctx);
    case "two_column": {
      const merged = { ...slide, points: [...slide.points, ...slide.rightPoints] };
      return composeBody({ ...design, body: "two-col-rule" }, merged, ctx);
    }
    default:
      return composeBody(design, slide, ctx);
  }
}

export type { Ctx as ComposeContext };
