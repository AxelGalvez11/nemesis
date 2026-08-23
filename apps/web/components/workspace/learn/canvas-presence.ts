// What the learner actually has in front of them.
//
// 🔴 WHY THIS EXISTS: A CANVAS COULD PAINT NOTHING, FOR EVER, AND NOTHING SAID SO.
//
// Observed on production 3/3, on a PDF lecture, a PDF equation sheet and a PowerPoint: upload
// material, press send, and the page goes blank and stays blank. No question, no text, no error.
// Leaving the canvas and reopening it from the Library then works — which is the shape of the bug
// rather than an accident of timing.
//
// The mechanism is entirely structural, and every step of it is reasonable on its own:
//
//   1. `begin()` sets `canvas.state = "learn"` and generates nothing. That is §24, deliberate:
//      "source ingestion is not source summarization" — opening a document must not write a
//      summary of the document back at the learner.
//   2. `learn` is a READING state, so `composeSurface` says the document region paints.
//   3. `CanvasDocument` maps over `canvas.blocks`, and §24 made "a `learn` canvas with zero
//      blocks" the ORDINARY case. It renders an empty `<div>`.
//   4. The processing state (`CanvasThinkingPreview`) was gated on the canvas NOT having begun,
//      so pressing send is precisely what removed the only thing that was speaking.
//   5. The policy's contribution is the one remaining candidate, and it paints only once
//      knowledge has resolved into something askable.
//
// So whenever the policy is not presenting, `learn` + zero blocks is a blank page, and the
// transition into it is one-way. Four different policy outcomes land there:
//
//   | policy at send        | what the learner saw            |
//   | --------------------- | ------------------------------- |
//   | unavailable           | an empty page, for ever         |
//   | loading, no phase yet | an empty page                   |
//   | loading, phase named  | a caption, then an empty page   |
//   | ready + a decision    | the question (the working case) |
//
// 🔴 THE FIX IS NOT "PUT THE OLD GATE BACK". It is that the surface must be able to say what it
// is doing in EVERY state, not only before the canvas has begun. So the question moves out of the
// component and becomes a value: what is on screen right now, and if the answer is "no content",
// which stand-in is honest here.
//
// PURE. No React, no I/O, no copy. What a presence MEANS is decided here; what it LOOKS like is
// the component's, and what the policy knows is the runtime's.

import { composeSurface, type CanvasRegions } from "@/lib/learn/canvas-hosting";
import type { CanvasState } from "@/lib/learn/canvas-model";

/**
 * What the canvas is putting in front of the learner.
 *
 * 🔴 TOTAL, AND THERE IS DELIBERATELY NO "NOTHING" MEMBER. A union that could answer "nothing" is
 * a union that lets a caller hold the defect as a legitimate value and forget to render it. Every
 * member here is something the surface paints (or, for `invitation`, something the surface paints
 * a control for), so "the learner is looking at an empty page with no way to know why" is not
 * representable rather than merely discouraged.
 */
export type CanvasPresence =
  /** The policy is asking, correcting, or reporting a verdict it has just given. */
  | "task"
  /** Reading material the learner can actually read — blocks that exist. */
  | "reading"
  /**
   * Nemesis answering something the learner asked. Ordinary conversation, and the whole page.
   *
   * 🔴 IT HAD TO BECOME A PRESENCE, NOT ONLY A REGION, BECAUSE OF WHAT THE SURFACE SAID WITHOUT IT.
   * A canvas that has begun, holds no blocks and has no policy decision resolves to `quiet` — and
   * `quiet` says *"Nemesis has your material but hasn't found anything to ask you about yet"* with a
   * Try again beside it. That was being painted directly above a perfectly good answer Nemesis had
   * just given, because "is there anything on this surface?" was asked without counting the reply as
   * anything. An answer is content; a surface holding one is not quiet.
   */
  | "reply"
  /** A legacy evidence stage. Kept because the state union still admits one. */
  | "stage"
  /** A step is genuinely running. The surface names it; see `thinking-phases.ts`. */
  | "preparing"
  /**
   * The canvas has not begun, and the composer IS the interface (§1, §4).
   *
   * 🔴 THE ONE LEGITIMATELY EMPTY BODY, AND IT IS NOT A DEAD END. §1 deleted the two pre-content
   * screens on purpose — "a canvas that has not begun is the canvas, with the persistent composer
   * already docked". The composer carries the attached material as chips, the placeholder that
   * says a bare send is enough, and the control that starts it. Painting a second invitation in
   * the body is the onboarding screen §4 forbids.
   */
  | "invitation"
  /**
   * The canvas has begun, nothing is running, and there is nothing to present.
   *
   * 🔴 THIS IS THE STATE THAT USED TO BE A BLANK PAGE. It is a real outcome — a source Nemesis
   * could not read, or one it read and found nothing askable in — and it is not a claim about the
   * learner, so the surface must say so and offer the way forward rather than going quiet.
   *
   * `thinking-phases.ts` already states the owner's rule this violates: "ninety seconds with no
   * transition or failure state should never be REPRESENTABLE."
   */
  | "quiet";

