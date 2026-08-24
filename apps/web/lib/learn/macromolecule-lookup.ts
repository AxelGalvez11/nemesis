// The call that turns a model's macromolecule names into database accessions (§42).
//
// The sibling of `structure-lookup.ts` and `figure-lookup.ts` — same shape, same positional
// contract, same policy that a failure costs the picture and never the prose.

import {
  applyResolvedMacromolecules,
  collectMacromoleculeNames,
  mightResolveMacromolecule,
  type MacromoleculeResolution,
} from "./macromolecule-resolve";

/** Our own route. RCSB is reached from the server, never from the learner's browser. */
export const MACROMOLECULE_ROUTE = "/api/learn/macromolecule";

/** How long the whole batch is worth waiting for — a search and a title fetch per name. */
export const MACROMOLECULE_TIMEOUT_MS = 8000;

/** A PDB entry id, as the spec will validate it. Checked on arrival for the same deploy-skew reason. */
const ACCESSION = /^[0-9][A-Za-z0-9]{3}$/;

export interface MacromoleculeLookupDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const REAL: MacromoleculeLookupDeps = { fetch: (...args) => globalThis.fetch(...args) };

/** The same answer, with every named macromolecule replaced by what the resolver returned. */
export async function resolveMacromolecules(
  text: string,
  deps: MacromoleculeLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightResolveMacromolecule(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const names = collectMacromoleculeNames(parsed);
  if (names.length === 0) return text;

  const results = await lookUp(names, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyResolvedMacromolecules(parsed, results));
  } catch {
    return text;
  }
}

async function lookUp(
  names: readonly string[],
  deps: MacromoleculeLookupDeps,
  signal?: AbortSignal,
): Promise<MacromoleculeResolution[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? MACROMOLECULE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(MACROMOLECULE_ROUTE, {
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
    if (!results || results.length !== names.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): MacromoleculeResolution {
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
  const { accession, name, provider, title } = structure as Record<string, unknown>;
  if (typeof accession !== "string" || !ACCESSION.test(accession) || provider !== "rcsb") {
    return { detail: "a resolution arrived without a usable accession", ok: false, reason: "malformed-result" };
  }
  return {
    ok: true,
    structure: {
      accession: accession.toUpperCase(),
      name: typeof name === "string" ? name : "",
      provider: "rcsb",
      ...(typeof title === "string" && title.trim() ? { title: title.trim().slice(0, 200) } : {}),
    },
  };
}
