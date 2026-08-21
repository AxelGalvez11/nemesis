// The call that turns a model's compound names into resolved structures (§42).
//
// 🔴 THE SIBLING OF `plot-compute.ts`, DELIBERATELY IDENTICAL IN SHAPE. Raw model text in, raw model
// text out; a substring test before any parse; results addressed by position; a failure returns the
// input unchanged. Two layers that do the same kind of job — rewrite a model's answer before the
// synchronous parsers see it — being the same shape is what makes either one readable.
//
// 🔴🔴 THE POINT IS WHOSE ANSWER THE LEARNER IS LOOKING AT. §42:
//
//   > A model asked for "the SMILES of aspirin" will produce one, fluently, and it will usually be
//   > right — which is exactly what makes it dangerous.
//
// A resolver's answer can be checked, cited and re-fetched. A remembered one cannot, and a molecule
// wrong by one atom draws a clean, confident picture of a different compound.
//
// 🔴 `fetch` IS INJECTED, so every rule here is testable with no network and no Next.js server.

import {
  applyResolvedStructures,
  collectCompoundNames,
  mightResolveStructure,
  type StructureResolution,
} from "./structure-resolve";

/** Our own route. PubChem is reached from the server, never from the learner's browser. */
export const STRUCTURE_ROUTE = "/api/learn/structure";

/**
 * How long the whole batch is worth waiting for.
 *
 * 🔴 LONGER THAN THE PLOT BOUND BECAUSE IT IS A THIRD PARTY, and shorter than patience because the
 * learner is already waiting when it runs. Past this, the answer arrives with one fewer picture.
 */
export const STRUCTURE_TIMEOUT_MS = 8000;

export interface StructureLookupDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/** The real thing, resolved at call time. See `plot-compute.ts` for why it is not at the call site. */
const REAL: StructureLookupDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * The same answer, with every named compound replaced by what PubChem returned.
 *
 * Returns the input unchanged when there is nothing to look up, when the text is not JSON, or when
 * the route cannot be reached.
 */
export async function resolveStructures(
  text: string,
  deps: StructureLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightResolveStructure(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const names = collectCompoundNames(parsed);
  if (names.length === 0) return text;

  const results = await lookUp(names, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyResolvedStructures(parsed, results));
  } catch {
    return text;
  }
}

async function lookUp(
  names: readonly string[],
  deps: StructureLookupDeps,
  signal?: AbortSignal,
): Promise<StructureResolution[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? STRUCTURE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(STRUCTURE_ROUTE, {
      body: JSON.stringify({ names }),
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
    // 🔴 THE LENGTHS MUST MATCH OR NOTHING IS APPLIED. Results are addressed by POSITION, so a short
    // array would draw benzene under the caption for glucose — a confidently wrong molecule, which
    // is the exact outcome resolving names was supposed to prevent.
    if (!results || results.length !== names.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): StructureResolution {
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
  const structure = result.structure;
  if (typeof structure !== "object" || structure === null) {
    return { detail: "a resolution arrived with no structure", ok: false, reason: "malformed-result" };
  }
  const { id, name, notation, provider, value: smiles } = structure as Record<string, unknown>;
  // 🔴 THE ROUTE IS OUR OWN AND IS STILL CHECKED ON ARRIVAL. A deploy skew or a half-written
  // response must degrade to "no picture", never to a partial stamp claiming PubChem provenance for
  // a string PubChem did not supply — that would be worse than no provenance at all.
  if (typeof smiles !== "string" || !smiles || notation !== "smiles" || provider !== "pubchem") {
    return { detail: "a resolution arrived without a usable SMILES", ok: false, reason: "malformed-result" };
  }
  return {
    ok: true,
    structure: {
      id: typeof id === "string" ? id : "unknown",
      name: typeof name === "string" ? name : "",
      notation: "smiles",
      provider: "pubchem",
      value: smiles,
    },
  };
}
