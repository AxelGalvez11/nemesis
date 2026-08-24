// Finding the surfaces in a model's answer, and putting the computed grids back (§45).
//
// 🔴 THE SECOND COMPUTED CHANNEL, BUILT TO THE FIRST ONE'S DRAWINGS. `computed-plot.ts` established
// the whole discipline — walk the raw answer for formula requests, compute on the server, apply the
// numbers back POSITIONALLY, drop what could not be computed while the prose survives — and this
// module changes exactly one thing: the request is a surface (`{"kind":"surface","expression":…}`)
// and the numbers come back as a grid rather than as segments.
//
// 🔴 A SEPARATE WALK RATHER THAN A CLEVERER SHARED ONE, DELIBERATELY. The two positional contracts
// stay independent: a mismatch in the plot results can never shift a surface onto the wrong grid,
// because the two passes each walk for their own kind and consume their own array.
//
// 🔴 PURE, for the reason its sibling is: mathjs must never reach the learner's bundle, so this file
// only says WHAT needs computing and WHERE it goes. `app/api/learn/plot/route.ts` does the
// arithmetic on the server. Nothing here imports anything.

/** How many surfaces one model answer may ask to have computed. */
const MAX_SURFACES = 4;

/** One surface the model asked for as maths rather than as numbers. */
export interface SurfaceRequest {
  readonly expression: string;
  readonly xFrom: number;
  readonly xTo: number;
  readonly yFrom: number;
  readonly yTo: number;
}

export type SurfaceResult =
  | { ok: true; grid: readonly (readonly (number | null)[])[] }
  | { ok: false; reason: string; detail: string };

/**
 * Is it worth parsing this at all?
 *
 * The same cheap gate its sibling keeps: one substring test before any `JSON.parse` and any network
 * call, because the overwhelming majority of turns contain no surface and must not pay for one.
 */
export function mightComputeSurface(text: string): boolean {
  return text.includes('"surface"');
}

/**
 * Every surface request in a model answer, in the order a walk finds them.
 *
 * 🔴 THE ORDER IS THE ADDRESS, exactly as it is for curves: `applySurfaceGrids` walks the identical
 * tree in the identical order and consumes results positionally, and two walks of one immutable
 * value cannot disagree.
 */
export function collectSurfaceRequests(value: unknown): SurfaceRequest[] {
  const found: SurfaceRequest[] = [];
  walk(value, (request) => {
    if (found.length < MAX_SURFACES) found.push(request);
  });
  return found;
}

/**
 * The same answer with computed grids in place of the formulas that asked for them.
 *
 * `results` is positional against `collectSurfaceRequests` on the SAME value. A surface that could
 * not be computed loses its visual entirely — the validator would refuse a gridless surface anyway,
 * and dropping it here keeps the failure a missing picture rather than a logged model mistake.
 */
export function applySurfaceGrids(value: unknown, results: readonly SurfaceResult[]): unknown {
  let cursor = 0;
  const next = (): SurfaceResult | undefined => results[cursor++];
  return rebuild(value, next);
}

// ------------------------------------------------------------------ the walk

/** A surface visual still in request form: a formula and a domain, with no grid yet. */
function asRequest(value: unknown): SurfaceRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (request.kind !== "surface") return null;
  // 🔴 A GRID ALREADY PRESENT MEANS THERE IS NOTHING TO COMPUTE — a stored block making a second
  // trip through the seam, which must be a no-op rather than a recomputation.
  if (Array.isArray(request.grid)) return null;

  const expression = typeof request.expression === "string" ? request.expression.trim() : "";
  if (!expression) return null;
  const { xFrom, xTo, yFrom, yTo } = request;
  if ([xFrom, xTo, yFrom, yTo].some((bound) => typeof bound !== "number" || !Number.isFinite(bound))) return null;

  return { expression, xFrom: xFrom as number, xTo: xTo as number, yFrom: yFrom as number, yTo: yTo as number };
}

function walk(value: unknown, visit: (request: SurfaceRequest) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const request = asRequest(value);
  if (request) {
    visit(request);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => SurfaceResult | undefined): unknown {
  if (Array.isArray(value)) {
    // A surface that computed to nothing leaves the array rather than sitting in it as `null`, for
    // the same reason its sibling's plots do: a null entry in `visuals: [...]` would be reported
    // downstream as a malformed model request when it was a server refusal.
    const rebuilt = value.map((item) => rebuild(item, next));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  const request = asRequest(value);
  if (request) {
    const result = next();
    if (!result || !result.ok) return null;
    return { ...(value as Record<string, unknown>), grid: result.grid };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const rebuiltItem = rebuild(item, next);
    if (rebuiltItem === null && item !== null) continue;
    out[key] = rebuiltItem;
  }
  return out;
}
