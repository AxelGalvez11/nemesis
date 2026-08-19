// Five representations, seven subjects (§44).
//
// 🔴 THESE ARE SHAPES, NOT SUBJECTS, AND THE COUNT IS THE ARGUMENT. The owner asked for computer
// science, accounting, history, statistics, geometry, physics and finance. That is seven subjects and
// five representations: accounting, finance and statistics all want a TABLE; history wants a
// TIMELINE; geometry and half of physics want a CONSTRUCTED FIGURE and LABELLED VECTORS; computer
// science wants CODE WITH A TRACE. Building "Accounting Mode" would have built the table three times
// and taught the Canvas three subjects it must not know.
//
// 🔴 EVERY NUMERIC CLAIM IS CHECKED BEFORE IT IS DRAWN. A stated total, a balance, an angle, an
// equilibrium — the model asserts them and `visual-verification.ts` recomputes them. This is §42's
// provenance rule carried into arithmetic: a generated picture may not be an answer key because its
// detail was invented, and an unrecomputed total is invented in exactly the same sense. A mismatch
// REFUSES; it never silently corrects, because a silent correction hides a model producing bad
// arithmetic.
//
// 🔴 SEPARATE FROM `canvas-visual.ts` FOR ONE REASON: SIZE, NOT BOUNDARY. The union, the refusal
// vocabulary and the single entry point all stay there — this file is called from that switch and
// has no callers of its own. Splitting the boundary itself would give the codebase two places to
// validate a model request, which is how one of them stops being applied.

import type { CanvasVisualBase } from "./canvas-visual";
import {
  verifyAngle,
  verifyBalance,
  verifyEquilibrium,
  verifyTotal,
  type Verification,
} from "./visual-verification";

// ─────────────────────────────────────────────────────────────────────────── the five shapes

/**
 * Rows and columns, with the arithmetic checked.
 *
 * 🔴 SEMANTIC, NOT MARKDOWN, AND THAT IS THE WHOLE POINT OF BUILDING IT. Markdown gives pixels; it
 * does not give a cell you can hide, highlight or mark an answer against. The difference is exactly
 * the difference between a figure and an occludable figure — one is decoration, the other is a
 * learning object §41 will allow on the Canvas.
 */
export interface TableVisual extends CanvasVisualBase {
  kind: "table";
  columns: readonly { key: string; label: string; numeric?: boolean }[];
  rows: readonly { cells: Readonly<Record<string, number | string>> }[];
  /**
   * A stated total per column, recomputed here.
   *
   * 🔴 OPTIONAL, AND STATING ONE IS A COMMITMENT. A table with no totals is just data; a table that
   * claims a total has made an arithmetic assertion and will be refused if it is wrong.
   */
  totals?: readonly { column: string; value: number }[];
  /**
   * Two columns whose sums must be equal.
   *
   * 🔴 A RULE ABOUT SHAPE, WHICH IS WHY IT IS FIELD-AGNOSTIC. "Two columns that must balance" is a
   * T-account, a trial balance and a balance sheet in accounting — and it is also a conservation
   * check in physics and a reconciliation in any subject with two views of one quantity. Nothing
   * here knows what a debit is, and nothing here may learn.
   */
  balance?: { left: string; right: string };
  /** One cell covered, for retrieval. The same interaction occlusion gives a figure. */
  hidden?: { column: string; row: number };
}

/**
 * Events in order, on a scale.
 *
 * 🔴 TIME IS A NUMBER PLUS A LABEL, AND THAT DESIGN AVOIDS THE ENTIRE CALENDAR PROBLEM. `at` places
 * the event; `atLabel` is what a human reads. So BCE is a negative number, an uncertain date is a
 * number with a flag, a geological span is millions and a reaction is seconds — and no date parser,
 * calendar table or era convention exists anywhere in this codebase to be wrong about any of them.
 * The alternative — parsing "44 BC" — is where naive timelines break, and history is full of it.
 */
