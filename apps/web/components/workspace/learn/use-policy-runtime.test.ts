import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { KNOWLEDGE_DEADLINE_MS } from "@/lib/learn/thinking-phases";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── an answer that is still settling must not decide the next question ───────────────────────────
//
// 🔴 THE WINDOW IS REAL AND IT WRITES A FALSE CLAIM. `submit()` sets feedback BEFORE `record()`
// resolves, and `record()` writes evidence then re-reads it. Between those, `evidence` still lacks
// the row this answer produced. `task` is null while feedback is up, so the learner is safe — until
// `acknowledge()` clears it. If that runs inside the window, the next task is built from a decision
// that predates the answer, and because `actedOn` reorders rather than filters, it resolves to the
// SAME objective whenever nothing else is owed anything.
//
// The learner is then told they were right and immediately asked the identical question with its
// answer on screen. Nothing stops them answering, and that submission is real: a durable
// demonstration of working memory. Not a flicker — a fabricated claim about a person.
//
// These are source assertions because the invariant is about ORDER inside a React hook, which has
// no return value to inspect. Same reason `canvas-motion.test.ts` reads source for its phase rule.

test("🔴 `acknowledge` refuses while the answer is still being recorded", async () => {
  const code = strip(await read("./use-policy-runtime.ts"));
  const start = code.indexOf("const acknowledge = useCallback(");
  assert.notEqual(start, -1, "acknowledge must exist");
  const body = code.slice(start, code.indexOf("}, [", start));

  assert.ok(
    body.includes("if (recording) return;"),
    "acknowledge must refuse while recording — a caller forgetting to gate must cost a missed advance, never a fabricated demonstration",
  );
  // The guard has to come FIRST. Clearing feedback and then bailing would still expose the surface.
  assert.ok(
    body.indexOf("if (recording) return;") < body.indexOf("setFeedback(null)"),
    "the refusal must precede clearing the feedback, or the window is already open",
  );
  assert.ok(body.includes("recording"), "and `recording` must be a dependency of the callback");
});

test("🔴 `recording` spans the WHOLE write-and-reread, including its failure paths", async () => {
  const code = strip(await read("./use-policy-runtime.ts"));
  const start = code.indexOf("const record = useCallback(");
  assert.notEqual(start, -1);
  const body = code.slice(start, code.indexOf("}, [", start));

  const raise = body.indexOf("setRecording(true)");
  const firstWrite = body.indexOf("await recordEvidence(");
  const reread = body.indexOf("await refresh(");
  const lower = body.indexOf("setRecording(false)");

  assert.notEqual(raise, -1, "the flag must be raised");
  assert.notEqual(lower, -1, "and lowered");
  assert.ok(raise < firstWrite, "raised BEFORE the first write, or the window opens unguarded");
  assert.ok(reread < lower, "lowered only AFTER the re-read, or evidence is still stale when it clears");

  // 🔴 `finally`, NOT A TRAILING CALL. `record` returns early when a write fails, so a lowering
  // statement placed after the happy path would leave the flag raised for ever on that branch and
  // freeze the surface — trading a false demonstration for a dead canvas.
  assert.ok(body.includes("finally"), "the flag must be lowered in a finally, so failure paths clear it too");
});

test("🔴 `recording` is a DIFFERENT question from `judging`, and both are exposed", async () => {
  // `judging` is already false when the write begins, so a caller gating on it would see a clear
  // signal during exactly the window that is unsafe. The two must not be collapsed.
  const source = await read("./use-policy-runtime.ts");
  const code = strip(source);

  assert.ok(/recording: boolean;/.test(source), "recording must be on the PolicyRuntime interface");
  assert.ok(/\n\s*recording,\n/.test(code), "and returned from the hook, or no caller can gate on it");

  // 🔴 CHECKED INSIDE `submit`, NOT ACROSS THE FILE. A first version of this compared the positions
  // of `setJudging(false)` and `setRecording(true)` in the whole source and failed — because
  // `record` is simply DECLARED above `submit`. That asserted file layout, not runtime order. The
  // real claim is about the sequence within one call, so it is read from one function's body.
  const submitStart = code.indexOf("const submit = useCallback(");
  assert.notEqual(submitStart, -1);
  const submitBody = code.slice(submitStart, code.indexOf("}, [", submitStart));

  const clearsJudging = submitBody.indexOf("setJudging(false)");
  const callsRecord = submitBody.lastIndexOf("await record(");
  assert.ok(clearsJudging !== -1, "submit must clear judging when the evaluator returns");
  assert.ok(callsRecord !== -1, "submit must hand its evidence to record");
  assert.ok(
    clearsJudging < callsRecord,
    "judging is already false by the time the write starts — which is exactly why it cannot serve as this gate",
  );
});

