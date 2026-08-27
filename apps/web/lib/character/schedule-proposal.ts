// What the character WOULD do, if the owner says yes.
//
// Owner, 2026-08-26: *"it's missing some animations and expressions"*, and, asked how the rest
// should be chosen: *"You pick, show me before it goes live"*. So this file is a proposal, not a
// schedule. `/dev-preview/mascot-schedule` draws every row of it live; `lib/character/stations.ts`
// — the file that decides what the product actually plays — is untouched until he has seen it.
//
// 🔴 THE PATTERN IS THE CATALOGUE'S OWN. `lib/avatar/catalogue.ts` already keeps the seven gestures
// "IN THE CATALOGUE, DELIBERATELY NOT IN THE SCHEDULE" for exactly this reason (owner, 2026-08-25:
// *"make the new animation and show me before implementing to live"*). Approving this means moving
// these rows into `ACTIVITY_STATE` and deleting this file, not adding a flag.
//
// ── WHAT IS ACTUALLY WRONG TODAY, MEASURED AGAINST THE CATALOGUE ─────────────────────────────
//
// The catalogue holds 52 things the character can do: 23 measured gaze loops, 16 feelings, 10
// routines, 3 gestures. `ACTIVITY_STATE` names four of them and the product can only reach three
// (`arrived` has no producer). That is the small half of the problem.
//
// 🔴 THE LARGE HALF IS THAT ALL THREE ARE HELD POSES RATHER THAN ANIMATIONS. `idle` is one step
// holding `neutral`; `curious` and `attentive` are single-frame feelings. So the character has
// exactly one face while you read, one while it thinks, one while you dictate, and it never
// changes any of them. It blinks, it drifts a degree, it glances away every 8.2 seconds — and
// that is the whole of its life. The 23 loops, which are the things in this catalogue that
// actually MOVE, are all unscheduled.
//
// So the proposal is not "add more animations". It is: play the moving version of what the
// character is already doing, and give the three activities with no producer one.

import type { NemesisActivity } from "./stations";

export interface ProposedRow {
  readonly activity: NemesisActivity | "failed";
  /** What has to be true for this to play. Plain English: the owner reads this page. */
  readonly when: string;
  /** What the app plays today, or null where the activity cannot happen at all. */
  readonly today: string | null;
  readonly proposed: string;
  /** Why this animation and not another. */
  readonly because: string;
}

export const PROPOSAL: readonly ProposedRow[] = [
  {
    activity: "resting",
    when: "You are reading, or typing, and nothing is running.",
    today: "idle",
    proposed: "gaze-idle",
    because:
      "The same character, awake. Today it holds one face for ever. This moves between two, five seconds each. It is the state a learner spends nearly all their time in, so it is the one worth the most.",
  },
  {
    activity: "thinking",
    when: "Nemesis is working on your turn.",
    today: "curious",
    proposed: "gaze-thinking",
    because:
      "Five faces over about twelve seconds: curious, narrowed, sceptical, playful, sceptical again. It reads as working through something, rather than as waiting.",
  },
  {
    activity: "preparing",
    when: "The session is being brought up, before anything can be asked.",
    today: "curious",
    proposed: "gaze-thinking",
    because:
      "Deliberately the same as thinking. Both waits are one experience to a learner: you asked for something and it has not arrived. Giving them different faces makes the character jump when one becomes the other.",
  },
  {
    activity: "listening",
    when: "You are dictating.",
    today: "attentive",
    proposed: "gaze-listening",
    because:
      "Attentive, then down, then a gentler down. Small on purpose. A character that pulls faces the moment you start talking is one you stop talking to.",
  },
  {
    activity: "retrieving",
    when: "Sources are being fetched or searched.",
    today: null,
    proposed: "gaze-searching",
    because:
      "Six faces, the eyes casting about. This moment has been in the table for weeks with nothing able to trigger it. The app already knows it is true, because it draws the site chips from the same signal.",
  },
  {
    activity: "ingesting",
    when: "A document you dropped is being taken in.",
    today: null,
    proposed: "gaze-working",
    because:
      "Focused, rather than casting about. That is the honest difference between hunting for material and reading material you already have. Not the reading glasses, which you cut by name this morning.",
  },
  {
    activity: "arrived",
    when: "An answer, a set of cards or a drawing has just landed.",
    today: null,
    proposed: "gaze-happy",
    because:
      "One beat, then back to rest. A happy face is already in the table and has never once been reachable, so today the character shows nothing at the one moment something good happens.",
  },
  {
    activity: "failed",
    when: "Something Nemesis tried did not work.",
    today: null,
    proposed: "confused",
    because:
      "Right now a thing that fails and a thing that works look identical on the character. Confused, never cross: the rule is that a feeling points at itself, never at the learner.",
  },
];

/**
 * The sixteen resting faces, in the catalogue's own order.
 *
 * 🔴 A SEPARATE QUESTION, AND IT BREAKS ONE OF THE CHARACTER'S RULES ON PURPOSE. The list above
 * obeys rule four — *every face has a reason; nothing plays at random*. This one does not: it is
 * the landing page's trick, where the rest between beats wears a different face each time, and it
 * is where all the variety on that page actually lives. It would make the app's character
 * noticeably more alive and it would mean a face that is not tied to a fact.
 *
 * Put to the owner as its own choice rather than folded into the eight above.
 */
export const RESTING_FACES: readonly string[] = [
  "neutral",
  "attentive",
  "curious",
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

/**
 * The two of the sixteen this list leaves out, and why — stated rather than silently dropped.
 *
 * 🔴 RULE THREE IS THE REASON: *feelings point at itself, never at the learner*. `angry` and
 * `scared` are the only two of the sixteen that a person sitting in front of the screen can read
 * as being about THEM, because nothing else is happening at rest for them to be about. The landing
 * page cycles all sixteen and is right to: it is a showcase with no learner in a session and
 * nothing at stake. Inside a lesson, a character that looks cross while you read your own notes is
 * a different product.
 *
 * They are named here rather than omitted quietly so that the next person can disagree with the
 * judgement instead of assuming it was an oversight.
 */
export const RESTING_FACES_LEFT_OUT: readonly string[] = ["angry", "scared"];
