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
 * The channel name the page uses to tell the panel how tall it is.
 *
 * 🔴 A MESSAGE, BECAUSE THE FRAME IS OPAQUE AND THAT IS THE POINT. The panel cannot read
 * `contentDocument.scrollHeight` across an opaque origin (it throws a SecurityError, verified on
 * production 2026-09-04), and giving the frame `allow-same-origin` to make that reading possible
 * would hand the page this app's storage and cookies. So the page reports its own height and the
 * panel believes it, which costs nothing: the number only ever sizes a box.
 */
export const HEIGHT_MESSAGE = "nemesis:page-height";

/**
 * The reporter, injected at the end of every page.
 *
 * 🔴 IT MUST NOT NEED THE NETWORK OR THE PARENT'S ORIGIN. `postMessage` is not a fetch, so
 * `default-src 'none'` does not touch it, and `"*"` as the target is correct here rather than lax:
 * the frame does not know its parent's origin and the payload is one integer.
 *
 * 🔴 A ResizeObserver, NOT A ONE-SHOT ON LOAD. A page that expands a section on a click is
 * exactly the kind of page worth asking for, and a height measured once would leave the rest of it
 * clipped the moment it grew.
 */
const REPORTER =
  "<script>(function(){var last=0;function tell(){var h=Math.max(document.body?document.body.scrollHeight:0," +
  "document.documentElement?document.documentElement.scrollHeight:0);if(h&&Math.abs(h-last)>2){last=h;" +
  `parent.postMessage({channel:"${HEIGHT_MESSAGE}",height:h},"*");}}` +
  "if(document.readyState!=='loading')tell();document.addEventListener('DOMContentLoaded',tell);" +
  "window.addEventListener('load',tell);setTimeout(tell,300);" +
  "try{new ResizeObserver(tell).observe(document.documentElement);}catch(e){}" +
  "})();<\/script>";

/** The height a page reported, or null when the message was not one of ours. PURE. */
export function pageHeightFrom(data: unknown): number | null {
  if (data === null || typeof data !== "object") return null;
  const message = data as { channel?: unknown; height?: unknown };
  if (message.channel !== HEIGHT_MESSAGE) return null;
  const height = message.height;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  // 🔴 CLAMPED. The number comes from inside the frame, which is the one place in this app
  // whose content nobody vouches for; an absurd value would make a panel megapixels tall.
  return Math.min(Math.max(Math.round(height), 120), 20000);
}

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
  const withPolicy = head
    ? `${source.slice(0, head.index + head[0].length)}${META}${source.slice(head.index + head[0].length)}`
    : `${META}${source}`;
  // 🔴 THE REPORTER GOES LAST, so it measures a page the browser has finished parsing rather
  // than one still arriving.
  return `${withPolicy}${REPORTER}`;
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
