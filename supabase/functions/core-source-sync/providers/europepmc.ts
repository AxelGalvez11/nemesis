/**
 * Europe PMC provider. Broader than PubMed E-utilities: open-access FULL-TEXT articles +
 * preprints across MED/PMC/PPR. REST API, no auth.
 *
 * API: https://www.ebi.ac.uk/europepmc/webservices/rest/search (resultType=core gives abstracts).
 * License: we restrict the query to OPEN_ACCESS:Y and tag results cc_by — consistent with how
 * pubmed_oa is handled (mixed CC, default permissive); the save-back commercial gate still applies.
 * Mapped to provider "pubmed_oa" with provider_id = PMID so it DEDUPES against the PubMed provider.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

export interface EuropePmcFetchOpts {
  query: string;
  retmax?: number;
}

interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  title?: string;
  authorString?: string;
  abstractText?: string;
  journalInfo?: { journal?: { title?: string } };
  pubYear?: string;
}

export async function fetchEuropePmc(opts: EuropePmcFetchOpts): Promise<NormalizedSource[]> {
  const retmax = Math.min(opts.retmax ?? 10, 25);
  const params = new URLSearchParams({
    query: `${opts.query} AND OPEN_ACCESS:Y`,
    format: "json",
    pageSize: String(retmax),
    resultType: "core",
  });

  const res = await fetch(`${SEARCH}?${params.toString()}`, {
    headers: { "User-Agent": "PharmaOrbBot/1.0" },
  });
  if (!res.ok) return [];
  const body = await res.json();
  const results: EpmcResult[] = body?.resultList?.result ?? [];

  const out: NormalizedSource[] = [];
  for (const r of results) {
    if (!r.abstractText || !r.title) continue; // need content to rank + ground
    const provider_id = r.pmid ?? `epmc:${r.source ?? "MED"}:${r.id ?? ""}`;
    const content_text = `${r.title}\n\nABSTRACT\n\n${r.abstractText}`;
    out.push({
      provider: "pubmed_oa",
      provider_id,
      title: r.title,
      subtitle: r.journalInfo?.journal?.title,
      source_url: r.pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`
        : `https://europepmc.org/article/${r.source ?? "MED"}/${r.id ?? ""}`,
      license: "cc_by",
      content_text,
      content_hash: await sha256Hex(content_text),
      metadata: { source: "europepmc", pmid: r.pmid, pmcid: r.pmcid, year: r.pubYear },
    });
  }
  return out;
}
