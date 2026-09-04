// A page Nemesis wrote, made safe to show.
//
// Owner, 2026-09-04: *"yes it should be able to display html"*. An HTML output is the one kind
// whose content is CODE rather than prose, so it is the one kind that needs a rule about what that
// code is allowed to do.
//
// 🔴🔴 TWO LOCKS, AND NEITHER IS A SANITISER. The house pattern for showing HTML is already
// established by the reader (`text-document-view.tsx`, for .html files a learner uploads): render
// it in an iframe rather than scrubbing tags, because a tag-scrubber is a blocklist and every
// blocklist is one bypass away from being wrong.
//
//   1. `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. The frame gets an opaque origin, so
//      the page cannot read this app's DOM, cookies, storage or session. Scripts DO run, which is
//      the whole point of asking for a page rather than a note: a timeline that expands, a diagram
//      that responds. The uploaded-file lane keeps the stricter `sandbox=""` because a stranger's
//      file has no reason to run anything.
//
//   2. A CONTENT SECURITY POLICY THAT BLOCKS THE NETWORK ENTIRELY. `default-src 'none'` means no
//      fetch, no XHR, no WebSocket, no remote image, no remote font, no remote script. This is the
//      lock that matters: a learner's own uploaded material can carry text that talks the model
//      into writing a page which phones home with what it was shown, and an opaque origin alone
//      would not stop that. With this, a page can compute and draw and animate, and it cannot
//      speak to anyone.
//
// 🔴 THE META TAG GOES FIRST OR IT DOES NOTHING. A CSP delivered in the document must appear
// before the content it governs; injected after a <script> the browser has already committed to,
// it is ignored. So it is placed immediately after <head> when there is one, and at the very top
// when there is not.

/**
 * What a Nemesis-made page is allowed to do.
 *
 * 🔴 `'unsafe-inline'` ON SCRIPT AND STYLE IS DELIBERATE AND IS NOT THE HOLE IT LOOKS LIKE. The
 * page IS inline script and inline style; there is no origin to serve a file from. What would make
 * this dangerous is a network to carry something out of, and `default-src 'none'` removes it.
 * `img-src data:` allows a drawing the page encodes itself. Nothing is fetched, ever.
 */
export const OUTPUT_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src data: blob:; " +
  "font-src data:; " +
  "form-action 'none'; " +
  "base-uri 'none'";

const META = `<meta http-equiv="Content-Security-Policy" content="${OUTPUT_CSP}">`;

/**
 * The page as it goes into the frame. PURE.
 *
 * 🔴 IT DOES NOT VALIDATE THE HTML, and must not start. A half-written page is the browser's
 * problem to render as best it can, exactly as it would be for a file on disk; refusing to show
 * one would turn every model slip into a blank panel with no way to see what went wrong.
 */
export function sandboxedPage(html: string): string {
  const source = html.trim();
  const head = /<head\b[^>]*>/i.exec(source);
  if (head) {
    const at = head.index + head[0].length;
    return `${source.slice(0, at)}${META}${source.slice(at)}`;
  }
  return `${META}${source}`;
}

/**
 * Whether what came back is plausibly a page rather than prose or a fenced block.
 *
 * 🔴 A MODEL THAT WRAPS ITS ANSWER IN ``` IS THE COMMON FAILURE, not a malformed tag. `stripFence`
 * handles that before this is asked.
 */
export function looksLikePage(html: string): boolean {
  return /<(?:!doctype html|html|body|div|section|main|table|h1|canvas|svg)\b/i.test(html);
}

/**
 * The page out of whatever wrapper the model put it in. PURE.
 *
 * 🔴 ONLY THE OUTERMOST FENCE, and only when the whole answer is one. A page can legitimately
 * contain ``` inside a <pre>, and a greedy strip would cut it in half.
 */
export function stripFence(text: string): string {
  const body = text.trim();
  const fenced = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```$/.exec(body);
  return (fenced?.[1] ?? body).trim();
}
