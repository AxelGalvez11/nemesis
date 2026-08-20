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
   * Nemesis's answer to something the learner just asked, as its own occupant of the surface.
   *
   * 🔴🔴 IT IS A REGION NOW BECAUSE IT WAS AN UNCONDITIONAL SIBLING, AND THAT IS THE REPORTED BUG.
   * `learning-canvas.tsx` rendered the reply after the policy's screen with no relationship between
   * the two, so asking *"what can you do?"* mid-lesson left the teaching card and its Continue at
   * the top of the page and stapled the answer below it — one screen holding two turns, the second
   * of which had nothing to do with the first. The owner met it twice and read it, correctly, as
   * Nemesis being unable to stop teaching.
   *
   * A region makes the relationship a decision this function makes once, with the same asymmetry it
   * already enforces between the policy and the legacy stages: two things may be on the surface, two
   * TURNS may not.
   */
  reply: boolean;
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
 * This canvas's STORED state says it has not begun: no lesson, no evidence, only whatever material
 * is waiting.
 *
 * 🔴 NECESSARY FOR "SUBMITTING MEANS START", NEVER SUFFICIENT — see composer-intent.ts. Nothing
 * advances `canvas.state` when the policy stages a question, so this stayed true with a real
 * question on screen and every typed answer on such a canvas was routed into `begin()`. It is
 * exported so that exactly one list of pre-content states exists; it is NOT exported as a licence
 * to test it alone.
 */
export function isPreContent(state: CanvasState): boolean {
  return PRE_CONTENT_STATES.includes(state);
}

/**
 * A name for the cognitive action in flight, stable while that action is what the learner is doing.
 *
 * 🔴 THE OBJECTIVE *AND* THE ACTION TYPE, BECAUSE EITHER ALONE IS THE WRONG GRAIN. The objective
 * alone would hold attention across "ask → they miss → here is the answer", which is two actions and
 * the second is precisely where general material must stop competing. The action type alone would
 * treat two different objectives' retrievals as one act, so material requested during the first
 * would still be painting under the second.
 */
export const NO_ACTION = "none";

export function actionKey(
  action: { type: string; objectiveId?: string; objectiveIds?: readonly string[] } | null,
): string {
  if (!action) return NO_ACTION;
  const subject = action.objectiveId ?? action.objectiveIds?.join(",") ?? "";
  return `${action.type}|${subject}`;
}

/**
 * Is the reading material on this canvas the cognitive action itself, right now?
 *
 * 🔴🔴 DERIVED, WHICH IS THE WHOLE FIX — THERE IS NOTHING TO CLEAR, SO IT CANNOT GO STALE. The
 * version this replaces was a session boolean set by the command path and never unset, so a single
 * *"explain this"* re-admitted general material beneath every question for the rest of the session:
 * the owner's overview came back one interaction later, and the fix that removed it read as a copy
 * change. A flag that must be cleared in N places is cleared in N−1 of them by the next editor.
 *
 * 🔴 IT ANSWERS THE OWNER'S TEST DIRECTLY — *"Could the learner meaningfully perform the current
 * cognitive action without this text?"* If the text IS the action, the question answers itself and
 * the material owns the Canvas. When the policy moves to a different action, the same material has
 * become background under a live task, and the answer flips with no state change anywhere.
 *
 * PURE, and both arguments are session facts about what the RUNTIME staged — never claims about the
 * learner, never durable.
 */
