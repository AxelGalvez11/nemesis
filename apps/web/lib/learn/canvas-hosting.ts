// What the Canvas presents, and who owns the learner's next answer.
//
// 🔴 WHY THIS IS A MODULE AND NOT A CONDITION IN THE COMPONENT.
//
// Step 7b removes whole-page runtime ownership (canvas-cognitive-runtime.md §8). Before it, exactly
// one thing painted: `policyOwns ? <CanvasPolicyView/> : <the six-stage machine/>`. That branch was
// safe by construction — two surfaces could not be on screen, so two surfaces could not both think
// they owned the answer.
//
// Removing it removes that safety. A hosted task can now sit beside a document, and the moment it
// can sit beside a document it can also sit beside `CanvasRecall`, which has its own answer path
// (`session.answerActiveTask`). Two answer surfaces means one of them silently loses the learner's
// work, or — worse — the policy's prompt id receives an answer that was typed at a recall card, and
// evidence is written against a question nobody was asked.
//
// That defect is invisible: every unit test passes, the screen looks right, and the corruption is
// in the evidence log. So the rule is not written as a condition somebody has to remember. It is
// written as a type that cannot hold two answers, and a composition function that is the only place
// deciding what paints.
//
// PURE. No React, no I/O, no cognitive meaning. What a task MEANS is Brain's; what it LOOKS like is
// UI's; this file only says where it may live and who receives its answer.

import type { CanvasState } from "./canvas-model";
import type { KnowledgeType } from "./knowledge-types";
// 🔴 `ObjectiveCapability`, NOT `CognitiveOperation`. The doc's §3 list of sixteen operations is
// the target vocabulary; what an objective actually carries today is `recall | discriminate |
// explain`, and that is what the evidence row records. Typing this as the wider list would need a
// mapping between the two — which is a claim about what a capability MEANS, and therefore Brain's
// to make, not the runtime's. This carries the narrow thing the runtime genuinely has.
import type { ObjectiveCapability } from "./learning-objective";

/** The composer's shape for "something is being asked". Shared by both producers. */
export interface HostedTaskShape {
  kind: "recall" | "question";
  id: string;
  prompt: string;
  placeholder: string;
  index: number;
  total: number;
  answered: boolean;
}

/**
 * How much room the thinking needs — the structural half of §9's variable tempo.
 *
 * 🔴 A PROJECTION OF THE BRAIN'S DECISION, NOT A NEW CLAIM. It is derived from the knowledge type
 * and cognitive operation the policy already chose; nothing here decides that an association is
 * quick. And it is NOT a style: the runtime never renders it. It exists so the surface can present
 * a one-second retrieval and a causal reconstruction differently (§14.6 forbids one template)
 * without the presentation layer having to re-derive cognitive demand from scratch.
 */
export type TaskTempo = "instant" | "deliberate";

/**
 * What the policy is contributing to the surface right now.
 *
 * 🔴 A CONTRIBUTION, NOT A PAGE. The Canvas owns the surface and hosts this; it is not a runtime
 * that has taken over. That distinction is the whole of 7b, and it is why this carries no layout,
 * no route and no "mode".
 */
export interface HostedTask {
  task: HostedTaskShape;
  tempo: TaskTempo;
  /** What the Brain decided this task demands. Carried, never interpreted here. */
  operation: ObjectiveCapability;
  knowledgeType: KnowledgeType;
}

/**
 * Who receives the learner's next answer.
 *
 * 🔴 THE POINT IS THAT IT CANNOT HOLD TWO. A `{ policy?, stage? }` record would compile with both
 * set, and the first edit that forgot to clear one would route an answer to whichever branch ran
 * first. The union makes the ambiguity unrepresentable rather than merely unlikely.
 */
export type AnswerSink =
  | { kind: "policy"; task: HostedTaskShape }
  | { kind: "stage"; task: HostedTaskShape }
  | { kind: "none" };

/**
 * Which regions of the Canvas paint.
 *
 * Three, and they are not three "modes" — `document` and `task` are routinely both true, which is
 * exactly the composition 7b exists to allow.
 */
export interface CanvasRegions {
  /** Reading material: the document, or the pre-content states that stand in for it. */
  document: boolean;
  /** The six-stage machine's EVIDENCE-COLLECTING surfaces: recall, test, diagnose, complete. */
  stages: boolean;
  /**
   * The policy's contribution: a question, a correction, a contrast, or a verdict just given.
   *
   * 🔴 WIDER THAN "THERE IS A QUESTION". Feedback and corrections occupy the surface too, and they
   * must not sit beside a recall card for the same reason a question must not. What is ANSWERABLE
   * inside this region is narrower — see `AnswerSink`.
   */
  policy: boolean;
  /**
   * The hosted task is sharing the surface with reading material that is genuinely there.
   *
   * 🔴 NOT THE SAME QUESTION AS `document`, AND CONFLATING THEM IS A REAL DEFECT. `document` is
   * also true for the PRE-CONTENT states, which paint a placeholder rather than a document. A task
   * told it is "sharing" on `sources_attached` shrinks to leave room for reading material that does
   * not exist, and ends up floating at the top of an empty surface beside a centred button.
   *
   * That is the COMMON shape today, not an edge case: a canvas with sources attached and no
   * generated lesson is most of them, so it is the path this migration exercises first.
   */
  sharing: boolean;
}

/** Canvas states whose surface collects an answer or reports on answers already collected. */
const EVIDENCE_STAGES: readonly CanvasState[] = [
  "recall",
  "test",
  "retest",
  "diagnose",
  "complete",
];

