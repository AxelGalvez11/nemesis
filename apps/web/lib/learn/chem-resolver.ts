// A name in, a canonical structure out — from a resolver, never from memory (§42).
//
// 🔴 THE POINT IS WHOSE ANSWER IT IS. A model asked for "the SMILES of aspirin" will produce one,
// fluently, and it will usually be right — which is exactly what makes it dangerous. There is no
// signal in the output distinguishing a remembered string from an invented one, and a SMILES that
// is wrong by one atom draws a clean, confident, incorrect molecule. A resolver's answer can be
// checked, cited and re-fetched; a remembered one cannot. So where a name exists, the name is
// resolved.
//
// 🔴 AND WHEN THE RESOLVER CANNOT ANSWER, THAT IS A NAMED OUTCOME RATHER THAN A FALLBACK TO THE
// MODEL. Falling back would mean the least trustworthy path runs precisely when the trustworthy one
// found nothing — which is the same failure §42's ladder exists to prevent, one layer down.
//
// 🔴 `fetch` IS INJECTED, WHICH IS WHAT MAKES THIS TESTABLE AT ALL. Every rule below runs in a test
// with no network: the response shapes that matter are the ones this file has to survive, and a
// module that reached for a global `fetch` could only be tested by calling a public API from CI.

import { validateSmiles } from "./chem-notation";

/** The one resolver this module speaks to. A name, so a second one is an addition rather than an edit. */
export type ChemProvider = "pubchem";

/**
 * PubChem's REST base.
 *
 * 🔴 A CONSTANT RATHER THAN A CONFIG, because the day it needs to vary is the day a second provider
 * exists, and a second provider is a new function rather than a different URL for this one.
 */
export const PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

export type ChemResolveRefusal =
  /** The caller passed nothing usable to look up. */
  | "empty-name"
  /** The resolver has no compound under that name. */
  | "not-found"
  /**
   * The resolver answered, and what it returned is not usable notation.
   *
   * 🔴 KEPT SEPARATE FROM `not-found` BECAUSE IT MEANS SOMETHING ELSE ENTIRELY. "PubChem has no
   * such compound" is a coverage fact about chemistry; "PubChem returned something this codebase
   * cannot draw" is a fact about the integration, and collapsing them would hide a broken parse
   * behind a plausible-looking miss.
   */
  | "no-usable-structure"
  /** The network failed, the resolver errored, or the body was not JSON. */
  | "provider-unreachable";

export interface ResolvedStructure {
  /** PubChem's compound id, as a string — it is an identifier, never arithmetic. */
  readonly id: string;
  /** The name that was looked up, kept so the stamp says what was asked rather than what matched. */
  readonly name: string;
  readonly notation: "smiles";
  readonly provider: ChemProvider;
  readonly value: string;
}

export type ChemResolution =
  | { ok: true; structure: ResolvedStructure }
  | { detail: string; ok: false; reason: ChemResolveRefusal };

export interface ChemResolveDeps {
  /** Injected so every rule here is testable without a network. */
  readonly fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
  /** Milliseconds before giving up. A teaching surface cannot wait on a third party indefinitely. */
  readonly timeoutMs?: number;
}

/**
 * Which SMILES field to read, in the order the answer is preferred.
 *
 * 🔴 A LADDER, BECAUSE PubChem RENAMED THIS FIELD AND BOTH SPELLINGS ARE IN THE WILD. Older
 * responses carry `CanonicalSMILES` and `IsomericSMILES`; newer ones carry `SMILES` and
 * `ConnectivitySMILES`. Reading one name only would work until it silently did not, and the
 * failure would look like "PubChem has no structure for aspirin".
 *
 * 🔴 ISOMERIC FIRST, AND THAT IS A TEACHING DECISION. The isomeric form carries stereochemistry —
 * `C[C@@H]` rather than `CC` — and a chirality question asked against a structure that dropped its
 * stereocentres is unanswerable. Canonical is the fallback, not the preference.
 */
const SMILES_FIELDS = ["IsomericSMILES", "SMILES", "CanonicalSMILES", "ConnectivitySMILES"] as const;

/** The URL this module asks for. Exported so a test can assert the request rather than guess it. */
export function pubchemUrl(name: string): string {
  return `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(name.trim())}/property/${SMILES_FIELDS.join(",")}/JSON`;
}

/**
 * Resolve a compound name to a canonical structure.
 *
 * Returns a named refusal rather than throwing: a teaching surface that cannot draw a molecule
 * carries on with its text, and the reason belongs in a report rather than in a stack trace.
 */
export async function resolveStructure(name: string, deps: ChemResolveDeps): Promise<ChemResolution> {
  const query = typeof name === "string" ? name.trim() : "";
  if (!query) return { detail: "no compound name was given", ok: false, reason: "empty-name" };

  let payload: unknown;
  try {
    const response = await deps.fetch(pubchemUrl(query), signalFor(deps.timeoutMs));
    // 🔴 404 IS `not-found`, EVERY OTHER FAILING STATUS IS `provider-unreachable`. PubChem answers
    // 404 for an unknown name, which is a fact about chemistry; a 500 or a 503 is a fact about
    // their afternoon, and treating the second as "no such compound" would teach a learner that a
    // molecule does not exist because a server was busy.
    if (response.status === 404) {
      return { detail: `no compound is registered under "${query}"`, ok: false, reason: "not-found" };
    }
    if (!response.ok) {
      return { detail: `the resolver answered ${response.status}`, ok: false, reason: "provider-unreachable" };
    }
    payload = await response.json();
  } catch (error) {
    return {
      detail: (error as Error)?.message ?? "the resolver could not be reached",
      ok: false,
      reason: "provider-unreachable",
    };
  }

  const property = firstProperty(payload);
  if (!property) {
    return { detail: `the resolver returned no properties for "${query}"`, ok: false, reason: "not-found" };
  }

  for (const field of SMILES_FIELDS) {
    const candidate = property[field];
    if (typeof candidate !== "string") continue;
    const validation = validateSmiles(candidate);
    // 🔴 THE RESOLVER'S ANSWER IS VALIDATED LIKE ANY OTHER INPUT. A trusted source is not an
    // unchecked one: this string is about to be handed to a depiction library and rendered to a
    // learner, and "it came from PubChem" is the same class of claim as "it came from a big open
    // repository" is for a licence.
    if (validation.ok) {
      return {
        ok: true,
        structure: {
          id: idOf(property),
          name: query,
          notation: "smiles",
          provider: "pubchem",
          value: validation.value,
        },
      };
    }
  }

  return {
    detail: `the resolver answered for "${query}" but carried no SMILES this codebase can draw`,
    ok: false,
    reason: "no-usable-structure",
  };
}

function signalFor(timeoutMs: number | undefined): { signal?: AbortSignal } {
  if (!timeoutMs || typeof AbortSignal?.timeout !== "function") return {};
  return { signal: AbortSignal.timeout(timeoutMs) };
}

/** PubChem wraps everything in `PropertyTable.Properties[]`. The first row is the best match. */
function firstProperty(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) return null;
  const table = (payload as { PropertyTable?: unknown }).PropertyTable;
  if (typeof table !== "object" || table === null) return null;
  const rows = (table as { Properties?: unknown }).Properties;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  return typeof first === "object" && first !== null ? (first as Record<string, unknown>) : null;
}

function idOf(property: Record<string, unknown>): string {
  const cid = property.CID;
  return typeof cid === "number" || typeof cid === "string" ? String(cid) : "unknown";
}
