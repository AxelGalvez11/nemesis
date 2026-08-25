// Domain + favicon helpers for the source chips: inline citation pills, the thinking preview's
// searched-domain chips, and the Sources button's stacked favicons.

/**
 * 🔴🔴🔴 OUR OWN ORIGIN, NOT GOOGLE'S. This was
 * `https://www.google.com/s2/favicons?domain=<host>&sz=<n>` — the same service ChatGPT uses
 * (measured 2026-08-24). An `<img>` at another origin carries the learner's IP and, in the query
 * string, the name of a site they are reading. One request per chip, from their machine, on every
 * web-search turn. For a study tool that is a list of what someone is researching — a diagnosis, a
 * legal problem, an immigration process — handed to a third party as a side effect of drawing a
 * 20px circle.
 *
 * It was harmless only because the one component calling it was never mounted. Drawing chips on
 * the real thinking preview is exactly what turns it live, which is why it changes in the same
 * commit rather than after.
 *
 * See app/api/favicon/route.ts for what happens on the other side, including the drawn globe that
 * stands in when a site has no icon.
 */
export function faviconUrl(domain: string): string {
  return `/api/favicon?domain=${encodeURIComponent(domain)}`;
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// Leading host labels that identify a mirror/language rather than the source itself, so a pill
// reads "Wikipedia" instead of "En".
const GENERIC_HOST_LABELS = new Set(["www", "en", "m", "amp", "mobile"]);

/**
 * Short display name for a bare HOSTNAME: fifa.com -> "Fifa", en.wikipedia.org -> "Wikipedia",
 * pubmed.ncbi.nlm.nih.gov -> "Pubmed".
 *
 * 🔴 ONE NAMING RULE, BECAUSE TWO SURFACES SHOW THE SAME SOURCE AT ONCE. The searched-domain
 * chips are handed bare hostnames and the source cards are handed URLs; if each spelled a host
 * its own way, one search would read as "Pubmed" in the cards and "pubmed.ncbi.nlm.nih.gov" in
 * the chips a few pixels above them, and a reader would have to work out they were the same
 * place. So the rule lives here and `sourceLabel` is the URL-shaped door onto it.
 */
export function domainLabel(host: string | null | undefined): string | null {
  if (!host) return null;
  const name = host.split(".").filter((part) => !GENERIC_HOST_LABELS.has(part))[0];
  if (!name) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The same name, from a URL. Null when the URL has no usable host. */
export function sourceLabel(url: string | null | undefined): string | null {
  return domainLabel(hostnameOf(url));
}

// 🔴🔴🔴 `SEARCH_DOMAINS` WAS HERE AND IS DELETED, NOT REPLACED. It was a hardcoded list —
// pubmed, clinicaltrials.gov, fda.gov, medlineplus.gov — described as "the engine's fixed search
// surface, shown as chips while a search is still running". `RunThinking` drew it whenever the
// real list was empty:
//
//     const chips = domains?.length ? domains : SEARCH_DOMAINS;
//
// Two separate wrongs, either one fatal:
//
//   1. IT IS A LIE WITH A LOGO ON IT. Those chips claimed four sites had been consulted when
//      nothing had been searched. `thinking-phases.ts`'s standing rule is that a caption must name
//      a step GENUINELY RUNNING; a favicon is the same claim in a smaller space, and a fabricated
//      one is harder to catch because a picture of a real site reads as evidence.
//   2. IT IS THE DEAD PHARMA IDENTITY. CLAUDE.md's standing rule (owner 2026-07-27) is that
//      Nemesis is field-agnostic and no feature may be scoped to one discipline. A law student
//      would have been told Nemesis checked the FDA.
//
// There is no "default" list to fall back to, because the honest answer to "which sites did we
// search" before searching any is NONE — and no chips is exactly how that is drawn.

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
