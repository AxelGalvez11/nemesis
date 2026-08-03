// The card at the bottom right of a portal page. It is the WHOLE interface.
//
// WHY IT IS THE WHOLE INTERFACE (owner 2026-07-31, pointing at UpAhead). There
// used to be two surfaces saying different things at once: Chrome's toolbar
// popup listed the courses, and a small card down here said a number. The
// popup is the wrong place for any of it — it closes the moment the student
// clicks the page, and on a slow portal they will, because reading takes the
// better part of a minute. So everything a student needs to see lives here,
// on the page, where it survives: what was found, how many, and the way back
// into Nemesis. The toolbar popup is now only the button that starts it.
//
// WHAT IT SHOWS WHILE IT WORKS. A portal that takes thirty seconds to render
// looks broken if the card just sits there. So the counts tick up as they are
// found, a row gets a tick the moment it has anything in it, and a thin
// indeterminate bar runs under the header. The animation is not decoration —
// it is the difference between "this is working" and "this is stuck".
//
// HONEST ROWS. The rows are not fake sequential stages. Courses, coursework
// and syllabus files all come out of the same read, so each row simply shows
// what that read has found so far: a hollow circle at zero, a tick once there
// is something. Nothing is ever shown as finished before it is.
//
// STYLE: black and white, thin borders, no logo, no emoji, no colour. It
// should read like the page telling you something, not like an advert.
//
// It lives in a CLOSED SHADOW ROOT: the portal's stylesheet cannot reach in
// and break it, and ours cannot leak out and restyle a student's grade page.

export type ToastTone = "working" | "done" | "empty" | "error";

const HOST_ID = "nemesis-scan-toast";

// Owner 2026-08-01: "I need it to have a scrollability to see more courses."
// There WAS a cap here (8, then "and N more"), which is why a student with a
// full timetable could not see their own courses listed. The card always had
// an overflow-y scroll; the names simply never reached it. Every course is
// listed now and the LIST scrolls inside the card, so the counts above it and
// the button below it both stay put while you look through them.

const CSS = `
:host { all: initial; }
.card {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  box-sizing: border-box;
  width: 330px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  color: #14161a;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.10);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity .18s ease, transform .18s ease;
}
.card.in { opacity: 1; transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  .card {
    background: #17191d;
    color: #f2f4f7;
    border-color: rgba(255,255,255,0.10);
    box-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.5);
  }
}

.head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px; }
.name { font-weight: 600; letter-spacing: -0.01em; font-size: 13px; }
.status {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; opacity: .55;
}
.close {
  flex: none; margin: -6px -6px 0 2px; padding: 5px;
  background: none; border: 0; cursor: pointer; color: inherit; opacity: .3;
  font: inherit; font-size: 14px; line-height: 1; border-radius: 6px;
}
.close:hover { opacity: .8; }

/* The processing animation: a thin bar that sweeps while the page is being
   read. Present only while working, so its absence means finished. */
.bar { height: 1.5px; background: currentColor; opacity: .10; overflow: hidden; }
.bar i {
  display: block; height: 100%; width: 38%;
  background: currentColor; opacity: 1;
  animation: sweep 1.15s ease-in-out infinite;
}
@keyframes sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(363%); }
}

.spinner {
  width: 11px; height: 11px; flex: none;
  border: 1.4px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2.4s; }
  .bar i { animation-duration: 3s; }
}

.scroll { overflow-y: auto; padding: 0 14px; }
.body { padding: 2px 0 0; }
.title { font-weight: 560; letter-spacing: -0.005em; }
.detail { margin-top: 2px; opacity: .6; font-size: 12px; }

.rows {
  margin-top: 10px;
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 10px;
  padding: 3px 0;
}
@media (prefers-color-scheme: dark) { .rows { border-color: rgba(255,255,255,0.09); } }
.row { display: flex; align-items: center; gap: 8px; padding: 5px 10px; }
.row .label { min-width: 0; flex: 1; font-size: 12.5px; }
.row .count {
  font-variant-numeric: tabular-nums; font-size: 12.5px; font-weight: 560;
}
.row.pending .label, .row.pending .count { opacity: .4; }
.dot {
  width: 11px; height: 11px; flex: none; border-radius: 50%;
  border: 1.4px solid currentColor; opacity: .28;
}
.mark { width: 12px; height: 12px; flex: none; }
.note { padding: 4px 10px 6px; font-size: 11.5px; opacity: .5; }

.courses {
  margin-top: 10px; display: flex; flex-direction: column; gap: 1px;
  /* Scrolls on its own so a long timetable never pushes the counts out of
     the card. ~9 rows tall, then it scrolls. */
  max-height: 180px; overflow-y: auto; overscroll-behavior: contain;
}
.course {
  font-size: 12.5px; padding: 3px 0;
  display: flex; align-items: baseline; gap: 8px;
}
.course-name { min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.course-count { font-variant-numeric: tabular-nums; font-size: 11.5px; opacity: .55; }
.course-count.none { opacity: .3; }
.more { font-size: 11.5px; opacity: .5; padding-top: 3px; }

.foot { padding: 12px 14px 14px; }
.action {
  display: block; width: 100%;
  padding: 8px 12px;
  border: 0; border-radius: 9px;
  background: #17191d; color: #fff;
  font: inherit; font-size: 12.5px; font-weight: 560;
  cursor: pointer;
}
.action:hover { opacity: .88; }
@media (prefers-color-scheme: dark) {
  .action { background: #f2f4f7; color: #14161a; }
}
`;

/** What the read has turned up so far. Counts only — the card never decides
 *  what any of it means. */
