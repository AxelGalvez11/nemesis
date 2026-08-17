/**
 * The showcase as ONE CONTINUOUS LEARNING SESSION, written as data.
 *
 * ── WHY THIS REPLACED THE REEL ────────────────────────────────────────────────
 *
 * The previous showcase was six scenes on a nine-second rotation. Two things were
 * wrong with it and the owner named both: it had visible dead time, and it argued
 * "look at the things Nemesis can draw" rather than "watch Nemesis teach someone".
 *
 * The dead time was structural, not a tuning mistake. Every scene finished its
 * choreography at 78% and then HELD for the remaining 22% — about two seconds of
 * a finished picture sitting still — and between scenes `bands()` drove both
 * neighbours to zero so the frame contained nothing but a small mark for another
 * second and a half. Three and a half seconds of stillness in every nine, twice a
 * minute, is exactly long enough to read as "has this frozen?".
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────────
 *
 * One Canvas shell that never moves, with a composer pinned to the bottom, and a
 * learning session running inside it:
 *
 *   Nemesis teaches (passage + a figure that illustrates the actual claim)
 *   the learner presses Continue
 *   Nemesis asks a question about what it just taught
 *   the learner answers THROUGH THE COMPOSER, and you watch them do it
 *   Nemesis thinks, then evaluates and refines
 *   it moves straight into the next concept
 *
 * Three acts — biology, mathematics, chemistry — because the line under the frame
 * claims exactly those three, and because a Canvas that becomes a heart, then a
 * limit, then an energy profile is the "whatever learning requires" claim being
 * demonstrated instead of printed.
 *
 * ── EVERYTHING IS A PURE FUNCTION OF ONE NUMBER ───────────────────────────────
 *
 * `sessionState(t)` takes 0..1 and returns everything on screen. Same constraint
 * the scenes already had, kept for two reasons: it matches the rest of this
 * directory, and it makes the owner's first acceptance criterion — "no perceptible
 * dead pause" — MEASURABLE. Step t in small increments, diff consecutive states,
 * and any interval where nothing changes is dead time with a number attached. An
 * animation driven by internal timers could only be watched, and watching is not
 * available in a background tab that delivers one frame per screenshot.
 *
 * ── THE WRAP IS CROSSFADED BY CONSTRUCTION ────────────────────────────────────
 *
 * 🔴 There is no "last act". Act index is `floor(t * 3) % 3` and the OUTGOING act
 * is `(index + 2) % 3`, so at t just past 1 the third act is fading out under the
 * first exactly as the first fades out under the second. The loop point is not a
 * special case, which is why it cannot read as a reset.
 */

import { clamp01, ease, window01 } from "../progress";

/**
 * Seconds of one act. Three of these is the whole loop.
 *
 * 🔴 IT ENDS ALMOST IMMEDIATELY AFTER THE LAST PRESS, AND THAT NUMBER WAS
 * MEASURED. At 17.6 the second Continue was pressed at 15.6 and the act then sat
 * completely unchanged for 1650ms before the next one began — the single longest
 * still moment in the loop, and the same defect as the reel this replaced. The
 * handover is the only thing that should follow the press, so the act ends when
 * the press has finished resolving.
 */
export const ACT_SECONDS = 15.6;
export const ACTS = 3;
export const CYCLE_SECONDS = ACT_SECONDS * ACTS;

/** How long an outgoing act keeps fading under the incoming one, in seconds. */
const XFADE = 1.1;

/** Which figure an act shows. Each is an existing scene, unchanged. */
export type FigureKind = "anatomy" | "plot" | "chemistry";

/** Where the synthetic cursor is heading. Resolved to real element boxes at render. */
export type CursorTarget = "continue" | "input" | "send";