export interface TimelineVisual extends CanvasVisualBase {
  kind: "timeline";
  /** What the numbers mean: "years", "Ma", "seconds since the trigger". */
  unit?: string;
  events: readonly {
    at: number;
    /** For a span rather than a moment. */
    until?: number;
    label: string;
    /** What a human reads instead of the raw number. */
    atLabel?: string;
    /** Parallel threads — two dynasties, two markets, two subsystems. */
    lane?: string;
    /** Rendered as uncertain rather than as a guess. */
    uncertain?: boolean;
  }[];
  /** Index of the event to cover, for retrieval. */
  hidden?: number;
}

/**
 * A figure made of points, with its stated measurements checked against them.
 *
 * 🔴 THIS IS WHY NEMESIS NEEDS NO GEOMETRY SOLVER TO BE HONEST. Constructing "a triangle with a 30°
 * angle at A" from a description is a hard problem. CHECKING that supplied points really do form 30°
 * at A is arithmetic. So the model places and trusted code marks — and a figure whose label
 * disagrees with its own coordinates is refused rather than drawn.
 *
 * 🔴 NO INTERACTION IN THIS VERSION, DELIBERATELY. Dragging a point is §41 priority five and this
 * work sits below that line. A static, correct figure teaches most of school geometry.
 */
export interface ConstructionVisual extends CanvasVisualBase {
  kind: "construction";
  points: readonly { id: string; x: number; y: number; label?: string }[];
  segments?: readonly { from: string; to: string; label?: string }[];
  circles?: readonly { centre: string; through: string }[];
  /** Each one is a claim about the coordinates, and each one is verified. */
  angles?: readonly { at: string; from: string; to: string; degrees: number }[];
}

/**
 * Labelled arrows on a body — a free-body diagram, and anything else shaped like one.
 *
 * 🔴 A SHAPE, NOT A PHYSICS FEATURE. "Quantities with magnitude and direction acting on one object"
 * is a force diagram, a velocity decomposition, a flow balance and a load on a beam. The vocabulary
 * below contains no physics term: no `normal`, no `friction`, no `weight`. Those are LABELS, which
 * are free text, and that is where they belong.
 */
export interface VectorsVisual extends CanvasVisualBase {
  kind: "vectors";
  /** What the arrows act on. */
  bodyLabel?: string;
  vectors: readonly { label: string; magnitude: number; degrees: number; unit?: string }[];
  /**
   * Claimed to be in balance — verified.
   *
   * 🔴 THE CHECK THAT STOPS A DIAGRAM MARKING A CORRECT LEARNER WRONG. A free-body diagram with the
   * normal force at the wrong angle looks entirely plausible; a learner answering correctly against
   * the real physics is then marked against the drawing.
   */
  equilibrium?: boolean;
  /** Optional axes, in degrees — an incline is 30, so components can be drawn along it. */
  axesDegrees?: number;
}

/**
 * Code, with what it did step by step.
 *
 * 🔴 THE TRACE IS NARRATED AND SAYS SO. Nothing in this codebase executes learner or model code, so
 * a trace is the model's account of what would happen — which may be wrong in exactly the way an
 * invented diagram is wrong. `traceOrigin` is therefore a required, single-valued field rather than
 * an optional flag: a narrated trace cannot be mistaken for a real one, and the day something
 * genuinely executes, that is a new value and a new security review rather than a quiet change of
 * meaning.
 */
export interface CodeVisual extends CanvasVisualBase {
  kind: "code";
  language: string;
  source: string;
  trace?: readonly {
    /** 1-based line in `source`. */
    line: number;
    note: string;
    variables?: readonly { name: string; value: string }[];
  }[];
  traceOrigin?: "narrated";
}

export type SubjectVisual =
  | CodeVisual
  | ConstructionVisual
  | TableVisual
  | TimelineVisual
  | VectorsVisual;

// ─────────────────────────────────────────────────────────────────────────── validation

