import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The artifact reader, held to numbers measured off the reference in the owner's own browser
// (2026-08-25, viewport 1470x779). Owner: *"One to one spacing, coloring, font, sizing exactly."*
//
// 🔴 EVERY NUMBER BELOW WAS READ WITH `getBoundingClientRect` AND `getComputedStyle`, not taken off
// a screenshot. That distinction is the whole reason this file can be strict: a screenshot at an
// unknown zoom is how a "one-to-one" match quietly becomes an approximation.

const code = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const PREVIEW = code("../../components/workspace/learn/output-preview.tsx");

test("🔴🔴 the docked panel is two thirds of the viewport, measured — not a fixed rem", () => {
  // 980 of 1470. The first version was 38rem (608px, a little over a third), which is a different
  // object: a document at that width wraps every line twice and reads as a sidebar rather than as
  // the thing you opened. A fixed width is also right at exactly one window size.
  assert.match(PREVIEW, /const DOCK_FRACTION = 2 \/ 3;/, "the dock width is no longer the measured fraction");
  assert.match(PREVIEW, /Math\.round\(window\.innerWidth \* DOCK_FRACTION\)/, "the width is not measured from the viewport");
  assert.match(PREVIEW, /window\.addEventListener\("resize", measure\)/, "the width does not follow a resize");
});

test("🔴 flush: no radius, no shadow, no inset, right edge on the viewport", () => {
  // The reference has none of those. A rounded card with a shadow reads as something laid ON the
  // page; this has to read as part of it.
  assert.match(PREVIEW, /fixed inset-y-0 right-0 z-50 flex flex-col/, "the panel is not flush to the edge");
  assert.ok(!/rounded-2xl/.test(PREVIEW), "the panel is a rounded card again");
  assert.ok(!/shadow-xl/.test(PREVIEW), "the panel floats above the page again");
  // 🔴 AND NO OUTSIDE-PRESS CATCHER. A panel owning two thirds of the window must not vanish
  // because somebody clicked the conversation beside it.
  assert.ok(!/onMouseDown=\{\(event\) =>/.test(PREVIEW), "an outside press can dismiss the docked panel again");
});

test("🔴 the header is the measured one: 36x36 buttons, 8px radius, 20px glyphs, 14px crumb", () => {
  // 🔴 EXPLICIT PIXELS. `html { font-size: 112.5% }` in this app, so `size-9 rounded-lg gap-2`
  // measured 40.5x40.5 at radius 13.5 on a 49.5 pitch — against 36x36 at 8 on 40. Measuring BOTH
  // sides is what caught it; each of those reads as correct in a screenshot.
  assert.match(PREVIEW, /button: "flex h-\[36px\] w-\[36px\]/, "the button is not 36x36");
  assert.match(PREVIEW, /rounded-\[8px\]/, "the button radius is not the measured 8px");
  assert.ok(!/size-9|rounded-lg/.test(PREVIEW), "a rem utility is back — it lands 1.125x too big here");
  assert.match(PREVIEW, /icon: "20px"/, "the header glyph is not 20px");
  assert.match(PREVIEW, /header: "flex items-center gap-\[4px\] px-\[12px\] py-\[5\.5px\]"/, "the header band is not the measured 47px on a 40px pitch");
  assert.match(PREVIEW, /leading-\[20px\] text-\(--ui-text-primary\)/, "the filename is not 14px on a 20px line");
});

test("🔴🔴 close is on the RIGHT when docked and on the LEFT when full, as the reference has it", () => {
  // Measured: x=193 beside the breadcrumb in the Library reader, far right in the conversation
  // panel. The control nearest the content is the one that dismisses it.
  assert.match(PREVIEW, /\{full && \(\s*<button aria-label="Close"/, "full screen does not put the close on the left");
  assert.match(PREVIEW, /\{!full && \(\s*<button aria-label="Close"/, "the docked panel does not put the close on the right");
  // And the three controls the reference carries, in its order — measured left to right at
  // x=1342, 1382, 1422, a 40px pitch.
  //
  // 🔴 THE RIGHT-HAND GROUP ONLY. My first version searched the whole header, where the full-screen
  // branch's close sits BEFORE the download in source order, so the check failed on correct markup.
  // The order that matters is the one inside the group that is actually right-aligned.
  const group = PREVIEW.slice(PREVIEW.indexOf("min-w-0 flex-1"), PREVIEW.indexOf("min-h-0 flex-1 overflow-auto"));
  const order = ["Download", "Full screen", "Close"].map((label) => group.indexOf(label));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!)), "the header controls are not Download, Full screen, Close");
});

test("🔴 the two surfaces differ by where they are opened from", () => {
  // In a conversation the reader docks so the thread stays on screen to check the artifact
  // against; on the Library page there is no thread, so it takes the whole surface.
  assert.match(PREVIEW, /initialMode\?: "docked" \| "full"/, "the reader has one shape for both surfaces");
  const library = code("../../components/workspace/library/library-outputs.tsx");
  assert.match(library, /initialMode="full"/, "the Library opens a docked panel with nothing beside it");
});

test("🔴🔴 an artifact opens itself, and flashcards go full screen instead of into the reader", () => {
  // The owner's own condition for this being done: *"user can click in the Canvas to create a
  // PowerPoint or any artifact, and it should open a sidebar for it inside the Canvas. Except for
  // flashcards… full screen just like an Anki with an x on it."*
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /openedArtifactId\.current = made\.id/, "a finished artifact does not open itself");
  assert.match(canvas, /made\.kind === "flashcards" && made\.deckId\) setReviewingDeck/, "a deck is squeezed into the reader");
  assert.match(canvas, /<DeckReview deckId=\{reviewingDeck\}/, "the full-screen review is never mounted");
  // 🔴 LATCHED ON THE ID. Without it, closing the reader on an artifact still held in state
  // re-opens it on the next render — a panel that cannot be dismissed.
  assert.match(canvas, /openedArtifactId\.current === made\.id\) return;/, "the reader re-opens itself after being closed");

  // And the deck really is a full-screen surface with a close, rather than something told to be.
  const review = code("../../components/workspace/study/review-session.tsx");
  assert.match(review, /h-\[100dvh\] max-h-none w-screen/, "the review is no longer full screen");
  assert.match(review, /showCloseButton/, "the review has no way out");
});

test("🔴🔴 the portal carries `data-workspace`, or every control in it goes acid green", () => {
  // `globals.css`: `button:where(:not([data-workspace] *)) { background: var(--acid) }`. The reader
  // is portalled to `document.body` so `position: fixed` resolves against the VIEWPORT rather than
  // against the canvas's transformed ancestor — and leaving the workspace scope handed the global
  // rule every header button. Measured `rgb(64,64,64)` filled pills against the reference's
  // transparent squares.
  assert.match(PREVIEW, /createPortal\(/, "the reader is not portalled — `fixed` will resolve against the canvas");
  assert.match(PREVIEW, /data-workspace/, "the portal left the workspace scope and the global button rule owns it");
});