export type Act = {
  readonly id: string;
  readonly subject: string;
  readonly figure: FigureKind;
  /** The teaching passage, in the chunks it appears in. Never a typewriter. */
  readonly teach: readonly string[];
  readonly question: string;
  /** What the composer invites while the question is open. Real Canvas wording. */
  readonly placeholder: string;
  /** The learner's answer, in the groups it fades in as. */
  readonly answer: readonly string[];
  /** Nemesis's verdict headline. Taken from the product's own VERDICT_HEADLINE. */
  readonly verdict: string;
  /** The refinement under it — the part that makes this teaching, not marking. */
  readonly refine: string;
};

/**
 * 🔴 THE COPY IS THE PRODUCT'S VOICE, NOT MARKETING'S. Verdicts are the literal
 * strings from `canvas-judge.ts` (VERDICT_HEADLINE.understood is "That's it.");
 * the placeholder follows the real composer's task wording. A landing page that
 * invents warmer copy for the same moments is showing a product that does not
 * exist.
 *
 * 🔴 AND EVERY ANSWER IS THE LEARNER BEING RIGHT-BUT-INCOMPLETE. That is the
 * interesting case and the one Nemesis is actually for: a verdict alone is
 * marking, and the refinement underneath is the teaching. A wrong answer would
 * make the demo about correction, and a perfect answer would make the refinement
 * redundant.
 */
export const SCRIPT: readonly Act[] = [
  {
    id: "biology",
    subject: "Cardiac anatomy",
    figure: "anatomy",
    teach: [
      "The left ventricle pushes blood through your entire body. The right ventricle only has to reach the lungs.",
      "Same volume every beat, very different pressure. The chamber doing the harder job is built thicker.",
    ],
    question: "Why does the left ventricle have a thicker wall than the right?",
    placeholder: "Answer in your own words…",
    answer: ["Because it has to generate more pressure", "to push blood around the whole body."],
    verdict: "That's it.",
    refine:
      "More precisely: it works against the resistance of the entire systemic circuit, where the right ventricle only faces the lungs.",
  },
  {
    id: "mathematics",
    subject: "The derivative",
    figure: "plot",
    teach: [
      "The average rate of change between two points is the slope of the line joining them.",
      "Slide the second point toward the first and that line settles onto one direction.",
    ],
    question: "What happens to the secant as the two points move together?",
    placeholder: "Answer in your own words…",
    answer: ["It becomes the tangent at that point,", "and its slope is the derivative."],
    verdict: "That's it.",
    refine:
      "And the value it settles on is the limit of the difference quotient as h approaches zero.",
  },
  {
    id: "chemistry",
    subject: "Catalysis",
    figure: "chemistry",
    teach: [
      "A catalyst offers the reaction a lower path over the energy hill, so it gets there sooner.",
      "It does not move where the reaction ends up. The start and the finish stay exactly where they were.",
    ],
    question: "Does a catalyst change how much product you end up with?",
    placeholder: "Answer in your own words…",
    answer: ["No, it only speeds it up.", "The equilibrium position is unchanged."],
    verdict: "That's it.",
    refine:
      "It lowers the barrier in both directions by the same factor, so the ratio that sets equilibrium is untouched.",
  },
];

/* ── The beat sheet, in seconds from the start of an act ─────────────────────
   🔴 EVERY WINDOW OVERLAPS ITS NEIGHBOUR. There is no moment where one thing has
   finished leaving and the next has not started arriving — that gap is precisely
   what the old showcase's hold-then-handoff produced, and it is what the owner
   saw. Read down the right-hand column: no value is ever equal to the one above
   it, they always cross.
   ────────────────────────────────────────────────────────────────────────────*/
