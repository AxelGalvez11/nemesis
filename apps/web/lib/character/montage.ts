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
 * Every face the montage can be asked to wear, with a word a person can read.
 *
 * 🔴🔴 THE OWNER PICKS FROM THIS, WHICH IS WHY IT CARRIES LABELS (2026-08-27: *"its still not doing
 * the expression montage i want, allow me to pick the expressions for the montage"*). The ids are
 * the catalogue's; the words are for the settings card, and they are the only place in this file
 * that is a matter of taste rather than fact.
 *
 * All SIXTEEN are offered, including the two the default leaves out — the default is a
 * recommendation, not a cage, and someone who wants a grumpy character should be able to have one.
 */
export const MONTAGE_CHOICES: readonly { readonly id: string; readonly label: string }[] = [
  { id: "neutral", label: "Neutral" },
  { id: "curious", label: "Curious" },
  { id: "attentive", label: "Attentive" },
  { id: "happy", label: "Happy" },
  { id: "proud", label: "Proud" },
  { id: "surprised", label: "Surprised" },
  { id: "shy", label: "Shy" },
  { id: "sleepy", label: "Sleepy" },
  { id: "suspicious", label: "Suspicious" },
  { id: "confused", label: "Confused" },
  { id: "excited", label: "Excited" },
  { id: "laughing", label: "Laughing" },
  { id: "unimpressed", label: "Unimpressed" },
  { id: "sad", label: "Sad" },
  { id: "angry", label: "Angry" },
  { id: "scared", label: "Scared" },
];

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
 * 🔴 9s → 5s ON REPORT (owner 2026-08-27: *"its still not doing the expression montage i want"*).
 * The first number came from the doze threshold's reasoning — the commonest thing a learner does
 * here is read, and a face changing every couple of seconds in the corner of their eye pulls at
 * attention they are trying to spend elsewhere. That reasoning holds and nine seconds overshot it:
 * an expression here moves the EYES ONLY, on a 76px character, so it is a quiet change to begin
 * with and at nine seconds most people never catch two in a row.
 */
export const MONTAGE_HOLD_MS = 5_000;

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
  /** The learner's own choice, or nothing for the default set. */
  readonly chosen?: readonly string[] | null;
}): string | null {
  const { restingMs, atRest, busy, seed = 0, chosen } = input;
  if (!atRest || busy || restingMs < 0) return null;
  const faces = resolveMontage(chosen);
  const step = Math.floor(restingMs / MONTAGE_HOLD_MS) + seed;
  return faces[((step % faces.length) + faces.length) % faces.length] ?? null;
}
