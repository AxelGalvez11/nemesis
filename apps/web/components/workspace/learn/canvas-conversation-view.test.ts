import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CANVAS_VIEW_STORAGE_KEY,
  DEFAULT_CANVAS_VIEW,
  canvasViewAction,
  otherCanvasView,
  readCanvasView,
} from "@/lib/learn/canvas-view";

// 🔴🔴🔴 THE ONE THING THIS FILE EXISTS FOR: THE CONVERSATION VIEW MUST NEVER BECOME A MODE.
//
// Owner, 2026-08-26, correcting his own first sentence within the same turn: he asked for *"a mode
// so that users can switch from regular chat conversation history mode to Canvas mode"*, then
// immediately: *"Like, it shouldn't be a different mode. It should just be, like, a different view,
// a different way to view outputs."*
//
// That correction is the same ruling `canvas-has-no-modes` records from earlier the same day, when
// the composer's "answer state" was deleted: *"A mode is a claim about what you may do; the intent
// is a fact about what you are doing, and only one of those belongs on screen."* The answer state
// was not one decision — it was three small, individually defensible ones (the `+` removed, a
// button added, the placeholder and send label rewritten) that together turned a conversation into
// a form. A mode does not arrive; it accretes.
//
// So the assertions below are not about how the conversation LOOKS. They are the fence: this value
// may change what is DRAWN and nothing else. Every one is calibrated — the comment on each says
// what to break to redden it alone.

const HERE = import.meta.dirname;
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
/** Comments stripped, because a guard that matches its own explanation proves nothing. */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CANVAS = strip(read("./learning-canvas.tsx"));
const VIEW = read("./canvas-conversation-view.tsx");
const VIEW_CODE = strip(VIEW);
const HOOK = strip(read("./use-canvas-view.ts"));
const MODEL = strip(readFileSync(new URL("../../../lib/learn/canvas-view.ts", import.meta.url), "utf8"));

// ── a view changes what is drawn, and nothing else ──────────────────────────────────────────

test("🔴🔴🔴 nothing a learner can DO is conditioned on the view", () => {
  // THE fence. Each of these is a verb: what the composer offers, what submitting means, where an
  // answer is routed, which regions may share the sheet, what the teaching runtime does. If the
  // view ever reaches one of them it has stopped being a view — and it would reach exactly one at
  // first, for a defensible reason, exactly as the answer state did.
  //
  // Calibration: write `showComposer && view === "answer"`, or pass `view` to `composeSurface`,
  // `composerIntent`, `answerSink` or `CanvasComposer`, and this reddens alone.
  const uses = [...CANVAS.matchAll(/[^\w.](?:conversationOpen|view)\b/g)].map((m) => {
    const line = CANVAS.slice(CANVAS.lastIndexOf("\n", m.index) + 1, CANVAS.indexOf("\n", m.index));
    return line.trim();
  });
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
      assert.ok(
        !line.includes(verb),
        `the view decides \`${verb}\` — that is a mode, not a view:\n    ${line}`,
      );
    }
  }
});

test("🔴🔴 the composer is mounted on one condition, and the view is not in it", () => {
  // The composer being on screen is what keeps the conversation a place you can still speak from.
  // Stated positively as well as negatively, because "the view is absent from that line" passes
  // just as happily if the line itself has been deleted.
  assert.match(CANVAS, /const showComposer = /, "showComposer is gone; the composer's gate moved");
  const gate = CANVAS.slice(CANVAS.indexOf("const showComposer = "));
  const line = gate.slice(0, gate.indexOf("\n"));
  assert.ok(!/view|conversation/i.test(line), `the composer is gated on the view: ${line}`);
});

test("🔴🔴 the overlay sits UNDER everything the learner acts with", () => {
  // This is the mechanism behind the rule above, and it is a number rather than an intention. The
  // composer is `z-20`; the character, the header controls, the exit `×` and the History Rail are
  // `z-30`. An overlay at `z-10` therefore covers the CONTENT and nothing else — which is precisely
  // what "a different way to view the same session" has to mean physically.
  //
  // Calibration: raise this to z-20 or above and the composer goes behind the page it is meant to
  // be typing into.
  const at = CANVAS.indexOf("{conversationOpen && (");
  assert.ok(at > 0, "the conversation overlay is not mounted");
  const overlay = CANVAS.slice(at, at + 500);
  assert.match(overlay, /absolute inset-0 z-10/, "the conversation overlay is not at z-10");
  assert.ok(!/z-2\d|z-3\d/.test(overlay), "the conversation overlay is above a control the learner needs");
});

