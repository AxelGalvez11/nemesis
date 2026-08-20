// What submitting through the primary composer MEANS right now. Exactly one answer, in one place.
//
// 🔴🔴🔴 THIS FILE EXISTS BECAUSE FIVE BOOLEANS USED TO ANSWER THAT QUESTION AND THEY DISAGREED.
//
// The composer routed by which handlers it had been handed:
//
//     if (onStart) onStart(value);
//     else if (answering) onAnswer(value, …);
//     else onAsk(value);
//
// with `onStart` gated on `preContent = canvas.state === "empty" || canvas.state ===
// "sources_attached"`. Nothing advances `canvas.state` when the policy runtime stages a question —
// knowledge resolves the moment a source's durable id lands, and `begin()` (the only writer of
// `state: "learn"`) has not run yet. So a learner read a real question, typed a real answer, pressed
// a button labelled **Submit answer**, and the text went to `begin()`: a model call, a re-titled
// canvas, a different question, and NO evidence row. No error, because nothing failed.
//
// 🔴 THE DEFECT IS CONDITIONAL, AND THE CONDITION IS EXACTLY THIS PREDICATE. Production holds one
// typed answer that DID reach the judge — canvas `796a6045`, 2026-08-14, `"Current goes up, because
// more resistance pushes more charge through the wire."` — and that canvas is stored at `learn`.
// Every canvas that never had `begin()` pressed stays at `sources_attached` and loses its answers.
// That is the common shape, not an edge case: material dropped on the front door attaches, resolves
// and asks without anyone pressing send.
//
// 🔴 THE PRODUCT INVARIANT, OWNER, 2026-08-18: *"IF NEMESIS IS VISIBLY ASKING THE LEARNER A
// QUESTION, SUBMITTING THROUGH THE PRIMARY COMPOSER IS AN ANSWER TO THAT QUESTION."* No stale
// `canvas.state`, no `onStart` handler, no placeholder, no hosting flag and no `preContent` boolean
// may outrank the fact that the Canvas is awaiting an answer.
//
// So the ordering is not a chain of `if`s spread across a component tree that a future edit can
// reorder. It is ONE pure function returning ONE union that cannot hold two meanings, and the
// composer switches on it rather than deducing anything.
//
// PURE. No React, no I/O. Strictly downstream of `canvas-hosting.ts`: that module decides what
// paints and who would RECEIVE an answer; this one decides what a submission IS.

import { isPreContent, type AnswerSink, type HostedTaskShape } from "./canvas-hosting";
import type { CanvasState } from "./canvas-model";

/**
 * The three things a submission can mean. Exactly three, and never two at once.
 *
 * 🔴 A UNION, NOT A RECORD OF FLAGS, FOR THE SAME REASON `AnswerSink` IS ONE. `{ start?: …,
 * answer?: … }` compiles with both set, and the first edit that forgets to clear one reintroduces
 * precedence-by-accident — which is the whole defect this replaces.
 */
export type ComposerIntent =
  /** Nemesis is waiting for the learner to respond to a cognitive task. */
  | { kind: "answer"; sink: "policy" | "stage"; task: HostedTaskShape }
  /** The Canvas has genuinely not begun. Submitting starts it. */
  | { kind: "start" }
  /** Ordinary conversational input about whatever is on screen. */
  | { kind: "ask" };

/**
 * The one authoritative reading of "what does submitting mean right now?".
 *
 * 🔴 ANSWER OUTRANKS EVERYTHING, WHICH IS THE INVERSION. `start` used to win by being tested first;
 * it now wins only when nothing else is true, and it is the ONLY branch that can destroy work —
 * `begin()` re-titles the canvas and regenerates it. A wrong `ask` costs a wasted reply. A wrong
 * `start` costs the learner's answer, their canvas title and their question.
 *
 * 🔴 "HAS NOT BEGUN" IS THREE FACTS, NOT ONE STORED FIELD. A canvas has begun if anything is
 * awaiting an answer, if the policy HOLDS anything (a lesson, a correction, a verdict just given —
 * whether or not it is the thing currently on screen), or if a sink exists at all. Each of those is a live observation of the surface; the stored
 * state is the one input that can be stale, so it is necessary and never sufficient.
 *
 * 🔴 `awaitingAnswer` IS A SECOND, INDEPENDENT WITNESS AND IT IS DELIBERATELY REDUNDANT. Today it
 * can never be true while the sink is `none` — `use-policy-runtime` hosts a task for every action
 * that awaits one. If a future action type awaits an answer and forgets to host a task, this makes
 * the failure "the learner's text is treated as a question" rather than "the learner's canvas is
 * silently restarted". Both are wrong; only one is destructive.
 */
export function composerIntent(input: {
  /** The runtime says a question is on screen and unanswered. */
  awaitingAnswer: boolean;
  /** The canvas's STORED lifecycle state — necessary for `start`, never sufficient. */
  canvasState: CanvasState;
  /**
   * The policy HOLDS something — a question, a correction, a contrast, a verdict just given.
   *
   * 🔴🔴 EXISTENCE, NOT OCCUPANCY, AND THE TWO CAME APART THE DAY A REPLY COULD DISPLACE A SCREEN.
   * This input was `policyPresenting`, which meant both at once for as long as the policy's screen
   * was the only thing that could be on the surface. It no longer is: `composeSurface` now lets a
   * conversational answer take the page from a claim being taught, so "the policy has content" and
   * "the policy is visible" are different facts and this function needs the FIRST one.
   *
   * 🔴 GETTING THAT BACKWARDS IS DESTRUCTIVE, WHICH IS WHY IT IS SPELLED OUT RATHER THAN INFERRED.
   * Feed the visible value in and `begun` goes false the moment a reply lands — and `answerSink`
   * reads the same region, so `sink` goes to `none` in the same instant. Two of `begun`'s three
   * terms vanish together, `start` becomes reachable on a `sources_attached` canvas, and the
   * learner's next sentence re-titles and regenerates the canvas they were talking to. That is the
   * exact failure this whole file was written to end, arriving through the one input that was
   * doing two jobs.
   *
   * The VISIBLE half is not thrown away: it lives in `sink`, which is derived from the region. So
   * the invariant reads exactly as the owner wrote it — *visibly* asking makes a submission an
   * answer — and its converse now holds too, which it could not before.
   */
  policyHasContent: boolean;
  /** Who would receive an answer, from `answerSink`. Region-derived, and therefore VISIBLE. */
  sink: AnswerSink;
}): ComposerIntent {
  const { awaitingAnswer, canvasState, policyHasContent, sink } = input;

  // 🔴 `answered` AND `placeholder` ARE CHECKED HERE RATHER THAN IN THE COMPOSER, WHICH IS WHERE
  // THEY USED TO LIVE (`const answering = Boolean(task && !task.answered && task.placeholder)`).
  // Two components each deciding whether a task is answerable is two chances to disagree.
  if (sink.kind !== "none" && !sink.task.answered && Boolean(sink.task.placeholder)) {
    return { kind: "answer", sink: sink.kind, task: sink.task };
  }

  // A sink that exists but is spent — an answered stage task — is still a Canvas that has content.
  // Falling through to `start` there would restart a canvas mid-session.
  const begun = sink.kind !== "none" || awaitingAnswer || policyHasContent;
  if (!begun && isPreContent(canvasState)) return { kind: "start" };
  return { kind: "ask" };
}
