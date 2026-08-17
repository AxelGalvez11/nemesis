// The owner's own worked examples, as tests. Each one names the behaviour it protects.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  readTurnIntent,
  sharesSubject,
  threadDepth,
  THREAD_OFFER_DEPTH,
  type TurnContext,
} from "./learning-intent";

const FRESH: TurnContext = { attachedSources: 0, recentAsks: [], sessionUnderway: false };
const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({ ...FRESH, ...over });

test("🔴 'What day is it today?' is answered, never taught", () => {
  // The single most annoying thing this product could do is turn a clock question into a lesson.
  const intent = readTurnIntent("What day is it today?", ctx());
  assert.equal(intent.kind, "answer");
});

test("🔴 utility outranks a running lesson — asking the date mid-session is still the date", () => {
  // Treating it as an interruption of teaching would be the hijack this file exists to prevent.
  assert.equal(readTurnIntent("what time is it", ctx({ sessionUnderway: true })).kind, "answer");
  assert.equal(readTurnIntent("who are you", ctx({ sessionUnderway: true })).kind, "answer");
});

test("'What is a dollar?' is a concise answer, not a lesson", () => {
  assert.equal(readTurnIntent("What is a dollar?", ctx()).kind, "answer");
});

test("the owner's dollar thread: answer, answer, then start modelling", () => {
  // Three turns circling one idea is somebody building a model, not running three lookups.
  const first = readTurnIntent("What is a dollar?", ctx());
  assert.equal(first.kind, "answer");

  const second = readTurnIntent("Why does a dollar have value if it is only paper?", ctx({
    recentAsks: ["What is a dollar?"],
  }));
  assert.equal(second.kind, "answer", "two turns is not yet a thread");

  const third = readTurnIntent("So what stops anyone printing more dollars?", ctx({
    recentAsks: ["What is a dollar?", "Why does a dollar have value if it is only paper?"],
  }));
  assert.equal(third.kind, "answer_and_offer");
  assert.equal(third.because, "conceptual-thread");
});

test("🔴 the middle state still ANSWERS — offering is not seizing", () => {
  // Without answer_and_offer the only options are "plain reply" and "hijack", and the cliff between
  // them is what makes tutors exhausting.
  const intent = readTurnIntent("So is it because the pressure drops?", ctx());
  assert.equal(intent.kind, "answer_and_offer");
  assert.equal(intent.because, "learner-reasoning");
});

test("'Teach me innate immunity.' teaches", () => {
  assert.equal(readTurnIntent("Teach me innate immunity.", ctx()).because, "explicit-teaching-request");
});

test("'Help me understand inflation.' teaches — a teaching request in softer clothes", () => {
  assert.equal(readTurnIntent("Help me understand inflation.", ctx()).kind, "teach");
  assert.equal(readTurnIntent("I don't understand how a diode works", ctx()).kind, "teach");
  assert.equal(readTurnIntent("I'm confused about consideration in contract law", ctx()).kind, "teach");
});

test("'What are the current hypertension recommendations?' is an ordinary lookup", () => {
  // Current-information request. Search and answer; teaching only if intent becomes clear.
  const intent = readTurnIntent("What are the current hypertension recommendations?", ctx());
  assert.equal(intent.kind, "answer");
});

test("🔴 attached material makes teaching AVAILABLE, never automatic", () => {
  // Owner rule 1: ordinary questions about your own sources must not force tutoring.
  const asked = readTurnIntent("what does osmolarity mean", ctx({ attachedSources: 2 }));
  assert.equal(asked.kind, "answer");
  // But sending with material and no question is "learn this material with me".
  assert.equal(readTurnIntent("", ctx({ attachedSources: 2 })).because, "material-attached");
});

test("a bare topic with nothing attached is a lesson", () => {
  assert.equal(readTurnIntent("innate immunity", ctx()).kind, "teach");
  assert.equal(readTurnIntent("the doctrine of promissory estoppel", ctx()).kind, "teach");
});

test("🔴 pressing Learn this is an instruction, not a signal to weigh", () => {
  const intent = readTurnIntent("What day is it today?", ctx({ explicitLearnThis: true }));
  assert.equal(intent.kind, "teach");
  assert.equal(intent.because, "explicit-learn-this");
});

test("mid-session, an ordinary utterance belongs to the lesson", () => {
  assert.equal(readTurnIntent("the sodium one", ctx({ sessionUnderway: true })).because, "session-underway");
});

