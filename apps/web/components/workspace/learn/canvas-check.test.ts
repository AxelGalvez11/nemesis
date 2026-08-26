import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cardsFromMisses, describeAttempt, type TestRun } from "@/lib/learn/test-run";

/** Two questions, one answered wrongly and one skipped — enough to exercise every branch. */
const RUN: TestRun = {
  questions: [
    { objectiveIdentityKey: "a", options: [{ correct: true, text: "right" }, { correct: false, text: "wrong" }], prompt: "Q1?" },
    { objectiveIdentityKey: "b", options: [{ correct: true, text: "yes" }, { correct: false, text: "no" }], prompt: "Q2?" },
  ],
};

// ── the test card on the canvas: where it may appear, and what it may take over ──────────────
//
// 🔴🔴 THE INVARIANT THIS FILE DEFENDS IS `canvas-runtime-branch.test.ts`'s, NOT A NEW ONE. That
// file forbids `<CanvasRecall`, `<CanvasTest`, `<CanvasDiagnosis` and `<CanvasComplete` from ever
// appearing in `learning-canvas.tsx` again: they were six-stage renderers that REPLACED the page
// and each claimed the composer, and two on one screen meant two rivals for one input. The rule it
// states is *"never two answer surfaces on one composer"*.
//
// `CanvasCheck` is deliberately outside that ban — it composes on top of the material and takes
// answers by TAP ONLY — but "outside the ban" is a claim that has to be held, not asserted once in
// a comment. These tests hold it.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CHECK = strip(readFileSync(new URL("./canvas-check.tsx", import.meta.url), "utf8"));
const CANVAS = strip(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));
const SESSION = strip(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));

test("🔴🔴 the check card never claims the composer", () => {
  // The clarification card DOES route the composer to itself (`composerIntent` returns "clarify").
  // This one must not: a learner mid-test still has an ordinary composer for ordinary questions,
  // and two surfaces competing for one input is precisely what the runtime-branch ban exists for.
  assert.ok(!/composerIntent|answerSink|awaitingAnswer/.test(CHECK), "the check card started reaching for the composer's routing");
  assert.ok(!/<input|<textarea/i.test(CHECK), "the check card grew a text box, which is a second composer wearing a card");
});

test("🔴🔴 it never paints while the policy is already waiting on an answer", () => {
  // Calibration: drop `!policy.awaitingAnswer` and this reddens. A hosted task with a live question
  // plus a test card on the same screen is two things asking to be answered.
  const mount = CANVAS.slice(CANVAS.indexOf("session.testRequested &&"), CANVAS.indexOf("<CanvasCheck"));
  assert.ok(mount.length > 0, "the mount site moved — this guard is pointed at nothing");
  assert.match(mount, /!policy\.awaitingAnswer/, "the test card can now appear beside a live task question");
});

test("🔴 the banned stage names stay banned, and this card is not one of them", () => {
  assert.ok(!CANVAS.includes("<CanvasTest"), "the banned stage name is back in the canvas");
  assert.match(CANVAS, /<CanvasCheck/, "the check card is not mounted at all");
});

test("🔴🔴 a test is never a mode: every turn re-answers the question", () => {
  // §38 permits a test as a PHRASE precisely because it cannot become a state the learner sits
  // inside. Assigning the decision's value (rather than only ever setting it true) is what makes
  // that structural: the next turn clears it whether or not anyone remembered to.
  assert.match(SESSION, /setTestRequested\(decision\.wantsTest\)/, "a test request can now survive into the next turn");
  assert.ok(!/setTestRequested\(true\)/.test(SESSION), "something sets the test flag without a decision behind it");
});