export interface ScanProgress {
  courses: number;
  items: number;
  syllabi: number;
  /**
   * Slides, readings and pages found by walking INSIDE the courses.
   *
   * Optional on purpose, and the row is hidden when it is absent: the course
   * list is read before any course is opened, and a "Documents 0" sitting there
   * during that phase reads as "there are none" rather than "not looked yet".
   */
  documents?: number;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface CardState {
  tone: ToastTone;
  title: string;
  detail?: string;
  /** Omitted for plain messages (a page that is not a portal, say). */
  progress?: ScanProgress;
  courseNames?: readonly string[];
  /**
   * How many documents came out of each course, keyed by course name.
   *
   * Owner 2026-08-01: "the lower right panel should show how many documents
   * picked up from each course." A single total cannot tell a student that
   * eight courses gave up their slides and the ninth gave up nothing — which
   * is exactly the case worth seeing, because that ninth one is the problem.
   *
   * A course missing from the map was never opened, and shows no number at
   * all rather than a nought. Same distinction the scan itself keeps.
   */
  documentsByCourse?: Readonly<Record<string, number>>;
  action?: ToastAction;
  /** 0 keeps the card up. */
  autoHideMs?: number;
}

interface Handle {
  root: ShadowRoot;
  card: HTMLDivElement;
  timer: number | null;
}

let handle: Handle | null = null;

function ensure(doc: Document): Handle {
  const existing = doc.getElementById(HOST_ID);
  if (handle && existing) return handle;

  // 🔴 A LEFTOVER HOST WITH NO HANDLE MEANS THIS SCRIPT WAS INJECTED AGAIN.
  // Each injection is a fresh module instance, so `handle` starts null while
  // the previous run's card is still sitting in the page — and without this,
  // pressing "Read this page" twice stacked two cards on top of each other.
  // Observed on a real portal.
  if (existing) existing.remove();

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

/** A tick, drawn rather than imported, so the card needs no assets. */
function tick(doc: Document): SVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "mark");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 8.5l3.5 3.5L13 4.5");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  // textContent, never innerHTML — much of this text originates on a page we
  // do not control.
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * One checklist row.
 *
 * A row is TICKED once it has found something and hollow while it has not.
 * It is never shown as finished on the strength of nothing, which is the whole
 * reason a progress display can be trusted.
 */
function progressRow(doc: Document, label: string, count: number): HTMLElement {
  const row = el(doc, "div", count > 0 ? "row" : "row pending");
  row.append(count > 0 ? tick(doc) : el(doc, "span", "dot"));
  row.append(el(doc, "span", "label", label));
  row.append(el(doc, "span", "count", count > 0 ? String(count) : "—"));
  return row;
}

/** Draw or redraw the card. Only ever touches its own shadow root. */
export function showCard(doc: Document, state: CardState): void {
  const { card } = ensure(doc);
  const working = state.tone === "working";
  card.replaceChildren();

  const head = el(doc, "div", "head");
  head.append(el(doc, "span", "name", "Nemesis"));
  const status = el(doc, "span", "status");
  if (working) status.append(el(doc, "span", "spinner"));
  status.append(el(doc, "span", "", working ? "Reading" : "Done"));
  head.append(status);
  const close = doc.createElement("button");
  close.className = "close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => hideCard(doc));
  head.append(close);
  card.append(head);

  // The sweeping bar exists ONLY while working, so no bar means finished.
  if (working) {
    const bar = el(doc, "div", "bar");
    bar.append(doc.createElement("i"));
    card.append(bar);
  }

  const scroll = el(doc, "div", "scroll");
  const body = el(doc, "div", "body");
  body.append(el(doc, "div", "title", state.title));
  if (state.detail) body.append(el(doc, "div", "detail", state.detail));

  if (state.progress) {
    const rows = el(doc, "div", "rows");
    rows.append(progressRow(doc, "Courses", state.progress.courses));
    rows.append(progressRow(doc, "Coursework and dates", state.progress.items));
    rows.append(progressRow(doc, "Syllabus files", state.progress.syllabi));
    if (state.progress.documents !== undefined) {
      rows.append(progressRow(doc, "Slides and readings", state.progress.documents));
    }
    // Says the quiet part out loud: clicking away does not cancel this.
    if (working) rows.append(el(doc, "div", "note", "Keep this tab open — this keeps going."));
    body.append(rows);
  }

  const names = state.courseNames ?? [];
  if (names.length > 0) {
    const list = el(doc, "div", "courses");
    for (const name of names) {
      const row = el(doc, "div", "course");
      row.append(el(doc, "span", "course-name", name));
      const found = state.documentsByCourse?.[name];
      // Absent means "not opened" and stays blank. 0 means "opened, empty" and
      // says so — the difference the student could not previously see.
      if (found !== undefined) {
        row.append(el(doc, "span", found > 0 ? "course-count" : "course-count none", String(found)));
      }
      list.append(row);
    }
    body.append(list);
  }

  scroll.append(body);
  card.append(scroll);

  if (state.action) {
    const foot = el(doc, "div", "foot");
    const button = doc.createElement("button");
    button.className = "action";
    button.type = "button";
    button.textContent = state.action.label;
    button.addEventListener("click", state.action.onClick);
    foot.append(button);
    card.append(foot);
  } else {
    // Keeps the bottom padding without an empty control.
    card.append(el(doc, "div", "foot"));
  }

  requestAnimationFrame(() => card.classList.add("in"));

  if (handle?.timer) window.clearTimeout(handle.timer);
  if (handle && state.autoHideMs && state.autoHideMs > 0) {
    handle.timer = window.setTimeout(() => hideCard(doc), state.autoHideMs);
  }
}

export function hideCard(doc: Document): void {
  const host = doc.getElementById(HOST_ID);
  if (!host) return;
  handle?.card.classList.remove("in");
  window.setTimeout(() => host.remove(), 200);
  handle = null;
}
