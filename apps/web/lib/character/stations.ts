// What Nemesis is doing → which animation plays, and where the character stands.
//
// 🔴 THIS FILE IS THE ONLY NEMESIS OPINION ABOUT THE CATALOGUE. `lib/avatar/*` decides
// what each animation LOOKS like and nothing else; everything this product decides — which of its own states map onto which
// animation, and which of them are worth walking to the middle of the screen for —
// lives here.
//
// 🔴 THE STATION IS A PROPERTY OF WHAT THE SYSTEM IS DOING, NOT A PROP SOMEBODY PASSES.
// If "come to the middle" were an argument, two call sites would eventually disagree
// about whether searching counts, and the character would behave differently on two
// screens for no reason a learner could explain.

/**
 * An animation's name, from the one catalogue.
 *
 * 🔴 A PLAIN STRING RATHER THAN A UNION, AND THAT IS A DELIBERATE LOOSENING. The catalogue
 * now holds fifty-six — sixteen feelings, ten routines, twenty-three gaze patterns and seven
 * gestures — and a union of all of them here would be a second list to keep in step with the
 * first.
 * `lib/avatar/catalogue.ts` refuses an unknown name at load, and `character.test.ts` checks
 * that every id this file names exists, which is the same guarantee without the duplicate.
 */
export type StateId = string;

/** Where the character stands while an animation plays. */
export type Station = "corner" | "centre";

/**
 * The busy animations — the ones that mean *the system has the floor*.
 *
 * These are the only states that take the middle of the surface. The rule is not
 * "anything eye-catching": it is that the learner has handed something over and is
 * waiting for it. Coming forward is how the character says the wait is real work, and
 * it is worth nothing if a wink does it too.
 */
const CENTRE: ReadonlySet<StateId> = new Set<StateId>(["thinking"]);

export function stationOf(state: StateId): Station {
  return CENTRE.has(state) ? "centre" : "corner";
}

/**
 * Nemesis's own busy vocabulary, mapped onto the catalogue.
 *
 * Two distinct waits exist in the Canvas and they are NOT the same event:
 *
 * - `thinking` is the policy runtime working on a turn, and it publishes the name of the
 *   step that is actually running. Three dots, because that is what a pause for thought
 *   looks like and it makes no claim about progress.
 * - `preparing` is the session being brought up before anything can be asked of it.
 *   The rings, because something is being assembled rather than considered.
 *
 * Wiring only the first is the mistake worth naming: the character would sit in the
 * corner through `preparing`, then jump to the middle when `thinking` began, and the jump
 * would read as a glitch rather than as a change of activity.
 */
export type NemesisActivity =
  /** The policy runtime is working on this turn. */
  | "thinking"
  /** The session is being brought up. */
  | "preparing"
  /** Sources are being fetched or searched. */
  | "retrieving"
  /** A document is being taken in. */
  | "ingesting"
  /** Nothing is running; the learner has the floor. */
  | "resting"
  /** The learner is talking to it. */
  | "listening"
  /** Something landed and it is worth a beat of acknowledgement. */
  | "arrived"
  /**
   * Nothing has happened for a long time.
   *
   * 🔴 THE ONE ROW HERE THAT IS ABOUT THE LEARNER RATHER THAN THE SYSTEM, and the only one whose
   * producer could not be a fact the surface already holds — nothing on a page knows that nothing
   * has happened. `lib/character/doze.ts` is that fact; `components/character/use-doze.ts` measures
   * it. Added on the owner's own list, 2026-08-26: *"bloub has nice animations called burst, sleep,
   * thinking, i want those"*.
   */
  | "dozing";

