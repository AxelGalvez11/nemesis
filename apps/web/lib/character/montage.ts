// The faces the character wears while nothing is happening.
//
// Owner, 2026-08-27: *"it still does not do expressions after a while of following the mouse"*, and
// then, plainly: *"it essentially needs to follow mouse but also do montage of expressions"*.
//
// 🔴🔴 THIS IS THE ONE THING THE CHARACTER DOES THAT DOES NOT MEAN ANYTHING, AND THAT IS THE POINT
// OF ASKING FOR IT. Rule four of the character's language is *every face has a reason; nothing
// plays at random* (`lib/avatar/features.ts`), and this breaks it deliberately, on the owner's own
// instruction, given twice. It is also exactly what the front page has always done — the rest
// between beats wears a different face each time, and it is where all the variety on that page
// lives (`landing/components/home/Mascot.tsx`).
//
// 🔴 WHY BREAKING THE RULE IS DEFENSIBLE HERE AND WAS NOT FOR THE `?` MARK. The mark asserted
// something — "there is a question for you" — and was wrong about it, repeatedly
// ([[character-signals-are-dead]] is a record of four failed narrowings). A resting face asserts
// nothing. It is the difference between a character that is idle and a character that is switched
// off, and no learner can read it as a claim about their lesson.
//
// 🔴 AND IT ONLY EVER RUNS AT REST. The moment Nemesis is doing something, the schedule owns the
// face again — see `stations.ts`. A montage over a working character would be exactly the rule
// breaking in the way that matters.
//
// 🔴🔴 WHEN AN ENTRY PLAYS IS NO LONGER DECIDED HERE. This file is the CATALOGUE — what may be
// worn, in what order, and for how long — and `attention.ts` is the clock that walks it. They were
// one thing, and being one thing is what let a second clock in `gaze.ts` decide the cursor
// independently: the character wore a face for 100% of its rest and the pointer overrode two
// thirds of it (owner, 2026-08-30: *"during expressions the mouse still moves the mascot eyes"*).
// `montageFace` and `montageLoop` were the two halves of that split and are gone.
//
// 🔴 `montageLoop` FILTERED THIS LIST TO THE MOVEMENT LOOPS and that filter went with it, which
// is a real change and a deliberate one: the owner ticked eleven HELD feelings and they were
// unreachable during a stretch. Its reasoning — that letting go of the cursor during a face which
// moves 0.8px gives a character doing nothing — is answered instead by the shape of the clock. A
// held feeling gets its five seconds and is followed by nine of watching, so no face is ever the
// last thing that happened for long.

import { ANIMATION_BY_ID, animationDuration } from "@/lib/avatar";

/**
 * Everything the montage can be asked to wear, with a word a person can read.
 *
 * 🔴🔴 THE SIXTEEN WERE NOT ALL OF IT, AND THAT WAS THE BUG (owner 2026-08-27: *"there are still
 * some expressions missing, check the github, because the website doesnt just show them forward
 * facing but also moving around"*). This list used to hold the sixteen FEELINGS only, and
 * `resolveMontage` drops anything not on it — so a learner picking a gaze loop got it silently
 * discarded and the default set back. The loops were in the catalogue the whole time.
 *
 * 🔴🔴 AND THE TWO KINDS ARE NOT THE SAME THING WEARING DIFFERENT NAMES. A `feeling` holds ONE
 * face; a `loop` cycles two to six of the measured poses and is where every bit of movement in
 * this character lives. Measured on a 76px character, eye travel over one cycle:
 *
 * | | travel |
 * |---|---|
 * | the busiest loop (`gaze-curious`) | **29.9px** |
 * | loops, typical | 13-30px |
 * | the sixteen feelings, median | **0.8px** |
 *
 * Under a pixel. That is a photograph, and it is the whole reason four separate reports said the
 * character was not pulling faces. The `kind` is still carried because `isMontageLoop` reads it —
 * a loop and a held face are timed differently — though the settings card it was first written for
 * is gone (owner 2026-08-31: *"remove this from settings, the choosing of the montage"*).
 */
export interface MontageChoice {
  readonly id: string;
  readonly label: string;
  /** `loop` cycles several measured poses; `feeling` holds one drawn face. */
  readonly kind: "loop" | "feeling";
}

