// Small pure formatters for the watch detail view. Kept out of the React components so they can be
// unit-tested with plain `npx tsx` (apps/web has no component test runner). Everything here is
// deterministic given its inputs — `relativeTime` takes `nowMs` explicitly rather than reading the
// clock, so the page passes Date.now() at the call site and tests pin a fixed "now".

/** A short, human "last checked …" label from an ISO timestamp, relative to `nowMs`.
 *  Returns null for a missing/unparseable timestamp so the caller simply renders nothing.
 *  A future timestamp (clock skew) collapses to "just now" — never a negative "in -3h". */
export function relativeTime(fromIso: string | null | undefined, nowMs: number): string | null {
  if (!fromIso) return null;
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return null;
  const diffMs = nowMs - then;
  if (diffMs < 60_000) return "just now"; // also covers small negative skew
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/** The in-app link that pre-fills the Ask composer with a watch's topic so the user can read the
 *  evidence that exists right now (it does NOT auto-submit — the Ask page only fills the box).
 *  Returns null for an empty topic so the caller hides the link entirely. */
export function askHrefForWatch(query: string | null | undefined): string | null {
  const q = (query ?? "").trim();
  if (!q) return null;
  return `/app/ask?q=${encodeURIComponent(q)}`;
}
