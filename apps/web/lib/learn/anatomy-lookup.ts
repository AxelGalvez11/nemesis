// The call that turns a model's anatomy asks into atlas stamps (§42).
//
// 🔴 THE SIBLING OF `figure-lookup.ts`, DELIBERATELY IDENTICAL IN SHAPE. Raw model text in, raw
// model text out; a substring test before any parse; results addressed by position; a failure
// returns the input unchanged — the view is lost, the explanation around it is not.
//
// 🔴 THE ROUTE EXISTS TO KEEP THE REGISTRY OFF THE LEARNER'S BUNDLE, not to reach a third party.
// Matching a name against the atlas is microseconds of string work; what it needs is the atlas,
// which is tens of thousands of structure names and grows with every region. Same argument as
// §45's plot route, same shape.
//
// 🔴 `fetch` IS INJECTED, so every rule here is testable with no network and no Next.js server.

import {
  applyResolvedAnatomy,
  collectAnatomyAsks,
  mightResolveAnatomy,
  type AnatomyResolutionResult,
} from "./anatomy-resolve";

/** Our own route. Same origin: this is our own registry, not a provider. */
export const ANATOMY_ROUTE = "/api/learn/anatomy";

/** Short, because the work behind it is string matching over an in-memory list. */
export const ANATOMY_TIMEOUT_MS = 4000;

export interface AnatomyLookupDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const REAL: AnatomyLookupDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * The same answer, with every anatomy ask stamped with what the atlas found.
 *
 * Returns the input unchanged when there is nothing to look up, when the text is not JSON, or when
 * the route cannot be reached.
 */
export async function resolveAnatomy(
  text: string,
  deps: AnatomyLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightResolveAnatomy(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const asks = collectAnatomyAsks(parsed);
  if (asks.length === 0) return text;

  const results = await lookUp(asks, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyResolvedAnatomy(parsed, results));
  } catch {
    return text;
  }
}

async function lookUp(
  structures: readonly string[],
  deps: AnatomyLookupDeps,
  signal?: AbortSignal,
): Promise<AnatomyResolutionResult[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? ANATOMY_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(ANATOMY_ROUTE, {
      body: JSON.stringify({ structures }),
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
    // 🔴 THE LENGTHS MUST MATCH OR NOTHING IS APPLIED. Results are addressed by POSITION, so a
    // short array would stamp the femur's view onto the sentence about the sacrum.
    if (!results || results.length !== structures.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * One arriving result, re-read rather than trusted.
 *
 * 🔴 THE ROUTE IS OUR OWN AND IS STILL CHECKED ON ARRIVAL, the discipline every sibling keeps: a
 * deploy skew must degrade to "no view", never to a viewer pointed at a path the validator has
 * never heard of.
 */
function readResult(value: unknown): AnatomyResolutionResult {
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
  const resolved = result.resolved;
  if (typeof resolved !== "object" || resolved === null) {
    return { detail: "a resolution arrived with no stamp", ok: false, reason: "malformed-result" };
  }
  const { assetPath, region, regionTitle, source, structures } = resolved as Record<string, unknown>;
  if (
    typeof assetPath !== "string" ||
    !/^\/anatomy\/[a-z0-9-]+\.glb$/.test(assetPath) ||
    typeof region !== "string" ||
    !region.trim() ||
    typeof regionTitle !== "string" ||
    !regionTitle.trim() ||
    typeof source !== "string" ||
    !source.trim() ||
    !Array.isArray(structures) ||
    structures.some((name) => typeof name !== "string")
  ) {
    return { detail: "a resolution arrived without a usable atlas stamp", ok: false, reason: "malformed-result" };
  }
  return {
    ok: true,
    resolved: {
      assetPath,
      region: region.trim(),
      regionTitle: regionTitle.trim(),
      source: source.trim(),
      structures: (structures as string[]).map((name) => name.trim()).filter(Boolean),
    },
  };
}
