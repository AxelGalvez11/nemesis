// The one call that turns a model's formulas into a drawable answer (§45).
//
// 🔴 IT TAKES THE MODEL'S RAW TEXT AND RETURNS RAW TEXT, WHICH IS WHY NOTHING DOWNSTREAM CHANGED.
// Every canvas parser — `parseLesson`, `parseCanvasOps`, `readTurnDecision` — is a synchronous
// function from a string to a validated object, and computing a curve needs a network call. Making
// those parsers async would have rewritten fourteen call sites and every test that drives them, to
// express something that is not really about parsing at all. Rewriting the JSON *before* the parser
// runs keeps the whole change to two `await`s at the two places a model answer arrives.
//
// 🔴🔴 AND IT IS A NO-OP FOR ALMOST EVERY TURN. `mightComputePlot` is a substring test that runs
// before any parse and before any fetch, so a greeting, a correction, a flashcard and a lesson with
// no maths in it pay one `String.includes` and nothing else. This is the reason the seam could go in
// the shared helper at all: an unconditional round trip on every canvas call would have been a
// latency tax on the ninety-odd percent of turns that never draw a curve.
//
// 🔴 A FAILURE HERE RETURNS THE ORIGINAL TEXT, NEVER AN ERROR. The formulas stay unresolved, the
// validator refuses those series as it always would, and the learner gets the prose with one fewer
// picture. The alternative — failing the turn — would mean a plot the server could not compute
// costing the learner the explanation that came with it.
//
// 🔴 `fetch` IS INJECTED, for the same reason `chem-resolver.ts` injects it: every rule below is
// testable with no network and no Next.js server, and a module reaching for a global could only be
// exercised by standing one up.

import {
  applyComputedSeries,
  collectComputedSeries,
  mightComputePlot,
  type ComputedSeriesResult,
} from "./computed-plot";

/** Where the arithmetic happens. Same origin: this is our own route, not a provider. */
export const PLOT_ROUTE = "/api/learn/plot";

/**
 * How long a curve is worth waiting for.
 *
 * 🔴 SHORT ON PURPOSE. This sits between a model answer and the learner seeing it, so every
 * millisecond is added to a wait they are already in. Evaluating a bounded expression at 160 points
 * is sub-millisecond work; anything approaching this bound is a route in trouble, and the right
 * answer then is the prose without the picture rather than a longer spinner.
 */
export const PLOT_TIMEOUT_MS = 4000;

export interface PlotComputeDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/**
 * The real thing, resolved at call time.
 *
 * 🔴 IT LIVES HERE RATHER THAN AT THE CALL SITES, AND A GUARD IS THE REASON. `conversation-is-the-
 * default.test.ts` fails if `canvas-chat.ts` contains `fetch(` at all — *"a second path to a
 * provider was opened"* — and that bluntness is worth keeping: the front door goes through one
 * valve, and a test that argues about which fetches are innocent would stop catching the one that
 * is not. This route is our own arithmetic and not a provider, so the right answer is for the front
 * door never to mention a fetch, not for the guard to learn exceptions.
 */
const REAL: PlotComputeDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * The same answer, with every formula replaced by the points it describes.
 *
 * Returns the input unchanged when there is nothing to compute, when the text is not JSON, or when
 * the route cannot be reached.
 */
export async function computePlots(text: string, deps: PlotComputeDeps = REAL, signal?: AbortSignal): Promise<string> {
  if (!mightComputePlot(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 🔴 NOT EVERY MODEL ANSWER IS JSON, and the ones that are not are not broken. A reply arrives
    // as a JSON envelope, but a rescued turn can arrive as prose and `decisionOrReply` handles it.
    // Nothing to walk means nothing to do.
    return text;
  }

  const requests = collectComputedSeries(parsed);
  if (requests.length === 0) return text;

  const results = await requestPoints(requests, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyComputedSeries(parsed, results));
  } catch {
    return text;
  }
}

async function requestPoints(
  series: readonly unknown[],
  deps: PlotComputeDeps,
  signal?: AbortSignal,
): Promise<ComputedSeriesResult[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? PLOT_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(PLOT_ROUTE, {
      body: JSON.stringify({ series }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const results =
      typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).results)
        ? ((body as Record<string, unknown>).results as unknown[])
        : null;
    // 🔴 THE LENGTHS MUST MATCH OR NOTHING IS APPLIED, because the results are addressed by
    // POSITION. A short array would silently shift every later series onto the wrong curve, which
    // is a wrong picture rather than a missing one — the failure this whole layer exists to avoid.
    if (!results || results.length !== series.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): ComputedSeriesResult {
  if (typeof value !== "object" || value === null) {
    return { detail: "the route returned something unreadable", ok: false, reason: "malformed-result" };
  }
  const result = value as Record<string, unknown>;
  if (result.ok !== true) {
    return {
      detail: typeof result.detail === "string" ? result.detail : "",
      ok: false,
      reason: typeof result.reason === "string" ? result.reason : "unknown",
    };
  }
  if (!Array.isArray(result.segments)) {
    return { detail: "a computed series arrived with no segments", ok: false, reason: "malformed-result" };
  }
  const segments: Array<{ points: Array<{ x: number; y: number }> }> = [];
  for (const entry of result.segments) {
    if (typeof entry !== "object" || entry === null) continue;
    const points = (entry as Record<string, unknown>).points;
    if (!Array.isArray(points)) continue;
    const usable: Array<{ x: number; y: number }> = [];
    for (const point of points) {
      if (typeof point !== "object" || point === null) continue;
      const { x, y } = point as Record<string, unknown>;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      usable.push({ x, y });
    }
    // A run of one point draws nothing; the plot validator refuses fewer than two anyway.
    if (usable.length > 1) segments.push({ points: usable });
  }
  return segments.length > 0
    ? { ok: true, segments }
    : { detail: "no run of the curve had two usable points", ok: false, reason: "nothing-to-plot" };
}