const B = {
  /** Teaching passage, one window per chunk. */
  teachIn: [0.15, 1.05] as const,
  teachIn2: [1.15, 2.05] as const,
  /** Continue arrives while the passage is still settling. */
  continueIn: [2.5, 3.1] as const,
  /** Cursor travels to Continue and presses it. */
  cursorToContinue: [3.3, 4.5] as const,
  press: [4.5, 4.78] as const,
  /** The passage leaves as the question arrives — they cross at 5.3. */
  teachOut: [4.85, 5.7] as const,
  questionIn: [5.15, 6.05] as const,
  /** Cursor moves into the composer, the answer forms in groups. */
  cursorToInput: [6.35, 7.35] as const,
  answerIn: [7.2, 8.0] as const,
  answerIn2: [8.05, 8.85] as const,
  /** Send appears the moment there is something to send, then is pressed. */
  sendIn: [8.5, 8.9] as const,
  cursorToSend: [8.95, 9.75] as const,
  sendPress: [9.75, 10.03] as const,
  /** Composer empties, Nemesis thinks. */
  thinking: [10.05, 11.15] as const,
  /** The learner's own words come back, then the verdict, then the refinement. */
  utteranceIn: [10.95, 11.6] as const,
  verdictIn: [11.5, 12.15] as const,
  refineIn: [12.3, 13.1] as const,
  /** Second Continue arrives while the refinement is still settling — measured:
   *  starting it at 13.5 left a 450ms hole after the refinement finished. */
  continue2In: [13.0, 13.6] as const,
  cursorToContinue2: [13.7, 14.85] as const,
  press2: [14.85, 15.13] as const,
  /** Nothing after the press but the handover, which the NEXT act drives. An
   *  `actOut` window used to live here and was the 1650ms stall: it faded content
   *  that the incoming act was already fading, so for two seconds the arithmetic
   *  produced no visible change at all. */
} as const;

const w = (t: number, [a, b]: readonly [number, number]) => ease(window01(t, a, b));

export type SurfaceItem = {
  readonly key: string;
  readonly kind: "teach" | "question" | "utterance" | "verdict" | "refine";
  readonly text: string;
  readonly opacity: number;
  /** Small upward settle as it arrives. Never more than 8px — this is a fade. */
  readonly lift: number;
};

export type SessionState = {
  readonly actIndex: number;
  readonly act: Act;
  /** 0..1 through the act. */
  readonly local: number;
  readonly seconds: number;
  /** Everything currently on the learning surface, already ordered. */
  readonly surface: readonly SurfaceItem[];
  /** The whole act's content, faded as one during the handover. */
  readonly actOpacity: number;
  readonly figure: { readonly kind: FigureKind; readonly t: number; readonly opacity: number };
  readonly composer: {
    readonly placeholder: string;
    /** What is currently "typed", already split into visible groups. */
    readonly groups: readonly { readonly text: string; readonly opacity: number }[];
    readonly sendOpacity: number;
    readonly sendPressed: number;
    readonly busy: boolean;
  };
  readonly continueButton: { readonly opacity: number; readonly pressed: number };
  readonly thinking: number;
  readonly cursor: {
    readonly visible: number;
    readonly from: CursorTarget | "rest";
    readonly to: CursorTarget;
    /** 0..1 along the path. */
    readonly progress: number;
    readonly pressing: number;
  } | null;
  /** The act fading out underneath, if the handover is running. Carries its own
   *  final surface so the whole screen leaves together. */
  readonly outgoing: {
    readonly act: Act;
    readonly opacity: number;
    readonly figure: FigureKind;
    readonly surface: readonly SurfaceItem[];
  } | null;
};

/** Eased travel that starts and stops gently — a hand moving, not a slide. */
function travel(t: number, [a, b]: readonly [number, number]): number {
  return ease(window01(t, a, b));
}

/** A press: down fast, back up. Peaks in the middle of its window. */
function press(t: number, [a, b]: readonly [number, number]): number {
  const local = window01(t, a, b);
  if (local <= 0 || local >= 1) return 0;
  return Math.sin(local * Math.PI);
}

/**
 * Everything on the learning surface for one act at one moment.
 *
 * 🔴 SHARED WITH THE HANDOVER, WHICH IS WHY IT IS A FUNCTION. The outgoing act
 * used to be drawn as its refinement line alone, so at every act boundary the
 * question, the learner's answer and the verdict were CUT rather than faded while
 * one paragraph dissolved beside them. Reading the leaving act's real final state
 * through the same function is the only way the two are guaranteed to match.
 */
