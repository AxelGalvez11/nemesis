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
import { validateStructure, type ChemNotation } from "../learn/chem-notation";
import { readModelJson } from "../model-json";

export const DECK_LAYOUTS = [
  "cover",
  "agenda",
  "section",
  "bullets",
  "two_column",
  "kpi",
  "chart",
  "table",
  "stat",
  "quote",
  "closing",
] as const;
export type DeckLayout = (typeof DECK_LAYOUTS)[number];

/**
 * One of the learner's OWN figures, offered to the deck.
 *
 * 🔴 FILLED BY THE CALLER FROM THE CANVAS, NEVER BY THE MODEL — exactly like `references`, and
 * for a stronger reason. `path` addresses an object in a PRIVATE, owner-scoped bucket; a model
 * that could write one would be writing a request for storage it may not read. The model picks a
 * NUMBER out of a menu (see `lib/learn/deck-figures.ts`) and this side turns numbers into paths.
 */
export interface DeckFigure {
  /** Object path in the private figure bucket. Not loadable until signed. */
  path: string;
  /** What the DOCUMENT called it, falling back to what vision saw. Printed on the slide. */
  caption: string;
  /** Which of the learner's sources it came from. Printed with the caption. */
  source: string;
  /** A signed, loadable URL. Added at render time and never stored: a signature expires, and a
   *  baked one would give a deck that showed its diagrams the day it was made and empty frames a
   *  week later. Absent means "draw the caption, not the picture". */
  url?: string;
  width?: number;
  height?: number;
}

/** One measured thing: a bar in a chart, or a figure in a KPI row. */
export interface DeckDatum {
  label: string;
  value: number;
}

/**
 * A molecule or a reaction, drawn on a slide.
 *
 * 🔴🔴 THE MODEL NAMES THE COMPOUND; IT DOES NOT WRITE THE STRUCTURE. §42's rule, and the reason
 * `structure-resolve.ts` exists: *"a model asked for the SMILES of aspirin will produce one,
 * fluently, and it will usually be right — which is exactly what makes it dangerous."* A wrong plot
 * looks wrong; a wrong molecule looks like chemistry. So a slide asks for a LOOKUP, the resolver
 * answers from PubChem, and `resolvedFrom` is the stamp saying which happened.
 *
 * 🔴 A GENERIC GROUP HAS NO NAME AND IS STILL ALLOWED. `*O` is an alcohol — every alcohol — and
 * PubChem has no compound called "any alcohol". Notation written directly is accepted and simply
 * arrives without provenance, which is the honest difference rather than a refusal.
 *
 * 🔴 THE SMILES IS STORED, NOT THE PICTURE. A drawn molecule is a deterministic function of its
 * notation, so the plan keeps the short string and the image is made at render time — the same
 * bargain the deck itself makes with the .pptx. Baking base64 PNGs into a saved plan would put
 * tens of kilobytes per slide into a canvas record that has to load on every visit.
 */
/** How many compounds may appear on one side of an arrow. More than this is a pathway, not a
 *  slide — and glycolysis as one scheme is unreadable at any size a slide allows. */
const MAX_STRUCTURE_PARTS = 4;

export interface DeckStructure {
  /** `smiles` for one molecule, `reaction-smiles` for `A.B>>C.D`. */
  notation: ChemNotation;
  value: string;
  /** What it shows, printed under the drawing. */
  caption: string;
  /** Present only when a resolver was asked for a name and answered. */
  resolvedFrom?: { name: string; provider: "pubchem"; id: string };
}

