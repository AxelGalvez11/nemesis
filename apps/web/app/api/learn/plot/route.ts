// Where a model's formula becomes numbers — the server half of §45.
//
// 🔴🔴 THIS ROUTE EXISTS FOR ONE REASON: THE MATHS LAYER MAY NOT REACH THE LEARNER'S BUNDLE. §45
// draws the line — *"model-written computation is safe, model-written rendering is not"* — and
// `visualization-roadmap.test.ts` enforces the other half of it by failing if a client component so
// much as names `mathjs`, `expression` or `computed-series`. But the canvas talks to the model from
// the BROWSER: `postChatCompletion` posts to the nemesis-llm edge function and the answer comes back
// into a React tree. So there is no server in the model's own path to hang this on, and a lazy
// `import()` would still ship a maths parser to a page whose only job is to draw a polyline.
//
// One round trip, made only when an answer actually contains a formula, buys the whole separation.
//
// 🔴 IT EXECUTES MODEL-WRITTEN TEXT, WHICH MAKES IT THE MOST SECURITY-SENSITIVE ROUTE IN THE APP,
// and every defence it has lives in `expression.ts` rather than here: an AST allow list of five node
// types and twenty-two function names, walked before anything evaluates. That was measured rather
// than assumed — with a constrained scope alone, `config({})` RUNS and returns the parser's entire
// configuration, because it lives on the parser instance and not in the scope. This file adds
// bounds and an envelope; it deliberately adds no cleverness of its own.
//
// 🔴 AND IT IS NOT A CALCULATOR ENDPOINT. It returns POINTS FOR A PLOT — never the value of an
// expression, never a parsed tree, never an error containing the input reflected back as markup. A
// caller can learn that a formula is unusable and why, in a named reason, and nothing else.
import { NextResponse } from "next/server";

import { curve, distributionCurve, surfaceGrid, type Segment } from "@/lib/learn/computed-series";
import type { DistributionKind, DistributionSpec } from "@/lib/learn/statistics";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * How many series one request may compute.
 *
 * 🔴 A PLOT TAKES FOUR SERIES AND ONE ANSWER MAY HOLD A HANDFUL OF PLOTS, so this is the product of
 * two bounds that already exist rather than a new opinion. Past it the caller is not drawing a
 * lesson.
 */
const MAX_SERIES = 32;

/**
 * How many surfaces one request may compute.
 *
 * 🔴 SMALLER THAN THE SERIES BOUND BECAUSE THE COST IS SQUARED: one surface is 1,681 evaluations
 * against a curve's 160, so four surfaces already out-cost a full plate of curves.
 */
const MAX_SURFACES = 4;

/** The longest formula. `expression.ts` bounds this too; stating it here stops a long body early. */
const MAX_EXPRESSION_LENGTH = 200;

const DISTRIBUTIONS: readonly DistributionKind[] = ["binomial", "normal", "poisson", "uniform"];

type Result =
  | { ok: true; segments: Segment[] }
  | { ok: false; reason: string; detail: string };

function refuse(reason: string, detail: string): Result {
  return { detail, ok: false, reason };
}

/**
 * A distribution the model named, or a refusal.
 *
 * 🔴 THE PARAMETERS ARE COPIED BY NAME, NEVER SPREAD. `{ ...body.distribution }` would carry
 * whatever else the model attached into `statistics.ts`, and the point of a typed spec is that only
 * the fields the mathematics uses ever exist.
 */
function distributionFrom(value: unknown): DistributionSpec | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  // 🔴 `shape`, NOT `kind`, AND THE RENAME IS FOR THE MODEL'S SAKE AS MUCH AS THE GUARD'S. `kind`
  // means "which visual" everywhere else in this wire format — the vocabulary guard in
  // `visualization-roadmap.test.ts` reads the prompt for `"kind":"…"` to check that every shape
  // offered is a shape the validator accepts — and a nested `"kind":"normal"` reads as a tenth
  // visual kind to a scanner and to a model skimming the contract. `kind` is still accepted, for
  // the same reason `reply-visuals.ts` accepts both spellings of a reaction fence: losing a curve
  // to a spelling is a worse outcome than carrying one alias.
  const named = typeof raw.shape === "string" ? raw.shape : raw.kind;
  const kind = DISTRIBUTIONS.find((candidate) => candidate === named);
  if (!kind) return null;

  const numeric = (key: string): number | undefined =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : undefined;

  return {
    kind,
    ...(numeric("mean") === undefined ? {} : { mean: numeric("mean") }),
    ...(numeric("sd") === undefined ? {} : { sd: numeric("sd") }),
    ...(numeric("from") === undefined ? {} : { from: numeric("from") }),
    ...(numeric("to") === undefined ? {} : { to: numeric("to") }),
    ...(numeric("trials") === undefined ? {} : { trials: numeric("trials") }),
    ...(numeric("probability") === undefined ? {} : { probability: numeric("probability") }),
    ...(numeric("rate") === undefined ? {} : { rate: numeric("rate") }),
  };
}

