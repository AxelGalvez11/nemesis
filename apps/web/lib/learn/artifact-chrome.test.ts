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
// 🔴🔴 THE FRAME MOVED INTO ONE COMPONENT ON 2026-09-04, and the reference changed with it. Owner,
// with Gemini's canvas and ChatGPT's Work pane on screen: *"i dont want the top bar or the outline
// comments … i want the multiple tabs too with the annotation/comment feature"*. The three panels
// (documents, artifacts, study) used to carry their own portal, shell, grip and two rows of chrome,
// and half of this file existed to keep the copies agreeing. `dock-panel.tsx` owns all of that now:
// Gemini's rounded floating panel (measured in his account, see `DOCK_*` in reader-chrome.ts) with
// ChatGPT's one row of tabs-and-controls on top. The guards below that pinned "flush, no radius,
// close on the left when full" were ChatGPT's conversation pane measured on 2026-08-25; the owner
// chose the other reference in writing, so the numbers changed and the method did not.
const FRAME = code("../../components/workspace/learn/dock-panel.tsx");
const STUDY = code("../../components/workspace/learn/study-panel.tsx");

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
  // 🔴 TWO NUMBERS SINCE 2026-09-04: the COLUMN (what pushes the conversation) is the fraction of
  // the space the rail leaves, and the panel's WIDTH is that column less Gemini's 32px gap and 24px
  // margin. One number would either glue the panel to the edge or push the conversation too far.
  assert.match(DOCK, /Math\.round\(Math\.max\(0, viewport - NAV_RAIL_WIDTH\) \* fraction\)/, "the column is not measured from the space the rail leaves");
  assert.match(DOCK, /width: Math\.max\(0, column - DOCK_GAP - DOCK_MARGIN\)/, "the panel's width no longer leaves the gap and the margin");
  assert.match(DOCK, /const \{ column, width \} = dockGeometry\(viewport, fraction\)/, "the hook stopped using the pure geometry");
  assert.match(DOCK, /window\.addEventListener\("resize", measure\)/, "the width does not follow a resize");
  // 🔴 THE FRACTION PERSISTS, NOT THE PIXELS. A panel dragged wide on a large monitor would
  // otherwise cover the whole canvas on a laptop; the proportion is what the learner chose.
  assert.match(DOCK, /String\(current\)/, "the dragged width is not remembered");
  assert.ok(!/setItem\([^)]*width/i.test(DOCK), "pixels are being stored instead of the fraction");
  for (const [name, source] of [["output-preview", PREVIEW], ["source-preview", SOURCE]] as const) {
    assert.match(source, /useDockWidth\(\)/, `${name}: the reader measures its own width instead of sharing the hook`);
    assert.match(source, /onDragStart=\{onDragStart\}/, `${name}: the panel cannot be resized`);
    // 🔴 NOT PINNED TO THE ARGUMENT: the artifact reader passes 0 while full-screen, which is
    // correct — full screen covers everything and pushes nothing. What matters is that it declares.
    assert.match(source, /useDeclareSidePanel\(/, `${name}: the panel covers the canvas instead of pushing it`);
    // 🔴🔴 THE OPENING SLIDE IS UNCONDITIONAL, AND THIS GUARD USED TO DEMAND THE OPPOSITE. It
    // pinned `!dragging && "reader-dock-in"`, on the reasoning that "the slide is dropped while
    // dragging, or the edge lags the pointer by the animation's own duration". That was wrong
    // twice: the keyframe moves `transform` and `opacity`, never width, so it cannot lag a resize;
    // and taking a class off and putting it back is exactly how you RESTART a CSS animation, so
    // every release of the drag handle replayed the 220ms entrance. Watched live on
    // /dev-preview/exports, 2026-09-01: the class went true → false on pointerdown → true on
    // pointerup, and the panel jumped to `translateX(4%)` at opacity 0 and slid in again. Owner,
    // the same day: *"there also seems to be flickering."*
    //
    // 🔴 THE REAL EDGE-LAG WAS SOMEWHERE ELSE ENTIRELY — on the CANVAS, whose `width` transition
    // did apply to every intermediate width a drag produces. Measured with the old rule forced back
    // on: the conversation's right edge sat 400px, 250px and 100px inside the panel through a
    // three-step drag. `useSidePanelLive` publishes the drag so the surface can follow instead.
    assert.match(source, /useDeclareSidePanel\([^)]*, dragging\)/, `${name}: the surface is never told the panel is being dragged`);
    // 🔴 BY THE COLUMN, never the panel's width: the conversation's edge must land a gap before
    // the panel's, not under it.
    assert.match(source, /useDeclareSidePanel\([^)]*\? column : 0, dragging\)/, `${name}: the conversation is pushed by the panel's width instead of its column`);
  }
  // 🔴🔴 THE ENTRANCE IS UNCONDITIONAL, IN THE FRAME. It used to be `!dragging && "reader-dock-in"`
  // in each panel, which replayed the entrance on every release of the grip (owner, 2026-09-01:
  // *"there also seems to be flickering"*): taking a class off and putting it back restarts a CSS
  // animation. The frame's class is a literal, and nothing can toggle it.
  assert.match(FRAME, /"dock-panel-in overflow-hidden border/, "the arrival is no longer the frame's own class");
  assert.match(FRAME, /cursor-col-resize/, "the frame lost its grip");
  assert.ok(!/dragging && "dock-panel-in"/.test(FRAME), "the drag re-arms the entrance animation");
});

