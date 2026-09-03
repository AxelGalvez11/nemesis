// The front door's last act, handed to the canvas: where everything was standing at the moment of
// the send.
//
// 🔴🔴 THIS EXISTS BECAUSE THE TWO SURFACES ARE TWO REACT TREES AND ONE OF THEM DIES. `/learn` and
// `/learn?ask=…` are the same route, so the router swaps `CanvasHome` for `LearningCanvas` in one
// commit: whatever the front door was showing is gone from the DOM before the canvas paints once.
// Every previous attempt to make that swap read as a movement tried to solve it on the DEPARTING
// side — travel the composer, fly the character, fade the greeting — and then hand a finished
// picture over. That cannot work, because the thing the eye is following stops existing mid-gesture
// and the arriving surface has no idea where anything was. Measured on production 2026-09-01: the
// screen was blank for 300ms and the character jumped from (746,378) to (400,778) without crossing
// the space between.
//
// So the departing side no longer animates at all. It MEASURES, stages the result here, and leaves
// immediately. The canvas reads these rectangles in a layout effect, paints its own furniture at
// the front door's coordinates on its FIRST frame, and eases it home. One element per thing, one
// continuous path, and the end pose is the canvas's natural layout rather than a number the front
// door had to guess.
//
// 🔴 A MODULE SINGLETON RATHER THAN THE URL OR STORAGE, and the reason is the lifetime. This is
// read exactly once, by the very next mount, in the same tick of the same document. A query
// parameter would put pixel coordinates in the address bar and survive a share; `sessionStorage`
// would survive a reload and replay a two-second animation on a page the learner opened cold.
// Neither is a fact about a link. This is a fact about a gesture, and a gesture does not outlive
// the click that made it.

/** A rectangle in viewport coordinates. `DOMRect` itself is not carried: it is a live-ish object
 *  with a dozen fields, and four numbers is the whole of what the arrival needs. */
export type ArrivalBox = { x: number; y: number; w: number; h: number };

/** A label the front door was showing that the canvas has no equivalent of — the greeting and the
 *  hint under the composer. The canvas redraws these where they stood and fades them out, so they
 *  LEAVE rather than being cut. Text rides along because the greeting is not a constant (it says
 *  "Learn <subject>" once a project is chosen). */
export type ArrivalLabel = {
  text: string;
  box: ArrivalBox;
  /** The source element's own type, carried so the copy is the same size as the thing it replaces.
   *  🔴 WITHOUT THIS THE COPY IS THE WRONG SIZE AND SILENTLY TRUNCATES. Caught on film 2026-09-01:
   *  the ghosts inherited the canvas's base type rather than the front door's, so the hint rendered
   *  larger than its measured box and came out as "…drop your materi…". The box is right; the text
   *  inside it has to match, and there is no way to know the size from the box alone. */
  font: string;
  weight: string;
  /** And its colour, for the same reason: the greeting is primary text and the hint is the faintest
   *  tier, so one inherited colour is wrong for one of them whichever is chosen. */
  colour: string;
};

export type Arrival = {
  /** The composer pill, measured AFTER it folds to its one-row canvas shape. */
  composer: ArrivalBox;
  /** The character. */
  character: ArrivalBox;
  /** The learner's own sentence, as it sat in the field. Null when nothing was typed — material
   *  dropped on the front door opens a canvas with no sentence to fly. */
  say: ArrivalBox | null;
  /** The greeting and the hint. */
  labels: readonly ArrivalLabel[];
  /** When it was staged, for the staleness check below. */
  at: number;
};

/**
 * How long a staged arrival is worth playing.
 *
 * 🔴 A ONE-SHOT WITH A CLOCK ON IT, BECAUSE BOTH HALVES OF THAT CAN FAIL ALONE. Cleared on read, so
 * a second mount in the same session cannot replay it; and expired by time, so a `router.push` that
 * never lands (an error boundary, a redirect to sign-in, a learner who hits Back inside the window)
 * cannot leave a rectangle lying here that fires a two-second animation onto some unrelated canvas
 * opened minutes later. The window only has to cover a client-side route change, which is one or
 * two frames; a second is already generous by an order of magnitude.
 */
const ARRIVAL_TTL_MS = 1_000;

let staged: Arrival | null = null;

/** Called by the front door on the frame it leaves. */
export function stageArrival(arrival: Omit<Arrival, "at">): void {
  staged = { ...arrival, at: Date.now() };
}

/** Called by the canvas on mount. Returns the arrival exactly once, and never a stale one. */
export function takeArrival(): Arrival | null {
  const held = staged;
  staged = null;
  if (!held) return null;
  return Date.now() - held.at <= ARRIVAL_TTL_MS ? held : null;
}

/** Only for tests, which would otherwise leak a staged arrival between cases. */
export function clearArrival(): void {
  staged = null;
}

/**
 * How long the walk from the front door to the canvas takes.
 *
 * 🔴🔴 BACK TO 460ms, AND THE HISTORY IS THE POINT. Owner, 2026-09-01, choosing direction A off the
 * motion study: *"make it all slower like 1.5 seconds slower"*, so this was 460 + 1,500 = 1,960.
 * Owner, 2026-09-02, having lived with it: *"the transition ... is super slow ... the mascot kind
 * of took forever to move ... everything should immediately move into place."* Reverted to the
 * duration direction A was actually drawn at, which is the one he picked before asking for slower.
 *
 * 🔴 A SLOW TRANSITION READS AS A SLOW APP EVEN WHEN NOTHING IS WAITING ON IT. Nothing here gates
 * anything: the canvas is live from its first frame, the composer takes typing, the ask is already
 * sent and the answer streams underneath. That was the argument for affording two seconds, and it
 * was wrong about people rather than about code. The eye reads furniture still moving as work still
 * happening, so the honest length is the shortest one that still reads as a movement rather than a
 * cut.
 */
export const ARRIVAL_MS = 460;

/**
 * The curve, and it moves back with the duration.
 *
 * 🔴 A HARD DECELERATE IS A SHORT-MOVE CURVE, and this is a short move again. `cubic-bezier(.32,.72,0,1)`
 * puts roughly 80% of the distance in the first third, which is what makes a quick move feel like it
 * LANDS rather than stops. The gentle S-curve that replaced it (`cubic-bezier(.42,.02,.18,1)`) was
 * chosen for the two-second version, where a hard decelerate lunged and then crawled; at 460ms that
 * same S-curve is the one that reads as sluggish, because it spends its opening frames doing almost
 * nothing. The curve and the duration are one decision and have to move together.
 */
export const ARRIVAL_EASE = "cubic-bezier(.32,.72,0,1)";

/** How long the greeting and the hint take to go. They are the only things on the front door with
 *  nothing to do in a canvas, so they are the only things that fade rather than travel.
 *  🔴 SHORTER THAN THE WALK, DELIBERATELY. Text that is leaving should be gone before the furniture
 *  stops, or the last thing the eye sees settling is a word that no longer belongs to the screen. */
export const ARRIVAL_LABEL_MS = 220;

/** When the canvas's own chrome — its title, the thinking caption — fades up. Just behind the
 *  furniture rather than long after it.
 *  🔴 IT WAS 1,280ms, WHICH IS MOST OF WHY THE ARRIVAL FELT EMPTY. Scaled with the walk: the rule
 *  was always "arrive behind furniture that has nearly stopped", and at 460ms that is 300ms, not a
 *  second and a quarter. Held as a fraction of the walk in the test rather than as a loose number,
 *  so the two cannot drift apart again. */
export const ARRIVAL_CHROME_DELAY_MS = 300;
