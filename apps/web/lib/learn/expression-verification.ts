// Expression verification: does a formula give the value it was said to give, and are two
// formulas the same function across a range. Split from visual-verification.ts because these
// two need mathjs (through expression.ts) and that module is reached by the canvas parser on
// the client, where mathjs does not belong in the bundle. Server-side and test callers import
// from here.

import { checkExpression } from "./expression";
import { agrees, fail, type Verification } from "./visual-verification";

// 🔴 SAMPLED, NOT PROVED, AND SAYING SO IS THE WHOLE POINT. Nemesis has no symbolic prover: what
// follows evaluates two expressions at many points and reports whether they ever disagree. That
// catches every ordinary teaching error — a dropped term, a sign, a mis-expanded bracket — and it
// cannot certify an identity. So the refusal is trustworthy (a disagreement is real) and the pass is
// evidence rather than proof, which is the right way round: the check exists to stop wrong algebra
// reaching a learner, not to award marks.


/** Does a formula really give the value it was said to give? */
export function verifyExpressionValue(
  expression: string,
  variables: Readonly<Record<string, number>>,
  stated: number,
  relative = 1e-6,
): Verification {
  const checked = checkExpression(expression, Object.keys(variables));
  if (!checked.ok) return fail("expression-refused", `${checked.reason}: ${checked.detail}`);
  if (!Number.isFinite(stated)) return fail("not-a-number", "the stated value is not a finite number");
  const actual = checked.evaluate(variables);
  if (actual === null) {
    const inputs = Object.entries(variables).map(([name, value]) => `${name}=${value}`).join(", ");
    return fail("nothing-to-check", `"${expression}" has no value at ${inputs}`);
  }
  return agrees(actual, stated, relative)
    ? { ok: true }
    : fail("value-mismatch", `"${expression}" evaluates to ${actual}, and the stated value is ${stated}`);
}

/**
 * Are two expressions the same function across a range?
 *
 * 🔴 A DISAGREEMENT IS REPORTED WITH THE POINT THAT FOUND IT, because "these are not equivalent" is
 * an assertion and "these differ at x = 2, where one gives 9 and the other 7" is a lesson. It is
 * also the only form a person can check by hand.
 *
 * 🔴 POINTS WHERE EITHER SIDE IS UNDEFINED ARE SKIPPED RATHER THAN COUNTED AS A DIFFERENCE. `x/x`
 * and `1` agree everywhere they are both defined, and refusing them over the single hole at zero
 * would refuse a correct simplification.
 */
export function verifyEquivalence(
  left: string,
  right: string,
  variable = "x",
  range: { from: number; to: number } = { from: -5, to: 5 },
  samples = 97,
): Verification {
  const a = checkExpression(left, [variable]);
  if (!a.ok) return fail("expression-refused", `left: ${a.reason}: ${a.detail}`);
  const b = checkExpression(right, [variable]);
  if (!b.ok) return fail("expression-refused", `right: ${b.reason}: ${b.detail}`);

  const low = Math.min(range.from, range.to);
  const high = Math.max(range.from, range.to);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) {
    return fail("nothing-to-check", "the range has no width");
  }

  const step = (high - low) / (samples - 1);
  let compared = 0;
  for (let index = 0; index < samples; index += 1) {
    // An irrational offset keeps the sample points off the round numbers where a wrong formula is
    // most likely to accidentally agree — x = 0, 1 and 2 are exactly where a dropped term hides.
    const at = low + index * step + step * 0.31830988618;
    if (at > high) continue;
    const leftValue = a.evaluate({ [variable]: at });
    const rightValue = b.evaluate({ [variable]: at });
    if (leftValue === null || rightValue === null) continue;
    compared += 1;
    if (!agrees(leftValue, rightValue, 1e-6)) {
      return fail(
        "not-equivalent",
        `at ${variable} = ${at.toFixed(4)}, "${left}" gives ${leftValue} and "${right}" gives ${rightValue}`,
      );
    }
  }

  return compared === 0
    ? fail("nothing-to-check", "neither expression has a value anywhere in this range")
    : { ok: true };
}