export interface DeckSlide {
  layout: DeckLayout;
  title: string;
  /** The "so what" line under an action title. The single most valuable sentence on a slide in
   *  the institutional register, and the model is asked for one on every content slide. */
  takeaway: string;
  /** bullets / two_column / closing use these. Clamped: 6 points, 220 chars each. */
  points: string[];
  /** two_column only: the right column; `points` is the left. */
  rightPoints: string[];
  /** Column headings for two_column. */
  leftHeading: string;
  rightHeading: string;
  /** A molecule or reaction beside the points. Absent on most slides. */
  structure?: DeckStructure;
  /**
   * A concept to illustrate from the shared reference shelf.
   *
   * 🔴 A CONCEPT, NEVER A FILENAME OR A URL. The same border-control rule `figure` follows: the
   * model says WHAT it wants a picture of, and trusted code decides which licensed file that is.
   * A model naming a file would be a model choosing an asset, which is how an unlicensed or
   * unrelated image reaches a slide with nothing able to catch it.
   */
  illustration?: string;
  /** stat only: the big number and its label. */
  statValue: string;
  statLabel: string;
  /** quote only. */
  quoteAttribution: string;
  /** cover only. */
  subtitle: string;
  /** chart / kpi: the figures. Clamped to 8 — more than that is a table, not a chart. */
  data: DeckDatum[];
  /** What the figures are measured in: "%", "$m", "x", "GW". Printed with every value. */
  unit: string;
  /** chart only: how to draw the figures. */
  chart: "column" | "bar" | "line";
  /** table only: the header row and the body rows. Clamped to 5 columns and 7 rows. */
  columns: string[];
  rows: string[][];
  /** A small footnote under the exhibit — the model's own caveat, never a citation (sources
   *  come from the canvas, see DeckPlan.references). */
  note: string;
  /**
   * Which of the learner's own figures to show, 1-based into `DeckPlan.figures`. 0 = none.
   *
   * 🔴 A NUMBER, NOT A PATH, AND THE RANGE IS CHECKED WHERE THE LIST IS KNOWN. This reader runs
   * before the figures are attached, so it can only insist on a non-negative integer; the
   * composer treats an index past the end as "no figure", which is the safe direction — a slide
   * loses a picture rather than gaining somebody else's.
   */
  figure: number;
}

export interface DeckPlan {
  title: string;
  subtitle: string;
  slides: DeckSlide[];
  /** References appended as the deck's last slide when the canvas was grounded. Filled by the
   *  CALLER from the canvas's own sources — never by the model, which would invent them. */
  references: { title: string; url?: string }[];
  /** The learner's own figures this deck may draw on. Filled by the CALLER, same rule as
   *  references — see DeckFigure. Empty when the canvas has no stored pictures. */
  figures: DeckFigure[];
}

const MAX_SLIDES = 24;
const MAX_POINTS = 6;
const MAX_DATA = 8;
const MAX_COLUMNS = 5;
const MAX_ROWS = 7;

const str = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.trim().slice(0, cap) : "";

const strList = (value: unknown, capEach: number): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => str(entry, capEach))
        .filter(Boolean)
        .slice(0, MAX_POINTS)
    : [];

/** Figures, read strictly: a label and a finite number, or the entry is dropped. */
const dataList = (value: unknown): DeckDatum[] =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const e = (entry ?? {}) as Record<string, unknown>;
          // 🔴 A STRING WITH NO DIGITS IS NOT A ZERO. "about a fifth" once cleaned to "" and
          // Number("") is 0, which put a fabricated zero bar on a chart — the worst possible
          // failure for an exhibit, because it looks like data.
          const cleaned = typeof e.value === "string" ? e.value.replace(/[^0-9.eE+-]/g, "") : "";
          const raw = typeof e.value === "string" ? (/\d/.test(cleaned) ? Number(cleaned) : NaN) : e.value;
          return { label: str(e.label, 28), value: typeof raw === "number" && Number.isFinite(raw) ? raw : NaN };
        })
        .filter((d) => d.label !== "" && Number.isFinite(d.value))
        .slice(0, MAX_DATA)
    : [];

/** A 1-based figure choice, or 0 for none. Anything that is not a whole positive number — a
 *  path, a caption, a float, a negative — means the model did not pick a figure. */
const figureIndex = (value: unknown): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** A table body: rows of cells, both dimensions clamped. */
const cellRows = (value: unknown): string[][] =>
  Array.isArray(value)
    ? value
        .map((row) => (Array.isArray(row) ? row.map((cell) => str(cell, 40)).slice(0, MAX_COLUMNS) : []))
        .filter((row) => row.some((cell) => cell !== ""))
        .slice(0, MAX_ROWS)
    : [];

