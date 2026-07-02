// Third-party enrichment for a literature source, keyed by PMID.
//  - OpenAlex (CC0): DOI resolution, is_retracted, cited_by_count.
//  - scite public tallies (per DOI): supporting / contrasting / mentioning counts.
// Both are best-effort: any HTTP/shape failure degrades to nulls, never throws to the caller.

import { normalizeDoi } from "../../../packages/shared/src/source-ids.ts";

export interface StudySnapshot {
  population: string | null;
  sample_size: number | null;
  duration: string | null;
  design: string | null;
}

export interface SourceEnrichment {
  doi: string | null;
  retracted: boolean;
  cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

const OPENALEX_MAILTO = "engineering@pharmaorb.app";

export function parseOpenAlexWork(json: unknown): { doi: string | null; retracted: boolean; cited_by: number | null } {
  const w = (json ?? {}) as Record<string, unknown>;
  const ids = (w.ids ?? {}) as Record<string, unknown>;
  return {
    doi: normalizeDoi(typeof ids.doi === "string" ? ids.doi : null),
    retracted: w.is_retracted === true,
    cited_by: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
  };
}

export function parseSciteTallies(json: unknown): SourceEnrichment["tallies"] {
  const t = (json ?? {}) as Record<string, unknown>;
  if (typeof t.supporting !== "number" || typeof t.mentioning !== "number") return null;
  const contrasting = typeof t.contradicting === "number" ? t.contradicting
    : typeof t.contrasting === "number" ? t.contrasting : 0;
  return { supporting: t.supporting, contrasting, mentioning: t.mentioning };
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null; // 4xx/5xx = "no data", by design
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchEnrichmentBase(pmid: string): Promise<Omit<SourceEnrichment, "snapshot">> {
  const work = parseOpenAlexWork(
    await getJson(`https://api.openalex.org/works/pmid:${pmid}?mailto=${OPENALEX_MAILTO}&select=ids,is_retracted,cited_by_count`),
  );
  const tallies = work.doi
    ? parseSciteTallies(await getJson(`https://api.scite.ai/tallies/${encodeURIComponent(work.doi)}`))
    : null;
  return { ...work, tallies };
}