test("🔴🔴 floating: Gemini's 24px margins, 40px corner, hairline edge, no shadow, and one row on top", () => {
  // 🔴 THIS REVERSES "flush: no radius, no shadow, no inset" (2026-08-25, ChatGPT's pane). Owner,
  // 2026-09-04, of Gemini's canvas: *"it has the rounded corners for the side panel … this is kind
  // of how I want to envision the chat to be."* Measured in his account: the panel at top 24 with
  // a 40px corner, `1px solid rgba(0,0,0,0.08)`, `box-shadow: none`, and the chat column one third
  // of the space between the rail and the margin with a 32px gap to the panel.
  assert.match(CHROME, /export const DOCK_MARGIN = 24;/, "the margin is not Gemini's 24");
  assert.match(CHROME, /export const DOCK_GAP = 32;/, "the gap to the conversation is not Gemini's 32");
  assert.match(CHROME, /export const DOCK_RADIUS = 40;/, "the corner is not Gemini's 40");
  assert.match(FRAME, /borderRadius: DOCK_RADIUS,\s*bottom: DOCK_MARGIN,\s*right: DOCK_MARGIN,\s*top: DOCK_MARGIN,/, "the docked frame is not the measured floating panel");
  assert.match(FRAME, /border border-\(--ui-stroke-tertiary\)/, "the hairline edge is gone");
  assert.ok(!/shadow-xl|shadow-lg|shadow-md/.test(FRAME), "the panel floats on a shadow, which Gemini's does not");
  // 🔴 ONE ROW, TABS LEFT, CONTROLS RIGHT, AND NOTHING UNDER IT BUT THE BODY. ChatGPT's Work pane,
  // from the owner's own screenshots: no name bar (the tab is the name), no outline, no comments
  // rail.
  assert.match(FRAME, /<div className=\{CHROME\.row\} data-testid="dock-panel-row">/, "the row is not the shared one");
  assert.match(CHROME, /row: "flex h-\[44px\] shrink-0 items-center gap-\[8px\] pb-\[8px\] pl-\[20px\] pr-\[12px\] pt-\[8px\]"/, "the row is not 44px starting 20px in");
  for (const [name, source] of [["output-preview", PREVIEW], ["source-preview", SOURCE], ["study-panel", STUDY]] as const) {
    assert.ok(!/CHROME\.header/.test(source), `${name}: a name band is back under the tabs`);
    assert.ok(!/fixed inset-y-0 right-0/.test(source), `${name}: the panel writes its own flush shell again`);
    assert.ok(!/createPortal\(/.test(source), `${name}: the panel portals itself instead of through the frame`);
    assert.match(source, /<DockPanel/, `${name}: the panel does not wear the shared frame`);
  }
  // 🔴 AND NO OUTSIDE-PRESS CATCHER. A panel owning two thirds of the window must not vanish
  // because somebody clicked the conversation beside it.
  assert.ok(!/onMouseDown=\{\(event\) =>/.test(FRAME), "an outside press can dismiss the docked panel again");
  assert.ok(!/onMouseDown=\{\(event\) =>/.test(PREVIEW), "an outside press can dismiss the docked panel again");
});

// 🔴🔴 RE-PINNED 2026-09-04, SMALLER, AND STILL MEASURED. Owner: *"the sidebar headers containing
// the tabs and tools feel too big ... i want it to look like how chatgpt does it, minimalist"*.
// The old numbers were read off the reference's CLOSE button, which is the one control in their
// header that is bigger than the rest. Read out of their desktop bundle instead
// (`artifact-source-bootstrap`, every control `size:"toolbar"` with `uniform:true`): 28x28 holding
// an 18px glyph, 4px apart. Ours is now that, in a 36px band, with the tab row above it at 32px —
// 68px of chrome where there used to be 83px. The rem-utility ban below is untouched and is still
// the thing this test is really for.
test("🔴 the header is the measured one: 28x28 buttons, 8px radius, 18px glyphs, 14px crumb", () => {
  // 🔴 EXPLICIT PIXELS. `html { font-size: 112.5% }` in this app, so `size-9 rounded-lg gap-2`
  // measured 40.5x40.5 at radius 13.5 on a 49.5 pitch. Measuring BOTH sides is what caught it;
  // each of those reads as correct in a screenshot.
  assert.ok(!/size-9|rounded-lg|gap-2\b|leading-5/.test(CHROME), "a rem utility is back in the shared chrome — every one lands 1.125x too big here");
  assert.match(CHROME, /button: "flex h-\[28px\] w-\[28px\]/, "the button is not 28x28");
  assert.match(CHROME, /rounded-\[8px\]/, "the button radius is not the measured 8px");
  assert.match(CHROME, /icon: "18px"/, "the header glyph is not 18px");
  assert.match(CHROME, /header: "flex items-center gap-\[4px\] px-\[10px\] py-\[4px\]"/, "the header band is not 36px");
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

test("🔴🔴 the panel arrives the way Gemini's does, and stands still under reduced motion", () => {
  // Read off Gemini's own Web Animations in the owner's account on 2026-09-04 (`Element.prototype
  // .animate` hooked while the canvas opened): the panel scales from 0.6 to 1 over 500ms on
  // cubic-bezier(0.2, 0, 0, 1), its opacity 0 to 1 over the first 200ms. Filmed headless after
  // building it: 0.60 at 76ms, 0.88 at 210ms, 0.99 at 476ms, `none` at 609ms, opacity 1 by 276ms.
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.dock-panel-in \{\s*animation: dock-panel-in 500ms cubic-bezier\(0\.2, 0, 0, 1\);\s*transform-origin: center;/, "the arrival is not Gemini's 500ms scale from the centre");
  assert.match(css, /@keyframes dock-panel-in \{\s*from \{ transform: scale\(0\.6\); opacity: 0; \}\s*40% \{ opacity: 1; \}/, "the arrival does not start at 0.6 or fade in over the first 200ms");
  // 🔴 THE LAYOUT STILL MOVES ON THE ONE 220ms CLOCK. Filmed: the conversation narrowed from 1418
  // to 473 between 76ms and 276ms while the panel was still growing into its box; a box that
  // took 500ms would leave the two edges of one seam apart for 280ms.
  assert.match(css, /\.canvas-exit-out \{ animation-duration: 1ms; \}/, "the reduced-motion block moved and this guard reads the wrong one");
  // 🔴 IN THE CANVAS BLOCK'S OWN SELECTOR LIST, NOT A NEW BLOCK AT THE END: canvas-motion.test.ts
  // reads the LAST reduced-motion query in the stylesheet, and a fresh block appended for this one
  // class would become that last one and make every other rule in the old block read as unguarded.
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  const list = reduced.slice(0, reduced.indexOf("animation: none;"));
  assert.ok(list.includes(".reader-dock-in,") && list.includes(".dock-panel-in,"), "the panel still scales in for someone who asked the system to stop moving, or it was guarded in a block of its own");
});

test("🔴🔴 close is on the RIGHT at every size, last in the row", () => {
  // 🔴 THIS REVERSES "close on the LEFT when full" (2026-08-25, ChatGPT's Library reader with its
  // breadcrumb). There is no crumb in the row any more (owner, 2026-09-04: *"i dont want the top
  // bar"*), so there is nowhere on the left for a close to sit beside, and a control that moves
  // between two ends of the panel depending on its size is one a learner looks for twice.
  assert.ok(!/\{full && \(\s*<button aria-label="Close"/.test(PREVIEW), "full screen puts a close on the left again");
  assert.ok(!/\{!full && \(\s*<button aria-label="Close"/.test(PREVIEW), "the close is conditional on the size again");
  // And the three controls in their order — measured left to right at x=1342, 1382, 1422 on the
  // 2026-08-25 reference, and the same order at the right end of ChatGPT's Work row.
  const group = PREVIEW.slice(PREVIEW.indexOf("const controls = ("), PREVIEW.indexOf("<DockPanel"));
  const order = ["Download", "Full screen", "Close"].map((label) => group.indexOf(label));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!)), "the row's controls are not Download, Full screen, Close");
});

test("🔴 the two surfaces differ by where they are opened from", () => {
  // In a conversation the reader docks so the thread stays on screen to check the artifact
  // against; on the Library page there is no thread, so it takes the whole surface.
  assert.match(PREVIEW, /initialMode\?: "docked" \| "full"/, "the reader has one shape for both surfaces");
  const library = code("../../components/workspace/library/library-outputs.tsx");
  // 🔴🔴 AND A DOCUMENT OPENED FROM THE SHELF CAN BE COMMENTED ON. This mount shipped without
  // `comments`, so the Library had the whole annotate layer built and unreachable — a Download
  // button and nothing else. Owner, 2026-08-31: *"the comment function should work like in claude
  // design where users drop in a bubble of a comment."* A prop that is easy to forget is exactly
  // the kind a guard should hold.
  assert.match(
    library,
    /<OutputPreview[\s\S]{0,200}comments=\{\{ preview: Boolean\(preview\), uid: userId \}\}/,
    "the Library's document reader lost comment mode again",
  );
  assert.match(library, /initialMode="full"/, "the Library opens a docked panel with nothing beside it");
});

test("🔴🔴 an artifact opens itself, and so does a deck, both as tabs of the one pane", () => {
  // The owner's own condition for this being done: *"user can click in the Canvas to create a
  // PowerPoint or any artifact, and it should open a sidebar for it inside the Canvas."* And on
  // 2026-09-03, of the deck that used to wait for a press: *"flashcards should also pop in the
  // right side panel too"*, then *"one side panel that's supposed to render anything... multiple
  // tab views"*: the deck is an item of the document dock now, not a panel of its own.
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /openedArtifactId\.current = made\.id/, "a finished artifact does not open itself");
  assert.match(canvas, /if \(made\.deckId\) dock\.openDeck\(made\.deckId, made\.title\);/, "a made deck no longer opens itself as a tab");
  assert.match(canvas, /dock\.active\?\.kind === "deck" && \(\s*<DeckReview/, "the review is not mounted from the dock");
  assert.ok(!/setReviewingDeck|reviewingDeck &&/.test(canvas), "a deck has a panel of its own again");
  // 🔴 LATCHED ON THE ID. Without it, closing the reader on an artifact still held in state
  // re-opens it on the next render — a panel that cannot be dismissed.
  assert.match(canvas, /openedArtifactId\.current === made\.id\) return;/, "the reader re-opens itself after being closed");
});

test("🔴🔴 the Library asks about a file; a canvas never does", () => {
  // Owner, 2026-09-01, of the reference's library: *"it also has like this chat bar at the bottom so
  // that you can ask a question about it, and then when you send it, it'll take you to a new chat.
  // So I think that'll be a good thing to have only for the library."*
  //
  // Measured in his Chrome the same day at 1470x836: a 604x52 pill at radius 28, centred in the
  // pane, 25px clear of the bottom, reading "Ask about this file".
  //
  // 🔴🔴 ONE COPY SINCE 2026-09-03, AND THE THIRD SURFACE IS WHY. This used to check that TWO files
  // each contained the markup above — which is exactly the shape that let the flashcard panel ship
  // with no bar at all, since it was in neither list. Owner: *"it should be the same, basically the
  // one it has for the document."* The measurements live in `reader-ask.tsx` now and the three
  // surfaces are checked for USING it, which a fourth surface cannot quietly opt out of.
  const ASK = code("../../components/workspace/learn/reader-ask.tsx");
  assert.match(ASK, /placeholder="Ask about this file"/, "the ask bar is gone");
  assert.match(ASK, /h-\[52px\] w-full max-w-\[604px\][\s\S]{0,40}rounded-\[28px\]/, "the ask bar lost the measured pill");
  assert.match(ASK, /bottom-\[25px\]/, "the ask bar lost its measured clearance");
  const view = code("../../components/workspace/deck/deck-view.tsx");
  const study = code("../../components/workspace/learn/study-panel.tsx");
  for (const [name, source] of [["output-preview", PREVIEW], ["deck-view", view], ["study-panel", study]] as const) {
    assert.match(source, /<ReaderAsk\b/, `${name}: this artifact stopped drawing the shared ask bar`);
    // 🔴 AND NOBODY MAY HAND-WRITE IT AGAIN. Two hand-typed copies is what this was.
    assert.ok(!/placeholder="Ask about this file"/.test(source), `${name}: the ask bar was hand-written back into this file`);
  }
  // 🔴 THE BAR IS FULL SCREEN ONLY, ON BOTH PANELS. Docked, either sits beside a conversation that
  // already has a composer, and the bar would be the second one on screen with the wrong one nearer.
  assert.match(PREVIEW, /\{full && onAsk && <ReaderAsk/, "the reader's ask bar shows while docked beside a conversation");
  assert.match(study, /\{full && onAsk && <ReaderAsk/, "the deck panel's ask bar shows while docked beside a conversation");
  // 🔴 AND ONLY THE LIBRARY PASSES IT. Asserted as an absence on the canvas, because "the Library
  // has it" passes just as well in a build where everything does.
  const library = code("../../components/workspace/library/library-outputs.tsx");
  assert.match(library, /onAsk=\{askAbout\}/, "the Library's reader lost its ask bar");
  assert.ok(!/onAsk=/.test(code("../../components/workspace/learn/canvas-controls.tsx")), "a canvas grew a second composer for the artifact beside it");
  // 🔴🔴 THE DOCUMENT TRAVELS WITH THE QUESTION, OR THE QUESTION IS UNANSWERABLE. `putPending` is
  // the front door's own single-use hand-off, so the new canvas ingests the document through the
  // one path every other attachment takes.
  for (const [name, source] of [["library", library], ["deck page", code("../../app/(workspace)/deck/page.tsx")]] as const) {
    assert.match(source, /putPending\(\[\{ file: new File\(\[material\.text\], material\.name/, `${name}: the question is sent without the document`);
    assert.match(source, /router\.push\(`\/learn\?ask=\$\{encodeURIComponent\(question\)\}`\)/, `${name}: asking no longer opens a new canvas`);
  }
  // 🔴 AND THE STASH STAYS TYPE-ONLY AT ITS EDGE. Written `import { type ExtractedFile }`, importing
  // `putPending` drags `chat-attachments` and every file parser behind it into whatever page did
  // the importing; the Library route stopped compiling for four minutes the first time.
  assert.match(
    code("../../components/workspace/learn/pending-attachment.ts"),
    /import type \{ ExtractedFile \}/,
    "the stash pulls the whole ingestion graph into every page that hands over a file",
  );
});

test("🔴🔴 all three opened artifacts wear ONE header band", () => {
  // Owner, 2026-09-01: *"it's kinda weird because all of them have different settings… the slides
  // and the documents, they both have like different top header settings."* Two of the three
  // already shared `CHROME`; the deck page had hand-written its own — `px-4 py-2`, which is 18px
  // and 9px at this app's 112.5% root against the readers' measured 12px and 5.5px — with the title
  // as secondary body text instead of a crumb, and no close at all.
  //
  // 🔴 THE CHECK IS THAT THEY IMPORT THE SAME NUMBERS, NOT THAT THEY LOOK ALIKE. Three files can
  // each measure 47px today and drift the first time one is adjusted; one module cannot.
  // 🔴 REPOINTED 2026-09-04: the two PANELS wear `DockPanel`'s one row now and have no band of
  // their own; the deck PAGE (a route, with no tabs to name it) keeps the flush band and the crumb.
  const view = code("../../components/workspace/deck/deck-view.tsx");
  for (const [name, source] of [["output-preview", PREVIEW], ["study-panel", STUDY]] as const) {
    assert.match(source, /reader-chrome"/, `${name}: this surface measures its own controls instead of importing CHROME`);
    assert.match(source, /<DockPanel/, `${name}: the panel does not wear the shared frame`);
    assert.match(source, /CHROME\.button/, `${name}: the row's controls are not the shared 28px squares`);
  }
  assert.match(view, /className=\{cn\("dk-print-hide border-b border-\(--ui-stroke-tertiary\)", CHROME\.header\)\}/, "deck-view: the page's band is not the shared one");
  assert.match(view, /CHROME\.crumb/, "deck-view: the title is not drawn as the shared crumb");
  assert.match(view, /CHROME\.button/, "deck-view: the controls are not the shared squares");
  assert.ok(!/px-4 py-2/.test(view), "the deck page went back to its own padding, which is 18px and 9px here");
  // 🔴 AND IT HAS A WAY OUT NOW. It is a PAGE, so before this the only exit was the browser's own
  // back button — and `router.back()` alone does nothing at all on a pasted URL.
  assert.match(view, /aria-label="Close"/, "the deck page lost the close it never used to have");
  const page = code("../../app/(workspace)/deck/page.tsx");
  assert.match(page, /window\.history\.length > 1 \? router\.back\(\) : router\.push\("\/library"\)/, "closing a deck opened by URL does nothing");
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
  assert.match(panel, /<DockPanel/, "the study panel is not docked in the shared frame");
  assert.match(FRAME, /createPortal\(/, "the frame is not portalled — `fixed` will resolve against the canvas");
  assert.match(FRAME, /data-workspace/, "the portal left the workspace scope and the global button rule owns it");
  // 🔴🔴 FULL SCREEN IS THE MAIN COLUMN, NOT THE VIEWPORT (2026-09-01). Owner, of the reference's
  // library: *"you keep the left sidebar and it just leaves the sidebar open and it'll just have
  // the document viewer in there."* Measured in his Chrome the same day: their viewer spans x=260
  // to the right edge while the 260px sidebar is untouched. `--nav-column` is published on
  // `documentElement` by the shell, because these panels are portalled to `document.body` and are
  // outside the scope `SHELL_VARS` are set on.
  assert.match(FRAME, /: "inset-y-0 right-0 left-\[var\(--nav-column,0px\)\]"/, "full screen covers the sidebar again");
  const shell = code("../../components/workspace/shell/workspace-shell.tsx");
  assert.match(shell, /document\.documentElement\.style\.setProperty\("--nav-column", column\)/, "the shell stopped publishing the column a portal can read");
  assert.match(shell, /narrowViewport\s*\?\s*"0px"/, "a phone's reader now leaves a gutter for an overlay sidebar");
  assert.match(panel, /data-testid="study-panel-full"/, "there is no way to go full screen");

  // 🔴🔴 CLOSED HIDES, IT DOES NOT UNMOUNT. A learner four questions into a check who closes the
  // panel must find those four answers when they reopen it. This is the line that guarantees it.
  assert.match(panel, /hidden=\{!open\}/, "closing the panel now discards what is inside it");
  assert.match(FRAME, /display: hidden \? "none" : undefined/, "the frame unmounts instead of hiding");
  assert.match(canvas, /open=\{checkOpen\}/, "the check panel does not follow its own open flag");
  assert.doesNotMatch(canvas, /checkOpen && \(\s*<StudyPanel/, "the check is unmounted when the panel closes, losing the learner's answers");

  // 🔴🔴 THE DOOR DECIDES WHERE A DECK LANDS, AND BOTH OWNER RULINGS SURVIVE THAT. This guard used
  // to read "a deck opens in the panel from EVERY door", because on 2026-08-31 he rejected the
  // Library opening one full screen — *"the flashcard open full screen, and it did not open in the
  // sidebar, like the test. I thought I already asked for that."* On 2026-09-01 he asked for the
  // opposite, in so many words, and scoped it: *"when I click on the flashcards it just pulls up a
  // sidebar, which is not how it's supposed to be in the library — for the library it should just
  // be full screen immediately."*
  //
  // The two are only a contradiction while the rule is about the OBJECT. Docking exists to keep
  // something else on screen; in a canvas that is the conversation the deck came out of, and on the
  // shelf it is a list of file names. So: canvas docks, Library lands full, and full screen stays
  // one button away from either.
  //
  // `surface="full"` — the OTHER full-screen path, which drops the panel chrome entirely — is
  // still unused. It is for a caller with no shell to dock into, and this guard notices if
  // anything starts passing it, because that door loses the header the other two share.
  assert.match(deck, /<StudyPanel/, "a deck no longer opens beside the conversation");
  assert.match(deck, /surface="bare"/, "the docked deck mounts a dialog inside a panel");
  assert.match(deck, /initialMode=\{initialMode\}/, "DeckReview stopped passing the door's choice through");
  //
  // 🔴🔴 THIS GUARD PINNED THE BUG IT WAS NAMED AFTER. `useState<"docked" | "full">` was asserted as
  // proof the panel respected the door, and it was also the whole defect: with only two sizes, the
  // Library's own full screen had nowhere to step UP to, so the shared-looking button stepped it
  // DOWN into a side sheet laid over a shelf. Owner, 2026-09-03: *"it opens full screen and when
  // you undo the full screen it kind of does this, which is different than the documents one."*
  // The panel reads the shared three-size model now; landing is still the door's call.
  assert.match(panel, /useState<ReaderMode>\(initialMode\)/, "the panel ignores where it was told to land");
  assert.match(panel, /setMode\(mode === initialMode \? biggerThan\(initialMode\) : initialMode\)/, "the deck's size toggle stopped keying on where it opened");
  assert.match(panel, /mode=\{mode\}/, "the deck panel does not hand its size to the frame");
  assert.match(FRAME, /mode === "maximized"\s*\? "inset-0 z-\[60\]"/, "the frame lost the third size, so exiting full screen docks it again");
  const library = code("../../components/workspace/library/library-outputs.tsx");
  assert.doesNotMatch(library, /<DeckReview[\s\S]{0,140}surface="full"/, "the Library took the chrome-less full-screen path instead of the panel's own");
  // 🔴 REPOINTED 2026-09-03: the mount carries the document's toolbar now, so the two props are no
  // longer adjacent. `library-geometry.test.ts` checks the rest of what it passes.
  assert.match(library, /<DeckReview[\s\S]{0,900}initialMode="full"/, "the Library's deck is back to sliding in as a sidebar");
  // 🔴 AND THE CANVAS IS STILL THE OTHER HALF OF THE RULE — asserted, not assumed, because "the
  // Library is full screen" passes just as well in a build where everything is.
  assert.doesNotMatch(canvas, /<DeckReview[\s\S]{0,160}initialMode="full"/, "a canvas now opens its deck full screen, over the conversation it came from");

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
  assert.match(FRAME, /createPortal\(/, "the frame is not portalled — `fixed` will resolve against the canvas");
  assert.match(FRAME, /data-workspace/, "the portal left the workspace scope and the global button rule owns it");
  assert.match(PREVIEW, /<DockPanel/, "the reader does not go through the frame");
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
  assert.match(FRAME, /flex flex-col bg-\(--ui-bg-elevated\)/, "the reader panel is no longer the neutral elevated ground");
  // 🔴 THE CAP IS NAMED HERE because it sits between `w-full` and `bg-white`, and this assertion
  // used to read the two as adjacent — which made a width fix look like a colour regression.
  assert.match(PREVIEW, /mx-auto w-full max-w-\[816px\] bg-white /, "the sheet is no longer white");
});

test("🔴🔴 a document is read at the measured column, not at whatever width the window is", () => {
  // Owner, 2026-08-31: *"why is that research document like it's too wide, and it doesn't look
  // like how [ChatGPT] outputs its own research reports."* He was right, and the numbers say how
  // badly: the sheet was `w-full` with nothing above it, which was harmless while it only opened
  // docked and became 1422px wide the moment it opened full screen — prose at **1332px on 14px
  // type, about 190 characters a line**, against the 45-75 a reader can actually track.
  //
  // 🔴 MEASURED THE SAME HOUR on ChatGPT, signed in, 1470px viewport: a report paragraph is
  // **736px wide, 16px on 26px, weight 400, rgb(13,13,13)** — and a list item the same. 736 plus
  // the sheet's 40px padding on each side is the 816 pinned here.
  //
  // 🔴 THE COLOUR AND SIZE MATTER AS MUCH AS THE WIDTH. This shipped in `--canvas-text-small`
  // (14px) in `--ui-text-secondary`, which is caption styling: a whole document set in grey
  // half-size type reads as a PREVIEW of a document rather than the document. `leading-relaxed`
  // on 16px is 26px exactly, so the measured line-height needs no literal to hit.
  assert.match(PREVIEW, /max-w-\[816px\]/, "the document sheet is uncapped again — full screen will run it to the window's width");
  const body = PREVIEW.slice(PREVIEW.indexOf("function DocBody"));
  assert.ok(
    !/text-\[length:var\(--canvas-text-small\)\][^"]*text-\(--ui-text-secondary\)/.test(body),
    "the document body is back to 14px grey, which reads as a preview rather than a document",
  );
  assert.match(body, /text-\[length:var\(--canvas-text-body\)\] leading-relaxed text-\(--ui-text-primary\)/, "the document body is no longer the measured 16/26 in the primary colour");
});

test("🔴🔴 there are THREE sizes, and full screen stops at the rail while maximized covers it", () => {
  // Owner, 2026-09-01: *"when users open the initial artifact in the library, it should take up the
  // whole screen except for the sidebar. And then if they want a full screen, then the sidebar will
  // disappear."* Two different bignesses, and the panel only had one.
  const reader = readFileSync(new URL("../../components/workspace/learn/output-preview.tsx", import.meta.url), "utf8");
  // 🔴 THE MODEL MOVED TO `reader-chrome.ts` ON 2026-09-03, beside the measurements, because the
  // flashcard panel needed the same three sizes and a second copy would have drifted. Both readers
  // import it; neither may define its own.
  const chrome = readFileSync(new URL("../../components/workspace/learn/reader-chrome.ts", import.meta.url), "utf8");
  assert.match(chrome, /export type ReaderMode = "docked" \| "full" \| "maximized"/, "the third size is gone");
  assert.ok(!/type Mode = "docked"/.test(reader), "the reader defined its own copy of the size model again");
  assert.match(
    FRAME,
    /mode === "maximized"\s*\? "inset-0 z-\[60\]"\s*: "inset-y-0 right-0 left-\[var\(--nav-column,0px\)\]"/,
    "full screen stopped stopping at the rail, or maximized stopped covering it",
  );

  // 🔴 THE TOGGLE IS AGAINST WHERE THE PANEL OPENED, NOT A FIXED PAIR. The canvas opens `docked`
  // and its button has always meant "fill the window" — which is `full`, not `maximized`. A
  // three-way cycle would also make getting back a double press.
  assert.match(reader, /setMode\(mode === initialMode \? biggerThan\(initialMode\) : initialMode\)/, "the size toggle stopped keying on where it opened");
  assert.match(chrome, /return opened === "docked" \? "full" : "maximized"/, "the step up from each opening size changed");

  // 🔴 AND MAXIMIZED MUST NOT GROW A SECOND ✕. Every big size already carries one at the head of
  // the crumb (the reference's placement, pinned above); this is the calibration that caught it.
  assert.ok(!/\(!full \|\| maximized\)/.test(reader), "a second close button is back in the maximized header");
});
