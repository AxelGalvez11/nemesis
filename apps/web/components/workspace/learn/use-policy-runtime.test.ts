import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

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
