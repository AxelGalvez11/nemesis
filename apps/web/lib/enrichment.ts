"use client";
// Fetches trust enrichment (retraction / scite tallies / snapshot / cited-by) for the
// PubMed-family sources in an answer. One batched call per unique PMID set; module-level
// cache so panel re-renders and repeat questions don't refetch. Best-effort: errors → {}.
import { useEffect, useState } from "react";
import type { Citation } from "@nemesis/shared";
import { pmidFromUrl } from "@nemesis/shared";
import { supabase } from "@/lib/supabase";

export interface StudySnapshot { population: string | null; sample_size: number | null; duration: string | null; design: string | null }
export interface SourceEnrichment {
  doi: string | null; retracted: boolean; cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

const memo = new Map<string, SourceEnrichment>();
// In-flight de-dup: a key already being fetched is awaited, not re-requested,
// so two concurrent callers sharing a PMID don't fire duplicate network calls.
const pending = new Map<string, Promise<void>>();

async function fetchBatch(pmids: string[]): Promise<Record<string, SourceEnrichment>> {
  const missing = pmids.filter((p) => !memo.has(`pmid:${p}`) && !pending.has(`pmid:${p}`));
  if (missing.length) {
    const request = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("enrich-source", { body: { pmids: missing } });
        if (!error && data?.results) for (const [k, v] of Object.entries(data.results)) memo.set(k, v as SourceEnrichment);
      } catch { /* best-effort */ }
    })();
    for (const p of missing) pending.set(`pmid:${p}`, request);
    request.finally(() => { for (const p of missing) pending.delete(`pmid:${p}`); });
  }
  const awaiting = pmids.map((p) => pending.get(`pmid:${p}`)).filter((p): p is Promise<void> => !!p);
  if (awaiting.length) await Promise.all(awaiting);
  const out: Record<string, SourceEnrichment> = {};
  for (const p of pmids) { const hit = memo.get(`pmid:${p}`); if (hit) out[`pmid:${p}`] = hit; }
  return out;
}

/** Trust enrichment for an explicit set of `pmid:N`-derived PMIDs. The single fetch path is shared
 *  with useEnrichment (same module-level memo + in-flight de-dup). Returned keys are `pmid:N`. */
export function useEnrichmentByPmids(pmids: string[]): Record<string, SourceEnrichment> {
  const [map, setMap] = useState<Record<string, SourceEnrichment>>({});
  const unique = [...new Set(pmids)];
  const sig = unique.join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    void fetchBatch(sig.split(",")).then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, [sig]);
  return map;
}

export function useEnrichment(citations: Citation[]): Record<string, SourceEnrichment> {
  const pmids = citations.map((c) => pmidFromUrl(c.url)).filter((p): p is string => !!p);
  return useEnrichmentByPmids(pmids);
}
