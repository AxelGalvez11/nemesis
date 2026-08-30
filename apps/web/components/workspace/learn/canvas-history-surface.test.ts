import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Source assertions for the History Rail's surface rules — the ones that are properties of where
// something is mounted or what it may import, which no pure function can hold.
//
// 🔴🔴 THE "ALL HISTORY" DRAWER IS GONE, AND HALF THIS FILE NOW GUARDS THE ABSENCE. Owner,
// 2026-08-23, reading both surfaces on production: *"there seems to be two rails. So when you
// click all history, that's like the actual bigger one. So I want you to just remove that bigger
// one and keep this one that's compact, but just increase the spacing a bit. …remove the all
// history and the canvas started, because that's not really necessary for the rail."* The card's
// own behaviour pins (Escape, width clamp, scroll-to-active) left with the card; what remains is
// the rule that no second history surface comes back.

const HERE = import.meta.dirname;
const read = (name: string) => readFileSync(join(HERE, name), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CANVAS = read("learning-canvas.tsx");
const CANVAS_CODE = strip(CANVAS);
const RAIL = read("canvas-history-rail.tsx");
const RAIL_CODE = strip(RAIL);
const VIEW_CODE = strip(read("canvas-history-view.tsx"));

// ── one rail for the whole Canvas ───────────────────────────────────────────────────────────

test("🔴🔴 the rail is mounted exactly once, and not inside anything that repeats", () => {
  // Calibration: move `<CanvasHistoryRail` inside the segment map and this reddens. The same class
  // of defect the owner caught on the audio player — "The player opens under each block? It's
  // supposed to be one player for the whole response." A rail per block would be a rail per block.
  const mounts = CANVAS_CODE.match(/<CanvasHistoryRail\b/g) ?? [];
  assert.equal(mounts.length, 1, `expected one rail mount, found ${mounts.length}`);

  // 🔴 THE SAME SHAPE `reply-actions.test.ts` USES: find the repeating region, assert the mount is
  // outside it. Anything cleverer with a regex is a guess about JSX nesting.
  const scroller = CANVAS_CODE.indexOf('className="relative h-full overflow-y-auto');
  assert.ok(scroller > 0, "the Canvas scroller moved; re-point this check");
  assert.ok(
    CANVAS_CODE.indexOf("<CanvasHistoryRail") < scroller,
    "the rail is mounted inside the scrolling content — it is a fixture of the Canvas, not a mark on the page",
  );

  const map = CANVAS_CODE.indexOf("replySegments(replyText, replyVisualList).map(");
  assert.ok(map > 0, "the segment map moved; re-point this check");
  assert.ok(CANVAS_CODE.indexOf("<CanvasHistoryRail") < map, "the rail is rendered per segment");
});

// ── the compact rail is the ONLY history surface ────────────────────────────────────────────

test("🔴🔴 the 'All history' drawer stays deleted — one history surface, the compact rail", () => {
  // Calibration: recreate canvas-history-panel.tsx, or render an "All history" control, and this
  // reddens before the owner sees two rails again.
  assert.ok(!existsSync(join(HERE, "canvas-history-panel.tsx")), "the drawer component is back on disk");
  assert.ok(!existsSync(join(HERE, "canvas-history-entry.tsx")), "the drawer's row component is back on disk");
  // CODE, not source: the ruling that cut the control is quoted in the rail's own header comment.
  assert.ok(!/All history/.test(RAIL_CODE), "the rail offers 'All history' again");
  assert.ok(!/CanvasHistoryPanel/.test(RAIL_CODE), "the rail mounts a second surface again");
  assert.ok(!/"expanded"/.test(RAIL_CODE), "the display union has an expanded state again");
});

test("🔴🔴🔴 the rail has ONE geometry — hovering it may not move a single marker", () => {
  // 🔴 REPOINTED 2026-08-29, AND THE TEST IT REPLACES IS WHY THE DEFECT SHIPPED. That one pinned
  // the OPEN rail's numbers — 36px rows, contiguous, 10px radius, measured off ChatGPT's sidebar in
  // the owner's own Chrome on 2026-08-26 — and every one of those numbers was correct. What nothing
  // asserted was that having a second geometry AT ALL was the problem.
  //
  // Owner, 2026-08-29: *"Fix the Canvas rail pop up because it's… I don't want it to have that. It
  // just moves a lot"*, and then *"im talking about the right side rail in the canvas for viewing
  // previous chats."* Measured before the change, at the 24-marker cap: the column stood ~288px
  // resting and ~864px hovered, three times taller — on a strip that is vertically CENTRED, so
  // every marker slid away from the middle and the one under the pointer left with them.
  //
  // 🔴 SO THE INVARIANT IS THE ABSENCE OF A SECOND STATE, WHICH IS A THING A SOURCE TEST CAN
  // ACTUALLY HOLD. A pixel assertion cannot: both geometries were individually defensible.
  assert.ok(!/peeking/.test(RAIL_CODE), "the rail grew a second display state again");
  assert.ok(!/HistoryRailDisplay/.test(RAIL_CODE), "the rail's display-state type is back");
  assert.ok(!/onMouseEnter|onMouseLeave/.test(RAIL_CODE), "the rail opens on hover again");
  // The surface that faded in with it — this is the literal "pop up".
  assert.ok(!/backdrop-blur/.test(RAIL_CODE), "the rail paints a panel behind itself again");
  assert.ok(!/shadow-lg ring-1 ring-\(--ui-stroke-secondary\) backdrop/.test(RAIL_CODE), "the pop-up panel is back");
  // 🔴 AND EXACTLY ONE ROW HEIGHT. Calibration: add a second `h-[...]` to the marker and this
  // reddens, which is the only edit that could bring the movement back.
  const rowHeights = [...RAIL_CODE.matchAll(/className=\{cn\(([\s\S]*?)\n      \)\}/g)];
  assert.ok(!/h-\[36px\]/.test(RAIL_CODE), "the 36px open row is back — the column will grow on hover again");
  assert.ok(/"group relative flex h-2 shrink-0/.test(RAIL_CODE), "the marker is no longer one fixed height");
  assert.ok(rowHeights.length >= 1, "the marker stopped composing its classes, so this guard cannot read it");
});

test("🔴🔴 the label is a TOOLTIP, out of flow, carrying the reference's list type", () => {
  // The 2026-08-26 measurements are not discarded — they moved onto the tooltip, which is where the
  // label now lives: 14px on a 20px line, truncated at 200px (the same share of a title ChatGPT's
  // 260px sidebar shows inside its 10px row padding).
  //
  // 🔴 `absolute` IS THE WHOLE FIX. Out of flow, a label cannot change the row's height, the
  // column's height, or where any other marker is — so the thing being pointed at stays put. A
  // label that reserved space in ANY form would reintroduce the report.
  assert.ok(/pointer-events-none absolute right-full/.test(RAIL_CODE), "the label is back in flow and can move the column");
  assert.ok(/leading-\[20px\]/.test(RAIL_CODE), "the label is not on the reference's 20px line");
  assert.ok(/max-w-\[200px\]/.test(RAIL_CODE), "the label lost the measured truncation width");
  // 🔴 IT MUST NOT EAT THE CLICK IT DESCRIBES: it overlaps the reading column and sits over the
  // marker's own hit target.
  assert.ok(/pointer-events-none/.test(RAIL_CODE), "the tooltip can intercept the press meant for the marker");
  // 🔴 20px CLEAR OF THE STRIP, measured in the owner's signed-in ChatGPT on 2026-08-29: its rail
  // ends at 52 and its tooltip starts at 72. The number is theirs; the side is ours, because this
  // rail is on the right edge and a tooltip to its right would be off screen.
  assert.ok(/TOOLTIP_GAP_PX = 20/.test(RAIL_CODE), "the tooltip's clearance is no longer the measured 20px");
});

test("🔴 no synthesised 'Canvas started' row reaches any surface", () => {
  // The row spent a marker slot announcing the one event every canvas shares. It is cut at the
  // PROJECTION — `reconstructMoment` keeps the title for old stored rewinds, deliberately, so
  // this scopes to buildCanvasHistory's own body.
  const history = strip(readFileSync(join(HERE, "../../../lib/learn/canvas-history.ts"), "utf8"));
  const build = history.slice(
    history.indexOf("export function buildCanvasHistory"),
    history.indexOf("export function", history.indexOf("export function buildCanvasHistory") + 1),
  );
  assert.ok(build.length > 0, "buildCanvasHistory moved; re-point this check");
  assert.ok(!/Canvas started/.test(build), "buildCanvasHistory synthesises the origin row again");
});

// ── the rail is not the Minimap ─────────────────────────────────────────────────────────────

test("🔴🔴 the History Rail and the Minimap stay separate, architecturally", () => {
  // Owner: "Do NOT merge this with the existing learning Minimap. They answer different questions."
  // The Minimap reads the learner model; this must not be able to.
  for (const [name, code] of [
    ["canvas-history-rail.tsx", RAIL_CODE],
    ["canvas-history-view.tsx", VIEW_CODE],
  ] as const) {
    assert.ok(!/canvas-minimap/.test(code), `${name} reaches into the Minimap`);
    assert.ok(!/learner-evidence|projectLearnerState/.test(code), `${name} reads the learner model`);
    assert.ok(!/territor/i.test(code), `${name} reads territories, which are the Minimap's subject`);
  }
});

// ── rewinding is read-only ──────────────────────────────────────────────────────────────────

test("🔴🔴 the historical view has no way to write anything", () => {
  // The learner-state guarantee, held structurally. `learner_evidence` is append-only in the
  // database, so a rewind could not roll back mastery even if it tried — this stops it trying.
  for (const forbidden of ["recordMoment", "session.", "policy.", "respond", "submit", "update("]) {
    assert.ok(!VIEW_CODE.includes(forbidden), `the history view reaches for \`${forbidden}\``);
  }
});

test("🔴 a new turn returns the learner to now", () => {
  // Leaving the Canvas rewound while an answer lands behind it puts the reply where they cannot
  // see it and leaves a stale moment reading as the live one.
  assert.ok(
    /if\s*\(turnInFlight\)\s*setRewound\(null\)/.test(CANVAS_CODE),
    "nothing returns the Canvas to now when a turn starts",
  );
});

test("🔴 rewinding never calls the session's writer", () => {
  const at = CANVAS_CODE.indexOf("setRewound");
  assert.ok(at > 0, "setRewound is not wired");
  // The rail's own select handler touches `setRewound` and nothing else.
  //
  // 🔴 REPOINTED 2026-08-29: it was `onSelect={setRewound}` until the marker had to TOGGLE. The
  // rewound surface lost its "Return to now" button that day (owner: *"Nothing but the exchange"*)
  // and the rail's "Now" mark had gone on 2026-08-25, so pressing the marker you are already on had
  // to become a way out. What this test is actually about is unchanged and still holds: selecting a
  // moment is a VIEW change and must never reach the session's writer.
  assert.ok(
    /onSelect=\{\(id\) => setRewound\(\(was\) => \(was === id \? null : id\)\)\}/.test(CANVAS_CODE),
    "the rail's selection goes somewhere other than the view state",
  );
});

// ── the rail's stated behaviours ────────────────────────────────────────────────────────────

test("🔴🔴 time runs downwards: oldest at the top, newest at the bottom", () => {
  // Owner's screenshot: the bright marker is at the BOTTOM and the rows above it run back through
  // the session. The first version reversed the list, which is how a chat sidebar is ordered — it
  // makes the column a stack of documents rather than a path.
  // Calibration: add `.reverse()` back and this reddens.
  assert.ok(!/entries\]\.reverse\(\)/.test(RAIL_CODE), "the rail reverses the history");
  assert.ok(RAIL_CODE.indexOf("shown.map(") > 0, "the rail no longer draws its moments");
});

test("🔴🔴 there is no 'Now' mark, and the way back to live is still there", () => {
  // Owner, 2026-08-25: *"could you remove the 'now' since thats not really needed?"*
  //
  // 🔴 THIS IS THE HALF THAT MAKES THE DELETION SAFE, AND IT IS WHY THE ASSERTION IS A PAIR. "Now"
  // was the rail's own way back to live, so removing it alone would strand anybody who had rewound
  // — a control that walks you into the past with no way forward. It does not, because the exit
  // was never only there: the rewound surface carries "Return to now", which is where somebody
  // looking at an old moment actually is. Delete that button and this test must redden.
  assert.ok(!/label="Now"/.test(RAIL_CODE), "the Now mark is back on the rail");
  // 🔴 AND AN EMPTY HISTORY NOW DRAWS NOTHING. "Now" used to guarantee the column had at least one
  // mark; without it, a canvas with no moments rendered an empty `<nav>` — invisible, and still
  // holding a hover target down the right edge that opened a panel with nothing in it.
  // 🔴 REPOINTED 2026-08-27: a docked reader now also silences the rail. Owner: *"hide the rail
  // when sidebar is open."* The rail is pinned to the RIGHT EDGE and the panel covers that edge, so
  // the two were stacked — a column of markers painted underneath a document. Same reasoning §38.1
  // uses for the nav rail inside a canvas: a surface that owns the screen owns the edges too.
  assert.match(RAIL_CODE, /if \(entries\.length === 0 \|\| inset > 0\) return null;/, "an empty history still paints a rail, or a docked reader no longer hides it");
  assert.match(RAIL_CODE, /const inset = useSidePanelInset\(\);/, "the rail is reading something other than the panel's own inset");
  const view = readFileSync(new URL("./canvas-history-view.tsx", import.meta.url), "utf8");
  assert.match(view, /Return to now/, "🔴 nothing returns the learner to live — the rail's Now is gone too");
});

test("🔴 with more moments than the rail can draw, an un-rewound rail holds the newest end", () => {
  // The learner is at the bottom of the column, so that is the end that must stay on screen.
  assert.ok(/rows\.slice\(-RAIL_MARKERS\)/.test(RAIL_CODE), "the window holds the oldest end instead");
});

// ── collapsed state stays quiet ─────────────────────────────────────────────────────────────

test("🔴 nothing but marks is painted while the rail is collapsed", () => {
  // Owner: "Do not show message bubbles, timestamps, labels, avatars or text while collapsed."
  //
  // 🔴 REPOINTED 2026-08-29. The labels are still in the DOM for screen readers and still unpainted
  // until the row is pointed at — what changed is HOW they are hidden. They used to be clipped to
  // zero width in flow; they are now transparent tooltips out of flow, because an in-flow label
  // still occupies a line box and that is what let the column grow on hover.
  assert.ok(/max-w-\[200px\] opacity-0/.test(RAIL_CODE), "labels are not hidden at rest");
  assert.ok(/group-hover:opacity-100/.test(RAIL_CODE), "labels never appear when a marker is pointed at");
  assert.ok(/group-focus-visible:opacity-100/.test(RAIL_CODE), "a keyboard user cannot read a marker's label");
});

test("🔴 a collapsed marker still has an accessible name", () => {
  // A column of 16px rules with no text is a column of unlabelled buttons to a screen reader.
  assert.ok(/aria-label=\{label\}/.test(RAIL_CODE), "markers are unlabelled");
});

test("the active marker is both longer and brighter", () => {
  // Length survives low opacity; brightness survives a peek where every marker is the same length.
  assert.ok(/h-0\.5 w-4 bg-\(--ui-text-primary\)/.test(RAIL_CODE), "the active marker is not emphasised");
});

test("🔴 the rail listens to no scroll event", () => {
  // There is no scrolling transcript on this Canvas — `composeSurface` gives one turn the surface
  // at a time — so there is nothing to sync to, and the performance requirement is met by there
  // being no listener rather than by a cheap one.
  assert.ok(!/scroll/i.test(RAIL_CODE), "the rail listens to scroll");
  assert.ok(!/IntersectionObserver/.test(RAIL_CODE), "the rail observes intersections it cannot use");
});

test("🔴 on a narrow screen the edge stays free, and no orphaned control points at the drawer", () => {
  // The edge rail is still desktop-only; the mobile "History" pill left with the drawer it
  // opened, because a button whose only job was opening a deleted surface is a control wired to
  // nothing — this codebase's most-repeated defect.
  assert.ok(/hidden items-center md:flex/.test(RAIL_CODE), "the edge rail is not hidden on mobile");
  assert.ok(!/md:hidden/.test(RAIL_CODE), "a small-screen affordance persists with nothing to open");
});

// ── it survives a reload ────────────────────────────────────────────────────────────────────

test("🔴🔴 moments are both written and read back — the whole point of a durable history", () => {
  // Calibration: `canvasToRow` and `canvasFromRow` each enumerate the document BY HAND, and the
  // model's own comment warns that a field missing from either is silently not persisted. Delete
  // either line and history survives until the next refresh, which is exactly the defect this
  // feature exists to fix.
  const store = strip(readFileSync(join(HERE, "../../../lib/learn/canvas-store.ts"), "utf8"));
  assert.ok(/moments: canvas\.moments/.test(store), "moments are never written to the row");
  assert.ok(/moments: list\(document\.moments\)/.test(store), "moments are never read back out of the row");

  const model = strip(readFileSync(join(HERE, "../../../lib/learn/canvas-model.ts"), "utf8"));
  assert.ok(/moments: CanvasMoment\[\]/.test(model), "the canvas has no moments field");
  assert.ok(/moments: \[\]/.test(model), "a new canvas does not start with an empty moment list");
});

test("🔴 the conversational turn is recorded, because it exists nowhere else", () => {
  // `conversation` is a ref capped at six turns and deliberately not persisted — its own comment
  // says so. Without this call, "what I asked" is gone on every refresh.
  assert.ok(/recordMoment\(\{/.test(CANVAS_CODE), "no moment is recorded from a turn");
  assert.ok(
    /kind: decision\?\.say \? "assistant" : "user"/.test(CANVAS_CODE),
    "a turn that acted rather than spoke is recorded as an answer",
  );
});

// ── going back reads as a conversation ─────────────────────────────────────────────────────────

test("🔴🔴 a rewound moment shows the learner's OWN words, in the learner's own treatment", () => {
  // Owner 2026-08-26: *"the Canvas should pretty much just be like a regular conversation in
  // ChatGPT. We're pretty much just gonna hide the messaging bubble except when user goes back with
  // the rail. And then it pretty much just makes it easier to navigate."*
  //
  // 🔴 THE LIVE ANSWER VIEW IS UNCHANGED AND MUST STAY UNCHANGED. Contract rule 2 keeps one exchange
  // on the canvas with the learner's sentence unrendered; that rule is about ATTENTION, and it has
  // nothing to say about a moment somebody has deliberately gone back to READ. There, the question
  // is what makes the answer legible at all.
  //
  // 🔴 `LearnerUtterance`, NOT A SECOND TREATMENT. §46.2: a learner must "distinguish instantly:
  // This came from me / This came from Nemesis", which only holds if their words look the same
  // every time they appear. What was here was a grey left-bordered quote invented for this screen.
  //
  // 🔴🔴 REPOINTED 2026-08-26 FROM `canvas-history-view.tsx` TO `canvas-moment-body.tsx`, AND THE
  // MOVE IS THE PARAGRAPH ABOVE BEING TAKEN SERIOUSLY RATHER THAN THE GUARD LOOSENING. A second
  // surface now draws a recorded moment — the whole conversation, read end to end — and this file's
  // own argument is that two call sites styling the learner's words independently is the failure
  // mode. So the drawing moved to one component and BOTH surfaces render it; the assertions below
  // are unchanged in substance, and the pair at the end is new: they hold that neither surface has
  // grown its own copy back. Calibration: inline the bubble into either view and the last two
  // reddens.
  const BODY = readFileSync(new URL("./canvas-moment-body.tsx", import.meta.url), "utf8");
  assert.match(BODY, /import \{ LearnerUtterance \}/, "the recorded moment stopped using the learner's own treatment");
  assert.match(BODY, /<LearnerUtterance via=\{null\}>\{moment\.asked\}<\/LearnerUtterance>/, "what the learner asked is no longer in their bubble");
  assert.match(BODY, /<LearnerUtterance via=\{null\}>\{moment\.answer\}<\/LearnerUtterance>/, "what the learner answered is no longer in their bubble");

  // 🔴 `via={null}` IS NOT A DETAIL. `LearnerUtterance` defaults to `"typed"`, and a moment on the
  // record does not keep how the words arrived — stamping every recorded sentence as typed would put
  // a claim in the DOM that nothing established.
  assert.ok(!/<LearnerUtterance>/.test(BODY), "a recorded sentence is being stamped with a modality nobody observed");

  // 🔴 AND THE STAGE DIRECTIONS WENT WITH IT. "YOU ASKED" over the learner's own sentence and
  // "NEMESIS" over the answer are labels a chat interface does not need: the bubble says whose
  // words those are, which is the entire argument `LearnerUtterance` was written on.
  //
  // 🔴 COMMENTS ARE STRIPPED FIRST, because the file cannot explain what it removed without naming
  // it. `canvas-policy-view.test.ts` learned the same lesson: a guard that cannot tell rendered copy
  // from a comment about it gets "fixed" by deleting the explanation.
  const rendered = strip(BODY);
  for (const label of ["You asked", "You answered", "<MomentLabel>Nemesis</MomentLabel>", 'label="Nemesis"']) {
    assert.ok(!rendered.includes(label), `"${label}" is back — the exchange reads as a record again, not as a conversation`);
  }
  // Question and Correction keep theirs: they come from the policy lane and are not chat answers,
  // and an unlabelled correction reads as a second answer.
  assert.match(BODY, /label="Correction"/, "a correction lost the word that tells it apart from an answer");

  // 🔴 THE REWIND DRAWS THROUGH THE SHARED BODY AND NOT ITSELF.
  assert.match(VIEW_CODE, /<CanvasMomentBody moment=\{moment\}/, "the rewind draws a recorded moment its own way again");
  assert.ok(!/LearnerUtterance/.test(VIEW_CODE), "the rewind view is drawing the learner's words itself again");

  // 🔴🔴 AND THE THREAD DOES NOT USE THIS PATH AT ALL, WHICH IS THE POINT OF THE 2026-08-26 REBUILD.
  // A recorded moment is FLAT TEXT — the log stores what was said, never the drawing beside it. The
  // first chat view drew the conversation from exactly this projection, and the owner's answer was
  // to name everything it lost: *"bring over the artifacts, rendering chips, the visualizations…
  // the pill shapes for the sources and favicon thumbnails… the component chips for tests."* The
  // thread now carries each turn's real payload and renders it with the live answer's own
  // components. Pointing it back at `CanvasMomentBody` would silently strip all of that again.
  const THREAD = strip(readFileSync(new URL("./canvas-thread-turn.tsx", import.meta.url), "utf8"));
  assert.ok(!/CanvasMomentBody/.test(THREAD), "the thread is drawing turns from the flat record again");
  assert.match(THREAD, /<SemanticVisual/, "a turn in the thread cannot draw");
  assert.match(THREAD, /<CanvasSourceCards/, "a turn in the thread lost its source pills");
  assert.match(THREAD, /<ArtifactCard/, "a turn in the thread lost what it made");
});

test("🔴 the banner survives all of it, because the dangerous state is not knowing this is old", () => {
  const VIEW = readFileSync(new URL("./canvas-history-view.tsx", import.meta.url), "utf8");
  assert.ok(VIEW.includes("Viewing earlier moment"), "the history banner is gone");
  assert.ok(VIEW.includes("Return to now"), "the way back to the live canvas is gone");
});

test("🔴🔴 the character stands down while a moment is being read", () => {
  // Measured on production 2026-08-26, on the first rewind after the conversation view shipped: the
  // character sat on top of the rewound answer's opening line.
  //
  // 🔴 THE CAUSE IS THE OVERLAY, AND IT IS DELIBERATE. `CanvasHistoryView` paints OVER a live
  // surface that stays mounted, so unmounting nothing means `#canvas-answer-end` keeps measuring
  // where the LIVE answer ended — and the character kept standing 24px under a paragraph nobody
  // could see.
  //
  // 🔴 RE-ANCHORING IT AT THE REWOUND ANSWER WOULD BE THE WRONG FIX. At rest the character means
  // "this is where Nemesis stopped talking", which is a claim about the live conversation. History
  // is read-only, says so in a banner, and the character has nothing to add to it.
  const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(
    CANVAS,
    /hidden=\{judgingPhase !== null \|\| rewound !== null\}/,
    "the character is back on top of the rewound answer",
  );
});