export const ACTIVITY_STATE: Record<NemesisActivity, StateId> = {
  // 🔴🔴 `waiting`, NOT `thinking`, AND THE NAMES ARE THE OPPOSITE WAY ROUND FROM WHAT THEY LOOK.
  // Owner, 2026-08-21: *"remove the three dots animation, i just want the mascot and the words lit
  // left to right."* The catalogue's `thinking` pose IS the three dots — `lib/avatar/routines.ts` says
  // so outright, *"la boule DEVIENT le point du milieu"* — and it fades the eyes to zero while it
  // does. So for weeks the character was not standing beside a caption while it worked; it had
  // dissolved into the dots, which is why every screenshot showed dots and no face.
  //
  // 🔴 THE WORDS CARRY THE MOTION NOW. `CharacterDock`'s caption is lit left to right, so the character
  // is free to stay a character: present, eyes open, tracking the pointer, beside a line that says
  // what is happening. `idle` is that pose.
  //
  // 🔴🔴 WHICH BREAKS THE DERIVED STATION, AND THE BREAK IS THE POINT. `stationOf` reads the POSE to
  // decide corner or centre, and it could while the working poses were unique to working. `idle` is
  // also how the character rests, so the same id now means two opposite places — and a resting
  // character dragged to the middle of the page would be far worse than dots. The station is passed
  // explicitly by the surface that knows (see the dock's `station`), and `stationOf` remains the
  // default for every caller that has no opinion.
  // 🔴🔴 `curious`, AND IT IS THE HEAD TILT DOING THE WORK. Owner 2026-08-25, after the
  // expression audit: the character had ONE face for all seven activities, so nothing it did
  // was legible as an activity. `curious` is the resting face with the head rolled fifteen
  // degrees — the reference's own note says outright that curiosity is carried by the roll,
  // not by the eyes. It reads as consideration, it keeps the eyes open and tracking, and it
  // survives the pointer: `DrawOptions.turn` adds to yaw and pitch and leaves roll alone, so
  // the tilt stays whatever the learner does with their mouse.
  thinking: "curious",
  // 🔴 THE SAME POSE, STILL (owner 2026-08-20: "why is it only doing swirl?"). Both waits are
  // one experience to a learner, so they get one animation. The audit proposed splitting this
  // — `sleepy` for a session coming up, on the grounds that it is literally waking — and that
  // is a reversal of an explicit decision, so it is not taken here. It is a question for the
  // owner, not a correction to make on the way past.
  preparing: "curious",
  // 🔴🔴 THE LAST OF THE VENDORED PACK LEAVES THE SCHEDULE (owner 2026-08-23: *"I don't want
  // any rainbow swirls or animations from the GitHub that we used"*). `comet` and `burst`
  // were borrowed loading effects; `wide` is the enlarged-eyes pose the owner asked gone by
  // name ("remove the big eyes"); `notify` bolts a badge onto the body, which our language
  // forbids outright — a creature, never an icon. What replaces them is not another pose but
  // OUR OWN layer: while material is being taken in, the character puts its reading glasses
  // on (see `FeatureFace` in lib/avatar/features.ts and the `face` prop on the dock) and stays a creature doing
  // something, instead of becoming a different drawing.
  //
  // 🔴 WHAT REPLACES THEM IS THE SIXTEEN, AND THAT IS WHY THEY QUALIFY. The rule stated above
  // is that the character stays a creature rather than becoming a different drawing. The
  // sixteen feelings are exactly the poses that obey it — not one of them changes the body,
  // hides the face, or bolts anything onto it. The ten routines mostly do all three.
  //
  // 🔴 AND THESE TWO SHARE A POSE ON PURPOSE. Fetching sources and taking a document in are
  // one experience to a learner: their material is being handled. What tells them apart is
  // OUR layer, not a different feeling — the reading glasses (`FeatureFace`, passed through
  // the dock's `face` prop). A second face here would be a distinction the learner cannot
  // read and the code would then have to keep.
  retrieving: "attentive",
  ingesting: "attentive",
  resting: "idle",
  // Head almost level and the eyes a little larger: turned toward you, which is the whole
  // content of listening. `attentive` differs from `idle` by 34 degrees of head and about a
  // tenth of eye — small, and the smallness is right. A character that gurns when you start
  // dictating is a character you stop dictating to.
  //
  // 🔴 THIS BRIEFLY SCHEDULED OUR OWN `leanIn` AND IT SHOULD NOT HAVE (owner 2026-08-26: *"i
  // said to put in the original animations and expressions NOT the custom built ones"*). Every
  // pose this table names is measured off the reference.
  listening: "attentive",
  // The squint into arcs — a smile, on a face with no mouth. (Also briefly `nod`, ours; see above.)
  arrived: "happy",
  // 🔴🔴 THE FIRST BODY-CHANGING ROUTINE TO REACH THE SCHEDULE, AND IT IS THE OWNER'S OWN REVERSAL
  // (2026-08-26: *"bloub has nice animations called burst, sleep, thinking, i want those"*). Every
  // vendored routine was cut on 2026-08-23; this is one coming back by name.
  //
  // 🔴 IT FADES THE EYES TO ZERO, AND HERE THAT IS CORRECT RATHER THAN A PROBLEM. `sleepHigh` and
  // `sleepLow` both carry `eyeAlpha: 0` — which is the exact property that made `thinking` wrong
  // while the character was supposed to be working beside a caption (see thinking-figure.test.ts).
  // A sleeping creature has its eyes shut. The rule was never "eyes always"; it was that the
  // character keeps its face WHILE IT WORKS, and this row is the opposite of working.
  //
  // 🔴 AND IT DOES NOT RESHAPE THE BODY. Both faces are `body({ scale, y })` and no `profile`, so
  // the squircle is scaled and bounced, not morphed into something else. `body.test.ts` checks the
  // whole of this table for exactly that and stays green.
  dozing: "sleep",
};

