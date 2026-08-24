// A macromolecule name in, a database accession out — from RCSB's own search, never from memory (§42).
//
// 🔴 THE POINT IS WHOSE ANSWER IT IS, the same point `chem-resolver.ts` makes one database down. A
// model asked for "the PDB id of myoglobin" will produce one, fluently, and a viewer will draw
// whatever entry that id names — right or wrong, with equal confidence. A search result can be
// checked, cited and re-fetched; a remembered id cannot.
//
// 🔴 THE TITLE TRAVELS WITH THE ACCESSION, AND IT IS THE INSPECTION SURFACE. Full-text relevance is
// genuinely fuzzy — "haemoglobin" may rank a variant or another species first — and the defence is
// not a cleverer query, it is showing the learner the entry's own title beside the viewer so what
// was found is never a secret. The same reason a structure shows its SMILES string.
//
// 🔴 `fetch` IS INJECTED, for the reason every resolver here injects it: every rule below runs in a
// test with no network.

/** RCSB's search endpoint. A constant for the same reason `PUBCHEM_BASE` is one. */
export const RCSB_SEARCH_BASE = "https://search.rcsb.org/rcsbsearch/v2/query";

/** RCSB's data endpoint, for the entry title. */
export const RCSB_DATA_BASE = "https://data.rcsb.org/rest/v1/core/entry";

/** A PDB entry id: one digit, then three letters or digits. The bound that makes it an identifier. */
const ACCESSION = /^[0-9][A-Za-z0-9]{3}$/;

export type MacromoleculeRefusal =
  /** The caller passed nothing usable to look up. */
  | "empty-name"
  /** The database's search matched nothing under that name. */
  | "not-found"
  /** The search answered, and what it returned is not a usable accession. */
  | "no-usable-structure"
  /** The network failed, the search errored, or the body was not JSON. */
  | "provider-unreachable";

export interface ResolvedAccession {
  readonly accession: string;
  readonly name: string;
  readonly provider: "rcsb";
  readonly title?: string;
}

export type AccessionResolution =
  | { ok: true; structure: ResolvedAccession }
  | { detail: string; ok: false; reason: MacromoleculeRefusal };

export interface MacromoleculeResolveDeps {
  readonly fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
  /** Milliseconds before giving up. A teaching surface cannot wait on a third party indefinitely. */
  readonly timeoutMs?: number;
}

/**
 * The preferred search: the name in the entry's OWN TITLE, oldest first.
 *
 * 🔴 OLDEST-FIRST IS A TEACHING HEURISTIC, MEASURED BEFORE IT WAS CHOSEN. Plain relevance ranked a
 * silkmoth insulin-RELATED peptide first for "insulin" and a sea-hare azide complex for
 * "myoglobin". Sorting title matches by release date surfaces the historic deposition instead —
 * 1MBN for myoglobin, 1EMA for green fluorescent protein — which is the structure the textbook
 * plate was drawn from. The known cost: a phrase inside a longer title in a different sense
 * ("ribosome" matches a "ribosome inactivating protein" toxin). That is why the entry's own title
 * is ALWAYS displayed beside the viewer — what was found is never a secret — and why the prompt
 * asks for a specific molecule name rather than a topic.
 */
export function rcsbTitleSearchUrl(name: string): string {
  const query = {
    query: {
      parameters: { attribute: "struct.title", operator: "contains_phrase", value: name.trim() },
      service: "text",
      type: "terminal",
    },
    request_options: {
      paginate: { rows: 1, start: 0 },
      sort: [{ direction: "asc", sort_by: "rcsb_accession_info.initial_release_date" }],
    },
    return_type: "entry",
  };
  return `${RCSB_SEARCH_BASE}?json=${encodeURIComponent(JSON.stringify(query))}`;
}

/** The fallback search, for a name no title carries: plain relevance over everything indexed. */
export function rcsbSearchUrl(name: string): string {
  const query = {
    query: { parameters: { value: name.trim() }, service: "full_text", type: "terminal" },
    request_options: { paginate: { rows: 1, start: 0 } },
    return_type: "entry",
  };
  return `${RCSB_SEARCH_BASE}?json=${encodeURIComponent(JSON.stringify(query))}`;
}