export const MONTAGE_CHOICES: readonly MontageChoice[] = [
  { id: "gaze-idle", label: "Idle", kind: "loop" },
  { id: "gaze-listening", label: "Listening", kind: "loop" },
  { id: "gaze-thinking", label: "Thinking", kind: "loop" },
  { id: "gaze-searching", label: "Searching", kind: "loop" },
  { id: "gaze-working", label: "Working", kind: "loop" },
  { id: "gaze-curious", label: "Curious", kind: "loop" },
  { id: "gaze-confused", label: "Confused", kind: "loop" },
  { id: "gaze-suspicious", label: "Suspicious", kind: "loop" },
  { id: "gaze-excited", label: "Excited", kind: "loop" },
  { id: "gaze-happy", label: "Happy", kind: "loop" },
  { id: "gaze-laughing", label: "Laughing", kind: "loop" },
  { id: "gaze-playful", label: "Playful", kind: "loop" },
  { id: "gaze-celebrate", label: "Celebrating", kind: "loop" },
  { id: "gaze-proud", label: "Proud", kind: "loop" },
  { id: "gaze-shy", label: "Shy", kind: "loop" },
  { id: "gaze-surprised", label: "Surprised", kind: "loop" },
  { id: "gaze-scared", label: "Scared", kind: "loop" },
  { id: "gaze-angry", label: "Angry", kind: "loop" },
  { id: "gaze-sad", label: "Sad", kind: "loop" },
  { id: "gaze-bored", label: "Bored", kind: "loop" },
  { id: "gaze-drowsy", label: "Drowsy", kind: "loop" },
  { id: "gaze-sleeping", label: "Sleeping", kind: "loop" },
  { id: "gaze-waking", label: "Waking", kind: "loop" },
  { id: "neutral", label: "Neutral", kind: "feeling" },
  { id: "curious", label: "Curious", kind: "feeling" },
  { id: "attentive", label: "Attentive", kind: "feeling" },
  { id: "happy", label: "Happy", kind: "feeling" },
  { id: "proud", label: "Proud", kind: "feeling" },
  { id: "surprised", label: "Surprised", kind: "feeling" },
  { id: "shy", label: "Shy", kind: "feeling" },
  { id: "sleepy", label: "Sleepy", kind: "feeling" },
  { id: "suspicious", label: "Suspicious", kind: "feeling" },
  { id: "confused", label: "Confused", kind: "feeling" },
  { id: "excited", label: "Excited", kind: "feeling" },
  { id: "laughing", label: "Laughing", kind: "feeling" },
  { id: "unimpressed", label: "Unimpressed", kind: "feeling" },
  { id: "sad", label: "Sad", kind: "feeling" },
  { id: "angry", label: "Angry", kind: "feeling" },
  { id: "scared", label: "Scared", kind: "feeling" },
];

/**
 * The default set: the twenty-six the owner ticked on the model sheet, 2026-08-27.
 *
 * 🔴🔴 `angry` AND `scared` ARE IN IT NOW, AND THAT REVERSES A RULE THIS FILE USED TO ENFORCE.
 * The old default left them out under rule three — *a feeling points at itself, never at the
 * learner* — on the reasoning that at rest there is nothing else for a face to be about. The owner
 * ticked both, from a page that showed all thirty-nine running and named every one. An informed
 * choice by the person whose product it is beats a rule I wrote; the rule is kept in
 * `features.ts` because it still governs everything the SCHEDULE plays, which is the part that
 * makes a claim about the learner's work. Nothing here claims anything.
 *
 * 🔴 THE ORDER IS THEIRS AS SENT, NOT SORTED. The montage walks this list in order, so sorting it
 * would quietly rearrange the character's behaviour on a whim of mine.
 *
 * 🔴 `gaze-sleeping` AND `gaze-drowsy` CUT 2026-08-28 (owner: *"remove sleeping and drowsy"*).
 * Both spend 100% of their time with BOTH eyes shut, and a character asleep beside someone who is
 * reading looks broken rather than restful — `useDoze` already owns actually falling asleep, and it
 * only does so after the learner has been away. Measured over one full round of this list, time
 * with both eyes shut goes 22% → 12%.
 *
 * 🔴 TWO PICKS STILL CARRY THAT LOOK AND ARE KEPT BECAUSE THE OWNER TICKED THEM: `gaze-waking` is a
 * SINGLE held `eyesClosed` face with no second pose and 0px of travel, so in a montage it is simply
 * eyes shut for five seconds; and `gaze-bored` spends two of its three poses on `sleepySquint` and
 * `drowsyClosed`, the same two `gaze-drowsy` was made of. Named here rather than removed on my own
 * judgement — see the report of 2026-08-28.
 */
export const MONTAGE: readonly string[] = [
  "gaze-thinking",
  "gaze-searching",
  "gaze-idle",
  "gaze-listening",
  "gaze-working",
  "gaze-excited",
  "gaze-bored",
  "gaze-angry",
  "gaze-suspicious",
  "gaze-confused",
  "gaze-happy",
  "gaze-curious",
  "attentive",
  "surprised",
  "neutral",
  "excited",
  "scared",
  "angry",
  "unimpressed",
  "shy",
  "curious",
  "confused",
  "suspicious",
  "gaze-waking",
];

