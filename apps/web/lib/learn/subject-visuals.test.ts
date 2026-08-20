// Five shapes, seven subjects, and the arithmetic checked before anything is drawn.
//
// 🔴 THE TESTS THIS FILE EXISTS TO BE are the four verification ones: a total that does not sum, a
// balance that does not balance, an angle that disagrees with its own coordinates, and forces that
// do not cancel. Each is a picture that passes every structural bound and is FALSE, and each would
// otherwise be drawn confidently and marked against a learner.
//
// 🔴 AND THE FIELD-AGNOSTIC ONE. A trial balance and a physics conservation check are the same
// request with different labels, and they must validate identically or the Canvas has learned
// accounting.

import assert from "node:assert/strict";
import test from "node:test";

import { validateCanvasVisual } from "./canvas-visual";
import { routeVisual } from "./visual-route";

function base(over: Record<string, unknown>): Record<string, unknown> {
  return { learningGoal: "Understand this", ...over };
}

// ─────────────────────────────────────────────────────────────────────────────── table

const T_ACCOUNT = base({
  balance: { left: "debit", right: "credit" },
  columns: [
    { key: "account", label: "Account" },
    { key: "debit", label: "Debit", numeric: true },
    { key: "credit", label: "Credit", numeric: true },
  ],
  kind: "table",
  rows: [
    { cells: { account: "Equipment", debit: 20000 } },
    { cells: { account: "Cash", credit: 20000 } },
  ],
});

test("a T-account validates, and the balance is checked rather than trusted", () => {
  const result = validateCanvasVisual(T_ACCOUNT);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.visual.kind, "table");
});