/** What went wrong, in the vocabulary `canvas-visual.ts` reports. */
export type SubjectRefusal =
  | "malformed-table"
  | "malformed-timeline"
  | "malformed-construction"
  | "malformed-vectors"
  | "malformed-code"
  /**
   * The structure was fine and the arithmetic was not.
   *
   * 🔴 ITS OWN REASON, AND IT IS THE ONE WORTH COUNTING. "The model sent a broken table" and "the
   * model sent a table whose total is wrong" are a formatting bug and a REASONING failure, and a
   * system that reports both as malformed can never notice the second is happening.
   */
  | "failed-verification";

export type SubjectValidation =
  | { ok: true; visual: SubjectVisual }
  | { detail: string; ok: false; reason: SubjectRefusal };

function refuse(reason: SubjectRefusal, detail: string): SubjectValidation {
  return { detail, ok: false, reason };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list(value: unknown, min: number, max: number): unknown[] | null {
  return Array.isArray(value) && value.length >= min && value.length <= max ? value : null;
}

/** Turn a verification failure into a refusal, keeping the reason in the detail so it stays countable. */
function fromVerification(result: Verification, what: string): SubjectValidation | null {
  return result.ok ? null : refuse("failed-verification", `${what} — ${result.reason}: ${result.detail}`);
}

// ── table ──────────────────────────────────────────────────────────────────────────────────────

function validateTable(value: Record<string, unknown>, common: CanvasVisualBase): SubjectValidation {
  const rawColumns = list(value.columns, 1, 6);
  if (!rawColumns) return refuse("malformed-table", "a table needs 1–6 columns");
  const columns: Array<{ key: string; label: string; numeric?: boolean }> = [];
  for (const item of rawColumns) {
    if (!record(item)) return refuse("malformed-table", "a column is not an object");
    const key = text(item.key, 40);
    const label = text(item.label, 60);
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) {
      return refuse("malformed-table", "a column key must be 1–40 characters of A–Z, 0–9, _ or -");
    }
    if (!label) return refuse("malformed-table", `column ${key} needs a label of 1–60 characters`);
    if (columns.some((column) => column.key === key)) return refuse("malformed-table", `column key ${key} is used twice`);
    columns.push({ key, label, ...(item.numeric === true ? { numeric: true } : {}) });
  }

  // 🔴 THIRTY ROWS, AND THE BOUND IS PEDAGOGY RATHER THAN PERFORMANCE. A statement a learner is
  // meant to read and reason about is not a data dump; past this it is a spreadsheet, and a
  // spreadsheet is the surface §41 says the Canvas is not.
  const rawRows = list(value.rows, 1, 30);
  if (!rawRows) return refuse("malformed-table", "a table needs 1–30 rows");
  const keys = new Set(columns.map((column) => column.key));
  const rows: Array<{ cells: Record<string, number | string> }> = [];
  for (const item of rawRows) {
    if (!record(item) || !record(item.cells)) return refuse("malformed-table", "a row is not an object with cells");
    const cells: Record<string, number | string> = {};
    for (const [key, cell] of Object.entries(item.cells)) {
      if (!keys.has(key)) return refuse("malformed-table", `a row names column ${key}, which the table does not have`);
      if (typeof cell === "number") {
        if (!Number.isFinite(cell)) return refuse("malformed-table", `a numeric cell in ${key} is not finite`);
        cells[key] = cell;
      } else {
        const asText = text(cell, 80);
        if (!asText) return refuse("malformed-table", `a cell in ${key} must be a number or 1–80 characters`);
        cells[key] = asText;
      }
    }
    rows.push({ cells });
  }

  const numbersIn = (column: string): number[] =>
    rows.map((row) => row.cells[column]).filter((cell): cell is number => typeof cell === "number");

  let totals: Array<{ column: string; value: number }> | null = null;
  if (value.totals !== undefined) {
    const rawTotals = list(value.totals, 1, 6);
    if (!rawTotals) return refuse("malformed-table", "totals must be 1–6 entries when present");
    totals = [];
    for (const item of rawTotals) {
      if (!record(item)) return refuse("malformed-table", "a total is not an object");
      const column = text(item.column, 40);
      const stated = finite(item.value);
      if (!column || !keys.has(column)) return refuse("malformed-table", `a total names column ${String(item.column)}, which the table does not have`);
      if (stated === null) return refuse("malformed-table", `the total for ${column} is not a finite number`);
      const failure = fromVerification(verifyTotal(numbersIn(column), stated, true), `the total for "${column}"`);
      if (failure) return failure;
      totals.push({ column, value: stated });
    }
  }

  let balance: { left: string; right: string } | null = null;
  if (value.balance !== undefined) {
    if (!record(value.balance)) return refuse("malformed-table", "balance must be an object naming two columns");
    const left = text(value.balance.left, 40);
    const right = text(value.balance.right, 40);
    if (!left || !right || !keys.has(left) || !keys.has(right)) {
      return refuse("malformed-table", "balance must name two columns the table has");
    }
    if (left === right) return refuse("malformed-table", "a column cannot balance against itself");
    const failure = fromVerification(verifyBalance(numbersIn(left), numbersIn(right)), `"${left}" against "${right}"`);
    if (failure) return failure;
    balance = { left, right };
  }

  let hidden: { column: string; row: number } | null = null;
  if (value.hidden !== undefined) {
    if (!record(value.hidden)) return refuse("malformed-table", "hidden must be an object naming a cell");
    const column = text(value.hidden.column, 40);
    const row = finite(value.hidden.row);
    if (!column || !keys.has(column)) return refuse("malformed-table", "hidden names a column the table does not have");
    if (row === null || !Number.isInteger(row) || row < 0 || row >= rows.length) {
      return refuse("malformed-table", `hidden names row ${String(value.hidden.row)}, and the table has ${rows.length}`);
    }
    hidden = { column, row };
  }

  return {
    ok: true,
    visual: {
      ...common,
      columns,
      kind: "table",
      rows,
      ...(totals ? { totals } : {}),
      ...(balance ? { balance } : {}),
      ...(hidden ? { hidden } : {}),
    },
  };
}