test("🔴 FIELD-AGNOSTIC: the same shapes route identically across disciplines", () => {
  // Every signal is about the shape of the exchange. Nothing names a discipline, and the test would
  // fail loudly if a keyword list crept in.
  const cases: [string, string][] = [
    ["Teach me the rule against perpetuities", "Teach me shear stress in a fillet weld"],
    ["What is consideration?", "What is enthalpy?"],
    ["Help me understand mens rea", "Help me understand Bernoulli's principle"],
  ];
  for (const [law, engineering] of cases) {
    assert.equal(
      readTurnIntent(law, ctx()).kind,
      readTurnIntent(engineering, ctx()).kind,
      `"${law}" and "${engineering}" must route identically`,
    );
  }
});

test("a thread is a CHAIN ending at this turn, not any two similar questions", () => {
  // Returning to a subject after unrelated turns is remembering, not momentum.
  const broken = threadDepth("more about dollars", [
    "what is a dollar",
    "how do I export my notes",
    "what is the weather",
  ]);
  assert.equal(broken, 1, "an unrelated turn breaks the chain");

  const intact = threadDepth("what stops printing more dollars", [
    "what is a dollar",
    "why does a dollar have value",
  ]);
  assert.equal(intact, 3);
  assert.ok(intact >= THREAD_OFFER_DEPTH);
});

test("a drifting subject is still one thread", () => {
  // dollar → inflation → interest rates is one model being built, not three lookups.
  const depth = threadDepth("how do interest rates affect inflation", [
    "what is a dollar",
    "what causes inflation of the dollar",
  ]);
  assert.ok(depth >= THREAD_OFFER_DEPTH, `expected a chain, got ${depth}`);
});

test("common words never make two questions the same subject", () => {
  assert.equal(sharesSubject("what is the time", "what is the date"), false);
  assert.equal(sharesSubject("how do I do this", "what should I do"), false);
  assert.equal(sharesSubject("what is a dollar", "why is a dollar worth anything"), true);
});

// 🔴 THE CANVAS MUST ACTUALLY ROUTE THROUGH THIS.
//
// Everything above proves the reducer. A reducer that is correct while `learning-canvas.tsx` still
// calls the old question-shape check fixes nothing, and that failure is invisible — every test
// above still passes. This is the wiring, checked separately, and calibrated: deleting the call
// site reddens it alone.
test("🔴 the canvas front door reads intent, not just question shape", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../../components/workspace/learn/learning-canvas.tsx"),
    "utf8",
  );

  // 🔴 THE FIRST VERSION OF THIS GUARD HAD NO TEETH, AND THE SABOTAGE PROVED IT. Asserting that
  // `readTurnIntent` appears ANYWHERE in the file passed happily while the front door had been
  // rewired to a hardcoded "answer" — because the symbol was still mentioned further down. A guard
  // has to name the code path it protects, not the file that contains it.
  //
  // Both entry points, checked by BODY: `beginOrAnswer` (an empty canvas, or the landing composer)
  // and `submit` (everything typed afterwards). A learner reaches teaching through one or the
  // other, so either one silently reverting is the whole feature gone for half the product.
  for (const handler of ["beginOrAnswer", "submit"]) {
    const start = source.indexOf(`const ${handler} = useCallback(`);
    assert.notEqual(start, -1, `${handler} was renamed or removed`);
    const open = source.indexOf("{", source.indexOf("=>", start));
    let depth = 0;
    let body = "";
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          body = source.slice(open, i + 1);
          break;
        }
      }
    }
    assert.match(
      body,
      /intentFor\(/,
      `${handler} must decide from intent — a hardcoded route is the regression this catches`,
    );
  }

  // And `intentFor` must be the real reader rather than a local guess.
  assert.match(source, /readTurnIntent\(/, "intentFor must call the intent reader");

  // The old check routed on punctuation alone, so "Teach me innate immunity" fell through to a
  // lesson only by accident and "what day is it" could not be told from "what is a dollar".
  assert.doesNotMatch(
    source,
    /isOrdinaryChatQuestion/,
    "the question-shape-only check is superseded and must not remain a second front door",
  );
});

test("🔴 an editing instruction is not a teaching request", () => {
  // "Summarize this" must keep writing to the document; routing it into a lesson would silently
  // remove a shipped behaviour (contract §24).
  for (const instruction of ["summarize this", "write me an outline", "make this simpler"]) {
    assert.notEqual(readTurnIntent(instruction, ctx({ attachedSources: 1 })).because, "explicit-teaching-request");
  }
});
