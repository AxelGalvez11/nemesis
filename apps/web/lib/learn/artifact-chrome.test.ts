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
    assert.match(source, /^\s*"reader-dock-in",$/m, `${name}: the entrance is conditional again, so it will replay after a resize`);
    assert.ok(!/!dragging && "reader-dock-in"/.test(source), `${name}: the drag re-arms the entrance animation`);
    assert.match(source, /useDeclareSidePanel\([^)]*, dragging\)/, `${name}: the surface is never told the panel is being dragged`);
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

test("🔴🔴 the Library asks about a file; a canvas never does", () => {
  // Owner, 2026-09-01, of the reference's library: *"it also has like this chat bar at the bottom so
  // that you can ask a question about it, and then when you send it, it'll take you to a new chat.
  // So I think that'll be a good thing to have only for the library."*
  //
  // Measured in his Chrome the same day at 1470x836: a 604x52 pill at radius 28, centred in the
  // pane, 25px clear of the bottom, reading "Ask about this file".
  const view = code("../../components/workspace/deck/deck-view.tsx");
  for (const [name, source] of [["output-preview", PREVIEW], ["deck-view", view]] as const) {
    assert.match(source, /placeholder="Ask about this file"/, `${name}: the ask bar is gone`);
    assert.match(source, /h-\[52px\] w-full max-w-\[604px\][\s\S]{0,40}rounded-\[28px\]/, `${name}: the ask bar lost the measured pill`);
    assert.match(source, /bottom-\[25px\]/, `${name}: the ask bar lost its measured clearance`);
  }
  // 🔴 THE READER'S BAR IS FULL SCREEN ONLY. Docked, it sits beside a conversation that already has
  // a composer, and the bar would be the second one on screen with the wrong one nearer.
  assert.match(PREVIEW, /\{full && onAsk && \(/, "the ask bar shows while docked beside a conversation");
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
  const view = code("../../components/workspace/deck/deck-view.tsx");
  for (const [name, source] of [
    ["output-preview", PREVIEW],
    ["study-panel", code("../../components/workspace/learn/study-panel.tsx")],
    ["deck-view", view],
  ] as const) {
    assert.match(source, /reader-chrome"/, `${name}: this surface measures its own header instead of importing CHROME`);
    assert.match(source, /className=\{CHROME\.header\}|CHROME\.header\)/, `${name}: the header band is not the shared one`);
    assert.match(source, /CHROME\.crumb/, `${name}: the title is not drawn as the shared crumb`);
    assert.match(source, /CHROME\.button/, `${name}: the header controls are not the shared 36px squares`);
  }
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
  assert.match(panel, /fixed inset-y-0 right-0/, "the study panel is not docked to the right edge");
  assert.match(panel, /createPortal\(/, "the panel is not portalled — `fixed` will resolve against the canvas");
  assert.match(panel, /data-workspace/, "the portal left the workspace scope and the global button rule owns it");
  // 🔴🔴 FULL SCREEN IS THE MAIN COLUMN, NOT THE VIEWPORT (2026-09-01). Owner, of the reference's
  // library: *"you keep the left sidebar and it just leaves the sidebar open and it'll just have
  // the document viewer in there."* Measured in his Chrome the same day: their viewer spans x=260
  // to the right edge while the 260px sidebar is untouched. `--nav-column` is published on
  // `documentElement` by the shell, because these panels are portalled to `document.body` and are
  // outside the scope `SHELL_VARS` are set on.
  assert.match(panel, /full \? "left-\[var\(--nav-column,0px\)\]"/, "the panel covers the sidebar again");
  assert.match(PREVIEW, /full \? "left-\[var\(--nav-column,0px\)\]"/, "the reader covers the sidebar again");
  const shell = code("../../components/workspace/shell/workspace-shell.tsx");
  assert.match(shell, /document\.documentElement\.style\.setProperty\("--nav-column", column\)/, "the shell stopped publishing the column a portal can read");
  assert.match(shell, /narrowViewport\s*\?\s*"0px"/, "a phone's reader now leaves a gutter for an overlay sidebar");
  assert.match(panel, /data-testid="study-panel-full"/, "there is no way to go full screen");

  // 🔴🔴 CLOSED HIDES, IT DOES NOT UNMOUNT. A learner four questions into a check who closes the
  // panel must find those four answers when they reopen it. This is the line that guarantees it.
  assert.match(panel, /display: open \? undefined : "none"/, "closing the panel now discards what is inside it");
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
  assert.match(panel, /useState<"docked" \| "full">\(initialMode\)/, "the panel ignores where it was told to land");
  const library = code("../../components/workspace/library/library-outputs.tsx");
  assert.doesNotMatch(library, /<DeckReview[\s\S]{0,140}surface="full"/, "the Library took the chrome-less full-screen path instead of the panel's own");
  assert.match(library, /<DeckReview deckId=\{reviewing\} initialMode="full"/, "the Library's deck is back to sliding in as a sidebar");
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

  assert.match(reader, /type Mode = "docked" \| "full" \| "maximized"/, "the third size is gone");
  assert.match(
    reader,
    /maximized \? "left-0 z-\[60\]" : full \? "left-\[var\(--nav-column,0px\)\]"/,
    "full screen stopped stopping at the rail, or maximized stopped covering it",
  );

  // 🔴 THE TOGGLE IS AGAINST WHERE THE PANEL OPENED, NOT A FIXED PAIR. The canvas opens `docked`
  // and its button has always meant "fill the window" — which is `full`, not `maximized`. A
  // three-way cycle would also make getting back a double press.
  assert.match(reader, /setMode\(mode === initialMode \? biggerThan\(initialMode\) : initialMode\)/, "the size toggle stopped keying on where it opened");
  assert.match(reader, /return opened === "docked" \? "full" : "maximized"/, "the step up from each opening size changed");

  // 🔴 AND MAXIMIZED MUST NOT GROW A SECOND ✕. Every big size already carries one at the head of
  // the crumb (the reference's placement, pinned above); this is the calibration that caught it.
  assert.ok(!/\(!full \|\| maximized\)/.test(reader), "a second close button is back in the maximized header");
});
