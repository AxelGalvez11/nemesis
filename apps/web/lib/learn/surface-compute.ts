// The one call that turns a model's surface formulas into drawable grids (§45).
//
// 🔴 THE SHAPE OF `plot-compute.ts`, ON PURPOSE, AND IT POSTS TO THE SAME ROUTE. Raw text in, raw
// text out, so no parser anywhere had to become async; a substring gate so almost every turn pays
// one `String.includes`; a failure returns the original text so a surface the server could not
// compute costs the learner a picture and never the explanation. The route is our own arithmetic —
// the same `/api/learn/plot` valve, carrying a `surfaces` array beside the `series` it always took.
//
// 🔴 `fetch` IS INJECTED, for the same reason every sibling injects it: every rule below is testable
// with no network and no Next.js server.

import { PLOT_ROUTE, PLOT_TIMEOUT_MS } from "./plot-compute";
import {
  applySurfaceGrids,
  collectSurfaceRequests,
  mightComputeSurface,
  type SurfaceResult,
} from "./computed-surface";

export interface SurfaceComputeDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const REAL: SurfaceComputeDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * The same answer, with every surface formula replaced by the grid it describes.
 *
 * Returns the input unchanged when there is nothing to compute, when the text is not JSON, or when
 * the route cannot be reached.
 */
export async function computeSurfaces(
  text: string,
  deps: SurfaceComputeDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightComputeSurface(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const requests = collectSurfaceRequests(parsed);
  if (requests.length === 0) return text;

  const results = await requestGrids(requests, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applySurfaceGrids(parsed, results));
  } catch {
    return text;
  }
}

async function requestGrids(
  surfaces: readonly unknown[],
  deps: SurfaceComputeDeps,
  signal?: AbortSignal,
): Promise<SurfaceResult[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? PLOT_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(PLOT_ROUTE, {
      body: JSON.stringify({ surfaces }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const results =
      typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).surfaces)
        ? ((body as Record<string, unknown>).surfaces as unknown[])
        : null;
    // 🔴 THE LENGTHS MUST MATCH OR NOTHING IS APPLIED — positional addressing, the same law the
    // curve pass keeps. A short array would shift every later surface onto the wrong grid, which is
    // a wrong picture rather than a missing one.
    if (!results || results.length !== surfaces.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): SurfaceResult {
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
  const raw = result.grid;
  if (!Array.isArray(raw)) return { detail: "a computed surface arrived with no grid", ok: false, reason: "malformed-result" };

  // 🔴 EVERY CELL IS RE-READ RATHER THAN TRUSTED, the discipline every arrival point keeps: a finite
  // number or a null, nothing else, and ragged rows fail the whole grid rather than being padded.
  const grid: Array<Array<number | null>> = [];
  let width = -1;
  for (const rawRow of raw) {
    if (!Array.isArray(rawRow)) return { detail: "a grid row is not an array", ok: false, reason: "malformed-result" };
    if (width === -1) width = rawRow.length;
    else if (rawRow.length !== width) return { detail: "the grid rows disagree about width", ok: false, reason: "malformed-result" };
    const row: Array<number | null> = [];
    for (const cell of rawRow) {
      if (cell === null) row.push(null);
      else if (typeof cell === "number" && Number.isFinite(cell)) row.push(cell);
      else return { detail: "a grid cell is neither a finite number nor null", ok: false, reason: "malformed-result" };
    }
    grid.push(row);
  }
  return grid.length > 1 ? { grid, ok: true } : { detail: "the grid has fewer than two rows", ok: false, reason: "malformed-result" };
}