function surfaceAt(act: Act, s: number): SurfaceItem[] {
  const out: SurfaceItem[] = [];
  const teachLeaving = 1 - w(s, B.teachOut);

  const teach1 = w(s, B.teachIn) * teachLeaving;
  if (teach1 > 0.001) {
    out.push({ key: `${act.id}-teach-0`, kind: "teach", text: act.teach[0]!, opacity: teach1, lift: (1 - w(s, B.teachIn)) * 8 });
  }
  const teach2 = w(s, B.teachIn2) * teachLeaving;
  if (teach2 > 0.001) {
    out.push({ key: `${act.id}-teach-1`, kind: "teach", text: act.teach[1]!, opacity: teach2, lift: (1 - w(s, B.teachIn2)) * 8 });
  }

  const question = w(s, B.questionIn);
  if (question > 0.001) {
    out.push({ key: `${act.id}-question`, kind: "question", text: act.question, opacity: question, lift: (1 - question) * 8 });
  }

  const utterance = w(s, B.utteranceIn);
  if (utterance > 0.001) {
    out.push({ key: `${act.id}-utterance`, kind: "utterance", text: act.answer.join(" "), opacity: utterance, lift: (1 - utterance) * 8 });
  }

  const verdict = w(s, B.verdictIn);
  if (verdict > 0.001) {
    out.push({ key: `${act.id}-verdict`, kind: "verdict", text: act.verdict, opacity: verdict, lift: (1 - verdict) * 8 });
  }

  const refine = w(s, B.refineIn);
  if (refine > 0.001) {
    out.push({ key: `${act.id}-refine`, kind: "refine", text: act.refine, opacity: refine, lift: (1 - refine) * 8 });
  }

  return out;
}