/**
 * The thirteen offered and not taken, so the choice can be argued with rather than assumed an
 * oversight.
 *
 * 🔴 REPOINTED 2026-08-27. This used to be `["angry", "scared"]` and carried an argument of mine
 * about what a resting face may say to a learner. It is now simply the remainder — whatever is on
 * the choice list and not in the default — because the default is no longer my reasoning, it is
 * the owner's ticks. Derived rather than typed, so the two can never disagree.
 */
export const MONTAGE_LEFT_OUT: readonly string[] = MONTAGE_CHOICES.map((c) => c.id).filter(
  (id) => !MONTAGE.includes(id),
);

/**
 * Is `id` one of the entries that MOVES, rather than a face that is merely held?
 *
 * 🔴 THE DIFFERENCE IS 30px AGAINST 0.8px, WHICH IS THE DIFFERENCE BETWEEN "DOING ITS OWN THING"
 * AND "STANDING STILL" (the table at the top of this file has the measurements).
 *
 * 🔴 NOTHING THAT DRAWS ASKS THIS, AND THAT IS THE POINT OF LEAVING IT HERE. The dock once gated
 * letting go of the pointer on it — only stop following if the montage HAPPENED to be playing
 * something that moves — and that gate measured as 55 seconds of every 193 in which the character
 * could never let go. What reads it now is `attention.test.ts`, asking whether a round of the
 * clock still contains real movement, which is the gate's reasoning kept as a check rather than
 * as a condition.
 *
 * Unknown ids are not loops. `resolveMontage` has already dropped anything unknown, so reaching
 * here with one means the catalogue moved under a stored list, and the safe answer is to keep
 * following the pointer.
 */
export function isMontageLoop(id: string | null | undefined): boolean {
  if (!id) return false;
  return MONTAGE_CHOICES.some((c) => c.id === id && c.kind === "loop");
}

/**
 * How long a HELD FACE stays on, before the next entry.
 *
 * 🔴 9s → 5s ON REPORT (owner 2026-08-27: *"its still not doing the expression montage i want"*).
 * The first number came from the doze threshold's reasoning — the commonest thing a learner does
 * here is read, and a face changing every couple of seconds in the corner of their eye pulls at
 * attention they are trying to spend elsewhere. That reasoning holds and nine seconds overshot it:
 * a feeling moves the EYES ONLY, on a 76px character, so it is a quiet change to begin with and at
 * nine seconds most people never catch two in a row.
 *
 * 🔴🔴 IT IS A FLOOR NOW, NOT THE ANSWER — see `holdFor`. It was the only number when every entry
 * was one held face.
 */
export const MONTAGE_HOLD_MS = 5_000;

/**
 * How long one entry gets: its own full cycle, or the held-face floor, whichever is longer.
 *
 * 🔴🔴 A FIXED FIVE SECONDS WOULD HAVE CUT EVERY LOOP OFF PART-WAY, AND THAT IS NOT A ROUNDING
 * ERROR — IT IS THE FEATURE NOT HAPPENING. `gaze-searching` is a playlist of six poses running
 * **16.8 seconds**; five seconds of it is two poses and then a cut to something else. The movement
 * a loop exists for is the movement BETWEEN its poses, so an entry that never reaches its third
 * pose is, on screen, indistinguishable from the held face this whole change is replacing.
 *
 * An unknown id falls back to the floor rather than throwing: `resolveMontage` has already dropped
 * anything unknown, so reaching here means the catalogue moved under a stored list, and a face
 * held slightly too long beats a character that does not draw.
 */
export function holdFor(id: string): number {
  const a = ANIMATION_BY_ID.get(id);
  return a ? Math.max(MONTAGE_HOLD_MS, animationDuration(a)) : MONTAGE_HOLD_MS;
}

/**
 * A chosen list, made safe to draw.
 *
 * 🔴 NOTHING CHOOSES ANY MORE, AND THIS STAYS FOR THE ONE PATH THAT IS LEFT. The Appearance card
 * that let a learner tick faces was removed on 2026-08-31 at the owner's word (*"remove this from
 * settings, the choosing of the montage of the character"*), along with the preference it wrote —
 * so every caller now asks with nothing and gets `MONTAGE`. The filtering below is not dead
 * defensiveness: it is what makes "no choice" a single well-defined answer instead of each caller
 * inventing its own default.
 *
 * An empty list resolves to the DEFAULT rather than to nothing, because a character with no face is
 * indistinguishable from a broken one.
 */
export function resolveMontage(chosen: readonly string[] | null | undefined): readonly string[] {
  if (!chosen) return MONTAGE;
  const known = new Set(MONTAGE_CHOICES.map((c) => c.id));
  const kept = chosen.filter((id) => known.has(id));
  return kept.length > 0 ? kept : MONTAGE;
}
