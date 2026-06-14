/**
 * Europe PMC provider. Broader than PubMed E-utilities: open-access FULL-TEXT articles +
 * preprints across MED/PMC/PPR. REST API, no auth.
 *
 * API: https://www.ebi.ac.uk/europepmc/webservices/rest/search (resultType=core gives abstracts).
 * License: we restrict the query to OPEN_ACCESS:Y, but the OA set MIXES CC variants (CC0, CC BY,
 * CC BY-SA, and the restricted CC BY-NC / CC BY-ND). We read each article's own license string and
 * map it precisely — unknown/missing licenses default to the restricted bucket (cc_by_nc) so the
 * save-back gate (assertCommercialFriendly) blocks ingest of anything we can't verify as permissive.
 * Restricted articles still surface as live candidates (we may cite them) but are never stored.
 * Mapped to provider "pubmed_oa" with provider_id = PMID so it DEDUPES against the PubMed provider.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";
import type { CoreSourceLicense } from "../license.ts";

const SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

/**
 * Map a Europe PMC license string (e.g. "cc by", "cc by-nc", "cc0") to our license enum.
 * Order matters: test the most-restrictive substrings first ("nc"/"nd" before plain "by").
 * Unknown or missing → cc_by_nc (restricted) so the commercial gate blocks storage of unverified text.
 */
function mapEpmcLicense(raw: string | undefined): CoreSourceLicense {
  const l = (raw ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  if (!l) return "cc_by_nc";
  if (l.includes("cc0") || l === "cc-0") return "cc0";
  if (l.includes("nc")) return "cc_by_nc"; // CC BY-NC / NC-SA / NC-ND — non-commercial
  if (l.includes("nd")) return "cc_by_nd"; // CC BY-ND — no derivatives (our chunk+embed is one)
  if (l.includes("sa")) return "cc_by_sa";
  if (l.includes("by")) return "cc_by";
  return "cc_by_nc"; // unrecognized → restricted by default
}

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
  journalInfo?: { journal?: { title?: string; issn?: string; essn?: string } };
  pubYear?: string;
  license?: string; // Europe PMC's own license tag for the article (core resultType)
  authorList?: { author?: Array<{ lastName?: string; initials?: string }> };
  pubTypeList?: { pubType?: string[] };
}

export async function fetchEuropePmc(opts: EuropePmcFetchOpts): Promise<NormalizedSource[]> {
  const retmax = Math.min(opts.retmax ?? 10, 25);
  const params = new URLSearchParams({
    // Parenthesize the caller's term so an OR inside it can't bind looser than the OA filter
    // (e.g. `a OR b AND OPEN_ACCESS:Y` would otherwise match non-OA `a`).
    query: `(${opts.query}) AND OPEN_ACCESS:Y`,
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
      license: mapEpmcLicense(r.license),
      content_text,
      content_hash: await sha256Hex(content_text),
      metadata: {
        source: "europepmc",
        pmid: r.pmid,
        pmcid: r.pmcid,
        year: r.pubYear,
        journal: r.journalInfo?.journal?.title,
        issn: [r.journalInfo?.journal?.issn, r.journalInfo?.journal?.essn].filter((s): s is string => Boolean(s)),
        authors: (r.authorList?.author ?? [])
          .map((au) => [au.lastName, au.initials].filter(Boolean).join(" "))
          .filter(Boolean),
        publication_types: r.pubTypeList?.pubType ?? [],
      },
    });
  }
  return out;
}