// ── §33: ninety seconds with no transition and no failure must not be REPRESENTABLE ──────────────
//
// 🔴 THE OWNER'S OWN CANVAS WAS IN THAT STATE WHEN THIS WAS WRITTEN. `8c49587e`: "Mapping what you
// know", indefinitely, across two loads over ninety seconds — territory NULL, `updated_at` hours
// old, zero rows, and NO CONSOLE ERROR. A silent永 stall with nothing to act on.
//
// There were two ways in and the effect had neither closed:
//
//   1. A THROW. The async IIFE had no `catch`, so anything rejecting inside
//      `ensureKnowledgeForCanvas` skipped every `setPhase(null)` and `setStatus(...)` below it and
//      left `loading` on screen for ever.
//   2. A PROMISE THAT NEVER SETTLES. A construction is one `fetch` with no timeout of its own, so a
//      connection accepted and never answered produces nothing to catch. No `catch` reaches that
//      one. Only a deadline does.
//
// These are source assertions rather than a rendered hook, for the same reason the ordering guards
// in `knowledge-coverage.test.ts` are: what matters is that the code cannot be written the old way
// again, and both routes are structural.

test("🔴 the resolve effect CATCHES, so a throw cannot leave the caption up for ever", async () => {
  const source = await read("./use-policy-runtime.ts");
  const effect = source.slice(source.indexOf("const knowledgeInputs = knowledgeSignature(canvas)"));
  const body = effect.slice(0, effect.indexOf("// ---------------------------------------------------------------- submit"));

  const call = body.indexOf("await ensureKnowledgeForCanvas(");
  const caught = body.indexOf("} catch (cause) {");

  assert.ok(call > 0, "the resolve must still happen");
  assert.ok(caught > 0, "🔴 and it must be caught — an uncaught throw IS the infinite caption");
  assert.ok(caught > call, "the catch must cover the resolve, not something before it");

  // And the catch must actually LEAVE the loading state. A catch that logged and returned would
  // satisfy the shape and reproduce the defect exactly.
  const handler = body.slice(caught, body.indexOf("clearTimeout(expiry);\n      if (!live) return;"));
  assert.match(handler, /setPhase\(null\)/, "the caption must come down");
  assert.match(handler, /setStatus\("unavailable"\)/, "and the runtime must stop claiming to be loading");
  assert.match(handler, /setError\(/, "and the learner must be told something they can act on");
});

test("🔴 the wait is BOUNDED, and the bound aborts the work rather than abandoning it", async () => {
  // 🔴 A TIMEOUT THAT ONLY STOPPED WAITING WOULD BE WORSE THAN NONE. The request would still be
  // running, still billable, and still able to resolve later and write knowledge for a canvas the
  // learner has given up on. "We stopped waiting" and "it stopped" have to be one event.
  const source = await read("./use-policy-runtime.ts");
  const knowledge = await read("../../../lib/learn/canvas-knowledge.ts");
  const api = await read("../../../lib/learn/canvas-api.ts");

  assert.match(source, /new AbortController\(\)/, "there must be something to abort with");
  assert.match(source, /setTimeout\(\(\) => deadline\.abort\(\), KNOWLEDGE_DEADLINE_MS\)/);
  assert.match(source, /signal: deadline\.signal/, "🔴 and the signal must be HANDED DOWN, not merely created");

  // The whole thread, end to end: nothing in the chain may drop it.
  assert.match(knowledge, /signal\?: AbortSignal/, "the knowledge layer must accept it");
  assert.match(knowledge, /constructTerritory\(userId, topic, TERRITORY_TARGET, \{ signal \}\)/, "topic lane");
  assert.match(knowledge, /signal,\n {4}sources: canvas\.sources,/, "grounded lane");
  assert.match(api, /ask\(uid, territoryMessages\(\{ count, sources, topic \}\), signal\)/, "and the model call");
});

test("🔴 the deadline is comfortably above a real build and comfortably inside the owner's ninety", () => {
  // 🔴 BOTH DIRECTIONS ARE FAILURES. Too tight aborts work that was about to succeed and reports a
  // failure the learner did not have; too loose reproduces the silent stall the rule exists to
  // remove. Production measured a topic territory resolving in about 18 seconds.
  assert.ok(KNOWLEDGE_DEADLINE_MS > 30_000, "a real build over 120,000 characters must not be cut off");
  assert.ok(KNOWLEDGE_DEADLINE_MS < 90_000, "🔴 and nothing may sit silent for the owner's ninety seconds");
});

test("🔴 the timer is cleared on EVERY exit, including unmount", async () => {
  // A timer that outlives its effect fires into a component nobody is looking at, and on a canvas
  // the learner has already navigated away from.
  const source = await read("./use-policy-runtime.ts");
  const effect = source.slice(source.indexOf("const deadline = new AbortController()"));
  const body = effect.slice(0, effect.indexOf("// ---------------------------------------------------------------- submit"));

  assert.ok(
    (body.match(/clearTimeout\(expiry\)/g) ?? []).length >= 3,
    "cleared on the failure path, on the success path, and on unmount",
  );
  assert.match(body, /live = false;\n {6}\/\/[\s\S]*?clearTimeout\(expiry\);/, "the cleanup must clear it");
});
