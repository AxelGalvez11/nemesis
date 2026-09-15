// Turns the two marker families a canvas reply's prose can carry — `[s1:e1]` (an attached
// document's excerpt) and `[1]` (a live web result) — into the same pill-link markdown the web
// app's `AssistantMarkdown` produces, so `MessageBody` can draw them as small chips instead of
// leaving the raw marker on screen.
//
// 🔴 A WRAPPER, NOT A REIMPLEMENTATION. Every transform below is the web's own pure function
// (`apps/web/lib/workspace/chat-citations.ts`, `apps/web/lib/favicon.ts`), re-exported unmodified
// through `learn/web.ts`. Rewriting a regex here would be a second copy of the rule the moment
// either side changed — see `learn/web.ts`'s own header for why only pure modules cross, and why
// this codebase treats "resolves identically on both apps" as the whole point.
//
// 🔴 THE WEB RUNS BOTH PASSES UNCONDITIONALLY, INSIDE `AssistantMarkdown` ITSELF (`chat-markdown.tsx`,
// "ALWAYS, NOT GATED" for the file pass; the web pass is gated only on `namedCitations`, which the
// canvas always sets). On the phone the same guarantee lives at exactly one call site —
// `CanvasTurn.tsx` calls this before handing text to `MessageBody`. A future screen that renders a
// canvas reply through `MessageBody` directly (skipping `CanvasTurn`) will show raw markers unless
// it also calls this first.
//
// 🔴 THE WEB PASS RUNS FIRST, THE FILE PASS SECOND — the same order `chat-markdown.tsx` runs them
// in. Harmless either way (the two marker patterns are disjoint: `[1]` is bare digits, `[s1:e1]`
// needs the `sN:eN` shape — `chat-citations.test.ts` asserts that in both directions), kept in step
// only so a future reader meets them in the order the model learned them.
//
// PURE. No React, no I/O.

import {
  citationsToMarkdown,
  fileRefsToMarkdown,
  groupCitationRuns,
  groupFileRuns,
  hostnameOf,
  sourceLabel,
  type CanvasSource,
  type FileCitation,
  type ThreadSource,
} from "../learn/web.ts";

/** `#nemesis-file=sN[.extra]` — a resolved DOCUMENT citation, produced only by `fileRefsToMarkdown`/
 *  `groupFileRuns` below. */
export const FILE_PILL_PREFIX = "#nemesis-file=";
/** `#nemesis-cite=n[.extra]` — a resolved WEB-RESULT citation, produced only by
 *  `citationsToMarkdown`/`groupCitationRuns` below. The web's own scheme, unchanged. */
export const WEB_PILL_PREFIX = "#nemesis-cite=";

/**
 * `reply`, with every resolvable citation marker turned into a pill link and every marker that
 * cannot be resolved deleted outright — never printed raw.
 *
 * - `[1]`..`[N]` (a web result the model was shown, 1-indexed) resolves POSITIONALLY against
 *   `webSources` — index `n-1`, exactly as `chat-markdown.tsx`'s `citeIndex` does. `webSources`
 *   must be the list in the numbering the model actually saw; `turn.sources` (`ThreadSource[]`) is
 *   what the web's own `CanvasThreadTurnView` passes for this once a turn is filed into the thread,
 *   so that is what this reads too — see that component's own note that a document belongs to the
 *   CANVAS while a web result belongs to the TURN. A marker past the end of the list is dropped.
 * - `[sN:eM]` (an attached document's excerpt) resolves against `sources` — `canvas.sources`, the
 *   canvas's whole shelf, not the turn's own attachments — exactly as `groundedReplyMarkdown`
 *   already did before this file also learned `[n]`.
 */
export function groundedReplyMarkdown(
  reply: string,
  sources: readonly CanvasSource[],
  webSources: readonly ThreadSource[],
): string {
  const cited = groupCitationRuns(citationsToMarkdown(reply, webSources.length));
  const files: FileCitation[] = sources.map((source) => ({ id: source.id, title: source.title }));
  return groupFileRuns(fileRefsToMarkdown(cited, files));
}

/**
 * The favicon for a web citation's host, fetched through NEMESIS rather than Google directly.
 *
 * 🔴🔴 THE SAME PROXY THE WEB ITSELF USES, NOT `https://www.google.com/s2/favicons`. Pointing an
 * `<Image>` straight at Google would tell it, on every citation chip, which page a learner had
 * just read — `apps/web/app/api/favicon/route.ts` exists at length to stop exactly that for the
 * browser, and a phone client calling Google directly would reopen the identical leak on a second
 * device. `APP_API_BASE` is duplicated from `api/chat.ts` rather than imported: that file pulls in
 * Expo/Supabase modules Deno cannot load, and this one stays pure specifically so it can be tested
 * without them.
 *
 * Null when `url` has no usable host — the caller falls back to a plain label with no image.
 */
const APP_API_BASE = "https://app.enternemesis.com";
export function webCitationFaviconUrl(url: string): string | null {
  const host = hostnameOf(url);
  return host ? `${APP_API_BASE}/api/favicon?domain=${encodeURIComponent(host)}` : null;
}

/** The chip's own text: a page's site name ("Wikipedia"), falling back to its bare host, falling
 *  back to null when the URL is unusable — the same fallback order `chat-markdown.tsx` renders. */
export function webCitationLabel(url: string): string | null {
  return sourceLabel(url) ?? hostnameOf(url);
}