// ── timeline ───────────────────────────────────────────────────────────────────────────────────

function validateTimeline(value: Record<string, unknown>, common: CanvasVisualBase): SubjectValidation {
  const rawEvents = list(value.events, 2, 20);
  if (!rawEvents) return refuse("malformed-timeline", "a timeline needs 2–20 events");
  const events: TimelineVisual["events"][number][] = [];
  for (const item of rawEvents) {
    if (!record(item)) return refuse("malformed-timeline", "an event is not an object");
    const at = finite(item.at);
    const label = text(item.label, 100);
    if (at === null) return refuse("malformed-timeline", "every event needs a finite position");
    if (!label) return refuse("malformed-timeline", "every event needs a label of 1–100 characters");
    const until = item.until === undefined ? null : finite(item.until);
    if (item.until !== undefined && until === null) return refuse("malformed-timeline", `the span end for "${label}" is not a finite number`);
    // A span that ends before it starts is not a rendering problem — it is a claim about time that
    // cannot be true, and drawing it would produce a bar of negative width.
    if (until !== null && until < at) return refuse("malformed-timeline", `"${label}" ends before it begins`);
    const atLabel = item.atLabel === undefined ? null : text(item.atLabel, 40);
    if (item.atLabel !== undefined && !atLabel) return refuse("malformed-timeline", "an event's display label must be 1–40 characters");
    const lane = item.lane === undefined ? null : text(item.lane, 40);
    if (item.lane !== undefined && !lane) return refuse("malformed-timeline", "a lane name must be 1–40 characters");
    events.push({
      at,
      label,
      ...(until !== null ? { until } : {}),
      ...(atLabel ? { atLabel } : {}),
      ...(lane ? { lane } : {}),
      ...(item.uncertain === true ? { uncertain: true } : {}),
    });
  }

  // 🔴 EVERY EVENT AT ONE POSITION IS NOT A TIMELINE. The same rule the plot lane holds for a single
  // x: there is no range to lay anything out along, and the renderer would stack them.
  if (new Set(events.map((event) => event.at)).size < 2) {
    return refuse("malformed-timeline", "every event sits at the same position, so there is no span to lay them out along");
  }

  const unit = value.unit === undefined ? null : text(value.unit, 40);
  if (value.unit !== undefined && !unit) return refuse("malformed-timeline", "the unit must be 1–40 characters when present");

  let hidden: number | null = null;
  if (value.hidden !== undefined) {
    const index = finite(value.hidden);
    if (index === null || !Number.isInteger(index) || index < 0 || index >= events.length) {
      return refuse("malformed-timeline", `hidden names event ${String(value.hidden)}, and there are ${events.length}`);
    }
    hidden = index;
  }

  return {
    ok: true,
    visual: { ...common, events, kind: "timeline", ...(unit ? { unit } : {}), ...(hidden !== null ? { hidden } : {}) },
  };
}