export function sessionState(t: number): SessionState {
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * ACTS;
  const actIndex = Math.min(ACTS - 1, Math.floor(scaled));
  const local = scaled - actIndex;
  const s = local * ACT_SECONDS;
  const act = SCRIPT[actIndex]!;

  // ── The handover ──────────────────────────────────────────────────────────
  // 🔴 The PREVIOUS act, not the next one, and the modulo is what makes the loop
  // point ordinary. At the very start of act 0 the outgoing act is act 2, so the
  // wrap crossfades exactly like every other boundary.
  const xfade = clamp01(s / XFADE);
  const outgoingAct = SCRIPT[(actIndex + ACTS - 1) % ACTS]!;
  const outgoing =
    xfade < 1
      ? {
          act: outgoingAct,
          opacity: 1 - ease(xfade),
          figure: outgoingAct.figure,
          // Its real final state, through the same function the live act uses —
          // so the whole feedback screen fades as one rather than one line of it
          // dissolving while the rest is cut.
          surface: surfaceAt(outgoingAct, ACT_SECONDS - 0.05),
        }
      : null;

  // The incoming act's own content is held back until the outgoing one is mostly
  // gone, so the two are never both at full strength on the same pixels.
  const actOpacity = ease(clamp01(s / (XFADE * 0.85)));

  // ── The learning surface ──────────────────────────────────────────────────
  const surface = surfaceAt(act, s);
  const questionOn = w(s, B.questionIn);

  // ── The composer ──────────────────────────────────────────────────────────
  // 🔴 The typed answer CLEARS on send, exactly as the real one does, and the
  // clearing is what makes the send read as having done something.
  const sent = w(s, [B.sendPress[1], B.sendPress[1] + 0.2] as const);
  const g1 = w(s, B.answerIn) * (1 - sent);
  const g2 = w(s, B.answerIn2) * (1 - sent);
  const thinking = w(s, B.thinking) * (1 - w(s, [B.thinking[1], B.thinking[1] + 0.35] as const));

  // ── The cursor ────────────────────────────────────────────────────────────
  // Only three journeys, and each one ends in a press the viewer can see.
  //
  // 🔴 THE POINTER LEAVES BEFORE THE THING IT PRESSED DOES. Its exit begins
  // slightly BEFORE the press window closes, because the control it is on starts
  // fading the instant the press lands. Tuned the other way round — cursor out
  // over [end+0.1, end+0.35], button out over [end, end+0.3] — the pointer
  // outlived its own target by 50ms and sat over nothing. The test in
  // session.test.ts is what found that; it is not visible at any speed a person
  // can watch.
  const exit = (end: number) => 1 - ease(window01(s, end - 0.05, end + 0.15));
  let cursor: SessionState["cursor"] = null;
  if (s >= B.cursorToContinue[0] && s < B.press[1] + 0.15) {
    cursor = {
      visible: ease(window01(s, B.cursorToContinue[0], B.cursorToContinue[0] + 0.3)) * exit(B.press[1]),
      from: "rest",
      to: "continue",
      progress: travel(s, B.cursorToContinue),
      pressing: press(s, B.press),
    };
  } else if (s >= B.cursorToInput[0] && s < B.sendPress[1] + 0.15) {
    const toSend = s >= B.cursorToSend[0];
    cursor = {
      visible: ease(window01(s, B.cursorToInput[0], B.cursorToInput[0] + 0.3)) * exit(B.sendPress[1]),
      from: toSend ? "input" : "rest",
      to: toSend ? "send" : "input",
      progress: toSend ? travel(s, B.cursorToSend) : travel(s, B.cursorToInput),
      pressing: press(s, B.sendPress),
    };
  } else if (s >= B.cursorToContinue2[0] && s < B.press2[1] + 0.15) {
    cursor = {
      visible: ease(window01(s, B.cursorToContinue2[0], B.cursorToContinue2[0] + 0.3)) * exit(B.press2[1]),
      from: "rest",
      to: "continue",
      progress: travel(s, B.cursorToContinue2),
      pressing: press(s, B.press2),
    };
  }

  // ── Continue ──────────────────────────────────────────────────────────────
  // Two of them per act: one under the passage, one under the feedback. Same
  // control, same meaning as the product's — "I have finished processing this".
  const c1 = w(s, B.continueIn) * (1 - w(s, [B.press[1], B.press[1] + 0.3] as const));
  const c2 = w(s, B.continue2In) * (1 - w(s, [B.press2[1], B.press2[1] + 0.3] as const));
  const continueOpacity = Math.max(c1, c2);

  // ── The figure ────────────────────────────────────────────────────────────
  // 🔴 Its own progress is NOT the act's. Each figure was authored to complete a
  // choreography over 0..1, and the teaching passage is what it illustrates — so
  // it runs across the teaching and the question and is finished, and holding,
  // by the time the verdict lands. Re-running it under the feedback would put
  // motion under the one thing the learner is meant to read.
  const figureT = clamp01(window01(s, 0.1, 11.4));
  // Dimmed, never removed, while the question owns attention — and back up for
  // the verdict, because the refinement refers to what the picture shows.
  // 🔴 0.28, NOT 0.45. At 0.55 opacity the heart very nearly disappeared against
  // the page, which defeats the figure's whole job: the question names the left
  // ventricle and the model is what shows where that is.
  const figureFocus = 1 - 0.28 * w(s, B.questionIn) * (1 - w(s, B.verdictIn));

  return {
    actIndex,
    act,
    local,
    seconds: s,
    surface,
    actOpacity,
    figure: { kind: act.figure, t: figureT, opacity: figureFocus },
    composer: {
      placeholder: questionOn > 0.5 && sent < 0.5 ? act.placeholder : "Ask Nemesis anything…",
      groups: [
        { text: act.answer[0]!, opacity: g1 },
        { text: act.answer[1]!, opacity: g2 },
      ],
      sendOpacity: w(s, B.sendIn) * (1 - sent),
      sendPressed: press(s, B.sendPress),
      busy: thinking > 0.35,
    },
    continueButton: { opacity: continueOpacity, pressed: Math.max(press(s, B.press), press(s, B.press2)) },
    thinking,
    cursor,
    outgoing,
  };
}
