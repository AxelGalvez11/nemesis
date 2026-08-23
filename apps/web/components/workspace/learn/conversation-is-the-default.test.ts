import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 `hello` STARTED A LESSON, AND THAT IS WHAT THIS FILE GUARDS.
//
// The canvas read every typed message with a regex classifier before any model saw it
// (`lib/learn/learning-intent.ts`, deleted). Its last rule was: text that is not a question is a
// topic, so teach it. So `hello` meant "teach me the topic hello" — a lesson, a re-titled canvas,
// and no reply. Every fix inside that design is another word list.
//
// These are wiring guards, not semantics. They prove the ordinary path REACHES THE MODEL and that
// no branch ahead of it can decide what the learner meant. Whether the model then understands
// `hello`, `yo`, `this sucks` or `innate immunity` is measured against the real model by
// `scripts/conversation-acceptance.ts` — a unit test asserting it would be testing nothing.
//
// 🔴 EACH ASSERTION IS CALIBRATED. Restoring the classifier — a `readTurnIntent` import, a
// `kind !== "teach"` branch, or a `session.begin(text)` on the ordinary path — reddens exactly the
// named test below and nothing else.

const canvasSource = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");

/** Comments stripped, because a guard that matches its own warning proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const canvas = code(canvasSource);
const session = code(sessionSource);

test("🔴🔴 the deleted classifier has not come back", () => {
  for (const ghost of ["readTurnIntent", "learning-intent", "intentFor", "askGeneral", "isOrdinaryChatQuestion"]) {
    assert.ok(!canvas.includes(ghost), `the canvas is reading the learner with "${ghost}" again`);
    assert.ok(!session.includes(ghost), `the session is reading the learner with "${ghost}" again`);
  }
});

test("🔴🔴 the front door hands the utterance to the model, and never starts a lesson from it", () => {
  const front = canvas.slice(canvas.indexOf("const beginOrAnswer = useCallback"));
  const body = front.slice(0, front.indexOf("\n  );"));
  // 🔴 `[,)]`, because the call legitimately grew arguments: `converse(trimmed, null, withCapability)`
  // carries the one-shot Course declaration down the SAME call as the words (owner, 2026-08-23 —
  // "structured intent on the same submission pipeline"). What this still pins is that the trimmed
  // text is the first argument of a real model call on the front-door path.
  assert.match(body, /converse\(trimmed[,)]/, "typed text no longer reaches the model at the front door");
  // The ONE `begin` left on this path is the empty send with material staged, which carries no
  // utterance for a model to read. A `begin(trimmed)` or `begin(asked)` here is the defect.
  assert.match(body, /session\.begin\(undefined\)/, "the empty-send-with-material route is gone");
  assert.ok(
    !/session\.begin\((?!undefined)/.test(body),
    "the front door is starting a lesson from what the learner typed again",
  );
});

test("🔴🔴 EVERY typed turn reaches the model before anything acts on it", () => {
  // Fixing one call site and not the other is how this bug half-survives: the front door and the
  // running canvas used to consult the same classifier from two places. The guarantee is now
  // stronger than it was — there is no branch left that reads the learner's words before the model
  // does. `submit` may act on its own only when there is nothing to read (an empty send) or nothing
  // to decide (several passages staged and an instruction typed about exactly them).
  const submit = canvas.slice(canvas.indexOf("const submit = useCallback"));
  const body = submit.slice(0, submit.indexOf("\n    [applyExplanationEvent"));
  const beforeModel = body.slice(0, body.indexOf("await converse("));
  assert.ok(beforeModel.length > 0, "the model call left `submit` entirely");
  // The only two branches allowed to return before the model has spoken.
  assert.match(beforeModel, /if \(!text\.trim\(\) && only\)/, "the empty-send-with-a-passage route was removed");
  assert.match(beforeModel, /if \(selected\.length > 1\)/, "the multi-selection scoped edit was removed");
  // 🔴 AND NOTHING IN THERE READS WHAT THEY TYPED. `text` may be tested for being EMPTY, which is a
  // fact about the turn; the moment it is matched against words, the classifier is back.
  assert.ok(
    !/\/[^\n/]+\/[a-z]*\.test\(text\)/.test(beforeModel),
    "a regex is reading the learner's words ahead of the model again",
  );
  assert.ok(
    !/text\.(?:includes|startsWith|endsWith|match|search|toLowerCase)\(/.test(beforeModel),
    "the learner's words are being inspected ahead of the model again",
  );
});

test("🔴 what the canvas still decides for itself, because it already knows it", () => {
  // The model is asked what the learner MEANT. It is never asked things the canvas already knows —
  // which passage is active, whether a demonstration is owed, whether there is material at all.
  const submit = canvas.slice(canvas.indexOf("const submit = useCallback"));
  const body = submit.slice(0, submit.indexOf("\n    [applyExplanationEvent"));
  assert.match(body, /decision\?\.then === "rewrite"/, "the model can no longer ask for a rewrite");
  assert.match(body, /routeRewrite\(/, "the referent is being guessed rather than read");
  assert.match(body, /routing\.kind === "rewrite"/, "an explicit rewrite no longer rewrites");
  assert.match(body, /routing\.kind === "refused"/, "a refusal is silent again");
  assert.match(body, /session\.askAbout\(only, EXPLAIN_THIS\)/, "the staged-selection route was removed");
  // The policy guard outranks the model: a rewrite asked for while a question is live would hand
  // the learner the answer to it.
  assert.match(body, /awaitingDemonstration: policy\.awaitingAnswer/);
});

test("🔴🔴 the invariant above all of this is untouched", () => {
  // If Nemesis is visibly asking a question, submitting is an ANSWER — decided before any of the
  // above runs, by composerIntent, with no model in the loop. See composer-intent.test.ts.
  assert.match(canvas, /const intent = composerIntent\(\{/);
  assert.match(canvas, /intent\.kind === "answer" && intent\.sink === "policy"/);
});

test("🔴 the canvas picks the mechanism for a study turn, not the model", () => {
  const converse = session.slice(session.indexOf("const converse = useCallback"));
  // 🔴 THE ANCHOR ITSELF IS ASSERTED. If `converse`'s dependency array ever changes shape, the
  // slice below silently becomes nearly the whole file and every assertion after it passes by
  // matching unrelated text — a guard that cannot fail. Fail loudly on the anchor instead.
  assert.notEqual(converse.indexOf("\n    [begin, command"), -1, "converse's dep-array anchor moved — update this test deliberately");
  const body = converse.slice(0, converse.indexOf("\n    [begin, command"));
  assert.match(body, /decision\.then === "study"/);
  assert.match(body, /isPreContent\(latest\.current\.state\)/, "the begin/command choice is not read off canvas state");
  // 🔴 THE MODEL'S SUBJECT OR NOTHING, NEVER THE RAW SENTENCE. Falling back to `said` titled the
  // canvas with the learner's whole utterance ("teach me innate immunity") and then web-searched
  // that phrase — which is what `groundingQuery`'s five layers of prefix-stripping existed to undo.
  assert.match(body, /begin\(decision\.topic \?\? undefined\)/);
  assert.ok(!/begin\(decision\.topic \?\? said\)/.test(body), "the raw utterance is a canvas title again");
  assert.match(body, /await command\(said, staged \? \[staged\] : \[\]\)/);
});

test("🔴 there is no Learn this offer under a reply at all", () => {
  // 🔴 THIS TEST OUTLIVED ITS FEATURE, AND THE HONEST VERSION IS THE INVERSE OF WHAT IT WAS.
  //
  // It began as "the offer keys on the SUBJECT the model read, never on the mere fact that a turn
  // happened", which put a stop to a "Learn this" button under "Hello. What can I do for you?".
  // That was the right narrowing at the time and it was not enough: nearly every real question
  // names a subject, so the button still sat under nearly every answer, and the owner asked about
  // it twice. It was deleted on 2026-08-20.
  //
  // What survives is the rule underneath it, which was never about a button: a turn is worth
  // teaching because of the SUBJECT it named, and `topic` — not `question` — is where that lives.
  // So this now checks the offer is gone AND that `topic` is still what the session reads.
  assert.ok(!/Learn this/.test(canvas), "the Learn this offer is back");
  assert.ok(
    !/\{session\.aside\.question && \(/.test(canvas),
    "something is gated on a turn merely having happened",
  );
  assert.match(session, /topic: decision\.topic \?\? undefined/, "the subject the model read is no longer kept");
  assert.ok(
    !/\{session\.aside\.question && \(/.test(canvas),
    "the offer is back on `question`, which every turn has — including a greeting",
  );
  assert.match(session, /topic: decision\.topic \?\? undefined/, "the model's subject never reaches the aside");
});

test("🔴 the conversation is remembered on both sides and sent", () => {
  // It was learner-only and never left the browser, which is why "why?" had nothing to resolve.
  assert.match(canvas, /conversation = useRef<TurnExchange\[\]>/);
  assert.match(canvas, /remember\(\{ replied: decision\?\.say \?\? "", said: trimmed \}\)/);
  assert.match(canvas, /history: conversation\.current/);
});

test("🔴 one model call, through the one shared valve", () => {
  const chat = code(readFileSync(new URL("./canvas-chat.ts", import.meta.url), "utf8"));
  assert.match(chat, /postChatCompletion\(/, "the canvas turn no longer goes through the shared door");
  assert.equal(
    (chat.match(/postChatCompletion\(/g) ?? []).length,
    1,
    "there is more than one model call on the front door path",
  );
  assert.ok(!/fetch\(/.test(chat), "a second path to a provider was opened");
});