/**
 * The presences with no content of their own, which the surface must therefore paint a stand-in
 * for.
 *
 * 🔴 EXPORTED SO A GUARD CAN ENUMERATE THEM RATHER THAN MATCHING A SPELLING. A test that pinned
 * the expression rendering each one would go red on a reformat and green on a deleted branch —
 * the failure mode `correction-loop.test.ts` demonstrated, where a guard required the exact
 * expression that caused the bug it was named after.
 */
export const STANDIN_PRESENCES = ["preparing", "invitation", "quiet"] as const;

/**
 * The presences that put something in the BODY of the canvas.
 *
 * 🔴 `invitation` IS NOT ONE OF THEM, AND THAT DISTINCTION WAS FOUND BY CALIBRATION RATHER THAN BY
 * REVIEW. A guard asserting only "the presence is a stand-in" stayed GREEN against a deliberate
 * break that special-cased the fix to `learn` — because the break made `orient` and
 * `targeted_relearn` report `invitation`, which IS a stand-in, and which renders nothing. The
 * blank page came straight back with the guard still passing.
 *
 * So the property has to name the narrower thing: once a canvas has begun, whatever it reports has
 * to be something the learner can actually see.
 */
export const PAINTING_PRESENCES = ["task", "reading", "reply", "stage", "preparing", "quiet"] as const;

/**
 * Whether this canvas has not begun — the one condition under which an empty body is correct.
 *
 * Exported so the guard asks the same question the derivation does, rather than keeping its own
 * copy of the state list. Two copies of a state list is how one of them ends up stale.
 */
export function hasNotBegun(canvasState: CanvasState): boolean {
  return PRE_CONTENT_STATES.includes(canvasState);
}

/** Every value `canvasPresentation` can return, for exhaustive sweeps. */
export const CANVAS_PRESENCES: readonly CanvasPresence[] = [
  "task",
  "reading",
  "reply",
  "stage",
  "preparing",
  "invitation",
  "quiet",
];

/** Canvas states that hold no lesson yet — the composer is the whole interface there. */
const PRE_CONTENT_STATES: readonly CanvasState[] = ["empty", "sources_attached"];

export interface CanvasPresentation {
  /**
   * A step is running — a turn the learner asked for, or ambient work.
   *
   * 🔴 NOT THE SAME QUESTION AS `presence`, and keeping them apart is what lets the canvas be one
   * persistent screen: content stays put while this is true, and the surface shows it is working
   * without taking the lesson away to prove it.
   */
  working: boolean;
  /** Which regions may paint. Decided by `composeSurface`, never re-decided here. */
  regions: CanvasRegions;
  /** What the learner is actually looking at, once the regions are resolved against reality. */
  presence: CanvasPresence;
}

/**
 * What paints, and what the learner sees, from one set of facts.
 *
 * 🔴 IT RETURNS THE REGIONS TOO, AND THAT IS THE POINT RATHER THAN A CONVENIENCE. The component
 * used to call `composeSurface` itself and then decide the empty case with inline conditions, so
 * the two answers could disagree — and they did. `composeSurface`'s own documentation names the
 * defect: `hasReadingMaterial` is optional and "absent means assume there is", and the single call
 * site omitted it, so a hosted task shrank to leave room for a document that was not there. One
 * call, one derivation, and the omission is no longer expressible.
 */