function computeOne(entry: unknown): Result {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return refuse("malformed-request", "a series is not an object");
  }
  const request = entry as Record<string, unknown>;
  const { from, to } = request;
  if (typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to)) {
    return refuse("domain-unusable", "a computed series needs a numeric from and to");
  }

  if (typeof request.expression === "string") {
    const expression = request.expression.trim();
    if (!expression || expression.length > MAX_EXPRESSION_LENGTH) {
      return refuse("expression-unusable", `an expression is 1–${MAX_EXPRESSION_LENGTH} characters`);
    }
    const computed = curve({
      expression,
      from,
      to,
      ...(typeof request.variable === "string" && request.variable.trim() ? { variable: request.variable.trim() } : {}),
      ...(typeof request.samples === "number" ? { samples: request.samples } : {}),
    });
    return computed.ok ? { ok: true, segments: computed.value } : refuse(computed.reason, computed.detail);
  }

  const spec = distributionFrom(request.distribution);
  if (!spec) return refuse("unknown-distribution", "a series needs an expression or a named distribution");
  const computed = distributionCurve(spec, from, to, typeof request.samples === "number" ? request.samples : undefined);
  return computed.ok ? { ok: true, segments: computed.value } : refuse(computed.reason, computed.detail);
}

type SurfaceRouteResult =
  | { ok: true; grid: Array<Array<number | null>> }
  | { ok: false; reason: string; detail: string };

/** One surface: a formula of x and y over a rectangle, evaluated under the same allow list. */
function computeOneSurface(entry: unknown): SurfaceRouteResult {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { detail: "a surface is not an object", ok: false, reason: "malformed-request" };
  }
  const request = entry as Record<string, unknown>;
  const expression = typeof request.expression === "string" ? request.expression.trim() : "";
  if (!expression || expression.length > MAX_EXPRESSION_LENGTH) {
    return { detail: `an expression is 1–${MAX_EXPRESSION_LENGTH} characters`, ok: false, reason: "expression-unusable" };
  }
  const bound = (key: string): number | null =>
    typeof request[key] === "number" && Number.isFinite(request[key]) ? (request[key] as number) : null;
  const xFrom = bound("xFrom");
  const xTo = bound("xTo");
  const yFrom = bound("yFrom");
  const yTo = bound("yTo");
  if (xFrom === null || xTo === null || yFrom === null || yTo === null) {
    return { detail: "a surface needs numeric xFrom, xTo, yFrom and yTo", ok: false, reason: "domain-unusable" };
  }
  const computed = surfaceGrid({ expression, xFrom, xTo, yFrom, yTo });
  return computed.ok
    ? { grid: computed.value, ok: true }
    : { detail: computed.detail, ok: false, reason: computed.reason };
}

/**
 * Compute every series in one go.
 *
 * 🔴 A PER-SERIES RESULT ARRAY, NOT A WHOLE-REQUEST PASS OR FAIL, and the positions match the input.
 * A lesson plotting a curve against a threshold should not lose the threshold because the curve was
 * asked for over a range where it does not exist — `computed-plot.ts` drops the series it could not
 * get and keeps the rest, and it can only do that if it is told which one went wrong.
 *
 * 🔴 NO AUTHENTICATION, AND THAT IS ARGUED RATHER THAN OVERLOOKED. This route reads nothing, writes
 * nothing, reaches no third party and returns no data belonging to anyone: it is arithmetic over the
 * numbers in the request body. What it must not become is an unbounded compute surface, which is
 * what `MAX_SERIES`, the expression length bound and `expression.ts`'s node-count ceiling are for.
 * The day it touches a learner's material, it needs the device key like everything else.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const series = envelope && Array.isArray(envelope.series) ? (envelope.series as unknown[]) : null;
  const surfaces = envelope && Array.isArray(envelope.surfaces) ? (envelope.surfaces as unknown[]) : null;
  if (!series && !surfaces) {
    return NextResponse.json({ error: "expected { series: [...] } or { surfaces: [...] }" }, { status: 400 });
  }
  if (series && series.length > MAX_SERIES) {
    return NextResponse.json({ error: `at most ${MAX_SERIES} series` }, { status: 400 });
  }
  if (surfaces && surfaces.length > MAX_SURFACES) {
    return NextResponse.json({ error: `at most ${MAX_SURFACES} surfaces` }, { status: 400 });
  }

  return NextResponse.json({
    ...(series ? { results: series.map(computeOne) } : {}),
    ...(surfaces ? { surfaces: surfaces.map(computeOneSurface) } : {}),
  });
}