/**
 * 🔴 THREE OF THE EIGHT HAVE NO PRODUCER, AND THEY DID NOT BEFORE THIS EITHER.
 * `stateForCanvas` below is the only route from the running product to this table, and it
 * reads three facts: thinking, preparing, listening. So `retrieving`, `ingesting` and
 * `arrived` are reachable through `stateFor` and nothing calls it. Naming that here rather
 * than letting the table imply a schedule it does not have: the rows are correct and three of
 * them are waiting on a surface to say when they are true.
 *
 * The fourth gap is worse and is not a row at all — there is no `failed`. A fetch that dies
 * and a fetch that works currently look identical on the character.
 *
 * 🔴 `dozing` IS THE FIRST ROW TO ARRIVE WITH ITS PRODUCER ATTACHED, which is the shape the other
 * three should copy: a row here, a pure rule beside it saying when it is true, and a hook that
 * measures it. See `lib/character/doze.ts`.
 */

export function stateFor(activity: NemesisActivity): StateId {
  return ACTIVITY_STATE[activity];
}

/**
 * Per-animation playback rate. 1 is the measured speed; below 1 is slower.
 *
 * 🔴 IT LIVES HERE AND NOT IN THE CATALOGUE. Every timing in `lib/avatar` is measured off a
 * reference, and a taste decision about pace is not a correction to a measurement. The
 * clock is scaled instead, which slows a whole animation coherently — body morph, gaze and
 * blink together — rather than stretching one term and leaving the others behind.
 *
 * 🔴 AND IT IS EMPTY, WHICH IS THE HONEST STATE. The one entry it ever held retimed `swirl`,
 * an animation that no longer exists: the owner cut every rainbow gesture on 2026-08-23.
 * The mechanism stays because the next taste decision about pace will want it, and because
 * a caller asking `speedOf` should not have to know whether anything is retimed today.
 */
export const SPEED: Record<string, number> = {};

export function speedOf(state: StateId): number {
  return SPEED[state] ?? 1;
}

/** What the Canvas is doing right now, as the surface already knows it. */
export interface CanvasActivity {
  /** The policy runtime is working on this turn (`policy.thinking`). */
  thinking: boolean;
  /** The session is being brought up, or material is being taken in (`presence === "preparing"`). */
  preparing: boolean;
  /** The learner is dictating. */
  listening?: boolean;
}

/**
 * The Canvas's activity → the animation that plays.
 *
 * 🔴 BOTH WAITS COME FORWARD, AND WIRING ONLY ONE IS THE MISTAKE TO AVOID. `thinking` and
 * `preparing` are different events with different captions, but to a learner they are the
 * same experience: they asked for something and it has not arrived. If only one took the
 * middle, the character would sit in the corner through the first, then jump to the middle
 * when the second began — and a jump with no cause a learner can name reads as a glitch,
 * not as a change of activity.
 *
 * Precedence is deliberate rather than incidental: thinking outranks preparing because a
 * turn in flight is the more specific fact, and both outrank dictation because what the
 * system is doing matters more than what the learner is doing with their microphone.
 */
export function stateForCanvas(activity: CanvasActivity): StateId {
  if (activity.thinking) return ACTIVITY_STATE.thinking;
  if (activity.preparing) return ACTIVITY_STATE.preparing;
  if (activity.listening) return ACTIVITY_STATE.listening;
  return ACTIVITY_STATE.resting;
}
