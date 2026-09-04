import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";


// 🔴🔴🔴 NEMESIS IS A CHATBOT, AND THE CANVAS IS A WAY OF LOOKING AT IT.
//
// Owner, 2026-08-26, hours after the conversation view shipped as an option beside a one-answer
// default: *"it should be a chatbot first. That's what makes sense. And the Canvas should just be a
// different way to view the chatbot history, or not even the history, just to focus it… the user
// could switch back to the classic chat mode."*
//
// Then, on what the Canvas is FOR: *"just make the canvas the one where it doesn't show the user's
// prompt. It just shows the output."*
//
// And on what the chat has to carry: *"bring over the artifacts, rendering chips, the
// visualizations, the instruction prompts for teaching, and bring over the output rendering, like
// the pill shapes for the sources and favicon thumbnails… and the component chips for tests… keep
// the composer the same. Don't make a new composer and all the modes as well."*
//
// 🔴 THE FIRST BUILD OF THIS FAILED THAT LAST PARAGRAPH, AND THE FAILURE IS WHY HALF THIS FILE
// EXISTS. The chat was an overlay that redrew the conversation from `canvas.moments` — a durable
// log of FLAT TEXT. Every drawing, source pill, artifact card and quiz vanished the moment a turn
// left the live region. The fix was structural rather than additive: the thread is now the SAME
// SCROLLER as the live answer, with the finished turns left on the page above it, each carrying
// its real payload. Nothing is re-rendered from a string.
//
// Each assertion below says what to break to redden it alone.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
/** Comments stripped, because a guard that matches its own explanation proves nothing. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CANVAS = strip(read("./learning-canvas.tsx"));
const TURN = read("./canvas-thread-turn.tsx");
const TURN_CODE = strip(TURN);

// ── the chat is the front door ──────────────────────────────────────────────────────────────

test("🔴🔴 the chat is the DEFAULT view, and the second one is a door, not a pin", () => {
  // Two owner rulings, hours apart, 2026-08-30. Morning (#937): *"why is latest output option
  // even there in the first place?"* — the view died with its buried menu row. Evening: *"also
  // there should be a way to chat mode to canvas mode"* — the view came back with a VISIBLE,
  // gated glyph. What must never come back is the part that generated three defect reports: the
  // stored pin. The view is in-memory per visit; every canvas opens on the conversation.
  const HOOK = strip(readFileSync(new URL("./use-canvas-view.ts", import.meta.url), "utf8"));
  const MODEL = strip(readFileSync(new URL("../../../lib/learn/canvas-view.ts", import.meta.url), "utf8"));
  assert.match(MODEL, /DEFAULT_CANVAS_VIEW: CanvasView = "conversation"/, "the chat stopped being the default");
  assert.match(HOOK, /useState<CanvasView>\(DEFAULT_CANVAS_VIEW\)/, "the view no longer starts at the default");
  assert.ok(!/getItem|setItem/.test(HOOK), "the stored view pin is back — the three-report defect returns");
  assert.match(HOOK, /removeItem\(CANVAS_VIEW_STORAGE_KEY\)/, "old browsers' pins are no longer healed on mount");
  assert.match(CANVAS, /const threadOpen = view === "conversation" && !viewing;/, "the thread gate lost the view");
});

test("🪦 the view door is PULLED — the canvas opens on the conversation and cannot leave it", () => {
  // Owner, 2026-09-01: *"we hid the canvas view to work on it later"* / *"yeah pull the glyph"*.
  //
  // 🔴 THIS TEST WAS THE OPPOSITE ASSERTION UNTIL TODAY, and it was right both times — the door
  // was correctly built and correctly gated. What changed is a PRODUCT decision about a parked
  // view, not a defect in the control, so the control's own rules (glyph names the destination,
  // `canvasViewAction` owns the words, gated on a conversation existing) are recorded in the
  // tombstone rather than deleted. Restoring the door means restoring them too.
  const CONTROLS = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const HEADER = strip(readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8"));
  assert.ok(!/export function CanvasViewControl/.test(CONTROLS), "the view control is mounted again");
  assert.ok(!/<CanvasViewControl/.test(HEADER), "the header draws the view door again");
  assert.ok(!/onToggleView/.test(HEADER), "the header still takes the door's props");
  assert.ok(!/onToggleView|conversationOffered/.test(CANVAS), "the canvas still offers the door");
});

test("🔴🔴🔴 the COURSE reaches the chat — nothing but the thread is gated on the view", () => {
  // Owner, 2026-09-01, asked what "no canvas" should cost: *"the course minimap should be in chat
  // mode."* It already is, and this test is what stops that from being a coincidence.
  //
  // 🔴 THE MINIMAP WAS NEVER A CANVAS-MODE THING. It is gated on the canvas HAVING A COURSE —
  // `planTitle` and a non-empty plan — which is a fact about the material, not about how the page
  // is being looked at. The same is true of the teaching screen: `canvasPresentation` decides
  // `regions.policy` from the runtime and the blocks and is never handed a view at all.
  //
  // 🔴 SO THE RULE IS STATED AS AN EXHAUSTIVE LIST, NOT AS A PILE OF ABSENCES. "The map is not
  // view-gated" would pass while someone quietly gated the policy screen instead. Every use of the
  // identifier `view` in the canvas is enumerated here, so gating ANYTHING new on it reddens this
  // and has to be argued for.
  // The trailing `-` in both guards is not decoration: it excludes the kebab-case import paths
  // (`./canvas-history-view`, `./use-canvas-view`), which are file names, not reads of the state.
  const uses = (CANVAS.match(/(?<![A-Za-z0-9_$."'`-])view(?![A-Za-z0-9_$-])/g) ?? []).length;
  assert.equal(uses, 4, `the canvas now reads \`view\` ${uses} times, not 4 — say what the new one gates`);
  assert.match(CANVAS, /const \{ view \} = useCanvasView\(\)/, "1 of 4: the view is no longer read from the hook");
  assert.match(CANVAS, /const threadOpen = view === "conversation" && !viewing;/, "2 of 4: the thread's gate changed");
  assert.match(CANVAS, /if \(view === "conversation" && scroller\)/, "3 of 4: going back stopped asking the view");
  // 🔴 THE DEPENDENCY, NOT THE WHOLE LIST. This pinned `[view],` and reddened the day `goToMoment`
  // gained a second dependency — a guard about what the view GATES failing on a change to what the
  // handler READS. `view` being in the list is the fact; what sits beside it is not this test's.
  assert.match(CANVAS, /\[history, view\],|\[view\],/, "4 of 4: goToMoment dropped its dependency on the view");

  // And the two course surfaces, gated on the course existing.
  const HEADER = strip(read("./canvas-header.tsx"));
  assert.match(
    HEADER,
    /\{minimap\.planTitle !== null && minimap\.plan && minimap\.plan\.length > 0 && \(/,
    "the course map's gate is no longer 'this canvas has a course'",
  );
  assert.ok(!/view/.test(HEADER), "a view reached the header again — the map is one prop away from being mode-only");
  assert.match(CANVAS, /\{regions\.policy && \(\s*<CanvasPolicyView/, "the teaching screen's gate is no longer the surface's own");
});

test("🔴🔴 pulling the door did NOT delete the view — the machinery is parked, not gone", () => {
  // The whole reason to keep this file's other tests meaningful. `threadOpen` still asks the view
  // what it is; the hook still runs, still refuses storage, and still heals #930's pin, which is
  // sitting in real browsers whether or not anything can set it today.
  const HOOK = strip(readFileSync(new URL("./use-canvas-view.ts", import.meta.url), "utf8"));
  assert.match(CANVAS, /const \{ view \} = useCanvasView\(\)/, "the canvas stopped reading the view at all");
  assert.match(CANVAS, /const threadOpen = view === "conversation" && !viewing;/, "the thread gate lost the view");
  assert.match(HOOK, /removeItem\(CANVAS_VIEW_STORAGE_KEY\)/, "the healer went out with the door");
  const VIEW = strip(readFileSync(new URL("../../../lib/learn/canvas-view.ts", import.meta.url), "utf8"));
  assert.match(VIEW, /export function canvasViewAction/, "the door's wording is gone — restoring the glyph now has no words");
  assert.match(VIEW, /DEFAULT_CANVAS_VIEW: CanvasView = "conversation"/, "the unreachable default is no longer the conversation");
});

test("🔴🔴 the thread is in the SAME scroller as the live answer, not an overlay over it", () => {
  // THE structural claim, and the reason every item on the owner's list works. An overlay would
  // have to redraw each turn from something; sharing the scroller means the newest turn simply IS
  // the canvas, and the history sits above it. Calibration: wrap the thread in `absolute inset-0`
  // and this reddens.
  // 🔴 MATCHED WITHOUT THE `className="` PREFIX ON PURPOSE. The scroller's width now depends on
  // whether the source pane is open, so the attribute is a template literal rather than a plain
  // string. What this check needs is the scroller's POSITION, which the quoting style does not
  // change; pinning the quotes made this redden for a reason it does not care about.
  const scroller = CANVAS.indexOf('relative h-full overflow-y-auto');
  assert.ok(scroller > 0, "the canvas scroller moved; re-point this check");
  const thread = CANVAS.indexOf("{threadOpen && thread.length > 0 && (");
  assert.ok(thread > scroller, "the thread is not inside the canvas scroller");
  const fade = CANVAS.indexOf("<CanvasFade contentKey={surfaceKey}>");
  assert.ok(thread < fade, "the thread is drawn below the live answer instead of above it");
  const block = CANVAS.slice(thread, thread + 400);
  assert.ok(!/absolute inset-0/.test(block), "the thread is an overlay again");
  assert.ok(!/data-canvas-view="conversation"/.test(CANVAS), "the retired overlay is back");
});

test("🔴🔴 a turn in the thread renders with the LIVE answer's own components", () => {
  // Every item on the owner's list, by name. A turn drawn from stored text has none of them.
  for (const [what, needle] of [
    ["the visualizations", "<SemanticVisual"],
    ["the source pills and favicons", "<CanvasSourceCards"],
    ["the artifacts", "<ArtifactCard"],
    ["the learner's own bubble", "<LearnerUtterance"],
  ] as const) {
    assert.ok(TURN_CODE.includes(needle), `a past turn lost ${what}`);
  }
  // 🔴 THE SAME SPLITTER, so a drawing lands where the model put it rather than after the prose.
  assert.match(TURN_CODE, /replySegments\(turn\.reply, turn\.visuals\)/, "a past turn no longer places its drawings in order");
  // 🔴 AND THE SAME CITATION PATH — `namedCitations` is what turns `[1]` into an inline pill with a
  // favicon instead of leaving the digits in the prose.
  assert.match(TURN_CODE, /namedCitations/, "inline citations in a past turn are back to raw markers");
});

test("🔴 a past turn carries no control that acts on the present", () => {
  // Offers belong to the turn you are IN. `use-canvas-session.ts` already makes this argument about
  // `pending` living on the aside: a consent button under a turn from twenty minutes ago is the one
  // way such a control becomes genuinely dangerous.
  for (const forbidden of ["Learn this", "BACK_TO_LESSON", "onAdd", "pending", "selectableRegion"]) {
    assert.ok(!TURN_CODE.includes(forbidden), `a past turn offers \`${forbidden}\``);
  }
});

test("🔴🔴 the thread writes nothing", () => {
  for (const forbidden of ["recordMoment", "session.", "policy.", "respond", "submit", "update("]) {
    assert.ok(!TURN_CODE.includes(forbidden), `the thread reaches for \`${forbidden}\``);
  }
});

// ── what the Canvas view is FOR ─────────────────────────────────────────────────────────────

test("🔴🔴 the learner's prompt is the ONE thing the Canvas view drops", () => {
  // Owner: *"just make the canvas the one where it doesn't show the user's prompt. It just shows
  // the output."* Expressed exactly once, on the live turn's own bubble — the whole difference
  // between the two views. Calibration: drop `threadOpen &&` and the Canvas shows the prompt.
  assert.match(
    CANVAS,
    /\{threadOpen && currentSaid\?\.trim\(\) && \(/,
    "the learner's message is no longer gated on the view — the Canvas is showing the prompt again",
  );
  // And the thread itself is the same gate, so the two cannot drift apart.
  assert.match(CANVAS, /\{threadOpen && thread\.length > 0 && \(/);
});

test("🔴🔴🔴 nothing a learner can DO is conditioned on the view", () => {
  // THE fence, and it survives the chat becoming the default. Owner: *"keep the composer the same.
  // Don't make a new composer and all the modes as well."* A view decides what is DRAWN; the moment
  // it decides what may be done it is a mode, and `canvas-has-no-modes` records what that costs.
  const uses = [...CANVAS.matchAll(/[^\w.](?:threadOpen|view)\b/g)].map((m) =>
    CANVAS.slice(CANVAS.lastIndexOf("\n", m.index) + 1, CANVAS.indexOf("\n", m.index)).trim(),
  );
  assert.ok(uses.length > 0, "the view is not wired at all; re-point this check");
  for (const line of uses) {
    for (const verb of [
      "showComposer",
      "composeSurface(",
      "composerIntent(",
      "answerSink(",
      "<CanvasComposer",
      "session.converse",
      "session.begin",
      "policy.",
      "onContinue",
      "placeholder",
    ]) {
      assert.ok(!line.includes(verb), `the view decides \`${verb}\` — that is a mode, not a view:\n    ${line}`);
    }
  }
});

test("🔴🔴 the composer was not touched, and neither was the character or the rail", () => {
  // There is no second surface for them to be missing from — that is the dividend of sharing one
  // scroller. Calibration: give the character a per-view anchor again and this reddens.
  //
  // 🔴 THE ANCHOR MOVED AND THE INVARIANT DID NOT. This pinned `#canvas-answer-end` because that
  // was where the character stood when #881 landed; it now stands on the composer (owner, hours
  // later: *"on top on the left of the chat composer"*). What this test is actually about is that
  // there is exactly ONE anchor, because a per-VIEW anchor is the shape of the bug it was written
  // against — so it pins the count and the absence, and names the anchor only to say which one.
  assert.match(CANVAS, /anchor="#canvas-composer"/, "the character stopped anchoring to the composer");
  assert.equal(CANVAS.match(/\n\s*anchor="#[^"]+"/g)?.length, 1, "the character has more than one anchor again — there is only one scroller now");
  assert.ok(!/canvas-conversation-end/.test(CANVAS), "a second character anchor survives");
});

// ── the thread is live, not a replay ────────────────────────────────────────────────────────

test("🔴🔴 a turn is filed with its payload when the NEXT turn starts", () => {
  // "Finished" is not an event a surface can observe: an answer streams and its last token is not a
  // signal. Filing on the next turn is also what guarantees the newest answer is drawn exactly once
  // — by the live region, never also by the thread. Calibration: file it in the `finally` instead
  // and the newest answer appears twice.
  const at = CANVAS.indexOf("const converse = useCallback");
  const body = CANVAS.slice(at, CANVAS.indexOf("[policy.decision, remember, session, surroundings]", at));
  assert.match(body, /const outgoing = onScreen\.current;/, "the outgoing turn is no longer read");
  assert.match(body, /setThread\(\(past\) => \[/, "nothing is filed into the thread");
  assert.match(body, /visuals: outgoing\.aside\?\.visuals \?\? \[\]/, "a filed turn loses its drawings");
  assert.match(body, /sources: outgoing\.aside\?\.sources \?\? outgoing\.aside\?\.consulted \?\? \[\]/, "a filed turn loses its sources");
  assert.match(body, /output: outgoing\.output/, "a filed turn loses what it made");
  // `shown` is the learner's own words: what they typed, or the note they wrote on a document when
  // the reader handed one over (annotation-finish.test.ts). Never the machine-written prompt.
  assert.match(body, /setCurrentSaid\(shown\)/, "the learner's words are not kept above the answer");
});

test("🔴 the learner's message is not cleared when the answer lands", () => {
  // In a chat your message stays above the answer it produced. The version this replaces cleared it
  // in a `finally`, which was correct for a transient "sending…" line and wrong for a transcript.
  assert.ok(!/setPendingSaid/.test(CANVAS), "the transient pending line is back");
});

test("🔴🔴 the thread is SEEDED from the log once, never derived from it", () => {
  // Recomputing from `canvas.moments` on every render would throw every payload away the instant an
  // autosave replaced the canvas object — which is exactly the defect the payload exists to fix.
  assert.match(CANVAS, /if \(seededFor\.current === canvas\.id\) return;/, "the thread is derived rather than seeded");
  assert.match(CANVAS, /restored: true,/, "a rebuilt turn no longer says it came from the record");
});

test("🔴🔴 the newest stored turn is held back ONLY when the session put it back on screen", () => {
  // FOUND ON SCREEN, not by a unit test: four moments, three turns, and the last question simply
  // gone. `use-canvas-session.ts` restores `lastThingSaid` into the live region only on a canvas
  // with no blocks; holding it back unconditionally deleted a turn on every canvas holding a lesson.
  assert.match(CANVAS, /const liveShowsLast = canvas\.blocks\.length === 0;/, "the hold-back is unconditional again");
});

test("🔴 the options menu did not survive anywhere, and neither did its rows' machinery", () => {
  // Owner, 2026-08-30, pointing at the open panel: *"remove this entire panel."* Every row's
  // feature died with it — the tombstone in canvas-controls.tsx carries the words. This pins the
  // ABSENCES a partial revert would resurrect first.
  const controls = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const header = strip(readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8"));
  assert.ok(!/export function OptionsMenu/.test(controls), "the options menu is back");
  assert.ok(!/OptionsMenu|MinimapControl/.test(header.replace(/import[^;]+;/g, "")), "the header mounts a dead control again");
  assert.ok(!/LEARNING_STYLE|LearningStyle/.test(controls), "the teaching-style picker is back");
  // 🔴 The view switch is deliberately NOT on this list any more: the owner ordered it back the
  // same evening (*"there should be a way to chat mode to canvas mode"*) — as a visible header
  // glyph, never as a menu. The two tests above this one are its fence; what stays banned here
  // is the MENU it used to hide in.
  assert.ok(!/MenuItem[\s\S]{0,200}canvasViewAction/.test(controls), "the view switch crawled back into a menu row");
});

test("🔴🔴 every control in the floating strip can actually be clicked", () => {
  // 🔴 THIS SHIPPED BROKEN AND ONLY A BROWSER FOUND IT. The strip is `pointer-events-none` so it
  // does not swallow presses meant for the page under it, and each child must switch clicks back
  // on. `CONTROL` did not, and `OptionsControl` applies it directly — so the READ-ALOUD TOGGLE was
  // unclickable in production. Fixed in the constant so a control added later inherits a working
  // one. Calibration: drop the utility from `CONTROL` and this reddens.
  const controls = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const at = controls.indexOf("const CONTROL =");
  assert.ok(at > 0, "the shared control box is gone");
  assert.match(controls.slice(at, at + 200), /pointer-events-auto/, "the header controls are dead again");
});

test("🔴 every glyph on the header's surviving controls exists in the icon font", () => {
  // A `Codicon` whose name is not in the font still measures, still takes clicks, and draws
  // nothing. This used to check the one glyph inside the `⋯` menu; the menu is gone
  // (2026-08-30), so it now sweeps every named glyph in the two files that draw this corner —
  // strictly wider than what it replaces.
  const css = readFileSync(new URL("../../../../../node_modules/@vscode/codicons/dist/codicon.css", import.meta.url), "utf8");
  for (const file of ["./canvas-controls.tsx", "./course-map.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const names = [...source.matchAll(/<Codicon name="([a-z-]+)"/g)].map((hit) => hit[1]);
    assert.ok(names.length > 0, `${file} draws no named glyph at all`);
    for (const name of names) {
      assert.ok(css.includes(`.codicon-${name}:before`), `codicon-${name} (${file}) is not in the font`);
    }
  }
});
