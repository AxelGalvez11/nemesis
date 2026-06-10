// Safe external-link guard. React escapes text but does NOT block dangerous URL schemes in an href —
// a `javascript:` or `data:` URL clicked from a citation would execute in our origin with the user's
// session. Citation URLs come from live sources (PubMed/openFDA/…) and LLM-synthesized report payloads,
// so they are semi-trusted: only http(s) is allowed through; anything else returns null (render as text).

export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const scheme = new URL(url).protocol;
    return scheme === "https:" || scheme === "http:" ? url : null;
  } catch {
    return null; // not a parseable absolute URL
  }
}