// ── it is a projection, not a second store ──────────────────────────────────────────────────

test("🔴🔴 the conversation is built from the moment log, through the same projection as the rail", () => {
  // A view with its own data would be a second answer to "what happened on this canvas", free to
  // disagree with the rail about the same session. `buildCanvasHistory` decides WHICH moments are
  // shown (it is where the synthesised "Canvas started" row was cut) and `reconstructMoment`
  // decides what each contains; walking `canvas.moments` here would bypass both.
  const at = CANVAS.indexOf("const conversationMoments = useMemo(");
  assert.ok(at > 0, "the conversation projection is gone");
  const body = CANVAS.slice(at, CANVAS.indexOf("}, [", at));
  assert.match(body, /history\s*\n?\s*\.map\(\(entry\) => reconstructMoment\(/, "the conversation no longer reconstructs the rail's own rows");
  assert.ok(!/canvas\.moments\.map\(/.test(body), "the conversation reads the raw moment list instead of the projection");
});

test("🔴 reconstructing every moment costs nothing in the default view", () => {
  // The memo re-runs whenever any of five arrays is replaced, which an autosave does on a
  // keystroke. Eighty reconstructions for a reader who is not reading is work with no audience.
  const at = CANVAS.indexOf("const conversationMoments = useMemo(");
  assert.match(CANVAS.slice(at, at + 200), /if \(view !== "conversation"\) return \[\];/, "the projection runs even when nothing shows it");
});

// ── read-only, exactly like the rewind ──────────────────────────────────────────────────────

test("🔴🔴 the conversation view has no way to write anything", () => {
  // Same list `canvas-history-surface.test.ts` holds over the rewound view, for the same reason:
  // learner state is a projection of an append-only table, and reading back through a canvas must
  // not be able to touch it. Held structurally rather than by care.
  for (const forbidden of ["recordMoment", "session.", "policy.", "respond", "submit", "update("]) {
    assert.ok(!VIEW_CODE.includes(forbidden), `the conversation view reaches for \`${forbidden}\``);
  }
});

test("🔴 it is not the Minimap and cannot become it", () => {
  // The Minimap answers "where am I in what I'm learning" from the learner model. This answers
  // "what happened here", from a log that provably cannot state anything about knowledge.
  assert.ok(!/canvas-minimap/.test(VIEW_CODE), "the conversation view reaches into the Minimap");
  assert.ok(!/learner-evidence|projectLearnerState/.test(VIEW_CODE), "the conversation view reads the learner model");
  assert.ok(!/territor/i.test(VIEW_CODE), "the conversation view reads territories, which are the Minimap's subject");
});

// ── the two ways of looking back do not stack ───────────────────────────────────────────────

test("🔴🔴 a rewind outranks the conversation, so two overlays are never on at once", () => {
  // Both are `z-10` absolute overlays; without a rule they would paint on top of each other. An
  // explicit act — clicking a marker, aimed at one moment — beats a standing preference.
  // Calibration: drop `!viewing` and a rewind renders over the conversation with no way to tell.
  assert.match(
    CANVAS,
    /const conversationOpen = view === "conversation" && !viewing &&/,
    "the conversation no longer yields to a deliberate rewind",
  );
});

test("🔴🔴 it never paints an empty sheet", () => {
  // The preference is global, so a brand-new canvas would otherwise open onto a blank overlay with
  // a control offering to return you to a Canvas you could not see. Nothing recorded and nothing in
  // flight means there is no conversation yet.
  assert.match(
    CANVAS,
    /conversationMoments\.length > 0 \|\| Boolean\(pendingSaid\)/,
    "the conversation can open with nothing in it",
  );
  // And the control itself is absent until there is something to read, the same rule the Minimap
  // follows ("the map icon should only appear if there is a course active").
  assert.match(CANVAS, /const conversationOffered = history\.length > 0;/, "the switch is offered on an empty canvas");
  assert.match(CANVAS, /view=\{conversationOffered \? view : undefined\}/, "the header is handed a view with nothing behind it");
});

// ── sending from the conversation looks like sending ────────────────────────────────────────

test("🔴🔴 the learner's own sentence appears while the answer is still coming", () => {
  // A moment is recorded when the turn RESOLVES. Without this the learner sends a message and
  // watches the list they are reading do nothing — invisible on the answer view, because the
  // character is walking over the top of it, and glaring here.
  //
  // Calibration: delete `setPendingSaid(trimmed)` and this reddens.
  const at = CANVAS.indexOf("const converse = useCallback");
  const body = CANVAS.slice(at, CANVAS.indexOf("[policy.decision, remember, session, surroundings]", at));
  assert.match(body, /setPendingSaid\(trimmed\);/, "the pending sentence is never set");
  assert.match(body, /\} finally \{\s*setPendingSaid\(null\);/, "the pending sentence is not cleared on every exit");
  assert.match(VIEW, /<LearnerUtterance via=\{null\}>\{pendingSaid\}<\/LearnerUtterance>/, "the pending sentence is not drawn in the learner's own bubble");
});

test("🔴 the pending sentence is never recorded as a moment", () => {
  // It is a live line held for seconds, not a fact about the canvas. `recordMoment` is called with
  // the turn's own text; a second write from here would double every turn on the rail.
  const at = CANVAS.indexOf("session.recordMoment({");
  assert.ok(at > 0, "the turn is no longer recorded");
  assert.ok(
    !CANVAS.slice(at, at + 300).includes("pendingSaid"),
    "the pending line is being written into the moment log",
  );
  // 🔴 EXACTLY ONE PLACE SETS IT AND EXACTLY ONE CLEARS IT. A second setter is how a sentence gets
  // stranded on screen for the rest of the session: one path sets, another path returns early, and
  // the line outlives the turn it belonged to.
  assert.equal((CANVAS.match(/setPendingSaid\(trimmed\)/g) ?? []).length, 1, "more than one place sets the pending line");
  assert.equal((CANVAS.match(/setPendingSaid\(null\)/g) ?? []).length, 1, "more than one place clears the pending line");
});

// ── the character stands in the right place in both views ───────────────────────────────────

test("🔴🔴 the character's anchor follows whichever surface is being read", () => {
  // `place="under"` measures a zero-height marker. Left pointing at the answer view's marker while
  // the conversation is open, the character would stand at a spot on a page nobody can see.
  assert.match(
    CANVAS,
    /anchor=\{conversationOpen \? "#canvas-conversation-end" : "#canvas-answer-end"\}/,
    "the character anchors to one view's marker in both views",
  );
});

test("🔴🔴 the conversation's marker has a WIDTH, and wears the answer marker's own classes", () => {
  // Both halves have already shipped as defects on `#canvas-answer-end`. A bare `h-0` div stretches
  // the whole scroller, so its `left` is 0 and the character lines up with the window instead of
  // the text — and the dock reads `width === 0` as "not laid out yet" for an `under` anchor and
  // falls back to the corner, which made the feature inert while looking implemented.
  assert.match(
    VIEW,
    /className="mx-auto h-0 w-full max-w-\(--canvas-column\) px-6"\s*\n?\s*id="canvas-conversation-end"/,
    "the conversation's character marker does not match the answer marker's geometry",
  );
  assert.match(
    CANVAS,
    /className="mx-auto h-0 w-full max-w-\(--canvas-column\) px-6" id="canvas-answer-end"/,
    "the answer marker changed shape; the conversation's copy has to follow it",
  );
});

// ── the preference is about the learner, not about the canvas ───────────────────────────────

test("🔴🔴 the choice is never written to the canvas", () => {
  // Looking at a canvas must not modify it — the rule the History Rail already states for
  // `rewound` ("the canvas is not modified by being read"). A field on the document would also
  // travel on every autosave and would make two people sharing a canvas fight over it.
  assert.ok(!/update\(\{[^}]*view/.test(CANVAS), "the view is being written into the canvas document");
  assert.ok(!MODEL.includes("canvas.document"), "the view model reaches into the canvas document");
  assert.match(HOOK, /window\.localStorage/, "the preference is not kept in the browser");
  assert.match(MODEL, new RegExp(`"${CANVAS_VIEW_STORAGE_KEY.replace(/\./g, "\\.")}"`), "the storage key moved");
});

test("🔴🔴 every storage access is guarded, because localStorage THROWS", () => {
  // Not "returns null" — throws, in a private window, with site data blocked, and inside a
  // cross-origin frame. An unguarded read takes out the product's primary page to remember a
  // preference. Calibration: remove either try/catch and this reddens.
  const reads = (HOOK.match(/window\.localStorage/g) ?? []).length;
  const guards = (HOOK.match(/\btry \{/g) ?? []).length;
  assert.ok(reads > 0, "the hook no longer touches storage");
  assert.equal(guards, reads, `${reads} storage accesses, ${guards} guards — one of them can take the Canvas down`);
});

test("🔴 the stored value is adopted in an effect, not read during render", () => {
  // Reading storage in the initialiser runs during hydration, where the server rendered the default
  // and the client would render something else: React discards the tree and warns. One frame of the
  // default is the cheaper wrong.
  assert.match(HOOK, /useState<CanvasView>\(DEFAULT_CANVAS_VIEW\)/, "the initial view is read from somewhere that can differ from the server");
  assert.match(HOOK, /useEffect\(\(\) => \{\s*try \{\s*setStateView\(readCanvasView\(window\.localStorage/, "the stored view is not adopted after mount");
});

// ── the model, as a pure function ───────────────────────────────────────────────────────────

test("🔴 the answer view is the default, and an unknown stored value falls back to it", () => {
  // localStorage is shared with every other tab, every previous version of this app, and anything
  // typed into a console. A key holding a future rename must land on the default, not throw.
  assert.equal(DEFAULT_CANVAS_VIEW, "answer");
  assert.equal(readCanvasView("conversation"), "conversation");
  assert.equal(readCanvasView("answer"), "answer");
  for (const junk of [null, undefined, "", "chat", "Conversation", "{}", "1"]) {
    assert.equal(readCanvasView(junk), "answer", `\`${String(junk)}\` did not fall back`);
  }
});

test("the switch is symmetric", () => {
  assert.equal(otherCanvasView("answer"), "conversation");
  assert.equal(otherCanvasView("conversation"), "answer");
  assert.equal(otherCanvasView(otherCanvasView("answer")), "answer");
});

test("🔴 the control's words name the DESTINATION, never where you already are", () => {
  // A toggle's label is a promise about the next click. Labelled with the current state, it is
  // indistinguishable from one labelled with where it goes — and the two mean opposite things.
  assert.match(canvasViewAction("answer"), /whole conversation/i);
  assert.match(canvasViewAction("conversation"), /one answer/i);
  assert.notEqual(canvasViewAction("answer"), canvasViewAction("conversation"));
});

test("🔴 the control says the same thing to a screen reader, a mouse and a test", () => {
  // Three copies of one sentence is three chances for two of them to drift.
  const controls = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const at = controls.indexOf("export function ConversationControl");
  assert.ok(at > 0, "the view switch is gone");
  // 🔴 THE NEXT `export function`, NOT THE NEXT `\n}` — the destructured props close with `}: {`,
  // so a brace-based end lands three lines into the signature and every assertion below passes or
  // fails on the wrong text.
  const body = controls.slice(at, controls.indexOf("export function", at + 20));
  assert.match(body, /const action = canvasViewAction\(view\);/, "the control writes its own wording");
  assert.match(body, /aria-label=\{action\}/);
  assert.match(body, /title=\{action\}/);
  assert.match(body, /aria-pressed=\{showingConversation\}/, "the control does not report which view is on");
});

test("🔴 the switch is the reference's own control geometry, like every other glyph in that row", () => {
  // `header-matches-reference.test.ts` pins 36×36, a 20px glyph and an 8px radius, measured off
  // ChatGPT. A fourth control that missed them would be visibly the odd one out.
  const controls = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
  const at = controls.indexOf("export function ConversationControl");
  const body = controls.slice(at, controls.indexOf("export function", at + 20));
  assert.match(body, /className=\{cn\(CONTROL,/, "the switch does not use the shared control box");
  assert.match(body, /size="20px"/, "the switch's glyph is not the reference size");
});

test("🔴 the glyph exists in the icon font", () => {
  // A `Codicon` whose name is not in the font still measures, still takes clicks, and draws
  // nothing — a control that looks broken rather than absent. Checked against the stylesheet that
  // globals.css imports, so a font upgrade that renamed it reddens here rather than on screen.
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  const at = controls.indexOf("export function ConversationControl");
  const named = /<Codicon name="([a-z-]+)"/.exec(controls.slice(at));
  assert.ok(named, "the switch draws no glyph");
  const css = readFileSync(
    new URL("../../../../../node_modules/@vscode/codicons/dist/codicon.css", import.meta.url),
    "utf8",
  );
  assert.ok(css.includes(`.codicon-${named[1]}:before`), `codicon-${named[1]} is not in the font`);
});

void HERE;
