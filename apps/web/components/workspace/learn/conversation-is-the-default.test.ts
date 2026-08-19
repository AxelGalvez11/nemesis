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
  assert.match(body, /converse\(trimmed\)/, "typed text no longer reaches the model at the front door");
  // The ONE `begin` left on this path is the empty send with material staged, which carries no
  // utterance for a model to read. A `begin(trimmed)` or `begin(asked)` here is the defect.
  assert.match(body, /session\.begin\(undefined\)/, "the empty-send-with-material route is gone");
  assert.ok(
    !/session\.begin\((?!undefined)/.test(body),
    "the front door is starting a lesson from what the learner typed again",
  );
});

test("🔴🔴 an ordinary mid-canvas message goes to the model too, not to a second reading", () => {
  // Fixing one call site and not the other is how this bug half-survives: the front door and the
  // running canvas used to consult the same classifier from two places.
  const submit = canvas.slice(canvas.indexOf("const submit = useCallback"));
  const branch = submit.slice(submit.indexOf('routing.kind === "ordinary"'));
  const upToReturn = branch.slice(0, branch.indexOf("return;") + "return;".length);
  assert.match(upToReturn, /await converse\(text\)/, "the ordinary path no longer reaches the model");
  assert.ok(
    !/session\.begin\(/.test(upToReturn),
    "the ordinary path can start a lesson without a model deciding it should",
  );
});

test("🔴 the deterministic routes ahead of the model are still there", () => {
  // The model is asked what the learner MEANT. It is never asked things the canvas already knows.
  const submit = canvas.slice(canvas.indexOf("const submit = useCallback"));
  const body = submit.slice(0, submit.indexOf("\n    [applyExplanationEvent"));
  assert.match(body, /routeComposerText\(/, "the rewrite/refusal routing was removed");
  assert.match(body, /routing\.kind === "rewrite"/, "an explicit rewrite no longer rewrites");
  assert.match(body, /routing\.kind === "refused"/, "a refusal is silent again");
  assert.match(body, /session\.askAbout\(only, EXPLAIN_THIS\)/, "the staged-selection route was removed");
  // The ordinary branch is scoped to NO selection: text typed with a passage staged is a scoped
  // instruction about that passage, which is not an open turn of conversation.
  assert.match(body, /routing\.kind === "ordinary" && selected\.length === 0/);
});

test("🔴🔴 the invariant above all of this is untouched", () => {
  // If Nemesis is visibly asking a question, submitting is an ANSWER — decided before any of the
  // above runs, by composerIntent, with no model in the loop. See composer-intent.test.ts.
  assert.match(canvas, /const intent = composerIntent\(\{/);
  assert.match(canvas, /intent\.kind === "answer" && intent\.sink === "policy"/);
});

test("🔴 the canvas picks the mechanism for a study turn, not the model", () => {
  const converse = session.slice(session.indexOf("const converse = useCallback"));
  const body = converse.slice(0, converse.indexOf("\n    [begin, command"));
  assert.match(body, /decision\.then === "study"/);
  assert.match(body, /isPreContent\(latest\.current\.state\)/, "the begin/command choice is not read off canvas state");
  assert.match(body, /begin\(decision\.topic \?\? said\)/);
  assert.match(body, /await command\(said, \[\]\)/);
});

test("🔴 Learn this is offered for a subject, never for a greeting", () => {
  assert.match(canvas, /\{session\.aside\.topic && \(/, "the offer is gated on something other than a subject");
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
