// The call that turns a model's figure subjects into licensed pictures (§42, rung three).
//
// 🔴 THE SIBLING OF `structure-lookup.ts`, DELIBERATELY IDENTICAL IN SHAPE. Raw model text in, raw
// model text out; a substring test before any parse; results addressed by position; a failure
// returns the input unchanged — the picture is lost, the explanation around it is not.
//
// 🔴 `fetch` IS INJECTED, so every rule here is testable with no network and no Next.js server.

import {
  applyResolvedFigures,
  collectFigureSubjects,
  mightResolveFigure,
  type FigureResolution,
} from "./figure-resolve";
import { allowedAssetUrl } from "./reference-images";

/** Our own route. The repositories are reached from the server, never from the learner's browser. */
export const REFERENCE_IMAGE_ROUTE = "/api/learn/reference-image";

/** How long the whole batch is worth waiting for. Two repositories per subject sit behind it. */
export const REFERENCE_IMAGE_TIMEOUT_MS = 10000;

export interface FigureLookupDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const REAL: FigureLookupDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * The same answer, with every figure request stamped with what the reference lane chose.
 *
 * Returns the input unchanged when there is nothing to look up, when the text is not JSON, or when
 * the route cannot be reached. 🔴 WITH ONE DELIBERATE EXCEPTION: when the route DID answer, an
 * unresolved subject still goes through `applyResolvedFigures`, because the apply pass is also the
 * strip pass — a model-written `asset` must not survive a lookup that found nothing better.
 */
export async function resolveFigures(
  text: string,
  deps: FigureLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightResolveFigure(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const subjects = collectFigureSubjects(parsed);
  if (subjects.length === 0) return text;

  const results = await lookUp(subjects, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyResolvedFigures(parsed, results));
  } catch {
    return text;
  }
}

async function lookUp(
  subjects: readonly string[],
  deps: FigureLookupDeps,
  signal?: AbortSignal,
): Promise<FigureResolution[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? REFERENCE_IMAGE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(REFERENCE_IMAGE_ROUTE, {
      body: JSON.stringify({ subjects }),
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
    // short array would stamp a nephron diagram onto the caption for a gram stain.
    if (!results || results.length !== subjects.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): FigureResolution {
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
  const asset = result.asset;
  if (typeof asset !== "object" || asset === null) {
    return { detail: "a resolution arrived with no asset", ok: false, reason: "malformed-result" };
  }
  const { assetPath, caption, licence, provenance } = asset as Record<string, unknown>;
  const licenceRecord = typeof licence === "object" && licence !== null ? (licence as Record<string, unknown>) : null;
  // 🔴 THE ROUTE IS OUR OWN AND IS STILL CHECKED ON ARRIVAL. A deploy skew must degrade to "no
  // picture", never to an <img> pointing somewhere the allow list has never heard of, and never to
  // a shown picture whose licence object did not actually make the trip.
  if (
    typeof assetPath !== "string" ||
    !allowedAssetUrl(assetPath) ||
    provenance !== "reference_image" ||
    !licenceRecord ||
    typeof licenceRecord.licence !== "string" ||
    !licenceRecord.licence.trim() ||
    typeof licenceRecord.source !== "string" ||
    !licenceRecord.source.trim()
  ) {
    return { detail: "a resolution arrived without a usable licensed asset", ok: false, reason: "malformed-result" };
  }
  return {
    asset: {
      assetPath,
      ...(typeof caption === "string" && caption.trim() ? { caption: caption.trim() } : {}),
      licence: {
        ...(typeof licenceRecord.attribution === "string" && licenceRecord.attribution.trim()
          ? { attribution: licenceRecord.attribution.trim() }
          : {}),
        licence: licenceRecord.licence.trim(),
        source: licenceRecord.source.trim(),
        ...(typeof licenceRecord.url === "string" && licenceRecord.url.trim() ? { url: licenceRecord.url.trim() } : {}),
      },
      provenance: "reference_image",
    },
    ok: true,
  };
}