// ── construction ───────────────────────────────────────────────────────────────────────────────

function validateConstruction(value: Record<string, unknown>, common: CanvasVisualBase): SubjectValidation {
  const rawPoints = list(value.points, 2, 12);
  if (!rawPoints) return refuse("malformed-construction", "a construction needs 2–12 points");
  const points: Array<{ id: string; x: number; y: number; label?: string }> = [];
  for (const item of rawPoints) {
    if (!record(item)) return refuse("malformed-construction", "a point is not an object");
    const id = text(item.id, 20);
    const x = finite(item.x);
    const y = finite(item.y);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return refuse("malformed-construction", "a point id must be 1–20 characters of A–Z, 0–9, _ or -");
    if (x === null || y === null) return refuse("malformed-construction", `point ${id} needs finite coordinates`);
    if (points.some((point) => point.id === id)) return refuse("malformed-construction", `point id ${id} is used twice`);
    const label = item.label === undefined ? null : text(item.label, 20);
    if (item.label !== undefined && !label) return refuse("malformed-construction", `the label on ${id} must be 1–20 characters`);
    points.push({ id, x, y, ...(label ? { label } : {}) });
  }
  const byId = new Map(points.map((point) => [point.id, point]));
  const known = (id: unknown, what: string): SubjectValidation | string => {
    const named = text(id, 20);
    if (!named || !byId.has(named)) return refuse("malformed-construction", `${what} names ${String(id)}, which is not a point`);
    return named;
  };

  const segments: Array<{ from: string; to: string; label?: string }> = [];
  if (value.segments !== undefined) {
    const raw = list(value.segments, 1, 20);
    if (!raw) return refuse("malformed-construction", "segments must be 1–20 entries when present");
    for (const item of raw) {
      if (!record(item)) return refuse("malformed-construction", "a segment is not an object");
      const from = known(item.from, "a segment");
      if (typeof from !== "string") return from;
      const to = known(item.to, "a segment");
      if (typeof to !== "string") return to;
      if (from === to) return refuse("malformed-construction", `a segment joins ${from} to itself`);
      const label = item.label === undefined ? null : text(item.label, 20);
      segments.push({ from, to, ...(label ? { label } : {}) });
    }
  }

  const circles: Array<{ centre: string; through: string }> = [];
  if (value.circles !== undefined) {
    const raw = list(value.circles, 1, 6);
    if (!raw) return refuse("malformed-construction", "circles must be 1–6 entries when present");
    for (const item of raw) {
      if (!record(item)) return refuse("malformed-construction", "a circle is not an object");
      const centre = known(item.centre, "a circle");
      if (typeof centre !== "string") return centre;
      const through = known(item.through, "a circle");
      if (typeof through !== "string") return through;
      if (centre === through) return refuse("malformed-construction", `a circle centred on ${centre} passes through itself`);
      circles.push({ centre, through });
    }
  }

  const angles: Array<{ at: string; from: string; to: string; degrees: number }> = [];
  if (value.angles !== undefined) {
    const raw = list(value.angles, 1, 8);
    if (!raw) return refuse("malformed-construction", "angles must be 1–8 entries when present");
    for (const item of raw) {
      if (!record(item)) return refuse("malformed-construction", "an angle is not an object");
      const at = known(item.at, "an angle");
      if (typeof at !== "string") return at;
      const from = known(item.from, "an angle");
      if (typeof from !== "string") return from;
      const to = known(item.to, "an angle");
      if (typeof to !== "string") return to;
      const degrees = finite(item.degrees);
      if (degrees === null || degrees <= 0 || degrees >= 360) {
        return refuse("malformed-construction", `the angle at ${at} must be a number between 0 and 360`);
      }
      // 🔴 THE CLAIM IS CHECKED AGAINST THE COORDINATES. This is the whole reason no solver is
      // needed: placing points is hard, marking them is arithmetic.
      const failure = fromVerification(
        verifyAngle(byId.get(at)!, byId.get(from)!, byId.get(to)!, degrees),
        `the angle at ${at}`,
      );
      if (failure) return failure;
      angles.push({ at, degrees, from, to });
    }
  }

  return {
    ok: true,
    visual: {
      ...common,
      kind: "construction",
      points,
      ...(segments.length ? { segments } : {}),
      ...(circles.length ? { circles } : {}),
      ...(angles.length ? { angles } : {}),
    },
  };
}

