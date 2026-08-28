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
 * character was not pulling faces. The `kind` is carried so the settings card can say which is
 * which rather than offering thirty-nine indistinguishable words.
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
 * 🔴 IT CAN COME OUT OF `localStorage`, SO IT CAN BE ANYTHING — a list from an older build naming
 * a face that has since been renamed, a hand-edited value, an empty array left by a learner who
 * unticked everything. Every one of those has to resolve to something drawable, because the
 * alternative is a character with no face and no explanation.
 *
 * An empty choice means the DEFAULT rather than nothing: "no expressions" is already expressible by
 * leaving one ticked, and a character frozen on one face is a better failure than a blank one.
 */
export function resolveMontage(chosen: readonly string[] | null | undefined): readonly string[] {
  if (!chosen) return MONTAGE;
  const known = new Set(MONTAGE_CHOICES.map((c) => c.id));
  const kept = chosen.filter((id) => known.has(id));
  return kept.length > 0 ? kept : MONTAGE;
}

/**
 * Which entry is playing `ms` into a rest, or null when the character is not resting.
 *
 * 🔴 ADDRESSED FROM THE CLOCK, NOT ADVANCED BY A TIMER, which is the same construction the blink
 * schedule uses and for the same reason: asking about a moment an hour in costs the same as asking
 * about the first second, and two characters mounted at the same time do not march in step. That
 * survives the move to uneven holds because the walk below is over a list, not over elapsed ticks.
 *
 * 🔴 `seed` SHIFTS THE STARTING ENTRY, NOT THE CLOCK. Offsetting the time would put a character
 * mid-way through some loop on its first frame; offsetting the index starts it cleanly on a
 * different one, which is all the seed was ever for.
 */
export function montageFace(input: {
  readonly restingMs: number;
  readonly atRest: boolean;
  /** Anything the character is doing that owns its face: a poke, a doze, a turn in flight. */
  readonly busy: boolean;
  /** Varies the starting entry per character so two on one page are never in step. */
  readonly seed?: number;
  /** The learner's own choice, or nothing for the default set. */
  readonly chosen?: readonly string[] | null;
}): string | null {
  const { restingMs, atRest, busy, seed = 0, chosen } = input;
  if (!atRest || busy || restingMs < 0) return null;
  const faces = resolveMontage(chosen);
  const n = faces.length;
  if (n === 0) return null;

  const holds = faces.map(holdFor);
  const round = holds.reduce((a, b) => a + b, 0);
  let left = restingMs % round;
  let step = 0;
  // A walk rather than arithmetic, because the holds are uneven. At most 39 entries, once a second.
  while (step < n - 1 && left >= holds[(step + seed) % n]!) {
    left -= holds[(step + seed) % n]!;
    step += 1;
  }
  return faces[(step + seed) % n] ?? null;
}