test("🔴 a balance that does not balance is refused as a REASONING failure, not a formatting one", () => {
  const result = validateCanvasVisual({
    ...T_ACCOUNT,
    rows: [{ cells: { account: "Equipment", debit: 20000 } }, { cells: { account: "Cash", credit: 19000 } }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "failed-verification");
  assert.match(result.ok === false ? result.detail : "", /balance-mismatch/);
});

test("🔴 a stated total that does not sum is refused", () => {
  const result = validateCanvasVisual(base({
    columns: [{ key: "item", label: "Item" }, { key: "amount", label: "Amount", numeric: true }],
    kind: "table",
    rows: [{ cells: { amount: 100, item: "Rent" } }, { cells: { amount: 250, item: "Wages" } }],
    totals: [{ column: "amount", value: 400 }],
  }));
  assert.equal(result.ok === false && result.reason, "failed-verification");
  assert.match(result.ok === false ? result.detail : "", /sums to 350/);
});

test("a correct total passes", () => {
  const result = validateCanvasVisual(base({
    columns: [{ key: "item", label: "Item" }, { key: "amount", label: "Amount", numeric: true }],
    kind: "table",
    rows: [{ cells: { amount: 100, item: "Rent" } }, { cells: { amount: 250, item: "Wages" } }],
    totals: [{ column: "amount", value: 350 }],
  }));
  assert.equal(result.ok, true);
});

test("🔴 an accounting table and a physics table are the same request", () => {
  // The field-agnostic rule. Two balances, identical shape, different labels — identical outcome.
  const physics = validateCanvasVisual({
    ...T_ACCOUNT,
    columns: [
      { key: "account", label: "Stage" },
      { key: "debit", label: "Energy in (J)", numeric: true },
      { key: "credit", label: "Energy out (J)", numeric: true },
    ],
    rows: [{ cells: { account: "Falling", debit: 20000 } }, { cells: { account: "Kinetic", credit: 20000 } }],
  });
  assert.equal(physics.ok, validateCanvasVisual(T_ACCOUNT).ok);
});

test("a cell can be hidden for retrieval, and hiding a cell that does not exist is refused", () => {
  assert.equal(validateCanvasVisual({ ...T_ACCOUNT, hidden: { column: "debit", row: 0 } }).ok, true);
  assert.equal(validateCanvasVisual({ ...T_ACCOUNT, hidden: { column: "debit", row: 9 } }).ok, false);
  assert.equal(validateCanvasVisual({ ...T_ACCOUNT, hidden: { column: "nope", row: 0 } }).ok, false);
});

test("a row naming a column the table does not have is refused", () => {
  const result = validateCanvasVisual({ ...T_ACCOUNT, rows: [{ cells: { mystery: 1 } }] });
  assert.equal(result.ok === false && result.reason, "malformed-subject");
});

// ─────────────────────────────────────────────────────────────────────────────── timeline

const TIMELINE = base({
  events: [
    { at: 1765, atLabel: "1765", label: "Stamp Act" },
    { at: 1773, atLabel: "1773", label: "Boston Tea Party" },
    { at: 1775, label: "War begins", until: 1783 },
  ],
  kind: "timeline",
  unit: "years",
});

test("a timeline of events and spans validates", () => {
  assert.equal(validateCanvasVisual(TIMELINE).ok, true);
});

test("🔴 time is a number plus a label, so BCE and deep time need no calendar", () => {
  // The design that avoids date parsing entirely: the model supplies the position AND the text.
  const bce = validateCanvasVisual(base({
    events: [
      { at: -44, atLabel: "44 BCE", label: "Caesar assassinated" },
      { at: -27, atLabel: "27 BCE", label: "Augustus takes power" },
    ],
    kind: "timeline",
    unit: "years",
  }));
  assert.equal(bce.ok, true);

  const geology = validateCanvasVisual(base({
    events: [
      { at: -252, atLabel: "252 Ma", label: "Permian extinction", uncertain: true },
      { at: -66, atLabel: "66 Ma", label: "Cretaceous extinction" },
    ],
    kind: "timeline",
    unit: "millions of years",
  }));
  assert.equal(geology.ok, true);
});

test("a span that ends before it begins is refused — it is a claim that cannot be true", () => {
  const result = validateCanvasVisual(base({
    events: [{ at: 1900, label: "A", until: 1880 }, { at: 1910, label: "B" }],
    kind: "timeline",
  }));
  assert.equal(result.ok === false && result.reason, "malformed-subject");
  assert.match(result.ok === false ? result.detail : "", /ends before it begins/);
});

test("🔴 every event at one position is refused, the same rule a single-x plot gets", () => {
  const result = validateCanvasVisual(base({
    events: [{ at: 1900, label: "A" }, { at: 1900, label: "B" }],
    kind: "timeline",
  }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.detail : "", /same position/);
});

// ─────────────────────────────────────────────────────────────────────────────── construction

const RIGHT_TRIANGLE = base({
  angles: [{ at: "A", degrees: 90, from: "B", to: "C" }],
  kind: "construction",
  points: [
    { id: "A", label: "A", x: 0, y: 0 },
    { id: "B", label: "B", x: 4, y: 0 },
    { id: "C", label: "C", x: 0, y: 3 },
  ],
  segments: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
});

test("a construction whose stated angle matches its coordinates validates", () => {
  assert.equal(validateCanvasVisual(RIGHT_TRIANGLE).ok, true);
});

test("🔴 a stated angle that disagrees with its own coordinates is refused, so no solver is needed", () => {
  // Placing points is hard; checking them is arithmetic. This is the trade that makes the whole
  // geometry lane honest without a constraint solver.
  const result = validateCanvasVisual({ ...RIGHT_TRIANGLE, angles: [{ at: "A", degrees: 30, from: "B", to: "C" }] });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "failed-verification");
  assert.match(result.ok === false ? result.detail : "", /90\.0°.*labelled 30°/);
});

test("a segment or angle naming a point that does not exist is refused", () => {
  assert.equal(validateCanvasVisual({ ...RIGHT_TRIANGLE, segments: [{ from: "A", to: "Z" }] }).ok, false);
  assert.equal(validateCanvasVisual({ ...RIGHT_TRIANGLE, angles: [{ at: "Z", degrees: 90, from: "B", to: "C" }] }).ok, false);
});

test("points with nothing joining them are prose, not a figure", () => {
  const route = routeVisual({
    request: base({ kind: "construction", points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 1 }] }),
  });
  assert.equal(route.decision, "prose");
  assert.equal(route.decision === "prose" && route.reason, "too-little-to-draw");
});

