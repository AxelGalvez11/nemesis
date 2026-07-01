// Domain + favicon helpers for the ChatGPT-style source chips: inline citation pills, the thinking
// trail's "searched domains" chips, and the Sources button's stacked favicons. Favicons come from
// Google's public s2 service (plain <img>, no key, no CORS needs); a broken icon just renders empty.

const FAVICON_BASE = "https://www.google.com/s2/favicons";

export function faviconUrl(domain: string, size = 32): string {
  return `${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// The engine's fixed search surface, shown as chips while a search is still running (the real
// per-answer domains replace these once citations arrive).
export const SEARCH_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "clinicaltrials.gov",
  "fda.gov",
  "medlineplus.gov",
];

// Unique source hostnames across citation lists, in first-seen order (cited before reviewed when
// called as citationDomains(citations, reviewed)).
export function citationDomains(...lists: Array<ReadonlyArray<{ url?: string | null }> | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const c of list ?? []) {
      const host = hostnameOf(c.url);
      if (host && !seen.has(host)) {
        seen.add(host);
        out.push(host);
      }
    }
  }
  return out;
}
