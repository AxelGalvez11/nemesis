// NCBI MeSH orchestration for the universal picker (Slice A2). Server-side only (called from the
// /api/entities/suggest route) so the NCBI key never reaches the browser and there's no CORS to NCBI.
// Fetch is injectable + everything is fault-tolerant: any NCBI hiccup yields [] so the picker still
// shows the in-house drug catalog (the route + client never depend on MeSH succeeding).
//
// The query shape is the one proven live by scripts/diag/entity-suggest-probe.ts:
//   espell (typo) → esearch db=mesh sort=relevance (canonical descriptor #1) → efetch text (name/tree).

import { parseMeshEfetch, type MeshTerm } from "./mesh";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "pharmaorb";

export interface NcbiOpts {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  signal?: AbortSignal;
}

async function eutils(path: string, opts: NcbiOpts): Promise<string> {
  let url = `${EUTILS}/${path}&tool=${TOOL}`;
  if (opts.apiKey) url += `&api_key=${encodeURIComponent(opts.apiKey)}`;
  const f = opts.fetchImpl ?? fetch;
  const res = await f(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`eutils ${path.split("?")[0]} → ${res.status}`);
  return res.text();
}

/** espell (db=pubmed) typo-correct. Best-effort: returns the correction only when it differs + is
 *  non-empty, else the original. A failure rethrows to the caller's try/catch (→ raw query is used). */
async function espell(q: string, opts: NcbiOpts): Promise<string> {
  const xml = await eutils(`espell.fcgi?db=pubmed&term=${encodeURIComponent(q)}`, opts);
  const m = xml.match(/<CorrectedQuery>([\s\S]*?)<\/CorrectedQuery>/);
  const corrected = (m?.[1] ?? "").trim();
  return corrected && corrected.toLowerCase() !== q.toLowerCase() ? corrected : q;
}

/** esearch db=mesh, NCBI translation, relevance-sorted (canonical descriptor first). Returns MeSH UIDs. */
async function esearchMesh(term: string, opts: NcbiOpts): Promise<string[]> {
  const body = await eutils(
    `esearch.fcgi?db=mesh&retmode=json&retmax=8&sort=relevance&term=${encodeURIComponent(term)}`,
    opts,
  );
  const json = JSON.parse(body) as { esearchresult?: { idlist?: string[] } };
  return json.esearchresult?.idlist ?? [];
}

/** Resolve loose text to ranked MeSH terms. Never throws — any failure (NCBI down, throttle, parse) → []. */
export async function fetchMeshSuggestions(q: string, opts: NcbiOpts = {}): Promise<MeshTerm[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  try {
    const corrected = await espell(query, opts).catch(() => query); // espell is best-effort
    const uids = await esearchMesh(corrected, opts);
    if (uids.length === 0) return [];
    const text = await eutils(`efetch.fcgi?db=mesh&retmode=text&id=${uids.join(",")}`, opts);
    return parseMeshEfetch(text, uids);
  } catch {
    return [];
  }
}
