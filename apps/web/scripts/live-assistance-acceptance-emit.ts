// Production acceptance, step 1 of 2: emit the EXACT rows the real code would write.
//
// 🔴 THE POINT IS THAT NOTHING HERE IS HAND-WRITTEN. Every row comes out of `completionPromptFor`,
// `recognitionPromptFor`, `retrievalPromptFor`, `asUnaidedProduction`, `evidenceForSubmission` and
// `evidenceRow` — the same functions the browser calls. A harness that composed its own SQL would
// prove that the SQL is fine and say nothing about the product.
//
// PROCEDURE
//   1. node scripts/live-assistance-acceptance-emit.ts <user-uuid>   -> rows as JSON
//   2. insert those rows into the target database against a throwaway user, then SELECT them back
//      joined to learning_objectives.identity_key
//   3. node scripts/live-assistance-acceptance-verify.ts <readback.json>
//   4. delete the throwaway auth user; ON DELETE CASCADE removes everything the run created
//
// Run against production on 2026-08-18 after migration 20260818T02: 15/15 checks passed, and the
// 47 pre-existing learner rows were verified untouched before and after.
import { completionPromptFor, evidenceForSubmission, judgementOf, recognitionPromptFor, retrievalPromptFor, asUnaidedProduction } from "@/lib/learn/objective-task";
import { evidenceRow } from "@/lib/learn/learner-store";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { workedExampleFor } from "@/lib/learn/worked-example";
import { performanceOf } from "@/lib/learn/teaching-policy";
import { optionsFor } from "@/lib/learn/choice-set";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";

const USER = process.argv[2]!;
const AT = "2026-08-18T15:40:00.000Z";

// A four-step procedure and a two-column pair, in a discipline that is neither medicine nor law.
const PROCEDURE = {
  id: "live-proc", identityKey: "procedure:v2:live-proc",
  statement: "commissioning a three-phase motor",
  steps: [
    { marker: "1.", text: "Lock out the supply and prove it dead.", unitId: "u1" },
    { marker: "2.", text: "Confirm winding resistance is balanced across all three phases.", unitId: "u2" },
    { marker: "3.", text: "Check the rotation direction against the driven load.", unitId: "u3" },
    { marker: "4.", text: "Log the no-load current before coupling.", unitId: "u4" },
  ],
  type: "procedure", unanchoredProvenance: [],
} as unknown as KnowledgeObject;

const pair = (id: string, left: string, right: string) => ({
  id, identityKey: `association:v2:${id}`,
  pair: { id: `${id}:r`, left, leftRole: "instrument", right, rightRole: "measures" },
  statement: `${left} measures ${right}`, type: "association", unanchoredProvenance: [],
}) as unknown as KnowledgeObject;

const PAIRS = [
  pair("live-a1", "megohmmeter", "insulation resistance"),
  pair("live-a2", "tachometer", "shaft speed"),
  pair("live-a3", "clamp meter", "running current"),
];

const stored = (k: KnowledgeObject, i: number, row: string) => ({ knowledge: k, objective: { ...objectivesForKnowledge(k)[i]!, rowId: row } });

const completionTarget = stored(PROCEDURE, 2, "ROW_PROC");   // step 3 of 4
const directTarget = stored(PAIRS[0]!, 0, "ROW_A1");
const recogTarget = stored(PAIRS[1]!, 0, "ROW_A2");
const beforeRevealTarget = stored(PAIRS[2]!, 0, "ROW_A3");

// 1. WORKED EXAMPLE — grounded, and asks for nothing, so there is no row to write.
const modelled = workedExampleFor(completionTarget);
const workedExampleWritesNothing =
  performanceOf({ because: "b", exposition: { mode: "deliberate" }, objectiveId: "x", type: "worked_example" }) === null;

// 2. COMPLETION
const completionPrompt = completionPromptFor(completionTarget, "live-completion")!;

// 3. INDEPENDENT
const directPrompt = retrievalPromptFor(directTarget, "live-direct", "independent");

// 4a. RECOGNITION, options revealed
const choicesFor = (target: typeof recogTarget) => {
  const built = optionsFor({
    answer: target.objective.answer, heldMisconceptions: [], identityKey: target.objective.identityKey,
    neighbouringClasses: [], prompt: "which instrument?",
    siblingAnswers: PAIRS.filter((p) => p.id !== target.knowledge.id).map((p) => objectivesForKnowledge(p)[0]!.answer),
  });
  if (typeof built === "string") throw new Error(`no options: ${built}`);
  return built;
};
const revealedPrompt = recognitionPromptFor(recogTarget, "live-recognised", choicesFor(recogTarget));

// 4b. RECOGNITION, answered BEFORE the options were opened
const beforeReveal = asUnaidedProduction(recognitionPromptFor(beforeRevealTarget, "live-before-reveal", choicesFor(beforeRevealTarget)));

const rowsFor = (prompt: Parameters<typeof evidenceForSubmission>[0]["prompt"], key: string, text: string) =>
  evidenceForSubmission({
    canvasId: null, judgement: judgementOf([{ objectiveIdentityKey: key, verdict: "understood" }]),
    occurredAt: AT, prompt, responseText: text, teachingStrategy: "llm_teacher", tookMs: 9000,
  }).map((r) => evidenceRow(USER, r));

console.log(JSON.stringify({
  modelledFrom: modelled.modelled?.from ?? null,
  modelledSteps: modelled.modelled?.steps ?? [],
  workedExampleWritesNothing,
  completionGiven: completionPrompt.given ?? [],
  completionQuestion: completionPrompt.prompt,
  objectiveKeys: {
    completion: completionTarget.objective.identityKey,
    direct: directTarget.objective.identityKey,
    recognised: recogTarget.objective.identityKey,
    beforeReveal: beforeRevealTarget.objective.identityKey,
  },
  rows: [
    ...rowsFor(completionPrompt, completionTarget.objective.identityKey, "Check the rotation direction against the driven load."),
    ...rowsFor(directPrompt, directTarget.objective.identityKey, "insulation resistance"),
    ...rowsFor(revealedPrompt, recogTarget.objective.identityKey, "shaft speed"),
    ...rowsFor(beforeReveal, beforeRevealTarget.objective.identityKey, "running current"),
  ],
}, null, 2));
