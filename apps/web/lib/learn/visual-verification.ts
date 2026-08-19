// Checking the arithmetic before a learner is graded on it (§44).
//
// 🔴 THE RULE THIS FILE EXISTS TO ENFORCE, STATED ONCE: **an unverified computed answer may not be an
// answer key.** §42 already forbids marking a learner against a picture Nemesis cannot vouch for —
// a generated image has no standing as evidence because its detail was invented. A worked total, a
// stated angle, a claimed equilibrium are the same thing in numbers: the model asserted them, and
// until something recomputes them they are exactly as trustworthy as a generated diagram.
//
// 🔴 WHY THIS IS ONE MODULE RATHER THAN THREE. A T-account that must balance, a triangle whose angle
// at A is claimed to be 30°, and a free-body diagram claimed to be in equilibrium are the same
// operation: the model stated a number, the structure implies a number, and they must agree. Putting
// the check next to each renderer would give three implementations of "close enough", drifting apart,
// and the one that drifts is always the one nobody is looking at.
//
// 🔴 A MISMATCH IS A REFUSAL, NOT A CORRECTION. Silently replacing the model's total with the right
// one would hide the fact that something upstream is producing bad arithmetic — the same argument
// `visual-route.ts` makes for refusing a malformed visual rather than substituting a different one.
// The teaching text stands; only the record differs, and the record is the point.
//
// PURE. No React, no I/O. Every rule here is a test rather than a promise.

/**
 * How close two numbers must be to count as agreeing.
 *
 * 🔴 RELATIVE, NOT ABSOLUTE, BECAUSE THE SUBJECTS DISAGREE ABOUT SCALE. A balance sheet in millions
 * and an angle in degrees cannot share a fixed epsilon: 0.01 is meaningless money and a visible
 * error in geometry. The tolerance scales with the magnitude being compared, with a floor so that
 * sums around zero — which is exactly what an equilibrium check produces — do not divide by nothing.
 */
export function agrees(a: number, b: number, relative = 1e-9): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= relative * scale;
}

/**
 * Money, compared the way money is compared.
 *
 * 🔴 A SEPARATE TOLERANCE, AND IT IS A DOMAIN FACT RATHER THAN A PREFERENCE. Accounting statements
 * are rounded to the cent and to whole units, and a trial balance that is out by half a cent is out.
 * Using the general relative tolerance here would accept a real error in a large balance sheet;
 * using this one on an angle would reject a correct figure.
 */
export function moneyAgrees(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.005;
}

export type VerificationFailure =
  /** A column's stated total is not the sum of its cells. */
  | "total-mismatch"
  /** Two sides that must balance do not. */
  | "balance-mismatch"
  /** A stated geometric measure disagrees with the coordinates that were supplied. */
  | "geometry-mismatch"
  /** Vectors claimed to cancel do not sum to zero. */
  | "equilibrium-mismatch"
  /** A value that should be a finite number is not. */
  | "not-a-number"
  /** The structure cannot be checked at all — too few points, no vectors, an empty column. */
  | "nothing-to-check";

export type Verification =
  | { ok: true }
  | { detail: string; ok: false; reason: VerificationFailure };

function fail(reason: VerificationFailure, detail: string): Verification {
  return { detail, ok: false, reason };
}

/**
 * Does a stated total match the numbers above it?
 *
 * 🔴 EMPTY IS `nothing-to-check`, NOT `ok`. A column with no values whose total is stated as zero
 * happens to be arithmetically true and is almost certainly a model that produced an empty table.
 * Reporting it as verified would make "we checked and it was right" indistinguishable from "there
 * was nothing there".
 */
export function verifyTotal(values: readonly number[], stated: number, money = false): Verification {
  if (values.length === 0) return fail("nothing-to-check", "a total was stated over no values");
  if (!Number.isFinite(stated) || values.some((value) => !Number.isFinite(value))) {
    return fail("not-a-number", "a value in this column is not a finite number");
  }
  const sum = values.reduce((total, value) => total + value, 0);
  const matches = money ? moneyAgrees(sum, stated) : agrees(sum, stated);
  return matches
    ? { ok: true }
    : fail("total-mismatch", `the column sums to ${sum}, and the stated total is ${stated}`);
}

/**
 * Do two sides that must balance actually balance?
 *
 * This is the T-account, the trial balance and the balance sheet, which are one rule about SHAPE
 * rather than three accounting facts: two columns whose sums must be equal. Nothing here knows what
 * a debit is, and nothing here may learn.
 */
