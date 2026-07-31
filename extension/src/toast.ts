// The small card that appears at the bottom right of a portal page while the
// extension reads it.
//
// WHY IT EXISTS. The extension's own popup closes the moment you click anywhere
// else, so pressing "Read this page" and then looking at the page meant staring
// at a portal with no idea whether anything had happened. On Blackboard Ultra,
// where the course cards can take half a minute to render, that silence is the
// whole experience.
//
// STYLE: quiet by default. One line of text, a thin spinner, no colour until
// there is something to say, no logo, no emoji. It should read like the page
// telling you something, not like an advert interrupting you.
//
// It lives in a SHADOW ROOT, which matters for two reasons: the portal's
// stylesheet cannot reach in and break it, and ours cannot leak out and break
// the portal. An extension that restyles a student's grade page is a bug
// report.

export type ToastTone = "working" | "done" | "empty" | "error";

const HOST_ID = "nemesis-scan-toast";

const CSS = `
:host { all: initial; }
.card {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 240px;
  max-width: 340px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  color: #14161a;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08);
  opacity: 0;
  transform: translateY(6px);
  transition: opacity .18s ease, transform .18s ease;
}
.card.in { opacity: 1; transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  .card {
    background: #1b1d21;
    color: #f2f4f7;
    border-color: rgba(255,255,255,0.10);
    box-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.45);
  }
}
.mark { flex: none; width: 16px; height: 16px; margin-top: 1px; }
/* A thin ring, not a bouncing dot. Restraint is the brand. */
.spinner {
  width: 14px; height: 14px; margin-top: 1px; flex: none;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  opacity: .45;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
.body { min-width: 0; flex: 1; }
.title { font-weight: 560; letter-spacing: -0.005em; }
.detail { margin-top: 2px; opacity: .62; font-size: 12px; }
.close {
  flex: none; margin: -4px -4px 0 0; padding: 4px;
  background: none; border: 0; cursor: pointer; color: inherit; opacity: .35;
  font: inherit; line-height: 1; border-radius: 6px;
}
.close:hover { opacity: .75; }
`;

interface Handle {
  root: ShadowRoot;
  card: HTMLDivElement;
  timer: number | null;
}

let handle: Handle | null = null;

function ensure(doc: Document): Handle {
  if (handle && doc.getElementById(HOST_ID)) return handle;
  const host = doc.createElement("div");
  host.id = HOST_ID;
  // The host itself must not participate in the page's layout at all.
  host.style.cssText = "all:initial;position:static;";
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = CSS;
  const card = doc.createElement("div");
  card.className = "card";
  card.setAttribute("role", "status");
  // Polite: a screen reader should hear this when it settles, not mid-sentence.
  card.setAttribute("aria-live", "polite");
  root.append(style, card);
  doc.body.append(host);
  handle = { card, root, timer: null };
  return handle;
}

/** A tick, drawn rather than imported, so the toast needs no assets. */
function tick(doc: Document): SVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "mark");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3.5 8.5l3 3 6-7");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

/**
 * Show or update the card. PURE-ish: only ever touches its own shadow root.
 *
 * `detail` is optional second-line context. `autoHideMs` of 0 keeps it up.
 */
export function showToast(
  doc: Document,
  tone: ToastTone,
  title: string,
  detail?: string,
  autoHideMs = 0,
): void {
  const { card } = ensure(doc);
  card.replaceChildren();

  if (tone === "working") card.append(Object.assign(doc.createElement("div"), { className: "spinner" }));
  else if (tone === "done") card.append(tick(doc));

  const body = doc.createElement("div");
  body.className = "body";
  const titleEl = doc.createElement("div");
  titleEl.className = "title";
  // textContent, never innerHTML — some of this text originates on a page we
  // do not control.
  titleEl.textContent = title;
  body.append(titleEl);
  if (detail) {
    const detailEl = doc.createElement("div");
    detailEl.className = "detail";
    detailEl.textContent = detail;
    body.append(detailEl);
  }
  card.append(body);

  const close = doc.createElement("button");
  close.className = "close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => hideToast(doc));
  card.append(close);

  requestAnimationFrame(() => card.classList.add("in"));

  if (handle?.timer) window.clearTimeout(handle.timer);
  if (handle && autoHideMs > 0) {
    handle.timer = window.setTimeout(() => hideToast(doc), autoHideMs);
  }
}

export function hideToast(doc: Document): void {
  const host = doc.getElementById(HOST_ID);
  if (!host) return;
  handle?.card.classList.remove("in");
  window.setTimeout(() => host.remove(), 200);
  handle = null;
}