// ── vectors ────────────────────────────────────────────────────────────────────────────────────

function validateVectors(value: Record<string, unknown>, common: CanvasVisualBase): SubjectValidation {
  const raw = list(value.vectors, 1, 8);
  if (!raw) return refuse("malformed-vectors", "a vector diagram needs 1–8 vectors");
  const vectors: Array<{ label: string; magnitude: number; degrees: number; unit?: string }> = [];
  for (const item of raw) {
    if (!record(item)) return refuse("malformed-vectors", "a vector is not an object");
    const label = text(item.label, 40);
    const magnitude = finite(item.magnitude);
    const degrees = finite(item.degrees);
    if (!label) return refuse("malformed-vectors", "every vector needs a label of 1–40 characters");
    if (magnitude === null || magnitude < 0) return refuse("malformed-vectors", `"${label}" needs a magnitude of zero or more`);
    if (degrees === null) return refuse("malformed-vectors", `"${label}" needs a finite direction in degrees`);
    const unit = item.unit === undefined ? null : text(item.unit, 12);
    if (item.unit !== undefined && !unit) return refuse("malformed-vectors", "a unit must be 1–12 characters when present");
    vectors.push({ degrees, label, magnitude, ...(unit ? { unit } : {}) });
  }

  if (value.equilibrium === true) {
    const failure = fromVerification(verifyEquilibrium(vectors), "these vectors are claimed to balance");
    if (failure) return failure;
  }

  const bodyLabel = value.bodyLabel === undefined ? null : text(value.bodyLabel, 60);
  if (value.bodyLabel !== undefined && !bodyLabel) return refuse("malformed-vectors", "the body label must be 1–60 characters when present");
  const axesDegrees = value.axesDegrees === undefined ? null : finite(value.axesDegrees);
  if (value.axesDegrees !== undefined && axesDegrees === null) return refuse("malformed-vectors", "axesDegrees must be a finite number when present");

  return {
    ok: true,
    visual: {
      ...common,
      kind: "vectors",
      vectors,
      ...(bodyLabel ? { bodyLabel } : {}),
      ...(value.equilibrium === true ? { equilibrium: true } : {}),
      ...(axesDegrees !== null ? { axesDegrees } : {}),
    },
  };
}

// ── code ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Languages a trace may be narrated for.
 *
 * 🔴 AN ALLOW LIST BECAUSE THE VALUE IS RENDERED, NOT BECAUSE THE SET IS COMPLETE. A free-text
 * language string ends up in a class name or a highlighter lookup, and the cost of adding a language
 * here is one line. The cost of accepting anything is a model-chosen string reaching the DOM.
 */