// ─────────────────────────────────────────────────────────────────────────────── vectors

const INCLINE = base({
  bodyLabel: "10 kg block",
  equilibrium: true,
  kind: "vectors",
  vectors: [
    { degrees: 270, label: "Weight", magnitude: 98, unit: "N" },
    { degrees: 60, label: "Normal", magnitude: 84.87, unit: "N" },
    { degrees: 150, label: "Friction", magnitude: 49, unit: "N" },
  ],
});

test("a free-body diagram in balance validates", () => {
  assert.equal(validateCanvasVisual(INCLINE).ok, true);
});

test("🔴 forces claimed to balance that do not are refused, so a wrong diagram cannot grade anyone", () => {
  const result = validateCanvasVisual({
    ...INCLINE,
    vectors: [{ degrees: 270, label: "Weight", magnitude: 98 }, { degrees: 90, label: "Normal", magnitude: 50 }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "failed-verification");
  assert.match(result.ok === false ? result.detail : "", /equilibrium-mismatch/);
});

test("the same unbalanced vectors are fine when nothing is claimed about them", () => {
  // The refusal is about the CLAIM, not about the forces. A diagram showing a net force is correct
  // physics; it just must not say it balances.
  const result = validateCanvasVisual({
    ...INCLINE,
    equilibrium: undefined,
    vectors: [{ degrees: 270, label: "Weight", magnitude: 98 }, { degrees: 90, label: "Normal", magnitude: 50 }],
  });
  assert.equal(result.ok, true);
});

test("🔴 no physics vocabulary is in the spec — the domain lives in free-text labels", () => {
  const flow = validateCanvasVisual({
    ...INCLINE,
    bodyLabel: "Reservoir",
    equilibrium: true,
    vectors: [
      { degrees: 0, label: "Inflow", magnitude: 50, unit: "L/s" },
      { degrees: 180, label: "Outflow", magnitude: 50, unit: "L/s" },
    ],
  });
  assert.equal(flow.ok, true);
});

// ─────────────────────────────────────────────────────────────────────────────── code

const CODE = base({
  kind: "code",
  language: "python",
  source: "total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)",
  trace: [
    { line: 1, note: "total starts at zero", variables: [{ name: "total", value: "0" }] },
    { line: 3, note: "first pass adds 1", variables: [{ name: "total", value: "1" }] },
    { line: 4, note: "prints 6", variables: [{ name: "total", value: "6" }] },
  ],
});

test("code with a trace validates, and the trace is stamped as narrated", () => {
  const result = validateCanvasVisual(CODE);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.visual.kind === "code" && result.visual.traceOrigin, "narrated");
});

test("🔴 a model cannot claim its narration was an execution", () => {
  // `traceOrigin` is stamped by the validator, never accepted from the request.
  const result = validateCanvasVisual({ ...CODE, traceOrigin: "executed" });
  assert.equal(result.ok && result.visual.kind === "code" && result.visual.traceOrigin, "narrated");
});

test("🔴 a trace step pointing past the end of the snippet is refused", () => {
  // It means the trace and the code have drifted apart — the model narrated a different program —
  // and highlighting nothing would hide that completely.
  const result = validateCanvasVisual({ ...CODE, trace: [{ line: 99, note: "somewhere" }] });
  assert.equal(result.ok === false && result.reason, "malformed-subject");
  assert.match(result.ok === false ? result.detail : "", /line 99.*has 4/);
});

test("an unknown language is refused rather than passed to a highlighter", () => {
  assert.equal(validateCanvasVisual({ ...CODE, language: "brainfuck" }).ok, false);
  assert.equal(validateCanvasVisual({ ...CODE, language: "PYTHON" }).ok, true);
});

test("a snippet past the teaching bound is refused", () => {
  assert.equal(validateCanvasVisual({ ...CODE, source: "x = 1\n".repeat(200) }).ok, false);
  assert.equal(validateCanvasVisual({ ...CODE, source: "" }).ok, false);
});
