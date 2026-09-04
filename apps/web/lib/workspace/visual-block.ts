// The drawings Nemesis can make out of an answer, as a typed spec it writes into the prose.
//
// Owner, 2026-09-04, holding his own wondering.app canvas beside ours: *"the diagrams are too big
// and also plain and boring unlike the wondering.app ones"*.
//
// 🔴🔴 THEIR "VISUALS" ARE NOT PICTURES AND NOT MERMAID, WHICH IS THE WHOLE FINDING. Measured
// inside his canvas (2026-09-04): every one is a React component rendering a small typed spec.
// A comparison is a grid of columns, each with a coloured header chip and a stack of cells, dashed
// rules between them and a shared footer band; a timeline is dated chips alternating above and
// below a 2px axis with dots on it; a milestone grid is tiles. Bold flat fills, heavy borders, no
// gradients. Nothing is generated as an image and nothing is drawn by a graph layout engine.
//
// That is why theirs reads as designed and ours reads as a diagram: mermaid is a graph renderer,
// and a graph renderer given "compare three things" produces boxes and arrows about a comparison.
//
// 🔴 SO THE MODEL DESCRIBES THE MEANING AND THE APP OWNS THE LOOK. Three shapes, chosen because
// they are the three an explanation actually falls into and each is field agnostic (CLAUDE.md): a
// comparison (things side by side on the same rows), a sequence (steps or dates in order), and a
// set (parts of one whole). A law student's remedies table and a machinist's tolerance table are
// the same `comparison`.
//
// 🔴 A FENCE, NOT A FIELD ON THE TURN, for the reason `reply-visuals.ts` gives: position. The
// drawing lands exactly where the model put it, between the sentence that introduces it and the one
// that follows, and a spec the parser refuses stays on screen as its own code block rather than
// disappearing or breaking the answer.
//
// PURE. No React, no I/O.

/** How many columns, steps or tiles one drawing may hold before it stops being readable. */
export const MAX_VISUAL_ITEMS = 6;
/** Rows inside one comparison column. */
export const MAX_VISUAL_CELLS = 6;
const MAX_LABEL = 48;
const MAX_TEXT = 120;
const MAX_TITLE = 80;

export type VisualKind = "comparison" | "sequence" | "set";

export interface VisualItem {
  /** The chip: a name, a step, a date, a part. */
  readonly label: string;
  /** Rows under the chip (comparison), or the one line under it (sequence, set). */
  readonly lines: readonly string[];
  /** A sequence's stamp above the chip: a date, a stage number, a phase. */
  readonly at?: string;
}

export interface VisualSpec {
  readonly kind: VisualKind;
  readonly title: string;
  /** What each row of a comparison MEANS, in order. Absent for the other kinds. */
  readonly rows?: readonly string[];
  readonly items: readonly VisualItem[];
  /** The band under a comparison: what every column shares. */
  readonly footer?: { readonly label: string; readonly text: string };
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function lines(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry, MAX_TEXT)).filter(Boolean).slice(0, limit);
}

function readItem(value: unknown): VisualItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const label = text(raw.label, MAX_LABEL);
  if (!label) return null;
  const at = text(raw.at, 24);
  // A single `line` is accepted as well as `lines`: it is what a model writes for a step.
  const body = Array.isArray(raw.lines) ? lines(raw.lines, MAX_VISUAL_CELLS) : [text(raw.line ?? raw.text, MAX_TEXT)].filter(Boolean);
  return { label, lines: body, ...(at ? { at } : {}) };
}

const KINDS: Record<string, VisualKind> = {
  comparison: "comparison",
  compare: "comparison",
  table: "comparison",
  sequence: "sequence",
  timeline: "sequence",
  steps: "sequence",
  flow: "sequence",
  process: "sequence",
  set: "set",
  parts: "set",
  grid: "set",
  pillars: "set",
};

/**
 * One spec, or null when what arrived cannot be drawn honestly.
 *
 * 🔴 REFUSED, NEVER REPAIRED, on `readChatCheck`'s rule. A comparison with one column is a list; a
 * drawing with no labels is a frame. Both are worse than the sentence the model already wrote, and
 * the caller shows the block as code so nothing is silently lost.
 */
export function readVisualSpec(value: unknown): VisualSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = KINDS[text(raw.kind, 24).toLowerCase()];
  if (!kind) return null;
  const items = (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.columns) ? raw.columns : [])
    .map(readItem)
    .filter((item): item is VisualItem => item !== null)
    .slice(0, MAX_VISUAL_ITEMS);
  if (items.length < 2) return null;
  const rows = lines(raw.rows, MAX_VISUAL_CELLS);
  const footerLabel = text((raw.footer as Record<string, unknown> | undefined)?.label, MAX_LABEL);
  const footerText = text((raw.footer as Record<string, unknown> | undefined)?.text, MAX_TEXT);
  return {
    items,
    kind,
    title: text(raw.title, MAX_TITLE),
    ...(rows.length > 0 ? { rows } : {}),
    ...(footerLabel && footerText ? { footer: { label: footerLabel, text: footerText } } : {}),
  };
}

/** What the model is told, shared by every surface that speaks. Kept beside the parser. */
export const VISUAL_INSTRUCTION =
  "You can also draw a designed figure, which reads far better than a graph for these three shapes. "
  + "Write it as a fenced ```visual block holding JSON and nothing else:\\n"
  + '```visual\\n{"kind": "comparison", "title": "…", "rows": ["what row 1 is", "what row 2 is"], '
  + '"items": [{"label": "First thing", "lines": ["row 1 value", "row 2 value"]}, {"label": "Second thing", "lines": ["…", "…"]}], '
  + '"footer": {"label": "All of them", "text": "what they share"}}\\n```\\n'
  + 'Use "comparison" for two to six things measured on the same rows (every item needs the same number of lines, in the row order). '
  + 'Use "sequence" for steps, stages or dates in order, where each item may carry "at" for its date or stage number and one line saying what happens. '
  + 'Use "set" for the parts of one whole, each with a line saying what that part does. '
  + "Keep labels to a few words and lines to one short phrase: this is a figure, not a paragraph. "
  + "Reach for it whenever you are comparing things, walking through stages, or naming the parts of something, "
  + "and keep the prose around it: the figure carries the shape, the sentences carry the reasoning.";
