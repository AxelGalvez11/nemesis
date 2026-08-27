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

/**
 * The resting faces, in the catalogue's own order.
 *
 * 🔴 FOURTEEN OF THE SIXTEEN, AND THE TWO LEFT OUT ARE NAMED RATHER THAN QUIETLY DROPPED. Rule
 * three is *feelings point at itself, never at the learner*. `angry` and `scared` are the only two
 * a person sitting in front of the screen can read as being about THEM, because at rest there is
 * nothing else happening for them to be about. The front page cycles all sixteen and is right to:
 * it is a showcase, with no learner in a session and nothing at stake.
 */
export const MONTAGE: readonly string[] = [
  "neutral",
  "curious",
  "attentive",
  "happy",
  "proud",
  "surprised",
  "shy",
  "sleepy",
  "suspicious",
  "confused",
  "excited",
  "laughing",
  "unimpressed",
  "sad",
];

/** Named so the choice can be argued with rather than assumed an oversight. */
export const MONTAGE_LEFT_OUT: readonly string[] = ["angry", "scared"];

/**
 * How long one face is held before the next.
 *
 * 🔴 SLOW, AND ON THE SAME REASONING AS THE DOZE THRESHOLD. The commonest thing a learner does here
 * is read; a face changing every couple of seconds in the corner of their eye is a thing pulling at
 * their attention while they are trying to concentrate. Long enough that noticing it is a pleasant
 * surprise rather than a flicker.
 */
export const MONTAGE_HOLD_MS = 9_000;

/**
 * Which face is worn `ms` into a rest, or null when the character is not resting.
 *
 * 🔴 ADDRESSED FROM THE CLOCK, NOT ADVANCED BY A TIMER, which is the same construction the blink
 * schedule uses and for the same reason: asking about a moment an hour in costs the same as asking
 * about the first second, and two characters mounted at the same time do not march in step.
 */
export function montageFace(input: {
  readonly restingMs: number;
  readonly atRest: boolean;
  /** Anything the character is doing that owns its face: a poke, a doze, a turn in flight. */
  readonly busy: boolean;
  /** Varies the starting face per character so two on one page are never in step. */
  readonly seed?: number;
}): string | null {
  const { restingMs, atRest, busy, seed = 0 } = input;
  if (!atRest || busy || restingMs < 0) return null;
  const step = Math.floor(restingMs / MONTAGE_HOLD_MS) + seed;
  return MONTAGE[((step % MONTAGE.length) + MONTAGE.length) % MONTAGE.length] ?? null;
}