/** Canvas states that hold reading material the learner can actually read. */
const READING_STATES: readonly CanvasState[] = ["orient", "learn", "targeted_relearn"];

/**
 * Canvas states with no reading material yet — they paint a placeholder in the same region.
 *
 * 🔴 SEPARATE FROM `READING_STATES` BECAUSE `sharing` DEPENDS ON THE DIFFERENCE. Both paint in the
 * document region; only one of them is something a task has to make room for.
 */
const PRE_CONTENT_STATES: readonly CanvasState[] = ["empty", "sources_attached"];

export function isEvidenceStage(state: CanvasState): boolean {
  return EVIDENCE_STAGES.includes(state);
}

/**
 * What paints, given what the canvas holds and whether the policy has something to ask.
 *
 * 🔴 THE ONE RULE, AND IT IS ASYMMETRIC ON PURPOSE:
 *
 *   Reading material may ALWAYS coexist with a hosted task.
 *   Evidence-collecting surfaces NEVER may.
 *
 * `CanvasDocument` collects nothing and writes no evidence, so a question beside a document is two
 * things the learner can do and one place their answer can go. `CanvasRecall` and `CanvasTest` are
 * the opposite: each is a second answer surface with its own write path, so hosting a task beside
 * one puts two writers on one composer.
 *
 * This is the narrowed form of the property `canvas-runtime-branch.test.ts` has always protected —
 * "the policy decided and a competing surface painted anyway". The subject list shrank; the
 * property did not.
 */
export function composeSurface(input: {
  canvasState: CanvasState;
  /** The policy has something to present — a question, a correction, or a verdict. */
  policyPresenting: boolean;
}): CanvasRegions {
  const { canvasState, policyPresenting } = input;
  const evidenceStage = isEvidenceStage(canvasState);
  const reading = READING_STATES.includes(canvasState);
  const policy = policyPresenting;

  return {
    // 🔴 A hosted task does NOT suppress reading. This single `true` is the behaviour change of
    // 7b: material the policy cannot represent stays on screen instead of being hidden behind a
    // runtime that took the page (§14.1 — the answer to zero owned canvases is composition, never
    // a lower coverage bar).
    document: reading || PRE_CONTENT_STATES.includes(canvasState),
    // 🔴 THE LEGACY ARM IS NOW A FALLBACK: it paints only where the policy has nothing to say.
    //
    // The exclusion is still one-directional and still expressed in exactly one place — the
    // direction is simply reversed. Both arms can never paint at once, which is the property that
    // matters (two answer surfaces on one composer means one of them silently loses the learner's
    // work), and it is still impossible to have neither: when the policy stands down,
    // `policyPresenting` is false and the stage paints.
    stages: evidenceStage && !policyPresenting,
    // 🔴 THE COMMENT THAT USED TO SIT HERE WAS RIGHT WHEN WRITTEN AND IS KEPT AS A RECORD, BECAUSE
    // WHAT FALSIFIED IT IS THE WHOLE JUSTIFICATION FOR THIS CHANGE. It read:
    //
    //     "REFUSED WHILE AN EVIDENCE STAGE IS UP, rather than the stage being refused. The
    //      six-stage machine is a run the learner started and is partway through; interrupting it
    //      to ask a policy question would discard answers already given to it."
    //
    // The premise is false. **The legacy arm has never written a `learner_evidence` row.**
    // `recordEvidence` has exactly one caller and it is in the policy arm, so a legacy run
    // accumulates answers in `canvas.document` and nothing durable is ever produced from them.
    // Verified in production, not inferred: `learner_evidence` holds ZERO rows, while
    // `knowledge_objects` and `learning_objectives` hold rows written by the policy path.
    //
    // So the precedence was protecting a run whose output was never recorded — it gave the surface
    // to the arm that cannot learn anything about the learner, and kept it there. That is exactly
    // backwards, and it is why the owner met a fixed six-question quiz on their own canvas.
    policy,
    // 🔴 REAL READING MATERIAL ONLY. A task makes room for a document; it does not make room
    // for a placeholder that is itself waiting for one.
    sharing: policy && reading,
  };
}

/**
 * Who owns the answer. Derived once, from the same facts that decided what paints.
 *
 * 🔴 THE POLICY WINS WHEN BOTH EXIST, AND THAT IS NOT A PREFERENCE — it is a consequence. A hosted
 * task only exists when no evidence stage is painting (`composeSurface`), so a stage task present
 * at the same time is a leftover from a run that is no longer on screen. Routing to it would send
 * the answer to an invisible surface.
 */
export function answerSink(input: {
  hosted: HostedTask | null;
  stageTask: HostedTaskShape | null;
  regions: CanvasRegions;
}): AnswerSink {
  const { hosted, regions, stageTask } = input;
  if (regions.policy && hosted) return { kind: "policy", task: hosted.task };
  if (regions.stages && stageTask) return { kind: "stage", task: stageTask };
  return { kind: "none" };
}

/**
 * The tempo a task's cognitive demand implies.
 *
 * 🔴 DERIVED FROM THE BRAIN'S OWN PAIR, NOT FROM A LIST MAINTAINED HERE. `recall` over an
 * `association` is the one interaction that must feel instantaneous — §9 opens with three of them
 * in a row, and §12 records it as the only supported combination today. Everything else is
 * `deliberate` by default, which is the safe direction: a new knowledge type arriving from Brain
 * gets room to think rather than being rushed into a flashcard shell (§14.2).
 */
export function tempoFor(input: {
  knowledgeType: KnowledgeType;
  operation: ObjectiveCapability;
}): TaskTempo {
  return input.knowledgeType === "association" && input.operation === "recall"
    ? "instant"
    : "deliberate";
}