export function canvasPresentation(input: {
  canvasState: CanvasState;
  /** How many blocks of reading material the canvas actually holds. */
  blocks: number;
  /** The policy has something to present — a question, a correction, or a verdict. */
  policyPresenting: boolean;
  /**
   * A step is genuinely running and can be named.
   *
   * 🔴 NEVER A TIMER, AND NEVER "SOMETHING PROBABLY IS". `thinking-phases.ts` is explicit that a
   * caption which walks through phases on an interval "would look exactly like a system thinking
   * and would be theatre". This is the caller's answer to "is a real step executing", and it is
   * the only thing that distinguishes `preparing` from `quiet`.
   */
  working: boolean;
  /** The material IS the cognitive action in flight — see `materialOwnsAttention`. */
  materialIsTheAction?: boolean;
  /** What Nemesis has said canvas-wide, and which kind it is — see `composeSurface`. */
  aside?: "none" | "opening" | "reply";
  /** The policy is asking for something the learner has not produced yet — see `composeSurface`. */
  answerOwed?: boolean;
  /**
   * The learner has just sent something and Nemesis is producing the answer to it.
   *
   * 🔴🔴 NARROWER THAN `working`, AND THE DIFFERENCE IS THE WHOLE SAFETY OF THIS. Owner call,
   * 2026-08-20: since their own words never appear on the canvas, the thinking state is the only
   * acknowledgement that a send happened, and they chose for it to REPLACE what was on screen.
   *
   * `working` is true for background knowledge resolution too, which this session measured running
   * for MINUTES on a topic-only canvas. Letting that replace the surface would take a perfectly
   * readable lesson away from someone who was reading it, for minutes, with no way to get it back
   * — the blank-screen defect of #690 returning with a mascot painted over it.
   *
   * So this is a TURN in flight: the learner asked, and the answer is being made. Ambient work
   * stays ambient and reports itself the way it always did.
   */
  turnInFlight?: boolean;
}): CanvasPresentation {
  const {
    answerOwed = false,
    aside = "none",
    blocks,
    canvasState,
    materialIsTheAction = false,
    policyPresenting,
    turnInFlight = false,
    working,
  } = input;

  // 🔴 `hasReadingMaterial` IS PASSED, WHICH THE ONE PRODUCTION CALL SITE DID NOT DO. §24 made a
  // reading state with zero blocks ordinary, so "is this a reading state" and "is there something
  // to read" came apart — and `composeSurface` degrades to the pre-§24 reading when not told.
  const regions = composeSurface({
    answerOwed,
    aside,
    canvasState,
    hasReadingMaterial: blocks > 0,
    materialIsTheAction,
    policyPresenting,
  });

  // Precedence is content first. A step running while a question is on screen is ambient — the
  // learner is not staring at nothing — and the surface reports that separately.
  // 🔴 `reply` SITS BELOW `task` AND ABOVE EVERYTHING ELSE, AND THE ORDER IS NOT ARBITRARY. It can
  // only reach `task` at all when a question is owed — `composeSurface` refuses to displace one —
  // and in that case the ASK is what the learner is being held to, so it names the presence and the
  // answer rides along beneath it. Everywhere else a reply is the newest thing Nemesis has said and
  // the only thing on the surface, so it outranks a document, a running step, and `quiet`.
  // 🔴🔴 CONTENT OUTRANKS THINKING NOW, AND THAT REVERSES A DELIBERATE CHOICE (owner 2026-08-22:
  // "canvas should have one persistent screen not a swapping one").
  //
  // `turnInFlight` used to sit ABOVE everything here, so a send replaced whatever was on screen
  // with the thinking state — the owner's own call on 2026-08-20, for a real reason: the learner's
  // words are never rendered, so without SOME visible change a send looked like nothing happened.
  //
  // What it cost, measured against the surface: `presence` is part of `surfaceKey`, and every
  // change of that key runs `CanvasFade` — 160ms out, 220ms in. One answer crossed it twice and
  // spent ~760ms dissolving the page away and back, with the document rewritten in the gap. Two
  // full rebuilds per turn is what "changing screens" was.
  //
  // 🔴 THE ACKNOWLEDGEMENT DOES NOT DEPEND ON THE REPLACEMENT, which is what makes this safe to
  // reverse. Three other things already report a turn in flight and none of them blank the page:
  // the character walks to the middle of the surface, `CanvasThinking` names the running step, and
  // the composer goes busy. The send stays unmistakable; the lesson stays where the learner left it.
  //
  // 🔴 `preparing` IS NOT GONE — IT MOVED DOWN. It still owns the surface when there is nothing to
  // keep, which is the blank-page defect this whole file exists to prevent. It just stops evicting
  // content that is already there.
  const presence: CanvasPresence = regions.policy
    ? "task"
    : regions.reply
      ? "reply"
      : regions.stages
        ? "stage"
        : regions.document && blocks > 0
          ? "reading"
          : turnInFlight || working
            ? "preparing"
            : hasNotBegun(canvasState)
              ? "invitation"
              : "quiet";

  // 🔴 REPORTED SEPARATELY RATHER THAN FOLDED INTO THE PRESENCE, which is the point of the
  // reversal above: the surface must be able to say "something is running" without that being the
  // same fact as "this is what you are looking at".
  return { presence, regions, working: turnInFlight || working };
}