export function materialOwnsAttention(input: {
  /** The action that was in flight when the learner asked for material. Null: they never asked. */
  requestedDuring: string | null;
  /** The action in flight now. `NO_ACTION` when the policy has nothing to say. */
  actionInFlight: string;
}): boolean {
  return input.requestedDuring !== null && input.requestedDuring === input.actionInFlight;
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
  /**
   * The canvas actually holds reading material right now.
   *
   * 🔴 IT IS NOT DERIVABLE FROM THE STATE ANY MORE, AND §24 IS WHY. `learn` used to imply blocks,
   * because reaching it meant `generateLesson` had run — so "a reading state" and "there is
   * something to read" were the same question and one input answered both. Opening a document no
   * longer writes anything to read, so a canvas sits in `learn` with zero blocks as the ORDINARY
   * case, and the two questions have come apart.
   *
   * 🔴 THE DEFECT THIS PREVENTS IS ALREADY DOCUMENTED IN THIS FILE, ONE STATE OVER. `sharing` told
   * a hosted task to shrink and leave room for reading material; on `sources_attached` that made a
   * question float at the top of an empty surface. Without this input, `learn` with no blocks
   * reproduces exactly that — the same bug arriving through the door §24 just opened.
   *
   * Optional, and absent means "assume there is", which is the pre-§24 reading. Nothing outside
   * this app calls it, but a caller that forgets should degrade to the old layout rather than to a
   * task that has quietly stopped making room for a document that IS there.
   */
  hasReadingMaterial?: boolean;
  /**
   * The reading material IS the cognitive action in flight — not "material exists and someone once
   * asked for some".
   *
   * 🔴🔴 THE ONE THING THAT LETS THE DOCUMENT PAINT WHILE A TASK IS UP, AND THE FIRST VERSION OF IT
   * WAS STICKY. *"Never explain the material merely because it exists. Explain what the learner
   * needs because of what they just demonstrated."* — owner, 2026-08-14, after meeting his own
   * canvas: it asked a real question and then printed **"What Acceptance B1 Covers"** beneath it.
   * I shipped `learnerAskedForContent`, a session flag set by the command path and **never
   * cleared**, so one *"explain this"* re-admitted general material underneath every question for
   * the rest of the session. The overview came back, one interaction later, and the fix read as a
   * copy change again.
   *
   * 🔴 THE INVARIANT IS NOT "READING IS HIDDEN WHENEVER A TASK EXISTS" — owner, correcting me:
   *
   *     "The invariant is that the current cognitive action owns attention. If teaching, targeted
   *      reading, a worked correction, or an explicitly requested explanation is itself the next
   *      cognitive action, that content should own the Canvas. What I don't want is stale/general
   *      document material competing with the active task."
   *
   * So the question this answers is about the material's RELATIONSHIP TO THE ACTION, not about the
   * learner's history: material the learner asked for is the action while that action is in flight,
   * and becomes background the moment the policy moves on. See `materialOwnsAttention`, which
   * derives it and cannot go stale, because there is nothing to clear.
   *
   * Absent means "it is background", which is the suppressing direction and the honest default.
   */
  materialIsTheAction?: boolean;
  /**
   * Nemesis has just answered something the learner asked, and that answer is live.
   *
   * Absent means "no reply", which is the pre-existing reading and leaves every other region exactly
   * where it was.
   */
  replyOnScreen?: boolean;
  /**
   * The policy is asking for something the learner has not produced yet.
   *
   * 🔴🔴 THIS IS THE ONE THING A REPLY MAY NOT PUSH OFF THE SURFACE, AND IT IS THE OWNER'S OWN
   * INVARIANT ARRIVING FROM THE OTHER DIRECTION. *"If Nemesis is VISIBLY asking the learner a
   * question, submitting through the primary composer is an answer to that question."* Hiding a
   * question behind a reply and then reading the next submission as an answer to it would break the
   * word "visibly"; hiding it and reading the submission as a question would silently discard an
   * answer the learner meant. Neither is acceptable, so an owed question simply is not displaced —
   * the reply appears with it, which is also what a teacher does: answer the aside, keep the ask.
   *
   * Everything else the policy can hold — a claim being taught, a correction, a contrast, a verdict
   * already given — owes the learner nothing, and yields.
   */
  answerOwed?: boolean;
}): CanvasRegions {
  const {
    answerOwed = false,
    canvasState,
    hasReadingMaterial = true,
    materialIsTheAction = false,
    policyPresenting,
    replyOnScreen = false,
  } = input;
  const evidenceStage = isEvidenceStage(canvasState);
  const reading = READING_STATES.includes(canvasState);

  // 🔴 THE DISPLACEMENT IS COMPUTED ONCE AND EVERY REGION READS THE RESULT. `answerSink` keys off
  // `regions.policy`, and so does the Continue's `requiresReading` — so a displaced screen loses its
  // answer routing and its button by the same act that takes it off the page, rather than by two
  // more conditions somebody has to remember to write. That is the property: what is on screen, what
  // can be answered, and what can be advanced are one answer.
  const displacedByReply = replyOnScreen && !answerOwed;
  const policy = policyPresenting && !displacedByReply;

  return {
    // 🔴🔴 A HOSTED TASK NOW *DOES* SUPPRESS READING, AND THIS REVERSES A DELIBERATE DECISION. The
    // comment here used to read: *"A hosted task does NOT suppress reading… material the policy
    // cannot represent stays on screen instead of being hidden behind a runtime that took the
    // page."* That was written to answer §12's measured "the policy owned 0 of 6 canvases", and the
    // reasoning was sound for the problem it had.
    //
    // The owner has overturned it, having met the result: his canvas asked *"What follows from
    // increasing resistance, and why?"* and then printed **"What Acceptance B1 Covers"** underneath,
    // several paragraphs telling him what the document he had just uploaded contained. His rule:
    //
    //     "Never explain the material merely because it exists. Explain what the learner needs
    //      because of what they just demonstrated."
    //     "The source is the knowledge substrate, not the page layout."
    //     "Could the learner meaningfully perform the current cognitive action without this text?
    //      If yes, do not render the text."
    //
    // 🔴 THE OLD CONCERN IS ANSWERED RATHER THAN IGNORED. Hiding material was thought to make it
    // unreachable; the owner's answer is that this is the intended behaviour — *"Nemesis should be
    // willing to read 70 slides and initially show the learner one question"* — and the material
    // stays reachable through its sources and by asking. Compression around the learner IS the
    // product; a document rendered in full because it exists is the thing being replaced.
    //
    // 🔴 AND IT IS NOT AN UNCONDITIONAL SUPPRESSION, because "Summarize this" writes into the same
    // blocks. Material that IS the action still paints — see `materialIsTheAction`. Suppressing
    // that too would answer a request with a blank page, which is a different defect wearing this
    // fix's clothes.
    // 🔴 THE READING BODY IS GATED; THE PRE-CONTENT SURFACE IS NOT. A canvas that has not begun is
    // not "material competing with a task" — it is the canvas itself, with its composer. Gating it
    // too was my first version and it took three guards red, which is exactly what they are for.
    document:
      PRE_CONTENT_STATES.includes(canvasState) || (reading && (!policy || materialIsTheAction)),
    // 🔴 THE LEGACY ARM IS NOW A FALLBACK: it paints only where the policy has nothing to say.
    //
    // The exclusion is still one-directional and still expressed in exactly one place — the
    // direction is simply reversed. Both arms can never paint at once, which is the property that
    // matters (two answer surfaces on one composer means one of them silently loses the learner's
    // work), and it is still impossible to have neither: when the policy stands down,
    // `policyPresenting` is false and the stage paints.
    // 🔴 AND THE LEGACY ARM IS DELIBERATELY *NOT* DISPLACED BY A REPLY. It hosts a task through
    // `stageTask`, which this function never sees, so it cannot tell an idle stage from one holding
    // an unanswered card — and displacing the second would hide a question the learner owes, which
    // is the one outcome `answerOwed` exists to prevent. A stage cannot coexist with a policy screen
    // anyway, so the reported defect is not reachable through here. Stated rather than left as an
    // omission, so the asymmetry is a decision on record.
    stages: evidenceStage && !policyPresenting,
    // 🔴 THE COMMENT THAT USED TO SIT HERE WAS RIGHT WHEN WRITTEN AND IS KEPT AS A RECORD, BECAUSE
    // WHAT FALSIFIED IT IS THE WHOLE JUSTIFICATION FOR THIS CHANGE. It read:
    //
    //     "REFUSED WHILE AN EVIDENCE STAGE IS UP, rather than the stage being refused. The
    //      six-stage machine is a run the learner started and is partway through; interrupting it
    //      to ask a policy question would discard answers already given to it."
    //
    // The premise is false. **The legacy arm has never written a `learner_evidence` row.** That is
    // established from the CALL GRAPH: `recordEvidence` has exactly one caller and it is in the
    // policy arm, so a legacy run accumulates answers in `canvas.document` and nothing durable is
    // ever produced from them.
    //
    // 🔴 IT IS NOT ESTABLISHED BY THE EMPTY TABLE, AND THAT DISTINCTION IS LEFT HERE BECAUSE I GOT
    // IT WRONG FIRST. `learner_evidence` reads zero rows, which looks like corroboration and is
    // not. A real row WAS written from the live policy canvas on 2026-08-13 — the table went 0 → 1,
    // observed with the service role — and was then deliberately deleted by id, because a row
    // claiming the account holder demonstrated something they were never asked is a durable false
    // claim about a person. **The table is empty because cleanup worked.**
    //
    // The general form, which is worth more than this instance: an empty table is not evidence that
    // a write path is dead. It is evidence of nothing until you check whether the upstream activity
    // ever happened — and here it did.
    //
    // So the precedence was protecting a run whose output was never recorded — it gave the surface
    // to the arm that cannot learn anything about the learner, and kept it there. That is exactly
    // backwards, and it is why the owner met a fixed six-question quiz on their own canvas.
    policy,
    reply: replyOnScreen,
    // 🔴 REAL READING MATERIAL ONLY. A task makes room for a document; it does not make room
    // for a placeholder that is itself waiting for one, and it does not make room for a reading
    // state that is empty because nothing was generated into it (§24).
    sharing: policy && reading && hasReadingMaterial,
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
