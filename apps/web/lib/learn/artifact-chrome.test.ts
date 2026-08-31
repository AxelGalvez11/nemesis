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
// 🔴 THE NUMBERS MOVED TO A SHARED MODULE ON 2026-08-27, when the source preview became a second
// docked reader (owner: *"file preview should open with sidebar not as popup"*). Two hand-written
// copies of a measured geometry drift the first time one is adjusted, so there is one set and both
// import it — which also means these guards now cover both readers instead of one.
const CHROME = code("../../components/workspace/learn/reader-chrome.ts");
const SOURCE = code("../../components/workspace/learn/source-preview.tsx");

test("🔴🔴 the docked panel is two thirds of the viewport, measured — not a fixed rem", () => {
  // 980 of 1470. The first version was 38rem (608px, a little over a third), which is a different
  // object: a document at that width wraps every line twice and reads as a sidebar rather than as
  // the thing you opened. A fixed width is also right at exactly one window size.
  assert.match(CHROME, /const DOCK_FRACTION = 2 \/ 3;/, "the dock width is no longer the measured fraction");
  // 🔴 BOTH READERS, because both dock. A panel that measured its own width would be the drift this
  // shared module exists to stop.
  // 🔴 REPOINTED 2026-08-27: the measurement moved into `use-dock-width.ts` when the panel became
  // DRAGGABLE (owner: *"allow user to slide the sidebar width like in chatgpt"*). Both readers take
  // the hook now, so a width dragged on either is the width both open at — two docked readers that
  // resized differently would be two objects.
  const DOCK = code("../../components/workspace/learn/use-dock-width.ts");
  assert.match(DOCK, /Math\.round\(viewport \* fraction\)/, "the width is not measured from the viewport");
  assert.match(DOCK, /window\.addEventListener\("resize", measure\)/, "the width does not follow a resize");
  // 🔴 THE FRACTION PERSISTS, NOT THE PIXELS. A panel dragged wide on a large monitor would
  // otherwise cover the whole canvas on a laptop; the proportion is what the learner chose.
  assert.match(DOCK, /String\(current\)/, "the dragged width is not remembered");
  assert.ok(!/setItem\([^)]*width/i.test(DOCK), "pixels are being stored instead of the fraction");
  for (const [name, source] of [["output-preview", PREVIEW], ["source-preview", SOURCE]] as const) {
    assert.match(source, /useDockWidth\(\)/, `${name}: the reader measures its own width instead of sharing the hook`);
    assert.match(source, /cursor-col-resize/, `${name}: the panel cannot be resized`);
    // 🔴 NOT PINNED TO THE ARGUMENT: the artifact reader passes 0 while full-screen, which is
    // correct — full screen covers everything and pushes nothing. What matters is that it declares.
    assert.match(source, /useDeclareSidePanel\(/, `${name}: the panel covers the canvas instead of pushing it`);
    // 🔴 AND THE OPENING SLIDE IS DROPPED WHILE DRAGGING, or the edge lags the pointer by the
    // animation's own duration and reads as the panel fighting you.
    assert.match(source, /!dragging && "reader-dock-in"/, `${name}: the slide runs during a resize`);
  }
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
  assert.ok(!/size-9|rounded-lg|gap-2\b|leading-5/.test(CHROME), "a rem utility is back in the shared chrome — every one lands 1.125x too big here");
  assert.match(CHROME, /button: "flex h-\[36px\] w-\[36px\]/, "the button is not 36x36");
  assert.match(CHROME, /rounded-\[8px\]/, "the button radius is not the measured 8px");
  assert.match(CHROME, /icon: "20px"/, "the header glyph is not 20px");
  assert.match(CHROME, /header: "flex items-center gap-\[4px\] px-\[12px\] py-\[5\.5px\]"/, "the header band is not the measured 47px on a 40px pitch");
  assert.match(CHROME, /leading-\[20px\] text-\(--ui-text-primary\)/, "the filename is not 14px on a 20px line");
  // 🔴 AND NEITHER READER MAY WRITE ITS OWN. A rem utility lands 1.125x too big here, and a second
  // hand-written copy of the header is how the two panels stop matching.
  for (const [name, source] of [["output-preview", PREVIEW], ["source-preview", SOURCE]] as const) {
    assert.match(source, /from "\.\/reader-chrome"/, `${name}: the reader stopped sharing the measured chrome`);
    // 🔴 NEITHER MAY DEFINE ITS OWN. This replaces a blanket ban on rem utilities across the whole
    // file, which was the wrong shape: it caught a `rounded-lg` on a preview IMAGE — decoration,
    // not a measured control — while a hand-written header constant would have slipped past it.
    assert.ok(!/^\s*button: "flex h-/m.test(source), `${name}: the reader writes its own header chrome again`);
    assert.ok(!/^\s*header: "flex items-center/m.test(source), `${name}: the reader writes its own header band again`);
  }
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

test("🔴🔴 an artifact opens itself, and a deck is opened by pressing its card", () => {
  // The owner's own condition for this being done: *"user can click in the Canvas to create a
  // PowerPoint or any artifact, and it should open a sidebar for it inside the Canvas."*
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /openedArtifactId\.current = made\.id/, "a finished artifact does not open itself");
  assert.match(canvas, /made\.kind === "flashcards" && made\.deckId\) setReviewingDeck/, "a deck is squeezed into the document reader");
  assert.match(canvas, /<DeckReview deckId=\{reviewingDeck\}/, "the review is never mounted");
  // 🔴 LATCHED ON THE ID. Without it, closing the reader on an artifact still held in state
  // re-opens it on the next render — a panel that cannot be dismissed.
  assert.match(canvas, /openedArtifactId\.current === made\.id\) return;/, "the reader re-opens itself after being closed");
});

test("🔴🔴 flashcards and the check open in the side panel, with full screen one button away", () => {
  // 🔴 THIS REVERSES AN EARLIER RULE, DELIBERATELY. Until 2026-08-30 this file pinned the opposite,
  // quoting the owner in August: *"Except for flashcards… full screen just like an Anki with an x
  // on it."* He changed it: *"the tests and the flashcards could appear in the sidebar… because
  // that way, users could ask questions as well, have the chat on the side, and they could also
  // full screen if they want."* Full screen did not go away; it stopped being the only way in.
  //
  // The argument that decided it: a check that owns the screen scrolls its own questions away the
  // moment the reply arrives, so the thing being discussed is the thing you can no longer see.
  const panel = code("../../components/workspace/learn/study-panel.tsx");
  const deck = code("../../components/workspace/study/deck-review.tsx");
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");

  // The same geometry as the document reader, from the same module — never a second set of numbers.
  assert.match(panel, /from "\.\/reader-chrome"/, "the study panel measures itself instead of importing CHROME");
  assert.match(panel, /useDockWidth/, "the study panel cannot be resized like the readers beside it");
  assert.match(panel, /fixed inset-y-0 right-0/, "the study panel is not docked to the right edge");
  assert.match(panel, /createPortal\(/, "the panel is not portalled — `fixed` will resolve against the canvas");
  assert.match(panel, /data-workspace/, "the portal left the workspace scope and the global button rule owns it");
  assert.match(panel, /full \? "left-0"/, "the panel has no full-screen geometry");
  assert.match(panel, /data-testid="study-panel-full"/, "there is no way to go full screen");

  // 🔴🔴 CLOSED HIDES, IT DOES NOT UNMOUNT. A learner four questions into a check who closes the
  // panel must find those four answers when they reopen it. This is the line that guarantees it.
  assert.match(panel, /display: open \? undefined : "none"/, "closing the panel now discards what is inside it");
  assert.match(canvas, /open=\{checkOpen\}/, "the check panel does not follow its own open flag");
  assert.doesNotMatch(canvas, /checkOpen && \(\s*<StudyPanel/, "the check is unmounted when the panel closes, losing the learner's answers");

  // A deck docks beside a conversation and takes the screen where there is no conversation.
  assert.match(deck, /<StudyPanel/, "a deck no longer opens beside the conversation");
  assert.match(deck, /surface="bare"/, "the docked deck mounts a dialog inside a panel");
  assert.match(deck, /surface === "full"/, "the Library lost its full-screen review");
  const library = code("../../components/workspace/library/library-outputs.tsx");
  assert.match(library, /<DeckReview[\s\S]{0,140}surface="full"/, "the Library docks a panel with nothing to dock beside");

  // 🔴 ONE REVIEW SCREEN, TWO SHELLS. `bare` may only drop the dialog; if it ever grows its own
  // card, counts or grade buttons there are two review screens to keep in step and they will drift.
  const review = code("../../components/workspace/study/review-session.tsx");
  assert.match(review, /h-\[100dvh\] max-h-none w-screen/, "the Study tab's review is no longer full screen");
  assert.match(review, /showCloseButton/, "the full-screen review has no way out");
  assert.equal((review.match(/GRADES\.map/g) ?? []).length, 1, "the grade buttons are drawn twice — two review screens now exist");
  assert.equal((review.match(/data-testid="review-counts"/g) ?? []).length, 1, "the Anki counts are drawn twice");

  // 🔴 AND THE HOTKEYS MUST NOT REACH OUT OF A NON-MODAL PANEL: docked beside a live canvas, Space
  // and 1-4 would otherwise grade a card while the learner is working next to it.
  assert.match(review, /if \(bare && scope\.current && !inside/, "the review's hotkeys are unscoped while docked");
  assert.match(review, /target instanceof Node/, "a keydown dispatched on `window` will throw inside the handler");
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

test("🔴🔴 the room an artifact sits in is neutral, never an accent fill", () => {
  // Owner 2026-08-26: *"opening documents, pdf, or pptx in library does not match chatgpt. the
  // background is green and not white."*
  //
  // 🔴 MEASURED ON BOTH SIDES, WITH THE ACCENT ON. Every `--ui-bg-*` fill is the learner's chosen
  // accent mixed over a translucent base, so with the green accent `--ui-bg-secondary` resolves to
  // `color(srgb 0.174 0.537 0.374 / 0.1723)` — rgb(219, 235, 227) once the page shows through.
  // The reference's artifact room is rgb(252, 252, 252). `--ui-bg-editor` is the app's neutral page
  // ground and measures rgb(253, 253, 253) whatever accent is chosen, which is one unit away.
  //
  // 🔴 THE DISTINCTION IS CONTROL vs ROOM, and it is worth stating because it will come up again.
  // `--ui-bg-*` are for things sitting ON a page — a hovered row, a chip, an input — where a trace
  // of the accent is the point. A surface an artifact is READ on is not a control, and tinting it
  // colours the artifact along with it.
  //
  // Calibration: put any `--ui-bg-*` fill back on either room and this reddens.
  const deck = code("../../components/workspace/deck/deck-view.tsx");
  assert.match(deck, /flex h-full min-h-0 flex-col bg-\(--ui-bg-editor\)/, "the deck room is not the neutral ground");
  assert.ok(!/flex-col bg-\(--ui-bg-(primary|secondary|tertiary|quaternary)\)/.test(deck), "the deck room is an accent fill again");
  // The document/PDF reader was already neutral and has to stay that way: measured
  // `color(srgb 0.9915 …)` = rgb(253, 253, 253) for the panel, pure white for the sheet.
  assert.match(PREVIEW, /flex flex-col bg-\(--ui-bg-elevated\)/, "the reader panel is no longer the neutral elevated ground");
  assert.match(PREVIEW, /mx-auto w-full bg-white /, "the sheet is no longer white");
});
