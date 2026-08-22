// Finding the formulas in a model's answer, and putting the computed points back (§45).
//
// 🔴🔴 THIS FILE EXISTS BECAUSE §45 SHIPPED A COMPUTATION LAYER NOBODY COULD REACH. `expression.ts`,
// `statistics.ts` and `computed-series.ts` were built, hardened against a real sandbox-escape probe,
// tested, and merged to main — and §45's own status line said the quiet part out loud for two days:
// *"NO LESSON EMITS ONE YET."* `grep -r computed-series` returned a dev gallery script and a test.
// The plot renderer even carried a comment explaining how it deduped the legend of a curve split by
// a pole, for curves that could not be produced. A capability nothing can reach is indistinguishable
// from one that was never built, which is the same lesson §41's visual vocabulary learned when it
// named three renderers out of nine.
//
// 🔴 SO WHAT WAS MISSING WAS NEVER MATHS. It was a CHANNEL — somewhere for the model to write `x^2`
// instead of a hundred and sixty coordinate pairs — and the machinery that turns one into the other
// before the sync validators ever see it.
//
// 🔴 AND STILL NO NEW VISUAL KIND, WHICH IS §45'S RULE AND NOT A CONVENIENCE. A function plot IS a
// quantitative plot whose points were computed rather than listed. Everything below rewrites a
// request into the shape `canvas-visual.ts` already validates, so by the time any existing code sees
// it there is nothing to know: same validator, same bounds, same renderer, same occlusion, same
// marking. A `function` kind would have meant a second plot renderer and two places for a chart to
// disagree with itself.
//
// 🔴 PURE, AND THAT IS LOAD-BEARING RATHER THAN TIDY. `computed-series.ts` pulls in mathjs and
// `simple-statistics`, and §45 forbids that layer reaching the learner's bundle — there is a test
// that fails if a client component so much as names it. The canvas talks to the model from the
// BROWSER (`postChatCompletion` → the nemesis-llm edge function), so the split has to be: this file
// says WHAT needs computing and WHERE it goes, `app/api/learn/plot/route.ts` does the arithmetic on
// the server, and no maths package is ever imported on a path a page can pull in. Nothing here
// imports anything.

/** How many series one plot may compute. The validator's own ceiling, restated so a walk can stop. */
const MAX_SERIES = 4;

/** How many plots one model answer may ask to have computed. */
const MAX_REQUESTS = 8;

/**
 * One series the model asked for as maths rather than as data.
 *
 * 🔴 `from`/`to` LIVE ON THE SERIES, NOT ON THE PLOT, and that is deliberate. Two curves on one axis
 * are routinely drawn over different useful ranges — a distribution over its body and a threshold
 * line over the whole axis — and hoisting the domain would force the model to pick one and let the
 * other run off the chart or crowd into a corner.
 */
export interface ComputedSeriesRequest {
  readonly label: string;
  /** A formula in one variable. Mutually exclusive with `distribution`. */
  readonly expression?: string;
  /** A named distribution, drawn as its density. Mutually exclusive with `expression`. */
  readonly distribution?: Readonly<Record<string, unknown>>;
  readonly from: number;
  readonly to: number;
  /** Defaults to `x`. */
  readonly variable?: string;
  readonly samples?: number;
}

/** One continuous run of points. A curve broken by a pole comes back as several. */
export interface ComputedSegment {
  readonly points: readonly { x: number; y: number }[];
}

export type ComputedSeriesResult =
  | { ok: true; segments: readonly ComputedSegment[] }
  | { ok: false; reason: string; detail: string };

/**
 * Is it worth parsing this at all?
 *
 * 🔴 A SUBSTRING TEST BEFORE A `JSON.parse`, AND BEFORE A NETWORK CALL, because the overwhelming
 * majority of turns contain no formula and must not pay for this. Both words are cheap to look for
 * and neither appears anywhere else in the canvas wire format, so a false positive costs one parse
 * of text that was about to be parsed anyway.
 */
export function mightComputePlot(text: string): boolean {
  return text.includes('"expression"') || text.includes('"distribution"');
}

/**
 * Every computed series in a model answer, in the order a walk finds them.
 *
 * 🔴 THE ORDER IS THE ADDRESS. Nothing is returned that says WHERE each request came from — no
 * pointer, no path, no id — because `applyComputedSeries` walks the identical tree in the identical
 * order and consumes the results positionally. Two walks of one immutable value cannot disagree,
 * and the alternative (JSON pointers threaded through a recursive walk) is a second thing to keep
 * correct for no gain.
 *
 * 🔴 IT WALKS ANYTHING, because the same shape arrives inside three different envelopes: a lesson's
 * `blocks[].visual`, a turn decision's `visuals[]`, and a canvas operation's `visual`. Looking for
 * the visual rather than for its container means a fourth envelope needs no change here.
 */
