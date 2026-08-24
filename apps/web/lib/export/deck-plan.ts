// The slide plan — what the model writes, and everything the deck builder will accept.
//
// 🔴 THE MODEL NEVER DESIGNS; IT FILLS SLOTS (owner 2026-08-25, after asking how Kimi makes
// "beautiful PowerPoints"): the model proposes content tagged with a LAYOUT from a fixed
// vocabulary, and the theme in deck-pptx.ts decides everything visual. This file is the border
// control between the two: a strict reader that turns a chatty model reply into a validated
// plan, or refuses. Same posture as readCardsJson in canvas-deliverables.ts — fences and
// preamble tolerated, junk refused, runaway output clamped — because this seam is where bad
// slides would come from.
//
// Pure and DOM-free; every rule here is testable without a model or a browser.

/** The layouts the theme knows how to draw. A tag outside this list is coerced to "bullets"
 *  rather than refused — a whole deck should not die because the model invented "hero". */
// 🔴 NO ICON VOCABULARY. The model used to be able to name a Lucide icon per slide, which the
// theme rasterised from a 97KB baked module. The designs draw their own furniture now — rules,
// numerals, cards, rails — and a stock glyph dropped into a composed slide read as clip art
// every time. If iconography returns it will be drawn by the composer, not chosen by the model.
export const DECK_LAYOUTS = ["cover", "section", "bullets", "two_column", "stat", "quote", "closing"] as const;
export type DeckLayout = (typeof DECK_LAYOUTS)[number];

export interface DeckSlide {
  layout: DeckLayout;
  title: string;
  /** bullets / two_column / closing use these. Clamped: 6 points, 220 chars each. */
  points: string[];
  /** two_column only: the right column; `points` is the left. */
  rightPoints: string[];
  /** Column headings for two_column. */
  leftHeading: string;
  rightHeading: string;
  /** stat only: the big number and its label. */
  statValue: string;
  statLabel: string;
  /** quote only. */
  quoteAttribution: string;
  /** cover only. */
  subtitle: string;
  /** An icon slot, when the layout shows one and the model picked a known name. */
}

export interface DeckPlan {
  title: string;
  subtitle: string;
  slides: DeckSlide[];
  /** References appended as the deck's last slide when the canvas was grounded. Filled by the
   *  CALLER from the canvas's own sources — never by the model, which would invent them. */
  references: { title: string; url?: string }[];
}

const MAX_SLIDES = 24;
const MAX_POINTS = 6;

const str = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.trim().slice(0, cap) : "";

const strList = (value: unknown, capEach: number): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => str(entry, capEach))
        .filter(Boolean)
        .slice(0, MAX_POINTS)
    : [];

/** The model's reply, read strictly into a plan — or null when nothing deck-shaped survived. */
export function readDeckJson(text: string): DeckPlan | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = parsed as Record<string, unknown>;
  const rawSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const slides: DeckSlide[] = [];
  for (const entry of rawSlides) {
    if (typeof entry !== "object" || entry === null) continue;
    const s = entry as Record<string, unknown>;
    const layout = (DECK_LAYOUTS as readonly string[]).includes(s.layout as string)
      ? (s.layout as DeckLayout)
      : "bullets";
    const slide: DeckSlide = {
      layout,
      leftHeading: str(s.leftHeading, 60),
      points: strList(s.points, 220),
      quoteAttribution: str(s.quoteAttribution, 120),
      rightHeading: str(s.rightHeading, 60),
      rightPoints: strList(s.rightPoints, 220),
      statLabel: str(s.statLabel, 160),
      statValue: str(s.statValue, 24),
      subtitle: str(s.subtitle, 160),
      title: str(s.title, 120),
    };
    // A slide with nothing on it is a failed slide, not a minimalist one.
    const hasBody =
      slide.title || slide.points.length || slide.statValue || slide.subtitle || slide.quoteAttribution;
    if (!hasBody) continue;
    slides.push(slide);
    if (slides.length >= MAX_SLIDES) break;
  }
  if (slides.length < 3) return null;
  // Structural guarantees the theme relies on: exactly one cover, first; exactly one closing, last.
  const body = slides.filter((slide) => slide.layout !== "cover" && slide.layout !== "closing");
  const cover = slides.find((slide) => slide.layout === "cover");
  const closing = slides.find((slide) => slide.layout === "closing");
  const title = str(raw.title, 120) || cover?.title || "Untitled deck";
  const ordered: DeckSlide[] = [
    cover ?? { ...EMPTY_SLIDE, layout: "cover", subtitle: str(raw.subtitle, 160), title },
    ...body,
    closing ?? { ...EMPTY_SLIDE, layout: "closing", title: "Questions?" },
  ];
  return {
    references: [],
    slides: ordered,
    subtitle: str(raw.subtitle, 160),
    title,
  };
}

export const EMPTY_SLIDE: DeckSlide = {
  layout: "bullets",
  leftHeading: "",
  points: [],
  quoteAttribution: "",
  rightHeading: "",
  rightPoints: [],
  statLabel: "",
  statValue: "",
  subtitle: "",
  title: "",
};

/** What the model is told. One system prompt, shared by every caller, so the reader and the
 *  writer can never drift apart — the layout and icon vocabularies are printed FROM the
 *  constants above. */
export function deckSystemPrompt(): string {
  return (
    "You plan presentation slides. Reply with ONLY a JSON object: " +
    '{"title": string, "subtitle": string, "slides": [...]}. Each slide is an object with ' +
    '"layout" (one of: ' +
    DECK_LAYOUTS.join(", ") +
    '), "title", and by layout: bullets → "points" (3-5 short strings, no trailing periods); ' +
    'two_column → "leftHeading", "points", "rightHeading", "rightPoints"; stat → "statValue" ' +
    '(a short figure like "86%" or "3x") and "statLabel"; quote → "title" is the quote and ' +
    '"quoteAttribution" names who said it; cover → "subtitle"; section → just "title"; ' +
    'closing → "title" and optionally "points" (key takeaways). ' +
    "Structure: one cover first, 6-12 body slides with a section slide introducing each part, " +
    "one closing last. Prefer concrete facts from the provided material; never invent " +
    "references. No markdown fences, no commentary."
  );
}