/** The model's reply, read strictly into a plan — or null when nothing deck-shaped survived. */
/**
 * A slide's chemistry, assembled from what the resolver returned.
 *
 * 🔴🔴 REACTIONS REUSE THE MOLECULE LANE RATHER THAN GROWING A SECOND RESOLVER. `structure-resolve.ts`
 * walks ARRAYS as well as objects, so a slide states its reactants and its products as two lists of
 * `{"kind":"structure","compound":"…"}` requests, each one resolved independently by the code the
 * canvas already uses. This function is the only new part: it joins the answers into the
 * reaction SMILES that `chem-notation.ts` already validates and `smiles-drawer` already draws.
 *
 * 🔴 TWO LISTS, NOT ONE. A flat list of names cannot say which side of the arrow a compound is on,
 * and a scheme that puts the product on the left is worse than no scheme.
 *
 * 🔴 AN UNRESOLVED COMPOUND LOSES ITS PICTURE, NEVER ITS SLIDE. The resolver returns null for a name
 * PubChem could not find and the array filter drops it; if that leaves no reactants, there is no
 * structure and the points stand alone. Falling back to a model-written SMILES would run the least
 * trustworthy path exactly when the trustworthy one found nothing — §42's whole subject.
 */
function readStructure(value: unknown): DeckStructure | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  /** The resolved SMILES in one side of the arrow, in the order the model listed them. */
  const side = (list: unknown): string[] =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        if (typeof item !== "object" || item === null) return "";
        const entry = item as Record<string, unknown>;
        const text = typeof entry.value === "string" ? entry.value.trim() : "";
        // Each part is validated on its own before anything is joined: one bad member must not be
        // able to smuggle characters into the assembled string.
        return text && validateStructure("smiles", text).ok ? text : "";
      })
      .filter(Boolean)
      .slice(0, MAX_STRUCTURE_PARTS);

  const from = side(raw.from);
  const to = side(raw.to);
  if (from.length === 0) return null;

  const notation: ChemNotation = to.length > 0 ? "reaction-smiles" : "smiles";
  const assembled = to.length > 0 ? `${from.join(".")}>>${to.join(".")}` : from.join(".");
  // 🔴 THE ASSEMBLED STRING IS VALIDATED TOO, not just its parts. Joining valid SMILES with `.` and
  // `>>` should always be valid, and "should always" is exactly the kind of claim that is worth one
  // cheap check at the boundary rather than a broken drawing on a slide.
  if (!validateStructure(notation, assembled).ok) return null;

  // Provenance from the first resolved member: enough to say a lookup happened, and the field's own
  // contract is "a resolver was asked for this name and returned this string".
  const first = (Array.isArray(raw.from) ? raw.from : []).find(
    (item) => typeof item === "object" && item !== null && (item as Record<string, unknown>).resolvedFrom,
  ) as Record<string, unknown> | undefined;
  const stamp = first?.resolvedFrom as { id?: unknown; name?: unknown } | undefined;

  return {
    caption: str(raw.caption, 120),
    notation,
    value: assembled,
    ...(stamp && typeof stamp.name === "string"
      ? { resolvedFrom: { id: String(stamp.id ?? ""), name: stamp.name, provider: "pubchem" as const } }
      : {}),
  };
}

export function readDeckJson(text: string): DeckPlan | null {
  // 🔴🔴 A DECK THAT RAN LONG KEEPS THE SLIDES THAT ARRIVED WHOLE. This used to be a plain
  // `JSON.parse` between the first `{` and the last `}`, so an answer cut off mid-object threw and
  // twelve slides of real work became "the slide plan came back unusable" — the owner's own
  // glycolysis deck. `readModelJson` repairs the STRUCTURE only: it cuts at the last complete
  // element and closes what was open, never inventing a field or finishing a sentence.
  //
  // 🔴 IT IS THE SECOND FIX, NOT THE FIRST. The first is `maxTokens` on the call that produces
  // this, because recovering nine slides out of twelve is a consolation, not a deck.
  const parsed = readModelJson(text);
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
    const data = dataList(s.data);
    const rows = cellRows(s.rows);
    const columns = Array.isArray(s.columns) ? s.columns.map((c) => str(c, 28)).filter(Boolean).slice(0, MAX_COLUMNS) : [];
    const chart = s.chart === "bar" || s.chart === "line" ? s.chart : ("column" as const);
    const slide: DeckSlide = {
      chart,
      columns,
      data,
      figure: figureIndex(s.figure),
      note: str(s.note, 140),
      rows,
      takeaway: str(s.takeaway, 180),
      unit: str(s.unit, 8),
      layout,
      leftHeading: str(s.leftHeading, 60),
      points: strList(s.points, 220),
      quoteAttribution: str(s.quoteAttribution, 120),
      rightHeading: str(s.rightHeading, 60),
      rightPoints: strList(s.rightPoints, 220),
      ...(readStructure(s.structure) ? { structure: readStructure(s.structure)! } : {}),
      ...(str(s.illustration, 80) ? { illustration: str(s.illustration, 80) } : {}),
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
    figures: [],
    references: [],
    slides: ordered,
    subtitle: str(raw.subtitle, 160),
    title,
  };
}