export function collectComputedSeries(value: unknown): ComputedSeriesRequest[] {
  const found: ComputedSeriesRequest[] = [];
  walk(value, (series) => {
    if (found.length < MAX_REQUESTS * MAX_SERIES) found.push(series);
  });
  return found;
}

/**
 * The same answer with computed points in place of the formulas that asked for them.
 *
 * `results` is positional against `collectComputedSeries` on the SAME value.
 *
 * 🔴🔴 A SERIES THAT COULD NOT BE COMPUTED IS DROPPED, AND A PLOT LEFT WITH NOTHING LOSES ITS
 * VISUAL ENTIRELY — it does not become an empty chart. `sqrt(x)` from −10 to −1 is a real formula
 * asked over the wrong range, and an axis with no line on it reads to a learner as a rendering
 * failure rather than as a question about a region where the function does not exist. The prose the
 * model wrote around it survives untouched; only the picture goes.
 *
 * 🔴 AND A SPLIT CURVE BECOMES SEVERAL SERIES SHARING ONE LABEL. The renderer already expects that
 * (§45) — it colours and lists a curve by its name rather than by its index — because `1/x` is one
 * function drawn as two runs, and joining them would draw a line straight through the asymptote the
 * lesson is about.
 */
export function applyComputedSeries(value: unknown, results: readonly ComputedSeriesResult[]): unknown {
  let cursor = 0;
  const next = (): ComputedSeriesResult | undefined => results[cursor++];
  return rebuild(value, next);
}

// ------------------------------------------------------------------ the walk

/** Is this an object that a `quantitative` visual would be? */
function isPlot(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === "quantitative" &&
    Array.isArray((value as Record<string, unknown>).series)
  );
}

/**
 * Does this series ask for computation?
 *
 * 🔴 `points` WINS IF BOTH ARE PRESENT, which is the conservative reading and the one that cannot
 * lose data. A model that listed its points and also named a formula has already answered; asking
 * the server to recompute would replace what it said with what we derived, and any disagreement
 * between the two would be resolved silently in favour of the half nobody checked.
 */
function asRequest(value: unknown): ComputedSeriesRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const series = value as Record<string, unknown>;
  if (Array.isArray(series.points)) return null;

  const label = typeof series.label === "string" ? series.label.trim() : "";
  if (!label) return null;

  const { from, to } = series;
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const expression = typeof series.expression === "string" ? series.expression.trim() : "";
  const distribution =
    typeof series.distribution === "object" && series.distribution !== null && !Array.isArray(series.distribution)
      ? (series.distribution as Record<string, unknown>)
      : null;

  // Exactly one of the two. Both is a model that has not decided what it is drawing.
  if (expression && distribution) return null;
  if (!expression && !distribution) return null;

  return {
    ...(expression ? { expression } : {}),
    ...(distribution ? { distribution } : {}),
    ...(typeof series.variable === "string" && series.variable.trim() ? { variable: series.variable.trim() } : {}),
    ...(typeof series.samples === "number" && Number.isFinite(series.samples) ? { samples: series.samples } : {}),
    from,
    label,
    to,
  };
}

function walk(value: unknown, visit: (series: ComputedSeriesRequest) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  if (isPlot(value)) {
    const series = value.series as unknown[];
    for (const item of series.slice(0, MAX_SERIES)) {
      const request = asRequest(item);
      if (request) visit(request);
    }
    return;
  }

  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => ComputedSeriesResult | undefined): unknown {
  if (Array.isArray(value)) {
    // 🔴 A PLOT THAT COMPUTED TO NOTHING LEAVES THE ARRAY RATHER THAN SITTING IN IT AS `null`.
    // `visuals: [...]` on a turn decision is the case that matters: a null entry would survive as
    // far as `replyVisuals`, which would refuse it and log a malformed visual — reporting a model
    // mistake for something the server declined to compute.
    const rebuilt = value.map((item) => rebuild(item, next));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  if (isPlot(value)) {
    const incoming = value.series as unknown[];
    const rebuilt: unknown[] = [];
    for (const item of incoming.slice(0, MAX_SERIES)) {
      const request = asRequest(item);
      if (!request) {
        rebuilt.push(item);
        continue;
      }
      const result = next();
      if (!result || !result.ok) continue;
      // One series per continuous run, all under the one name the model gave the curve.
      for (const segment of result.segments) {
        rebuilt.push({ label: request.label, points: segment.points });
      }
    }
    // A plot with nothing left to draw is not a plot. The caller drops the visual, keeps the prose.
    if (rebuilt.length === 0) return null;
    return { ...value, series: rebuilt };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const rebuiltItem = rebuild(item, next);
    // 🔴 A VISUAL THAT COMPUTED TO NOTHING IS REMOVED RATHER THAN SET TO null, because `visual` is
    // optional on a block and absent is the shape every reader here already handles. `null` would
    // be a third state for one existing pair of cases.
    if (rebuiltItem === null && item !== null) continue;
    out[key] = rebuiltItem;
  }
  return out;
}