test("🔴🔴 no question is marked while the test is still running", () => {
  // 🔴🔴 OWNER, 2026-08-24: *"I need that to just be one where the user does not immediately get
  // feedback until the end… that way it's not just like friction every time you click the answer."*
  //
  // The guard is on the QUESTION screen reading `correct` at all, not merely on the verdict
  // sentence, because the first version leaked the answer three other ways before it said a word:
  // the right row grew a ring, the wrong rows faded to 45% opacity, and every row went `disabled`.
  // A learner could see which one was right without reading anything. So: the question screen must
  // not branch on correctness, and the marking must live in `CheckResult`.
  assert.ok(!/option\.correct/.test(CHECK), "the question screen reads which option is correct — the answer leaks through styling");
  assert.ok(!/verdictFor\(/.test(CHECK), "the question screen is scoring a tap as it happens");
  assert.ok(!/groundedMiss\(/.test(CHECK), "a verdict sentence is back on the question screen");

  // …and the feedback genuinely moved rather than being deleted. It now lives in the account
  // `describeAttempt` writes for the model — score, every prompt, every pick, every answer.
  const account = describeAttempt(RUN, ["wrong", null]);
  assert.match(account, /0 out of 2/, "the account no longer carries the score");
  assert.match(account, /I answered "wrong", but the answer was "right"/, "the account hides what they picked or what was right");
  assert.match(account, /I skipped this one/, "an unanswered question is not reported as skipped");
});

test("🔴🔴 the run ends by handing the conversation an account, not by drawing a screen", () => {
  // 🔴 OWNER, 2026-08-24: *"at the end it shouldn't show anything… it's just up to DeepSeek to
  // report the results in its own words, not some kind of screen. I just want it to say, okay, you
  // got four out of five right, and here's the one you missed and why. That's more natural."*
  assert.ok(!/CheckResult/.test(CHECK), "the results screen is back");
  assert.ok(!/Make cards from what I missed/.test(CHECK), "the deck button came back with the screen");
  assert.match(CHECK, /onFinished\(describeAttempt\(run, answered\)\)/, "the last answer no longer hands over an account");

  // The canvas sends it as an ordinary turn, so it lands in the transcript and the packet.
  assert.match(CANVAS, /const finishCheck = useCallback/, "nothing receives the finished check");
  const finish = CANVAS.slice(CANVAS.indexOf("const finishCheck = useCallback"), CANVAS.indexOf("const finishCheck = useCallback") + 400);
  assert.match(finish, /session\.clearTest\(\);/, "the card is left on screen while the reply is fetched");
  assert.match(finish, /await converse\(account\)/, "the account never reaches the model");
});

test("🔴 one tap answers and advances — the second press was the friction", () => {
  // The old card demanded "Next question" after every tap, so a five-question run cost ten presses.
  assert.ok(!/Next question/.test(CHECK), "the extra press per question is back");
  assert.ok(!/See how you did/.test(CHECK), "the extra press before the results is back");
  const answer = CHECK.slice(CHECK.indexOf("const answer = ("), CHECK.indexOf("return (", CHECK.indexOf("const answer = (")));
  assert.match(answer, /setPicks\(/, "tapping an option no longer records the answer");
  assert.match(answer, /else setIndex/, "answering no longer advances to the next question");
  // 🔴 THE ACCOUNT IS BUILT FROM THE LOCAL VALUE, NOT FROM STATE. `setPicks` does not update the
  // captured `picks`, so reading state here would report the final question as skipped every time.
  assert.match(answer, /Object\.assign\(\[\.\.\.picks\]/, "the last tap is no longer folded in before the account is written");
  assert.ok(!/describeAttempt\(run, picks\)/.test(answer), "the account is built from stale state — the last answer will read as skipped");
});

test("🔴 a mis-tap is recoverable, because deferred marking is what made it invisible", () => {
  // While each tap was marked instantly, hitting the wrong row was obvious immediately. Deferring
  // the marking removes that signal, so the way back has to be explicit — otherwise this change
  // quietly turns a slip into a wrong answer the learner cannot see until the results.
  // 🔴 REPOINTED 2026-08-26 FROM THE BUTTON TO THE PROPERTY. This pinned a control literally
  // labelled `Back`, which was the way back until the card took Claude's numbered pips (owner:
  // *"they should both bring up a proper component like in Claude code or like in Claude dot AI
  // did"*). The pips ARE the way back, and they also say where you are, so one control replaced
  // one-and-a-half. What must never go is the ability to return to a question already answered.
  assert.match(CHECK, /onClick=\{\(\) => setIndex\(at\)\}/, "there is no way back after a mis-tap");
  // 🔴 AND ONLY BACKWARDS. Jumping ahead lets a learner read question eight before answering one,
  // which is not a navigation preference — it is reading the whole test before committing to any
  // of it.
  assert.match(CHECK, /disabled=\{at >= index\}/, "the learner can skip ahead and read the test before answering it");
});

test("🔴 no deck is written behind the learner's back when a check ends", () => {
  // 🔴 THE "Make cards from what I missed" BUTTON WENT WITH THE RESULTS SCREEN (owner,
  // 2026-08-24). The rule it enforced outlives it and is the one worth keeping: a check must not
  // put an artifact in the Library on its own. Previously that was guaranteed by the write being
  // behind a press; now it is guaranteed by there being no write at all on this path.
  const finish = CANVAS.slice(CANVAS.indexOf("const finishCheck = useCallback"), CANVAS.indexOf("const finishCheck = useCallback") + 400);
  assert.ok(finish.length > 0, "the finish handler is gone — this guard is pointed at nothing");
  assert.ok(!/ensureCanvasDeck|writeRecallCards/.test(finish), "finishing a check silently writes a deck");
  // A learner who wants cards asks for them in words, the same rule §38 applies everywhere here.
  assert.ok(!/cardsFromMisses/.test(CHECK), "the check card is minting cards again");
});

test("cardsFromMisses turns the exact question they failed into the card", () => {
  const run: TestRun = {
    questions: [
      { objectiveIdentityKey: "a", options: [{ correct: true, text: "right" }, { correct: false, text: "wrong" }], prompt: "Q1?" },
      { objectiveIdentityKey: "b", options: [{ correct: true, text: "yes" }, { correct: false, text: "no" }], prompt: "Q2?" },
    ],
  };
  assert.deepEqual(cardsFromMisses(run, ["b"]), [{ back: "yes", front: "Q2?", objectiveIdentityKey: "b" }]);
  assert.deepEqual(cardsFromMisses(run, []), []);
  // One objective, one card, however many times it was asked.
  assert.equal(cardsFromMisses(run, ["a", "a"]).length, 1);
});

test("🔴 a question with no correct option produces no card rather than a blank one", () => {
  const broken: TestRun = {
    questions: [{ objectiveIdentityKey: "a", options: [{ correct: false, text: "one" }], prompt: "Q?" }],
  };
  assert.deepEqual(cardsFromMisses(broken, ["a"]), [], "a card with an empty back reached the deck");
});

// ── one question giving way to the next ────────────────────────────────────────────────────────

test("🔴🔴 the next question FADES UP; the card it sits in does not move", () => {
  // Owner 2026-08-26: *"I want there to be a smoother animation when a user clicks an answer, so it
  // fades into the next question."* The swap was instantaneous before this: the words under the
  // learner's cursor were replaced between two frames.
  //
  // 🔴 THE KEY IS THE MECHANISM, NOT DECORATION. A CSS animation runs when an element is CREATED.
  // Without `key={index}` React edits the same nodes in place, the class stays put, and the
  // animation never runs again after the card first arrives — the feature would look implemented
  // and do nothing, which is exactly how the `place="under"` anchor shipped inert on #874.
  const wrapper = /<div className="canvas-question-in" key=\{index\}>/;
  assert.match(CHECK, wrapper, "the per-question fade wrapper is gone, or lost the key that makes it run");

  // 🔴 AND IT WRAPS ONLY THE QUESTION. The pips say where you are and the ✕ leaves; re-mounting
  // them on every tap would blink the frame the learner is working inside and reset focus.
  const opened = CHECK.indexOf('<div className="canvas-question-in"');
  assert.ok(CHECK.indexOf("</ol>") < opened, "the progress pips moved inside the fading block");
  assert.ok(CHECK.indexOf("onClick={onDismiss}") < opened, "the dismiss control moved inside the fading block");
  assert.ok(CHECK.indexOf("{question.prompt}") > opened, "the question itself is no longer inside the fading block");
});

test("🔴 the fade is CSS the reduced-motion block already covers, and it costs the advance nothing", () => {
  const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(CSS, /@keyframes canvas-question-in/, "the keyframes are gone; the class now names nothing");
  // Somebody who asked the browser to stop moving things gets a plain swap, like every other
  // animation in this file.
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.includes(".canvas-question-in"), "the question fade is not in the reduced-motion block");

  // 🔴 NO TIMER, WHICH IS THE POINT. A cross-fade would have to hold the old question up while the
  // new one arrives, and every millisecond of that lands on somebody who has already decided. The
  // owner's 2026-08-24 rule is that one tap answers AND advances, without friction.
  const answer = CHECK.slice(CHECK.indexOf("const answer = (text: string)"), CHECK.indexOf("const frame = useRef"));
  assert.ok(answer.length > 0, "the answer handler is gone — this guard is pointed at nothing");
  assert.ok(!/setTimeout|requestAnimationFrame|await /.test(answer), "the advance now waits on a timer");
});
