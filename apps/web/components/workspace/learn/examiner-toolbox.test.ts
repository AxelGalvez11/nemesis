import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── the examiner's toolbox: the model decides the path, with tools ───────────
//
// Owner, 2026-08-31, twice: *"it should not be hardcoded. It should be that
// DeepSeek should know what to do based on the given prompts and on its given
// tool set... I think this is what the best path for this user is."* And the
// follow-up decision: results live IN THE CONVERSATION — a made test arrives as
// a card in the reply, not on a page.
//
// The pieces wrap hooks, Supabase and a model call, so the wiring is pinned by
// source assertions; the pure halves (record shape, material resolution) run
// through the same builders value-tested in study-artifact-content.test.ts.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const shared = read("../../../../../packages/shared/src/workspace-agent-tools.ts");
const agentTools = read("../../../lib/workspace/agent-tools.ts");
const canvasTools = read("../../../lib/learn/canvas-tools.ts");
const canvasChat = read("./canvas-chat.ts");
const session = read("./use-canvas-session.ts");
const canvas = read("./learning-canvas.tsx");
const card = read("./test-ready-card.tsx");

test("🔴 the model's toolbox carries the examiner pair, web-side", () => {
  // Calibration: move these into WORKSPACE_AGENT_TOOL_NAMES (the cross-platform
  // list) and the phone advertises tools it has no executor for — the exact lie
  // the WEB_EXTRA split exists to prevent.
  const webExtra = shared.split("WEB_EXTRA_AGENT_TOOL_NAMES")[1]?.split("] as const")[0] ?? "";
  assert.ok(webExtra.includes('"get_study_record"'), "the record tool left the web list");
  assert.ok(webExtra.includes('"make_practice_test"'), "the test tool left the web list");
  const shared_names = shared.split("WORKSPACE_AGENT_TOOL_NAMES = [")[1]?.split("] as const")[0] ?? "";
  assert.ok(!shared_names.includes("get_study_record"), "the record tool leaked onto the phone's list");
});

test("🔴 the tool descriptions hand over judgment, not a recipe — and name no field", () => {
  assert.ok(shared.includes("YOU decide that a test is the right move"), "the description took the judgment back");
  const descriptions = shared.split("WORKSPACE_TOOL_DESCRIPTIONS")[1] ?? "";
  assert.ok(!/patient|clinical|pharma|dosing/i.test(descriptions), "a subject crept into a tool description");
});

test("🔴 make_practice_test refreshes the study store, or the card cannot find its artifact", () => {
  // Calibration: drop it from STUDY_WRITING_TOOLS and the write happens but the
  // conversation's card waits forever on an artifact the store never loads.
  const set = agentTools.split("const STUDY_WRITING_TOOLS")[1]?.split("]);")[0] ?? "";
  assert.ok(set.includes('"make_practice_test"'), "the store no longer refreshes after the tool writes");
  assert.match(agentTools, /case "get_study_record": return await getStudyRecord\(\);/);
  assert.match(agentTools, /case "make_practice_test": return await makePracticeTest\(args\);/);
});

test("🔴 the record carries the student's own miss diagnoses to the model", () => {
  assert.match(agentTools, /student_diagnosis: MISS_KIND_LABEL\[miss\.why\]/, "the diagnoses no longer reach the record");
  // And the paper is aimed by the CALLING model's record, passed through whole.
  assert.match(agentTools, /testOpts: \{ record \}/, "the model's record no longer aims the paper");
});

test("🔴 a made test rides the turn out as `produced`, with the same one-first rule as pending", () => {
  assert.match(canvasTools, /if \(!produced\) produced = readProducedTest\(result\);/, "the round no longer carries the paper out");
  assert.match(canvasChat, /if \(ran\.produced\) producedTest = ran\.produced;/, "the chat loop drops the paper");
  assert.match(session, /producedTest: result\.producedTest,/, "the aside no longer receives the paper");
});

test("🔴 the card renders in the conversation, gated exactly like the confirmation card", () => {
  // Calibration: lose the turnInFlight gate and a "Sit it" button renders under
  // half an answer — the same failure ConfirmCard's gate exists to prevent.
  assert.match(canvas, /\{!turnInFlight && session\.aside\?\.producedTest && \(/, "the card lost its in-flight gate");
  assert.match(card, /disabled=\{!artifact\}/, "the button no longer waits for the artifact to land");
  assert.match(card, /TakeTestDialog artifact=\{artifact\}/, "the sitting no longer opens from the card");
});
