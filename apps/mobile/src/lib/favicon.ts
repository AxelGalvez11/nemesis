// Domain + favicon helpers for the ChatGPT-style source chips: the inline
// citation pills painted in an answer and the rows in the tap-to-open sheet.
// Ported from web's apps/web/lib/favicon.ts (this repo keeps per-app copies —
// mobile never imports across apps).
//
// One deliberate divergence from web: `hostnameOf` is a REGEX, not `new URL()`.
// Hermes/React Native have no reliable `URL` parser (SourcesSheet already hit
// this and hand-rolled the same regex), so a `new URL(u).hostname` would throw
// or return the wrong thing on a phone. The regex is also lookbehind-free, which
// Hermes requires.

const FAVICON_BASE = "https://www.google.com/s2/favicons";

/** Google's public s2 favicon service — no key, no CORS, and a broken/blocked
 *  icon just renders as empty space (never a broken-image glyph). We pass the
 *  FULL host including any subdomain so the service resolves the real site. */
export function faviconUrl(domain: string, size = 32): string {
  return `${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

// Scheme + optional userinfo, then capture the host up to the first `/ : ? #`.
// No lookbehind/lookahead (Hermes-safe). Returns the full host — subdomain and
// all — so faviconUrl resolves and sourceLabel's generic-part filter below can
// still strip "en"/"www" to reach the real name.
const HOST_RE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:?#]+)/i;

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = HOST_RE.exec(url);
  return match?.[1] ?? null;
}

// Leading host labels that identify a mirror/language rather than the source
// itself, so a pill reads "Wikipedia" instead of "En".
const GENERIC_HOST_LABELS = new Set(["www", "en", "m", "amp", "mobile"]);

/** Short display name for a source pill: fifa.com -> "Fifa",
 *  en.wikipedia.org -> "Wikipedia", pubmed.ncbi.nlm.nih.gov -> "Pubmed". Falls
 *  back to null when the URL has no usable host. */
export function sourceLabel(url: string | null | undefined): string | null {
  const host = hostnameOf(url);
  if (!host) return null;
  const name = host.split(".").filter((part) => !GENERIC_HOST_LABELS.has(part))[0];
  if (!name) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
