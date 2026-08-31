import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CANVAS_VIEW_STORAGE_KEY,
  DEFAULT_CANVAS_VIEW,
  canvasViewAction,
  otherCanvasView,
} from "@/lib/learn/canvas-view";

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
const HOOK = strip(read("./use-canvas-view.ts"));
const MODEL = strip(readFileSync(new URL("../../../lib/learn/canvas-view.ts", import.meta.url), "utf8"));

// ── the chat is the front door ──────────────────────────────────────────────────────────────

test("🔴🔴🔴 the chat is the default, and the Canvas is the option", () => {
  // The owner's reversal, in one value. Calibration: put `answer` back and this reddens alone.
  assert.equal(DEFAULT_CANVAS_VIEW, "conversation");
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
  assert.match(body, /setCurrentSaid\(trimmed\)/, "the learner's words are not kept above the answer");
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

// ── the choice lasts while you look, and nothing else ───────────────────────────────────────
//
// 🔴🔴🔴 THE STORED VIEW IS DEAD, AND THESE TESTS ARE WRITTEN SO RESTORING IT REDDENS THEM.
// Persisting the toggle produced the same owner report three times over four days ("chat mode not
// showing conversation history"): one click of "Focus on the latest output" pinned `answer` for
// every canvas on every visit, invisibly, while the thread worked the whole time. Reproduced on
// screen 2026-08-30 — four recorded turns, none drawn. The account lives on
// `CANVAS_VIEW_STORAGE_KEY`'s doc; what follows is the enforcement.

test("🔴🔴🔴 every canvas opens on the conversation, because nothing stored can say otherwise", () => {
  // Both halves matter. The default IS the conversation — and the hook has no way to start
  // anywhere else, because its state initialises from the constant and nothing reads storage.
  assert.equal(DEFAULT_CANVAS_VIEW, "conversation");
  assert.match(HOOK, /useState<CanvasView>\(DEFAULT_CANVAS_VIEW\)/, "the view no longer starts on the default");
  assert.ok(!/getItem/.test(HOOK), "the hook is reading a stored view again — the invisible pin is back");
  assert.ok(!/readCanvasView/.test(HOOK) && !MODEL.includes("readCanvasView"), "the stored-view reader has been rebuilt");
});

test("🔴🔴 the toggle is never persisted, anywhere", () => {
  // To the browser: one click must not outlive the visit. To the canvas: merely looking at a
  // canvas must not modify it (the History Rail's own rule for `rewound`).
  assert.ok(!/setItem/.test(HOOK), "the toggle writes to storage again — one click will outlive the visit");
  assert.ok(!/update\(\{[^}]*view/.test(CANVAS), "the view is being written into the canvas document");
  assert.ok(!MODEL.includes("canvas.document"), "the view model reaches into the canvas document");
});

test("🔴🔴 the old pin is deleted on mount, and that is the ONE storage access left", () => {
  // Browsers that ran the persisting build still hold `answer` under the key. Leaving it there
  // invites some future reader to trust it; removal heals every one of them, including the three
  // reports' own browser.
  assert.match(HOOK, /removeItem\(CANVAS_VIEW_STORAGE_KEY\)/, "the healer is gone and stale pins live for ever");
  assert.equal((HOOK.match(/window\.localStorage/g) ?? []).length, 1, "a second storage access appeared — this feature is allowed exactly one, the healer");
  assert.match(MODEL, new RegExp(`"${CANVAS_VIEW_STORAGE_KEY.replace(/\./g, "\\.")}"`), "the key moved, so the healer deletes the wrong thing");
});

test("🔴🔴 the one storage access is guarded, because localStorage THROWS", () => {
  // Not "returns null" — throws, in a private window, with site data blocked, and inside a
  // cross-origin frame. An unguarded touch takes out the product's front door to tidy a dead key.
  const touches = (HOOK.match(/window\.localStorage/g) ?? []).length;
  const guards = (HOOK.match(/\btry \{/g) ?? []).length;
  assert.ok(touches > 0, "the healer no longer touches storage");
  assert.equal(guards, touches, `${touches} storage accesses, ${guards} guards — one can take the Canvas down`);
});

// ── the model, as a pure function ───────────────────────────────────────────────────────────

test("the switch is symmetric", () => {
  assert.equal(otherCanvasView("answer"), "conversation");
  assert.equal(otherCanvasView("conversation"), "answer");
});

test("🔴 the control's words name the DESTINATION, never where you already are", () => {
  assert.match(canvasViewAction("answer"), /whole conversation/i);
  assert.match(canvasViewAction("conversation"), /focus/i);
  assert.notEqual(canvasViewAction("answer"), canvasViewAction("conversation"));
});

test("🔴 the view switch is a glyph on the row again, wording intact (owner 2026-08-30)", () => {
  // The morning fold into the `⋯` lasted one day — by evening: *"there should be a way to chat
  // mode to canvas mode"*; a door is not a door when it is behind another door. What must not
  // move: `canvasViewAction` still writes the words (the tooltip and a screen reader name the
  // DESTINATION), and the header still withholds the control until a conversation exists.
  const controls = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const at = controls.indexOf("export function CanvasViewControl");
  assert.ok(at > 0, "the view control is gone");
  const body = controls.slice(at, at + 900);
  assert.match(body, /canvasViewAction\(view\)/, "the control no longer writes its wording through canvasViewAction");
  assert.match(body, /aria-label=\{action\}/, "the control's accessible name is not the action's own words");
  assert.match(body, /onClick=\{onToggleView\}/, "the control does not actually switch the view");
  const header = strip(readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8"));
  assert.match(
    header,
    /\{view && onToggleView && <CanvasViewControl onToggleView=\{onToggleView\} view=\{view\} \/>\}/,
    "the header stopped gating the door on a conversation existing",
  );
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

test("🔴 every glyph the row's controls draw exists in the icon font", () => {
  // A `Codicon` whose name is not in the font still measures, still takes clicks, and draws
  // nothing. The view door's two names sit in a ternary, so they are checked by name.
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  const viewControl = controls.slice(controls.indexOf("export function CanvasViewControl"));
  assert.match(viewControl, /view === "conversation" \? "output" : "comment-discussion"/, "the door's glyphs changed — repoint the font check");
  const css = readFileSync(new URL("../../../../../node_modules/@vscode/codicons/dist/codicon.css", import.meta.url), "utf8");
  for (const name of ["ellipsis", "output", "comment-discussion"]) {
    assert.ok(css.includes(`.codicon-${name}:before`), `codicon-${name} is not in the font`);
  }
});