export const EMPTY_SLIDE: DeckSlide = {
  chart: "column",
  columns: [],
  data: [],
  figure: 0,
  note: "",
  takeaway: "",
  unit: "",
  layout: "bullets",
  leftHeading: "",
  points: [],
  quoteAttribution: "",
  rightHeading: "",
  rightPoints: [],
  rows: [],
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
    'two_column → "leftHeading", "points", "rightHeading", "rightPoints"; kpi → "data" (2-4 ' +
    'entries of {"label","value"}) and "unit"; chart → "data" (3-8 entries of ' +
    '{"label","value"}), "unit", and "chart" ("column", "bar" or "line"); table → "columns" ' +
    '(2-5 headings) and "rows" (arrays of cells); stat → "statValue" (a short figure like ' +
    '"86%" or "3x") and "statLabel"; quote → "title" is the quote and "quoteAttribution" ' +
    'names who said it; cover → "subtitle"; agenda → "points" (the sections ahead); section → ' +
    'just "title"; closing → "title" and optionally "points" (key takeaways). ' +
    "🔴 TITLES ARE FINDINGS, NOT HEADINGS: write the title as the claim the slide proves " +
    '("Photorespiration wastes a fifth of fixed carbon"), not the subject ("Photorespiration"). ' +
    'Give every content slide a "takeaway": one sentence saying what the reader should ' +
    'conclude. Optionally add "note" for a caveat. ' +
    "🔴 FIGURES MUST COME FROM THE PROVIDED MATERIAL. Use kpi, chart and table only for numbers " +
    "the material actually contains; with no material, do not use them at all. " +
    "🔴 PICTURES ARE CHOSEN BY NUMBER, NEVER NAMED. If the brief lists figures from the " +
    'learner\'s own material, a bullets or two_column slide may set "figure" to one of those ' +
    'numbers to show that picture beside its points. Use 0 — or leave it out — on every other ' +
    "slide, and never write a filename, a path or a figure that is not in the list. Most slides " +
    "should have no picture: one that illustrates the point earns its place, one that decorates " +
    "does not. " +
    // 🔴 THE MODEL NAMES THE COMPOUND AND STOPS. §42, and the same instruction the canvas gives:
    // the string that reaches the depiction library comes from PubChem, not from memory. The
    // request shape is exactly what `structure-resolve.ts` walks for, so the deck reuses that whole
    // lane rather than growing a second resolver.
    "🔴 CHEMISTRY IS LOOKED UP, NEVER WRITTEN FROM MEMORY. To put a molecule on a slide, set " +
    '"structure" to {"caption":"<what it shows>","from":[{"kind":"structure","compound":"<name>"}]}. ' +
    'For a reaction, add "to" with the products the same way: ' +
    '{"caption":"Hexokinase traps glucose in the cell","from":[{"kind":"structure","compound":"glucose"}],' +
    '"to":[{"kind":"structure","compound":"glucose 6-phosphate"}]}. Name real compounds; at most ' +
    "four a side. Do NOT write SMILES yourself — a wrong molecule looks like correct chemistry, and " +
    "the lookup is what makes it right. A slide showing the compound under discussion earns its " +
    "structure; a decorative one does not. " +
    // 🔴 A CONCEPT, NOT A FILE. Trusted code picks the licensed image; the model only says what it
    // wants a picture of.
    '🔴 TO ILLUSTRATE A CONCEPT, set "illustration" to a short phrase naming what a diagram should ' +
    'show ("the pyruvate dehydrogenase complex"). Nemesis finds a licensed figure if one exists and ' +
    "leaves the slide alone if not. Never name a file, a URL or a source. " +
    "Structure: one cover first, then an agenda, then 6-12 body slides with a section slide " +
    "introducing each part, one closing last. Prefer concrete facts from the provided material, " +
    "and never invent references. No markdown fences, no commentary."
  );
}