const CODE_LANGUAGES: readonly string[] = [
  "c", "cpp", "csharp", "css", "go", "haskell", "html", "java", "javascript", "json", "kotlin",
  "matlab", "php", "python", "r", "ruby", "rust", "scala", "shell", "sql", "swift", "typescript",
];

function validateCode(value: Record<string, unknown>, common: CanvasVisualBase): SubjectValidation {
  const language = text(value.language, 20)?.toLowerCase() ?? null;
  if (!language || !CODE_LANGUAGES.includes(language)) {
    return refuse("malformed-code", `${JSON.stringify(value.language)} is not a language this Canvas renders`);
  }
  // 🔴 BOUNDED, AND THE BOUND IS TEACHING RATHER THAN MEMORY. A snippet a learner reads and reasons
  // about line by line is short. Past this it is a file, and a file is read in an editor.
  const source = typeof value.source === "string" ? value.source.replace(/\r\n/g, "\n") : "";
  if (!source.trim()) return refuse("malformed-code", "the snippet is empty");
  if (source.length > 4000) return refuse("malformed-code", `${source.length} characters, past the 4000 a snippet may carry`);
  const lineCount = source.split("\n").length;
  if (lineCount > 120) return refuse("malformed-code", `${lineCount} lines, past the 120 a snippet may carry`);

  let trace: CodeVisual["trace"] | null = null;
  if (value.trace !== undefined) {
    const raw = list(value.trace, 1, 60);
    if (!raw) return refuse("malformed-code", "a trace must be 1–60 steps when present");
    const steps: Array<{ line: number; note: string; variables?: Array<{ name: string; value: string }> }> = [];
    for (const item of raw) {
      if (!record(item)) return refuse("malformed-code", "a trace step is not an object");
      const line = finite(item.line);
      const note = text(item.note, 160);
      // 🔴 A STEP POINTING PAST THE END OF THE SNIPPET IS THE INTERESTING MALFORMATION. It means the
      // trace and the code have drifted apart — the model narrated a different program from the one
      // on screen — and highlighting nothing would hide that completely.
      if (line === null || !Number.isInteger(line) || line < 1 || line > lineCount) {
        return refuse("malformed-code", `a trace step names line ${String(item.line)}, and the snippet has ${lineCount}`);
      }
      if (!note) return refuse("malformed-code", "every trace step needs a note of 1–160 characters");
      let variables: Array<{ name: string; value: string }> | undefined;
      if (item.variables !== undefined) {
        const rawVars = list(item.variables, 1, 8);
        if (!rawVars) return refuse("malformed-code", "a step's variables must be 1–8 entries when present");
        variables = [];
        for (const entry of rawVars) {
          if (!record(entry)) return refuse("malformed-code", "a variable is not an object");
          const name = text(entry.name, 40);
          const shown = text(entry.value, 60);
          if (!name || !shown) return refuse("malformed-code", "a variable needs a name and a value");
          variables.push({ name, value: shown });
        }
      }
      steps.push({ line, note, ...(variables ? { variables } : {}) });
    }
    trace = steps;
  }

  return {
    ok: true,
    // `traceOrigin` is stamped here rather than accepted from the request: the model does not get to
    // tell the Canvas that its narration was an execution.
    visual: { ...common, kind: "code", language, source, ...(trace ? { trace, traceOrigin: "narrated" as const } : {}) },
  };
}

// ── entry point ────────────────────────────────────────────────────────────────────────────────

/** Which kinds this module owns. `canvas-visual.ts` delegates on exactly these. */
export const SUBJECT_KINDS: readonly string[] = ["code", "construction", "table", "timeline", "vectors"];

export function validateSubjectVisual(
  kind: string,
  value: Record<string, unknown>,
  common: CanvasVisualBase,
): SubjectValidation {
  if (kind === "table") return validateTable(value, common);
  if (kind === "timeline") return validateTimeline(value, common);
  if (kind === "construction") return validateConstruction(value, common);
  if (kind === "vectors") return validateVectors(value, common);
  return validateCode(value, common);
}
