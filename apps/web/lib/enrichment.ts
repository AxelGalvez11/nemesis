"use client";
// Fetches trust enrichment (retraction / scite tallies / snapshot / cited-by) for the
// PubMed-family sources in an answer. One batched call per unique PMID set; module-level
// cache so panel re-renders and repeat questions don't refetch. Best-effort: errors → {}.
import { useEffect, useState } from "react";
import type { Citation } from "@pharmabro/shared";
import { pmidFromUrl } from "@pharmabro/shared";
import { supabase } from "@/lib/supabase";

export interface StudySnapshot { population: string | null; sample_size: number | null; duration: string | null; design: string | null }
export interface SourceEnrichment {
  doi: string | null; retracted: boolean; cited_by: number | null;
  tallies: { supporting: number; contrasting: number; mentioning: number } | null;
  snapshot: StudySnapshot | null;
}

const memo = new Map<string, SourceEnrichment>();

async function fetchBatch(pmids: string[]): Promise<Record<string, SourceEnrichment>> {
  const missing = pmids.filter((p) => !memo.has(`pmid:${p}`));
  if (missing.length) {
    try {
      const { data, error } = await supabase.functions.invoke("enrich-source", { body: { pmids: missing } });
      if (!error && data?.results) for (const [k, v] of Object.entries(data.results)) memo.set(k, v as SourceEnrichment);
    } catch { /* best-effort */ }
  }
  const out: Record<string, SourceEnrichment> = {};
  for (const p of pmids) { const hit = memo.get(`pmid:${p}`); if (hit) out[`pmid:${p}`] = hit; }
  return out;
}

export function useEnrichment(citations: Citation[]): Record<string, SourceEnrichment> {
  const [map, setMap] = useState<Record<string, SourceEnrichment>>({});
  const pmids = [...new Set(citations.map((c) => pmidFromUrl(c.url)).filter((p): p is string => !!p))];
  const sig = pmids.join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    void fetchBatch(sig.split(",")).then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, [sig]);
  return map;
}