export function verifyBalance(left: readonly number[], right: readonly number[], money = true): Verification {
  if (left.length === 0 && right.length === 0) {
    return fail("nothing-to-check", "a balance was claimed between two empty sides");
  }
  if ([...left, ...right].some((value) => !Number.isFinite(value))) {
    return fail("not-a-number", "a value on one side is not a finite number");
  }
  const leftSum = left.reduce((total, value) => total + value, 0);
  const rightSum = right.reduce((total, value) => total + value, 0);
  const matches = money ? moneyAgrees(leftSum, rightSum) : agrees(leftSum, rightSum);
  return matches
    ? { ok: true }
    : fail("balance-mismatch", `one side sums to ${leftSum} and the other to ${rightSum}`);
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The angle at `vertex`, in degrees, between the rays to `a` and `b`. */
export function angleAt(vertex: Point, a: Point, b: Point): number | null {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const bx = b.x - vertex.x;
  const by = b.y - vertex.y;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  // A zero-length ray has no angle. Returning 0 would be a number that looks like an answer.
  if (magA === 0 || magB === 0) return null;
  const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (magA * magB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** The distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Does a stated angle match the coordinates that were supplied?
 *
 * 🔴 THIS IS WHY NEMESIS NEEDS NO GEOMETRY SOLVER TO BE HONEST. Constructing "a triangle with a 30°
 * angle at A" from a description is a hard problem; CHECKING that the points a model supplied really
 * do form a 30° angle at A is arithmetic. So the model does the placing and trusted code does the
 * marking, and a figure whose label disagrees with its own coordinates is refused rather than drawn
 * — which is the failure that would otherwise teach a learner a wrong number with a picture to back
 * it up.
 *
 * The tolerance is generous by geometry standards because a model placing points to two decimal
 * places will land a degree or so off, and refusing that would refuse every correct figure.
 */
export function verifyAngle(vertex: Point, a: Point, b: Point, statedDegrees: number, toleranceDegrees = 1): Verification {
  if (!Number.isFinite(statedDegrees)) return fail("not-a-number", "the stated angle is not a number");
  const measured = angleAt(vertex, a, b);
  if (measured === null) return fail("nothing-to-check", "two of these points coincide, so there is no angle");
  return Math.abs(measured - statedDegrees) <= toleranceDegrees
    ? { ok: true }
    : fail(
        "geometry-mismatch",
        `the coordinates give ${measured.toFixed(1)}°, and the figure is labelled ${statedDegrees}°`,
      );
}

/** A quantity with a direction, in degrees anticlockwise from the positive x axis. */
export interface Vector {
  readonly degrees: number;
  readonly magnitude: number;
}

/** Where a set of vectors ends up. */
export function resultant(vectors: readonly Vector[]): { degrees: number; magnitude: number; x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const vector of vectors) {
    const radians = (vector.degrees * Math.PI) / 180;
    x += vector.magnitude * Math.cos(radians);
    y += vector.magnitude * Math.sin(radians);
  }
  return { degrees: (Math.atan2(y, x) * 180) / Math.PI, magnitude: Math.hypot(x, y), x, y };
}

/**
 * Do vectors claimed to cancel actually cancel?
 *
 * 🔴 THE CHECK THAT STOPS A DIAGRAM MARKING A CORRECT LEARNER WRONG. A free-body diagram with the
 * normal force drawn at the wrong angle looks entirely plausible, and a learner who answers
 * correctly against the real physics is then marked against the drawing. The resultant is arithmetic
 * and the claim is checkable, so it gets checked.
 *
 * The tolerance is relative to the largest force present: a 100 N system that resolves to 0.5 N is
 * balanced to within rounding, and the same 0.5 N in a 1 N system is not.
 */
export function verifyEquilibrium(vectors: readonly Vector[], relative = 0.02): Verification {
  if (vectors.length < 2) return fail("nothing-to-check", "equilibrium was claimed over fewer than two vectors");
  if (vectors.some((vector) => !Number.isFinite(vector.magnitude) || !Number.isFinite(vector.degrees))) {
    return fail("not-a-number", "a vector has a non-finite magnitude or direction");
  }
  const largest = Math.max(...vectors.map((vector) => Math.abs(vector.magnitude)));
  if (largest === 0) return fail("nothing-to-check", "every vector has zero magnitude");
  const net = resultant(vectors);
  return net.magnitude <= relative * largest
    ? { ok: true }
    : fail(
        "equilibrium-mismatch",
        `these forces resolve to ${net.magnitude.toFixed(2)} at ${net.degrees.toFixed(0)}°, which is not zero`,
      );
}