/** The entry-title URL. Exported for the same reason. */
export function rcsbEntryUrl(accession: string): string {
  return `${RCSB_DATA_BASE}/${encodeURIComponent(accession)}`;
}

/**
 * Resolve a macromolecule name to a PDB accession and the entry's own title.
 *
 * Returns a named refusal rather than throwing: a teaching surface that cannot draw a protein
 * carries on with its text, and the reason belongs in a report rather than in a stack trace.
 */
export async function resolveMacromolecule(
  name: string,
  deps: MacromoleculeResolveDeps,
): Promise<AccessionResolution> {
  const query = typeof name === "string" ? name.trim() : "";
  if (!query) return { detail: "no molecule name was given", ok: false, reason: "empty-name" };

  // Title-match first (the classic deposition), plain relevance only when no title carries the
  // name. Two requests at most, and the second runs only on the first's honest "nothing matched".
  let identifier: string | null = null;
  for (const url of [rcsbTitleSearchUrl(query), rcsbSearchUrl(query)]) {
    let payload: unknown;
    try {
      const response = await deps.fetch(url, signalFor(deps.timeoutMs));
      // 🔴 204 IS "NOTHING MATCHED", NOT AN ERROR. RCSB answers an empty result set with No
      // Content and an empty body, so reaching for `json()` there would report a fact about
      // biology as a fact about the network.
      if (response.status === 204) continue;
      if (!response.ok) {
        return { detail: `the search answered ${response.status}`, ok: false, reason: "provider-unreachable" };
      }
      payload = await response.json();
    } catch (error) {
      return {
        detail: (error as Error)?.message ?? "the search could not be reached",
        ok: false,
        reason: "provider-unreachable",
      };
    }
    identifier = firstIdentifier(payload);
    if (identifier !== null) break;
  }

  if (identifier === null) {
    return { detail: `the structure database matched nothing under "${query}"`, ok: false, reason: "not-found" };
  }
  // 🔴 THE SEARCH'S ANSWER IS VALIDATED LIKE ANY OTHER INPUT before it is interpolated into a data
  // URL and handed to a viewer. "It came from RCSB" is the same class of claim as "it came from a
  // big open repository" is for a licence.
  if (!ACCESSION.test(identifier)) {
    return {
      detail: `the search answered "${identifier}", which is not a PDB accession`,
      ok: false,
      reason: "no-usable-structure",
    };
  }
  const accession = identifier.toUpperCase();

  // The title is worth one more request and is not worth failing over: an accession with no title
  // still draws, it just answers "what did the search find" less well.
  let title: string | undefined;
  try {
    const response = await deps.fetch(rcsbEntryUrl(accession), signalFor(deps.timeoutMs));
    if (response.ok) title = entryTitle(await response.json());
  } catch {
    title = undefined;
  }

  return { ok: true, structure: { accession, name: query, provider: "rcsb", ...(title ? { title } : {}) } };
}

function signalFor(timeoutMs: number | undefined): { signal?: AbortSignal } {
  if (!timeoutMs || typeof AbortSignal?.timeout !== "function") return {};
  return { signal: AbortSignal.timeout(timeoutMs) };
}

/** RCSB wraps results in `result_set[]`, each row carrying `identifier`. The first is best ranked. */
function firstIdentifier(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const rows = (payload as { result_set?: unknown }).result_set;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) return null;
  const identifier = (first as { identifier?: unknown }).identifier;
  return typeof identifier === "string" && identifier.trim() ? identifier.trim() : null;
}

/** The entry's own title, bounded the way the visual spec will bound it. */
function entryTitle(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const struct = (payload as { struct?: unknown }).struct;
  if (typeof struct !== "object" || struct === null) return undefined;
  const title = (struct as { title?: unknown }).title;
  if (typeof title !== "string") return undefined;
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}
