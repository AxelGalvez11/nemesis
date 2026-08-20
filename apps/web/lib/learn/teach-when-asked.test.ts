import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import { createLlmTeacherStrategy, type TeacherTransport } from "./strategy-llm-teacher";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { TeachingContext } from "./teaching-strategy";

// 🔴🔴 THE OWNER ASKED TO BE TAUGHT ORGANIC CHEMISTRY AND WAS IMMEDIATELY QUIZZED ON IT (2026-08-19).
//
// That was not a bug in the sense of something failing. `teaching-policy.ts` documents the opening
// move as deliberate: "unknown means Nemesis lacks evidence, not that the learner lacks knowledge",
// and from that it follows that a canvas with no evidence ASKS rather than teaches. The reasoning is
// right for the case it was written for — material attached with nothing said — and wrong for the
// case where the learner has just told you in words what they came for.
//
// So the fix is not "teach first". It is: give the controller the sentence, and let it decide. These
// tests hold that the sentence actually arrives, because a fact that never reaches the prompt is the
// exact shape of "implemented, merged, deployed and dead" this codebase keeps paying for.

const NOW = new Date("2026-08-19T21:00:00.000Z");

function knowledgeFor(cue: string, answer: string): KnowledgeObject {
  return {
    id: `k-${cue}`,
    identityKey: `association:v2:${cue}`,
    pair: { id: `t1:${cue}`, left: cue, leftRole: "generic", right: answer, rightRole: "brand" },
    relationKind: "brand|generic",
    statement: `${cue} — ${answer}`,
    type: "association",
    unanchoredProvenance: [],
  };
}

/** Minted by the real `objectivesForKnowledge`, for the reason `strategy-cleanroom.test.ts` gives:
 *  a hand-written objective is not the thing the controller is asked to copy back. */
function resolved(cue: string, answer: string): ResolvedObjective {
  const knowledge = knowledgeFor(cue, answer);
  const [objective] = objectivesForKnowledge(knowledge);
  assert.ok(objective, `the fixture must mint an objective for ${cue}`);
  const stored: StoredObjective = { ...objective, rowId: `row-${objective.identityKey}` };
  return { knowledge, objective: stored };
}

const CANDIDATES: readonly ResolvedObjective[] = [resolved("alcohol", "hydroxyl")];

function context(over: Partial<TeachingContext> = {}): TeachingContext {
  return { evidence: [], now: NOW, objectives: CANDIDATES, uid: "learner-1", ...over };
}

/** Captures what was actually sent, which is the only thing these tests care about. */
function capturing(): { transport: TeacherTransport; sent: () => string } {
  let seen = "";
  const transport: TeacherTransport = async (_uid, messages) => {
    seen = JSON.stringify(messages);
    return { errorText: null, text: JSON.stringify({ because: "x", move: "ask", objective: CANDIDATES[0]!.objective.identityKey }) };
  };
  return { sent: () => seen, transport };
}

test("🔴🔴 the learner's opening words reach the model verbatim", async () => {
  // Calibration: delete the `opening` push in `sittingNote` and this reddens alone.
  const { sent, transport } = capturing();
  await createLlmTeacherStrategy(transport).decide(context({ opening: "teach me functional groups" }));
  assert.match(sent(), /teach me functional groups/, "the controller was never told what was asked for");
});

test("🔴 a canvas that began from a file says nothing about an opening", async () => {
  // The absent case has to stay absent. A prompt that always carries the line — empty when there is
  // nothing to say — teaches the model that the field is noise, and it stops reading it on the turns
  // where it matters.
  const { sent, transport } = capturing();
  await createLlmTeacherStrategy(transport).decide(context());
  // 🔴 THE QUOTED LINE, NOT THE PHRASE. The system prompt's own rule contains "opened this
  // sitting" on every single turn, so the loose phrase matches whether or not there is an opening —
  // a guard that can never fail. What must be absent is the sitting note's line reporting one.
  assert.ok(!/learner opened this sitting by saying/.test(sent()), "an absent opening still produced a line about one");
});

test("🔴 the opening is bounded, because it is unbounded learner text on a per-turn model call", async () => {
  const { sent, transport } = capturing();
  await createLlmTeacherStrategy(transport).decide(context({ opening: "x".repeat(5_000) }));
  const run = /x{50,}/.exec(sent());
  assert.ok(run, "expected the opening to appear at all");
  assert.ok(run[0].length <= 200, `the opening went in at ${run[0].length} characters, unbounded`);
});

test("🔴🔴 the instruction is scoped, and does not say 'always teach first'", () => {
  // The invariant this sits next to is real: being told nothing is not evidence of ignorance. An
  // unconditional "open by teaching" would erode exactly that, and would also teach someone who
  // asked to be TESTED. The rule has to name all three limits or it is a different rule.
  const source = readFileSync(new URL("./strategy-llm-teacher.ts", import.meta.url), "utf8");
  const start = source.indexOf("SHOW SOMETHING BEFORE YOU TEST IT");
  assert.ok(start > 0, "the show-before-testing instruction is not in the system prompt");
  // The prompt is an array of string literals, so the sentence is split across elements; flatten the
  // quoting away before reading it rather than trying to match across it.
  const rule = source.slice(start, start + 900).replace(/",?\n\s*"/g, " ").replace(/\s+/g, " ");
  // 🔴 BROADENED 2026-08-19, ON THE OWNER'S SECOND REPORT: "why is it asking me retrieval questions
  // from the get go? thats not how chatgpt or other ai will teach users." The rule used to require
  // that they had ASKED to be taught, which meant it only ever fired in the session where the words
  // were typed — reopening the canvas dropped it and the quizzing came straight back. What survives
  // is the part that matters: it is bounded by evidence, and an explicit request to be tested wins.
  assert.match(rule, /no evidence at all for an objective/, "it does not require the absence of evidence");
  assert.match(rule, /Once they have produced ANYTHING/, "it does not stop once the learner has produced something");
  assert.match(rule, /asked to be tested, quizzed or drilled/, "it does not exempt a request to be tested");
  // 🔴 AND IT STILL DOES NOT CLAIM THE LEARNER IS IGNORANT, which is the invariant it sits beside:
  // "unknown means Nemesis lacks evidence, not that the learner lacks knowledge". Showing material
  // before asking about it asserts nothing about them; only what they produce is evidence.
  assert.match(rule, /not a claim that they do not know it/, "it no longer distinguishes teaching from assuming ignorance");
});

test("🔴 the runtime actually passes it — the field is not decorative", () => {
  // A context field nothing populates is the same as no field. Read as source because the wiring is
  // three files apart: the session records it, the canvas hands it over, the runtime puts it on the
  // context, and any one of those going missing is silent.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  const canvas = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");

  assert.match(session, /setOpening\(said\);/, "the session never records what was said");
  assert.match(canvas, /usePolicyRuntime\(canvas, policyOverride, strategyOverride, session\.opening, notAnAttempt\)/,
    "the canvas does not hand the opening to the runtime");
  assert.match(runtime, /^\s+opening,$/m, "the runtime does not put the opening on the teaching context");
});
