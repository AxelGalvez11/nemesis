// PMID/DOI identity helpers for source enrichment. PubMed-family citations carry their
// PMID in the url; label/trial sources have no PMID and are simply not enrichable (the
// trust badges are literature signals — an FDA label has no citation tallies).

const PMID_RES = [
  /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i,
  /europepmc\.org\/(?:article|abstract)\/MED\/(\d+)/i,
];

export function pmidFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const re of PMID_RES) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

const DOI_RE = /10\.\d{4,9}\/[^\s"'<>]+/;

export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(DOI_RE);
  return m ? m[0].replace(/[.,;)\]]+$/, "").toLowerCase() : null;
}

/** Cache/lookup key for a citation: pmid:<n> when the url carries a PMID, else null. */
export function enrichmentKeyFor(c: { url?: string | null }): string | null {
  const pmid = pmidFromUrl(c.url);
  return pmid ? `pmid:${pmid}` : null;
}
