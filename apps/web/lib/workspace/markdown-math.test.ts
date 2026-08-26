import assert from "node:assert/strict";

import { escapeCurrencyDollars, normalizeMathDelimiters } from "./markdown-math";

assert.equal(normalizeMathDelimiters("Use \\(x^2\\) here."), "Use $$x^2$$ here.");
assert.equal(normalizeMathDelimiters("\\[x+y=z\\]"), "\n$$\nx+y=z\n$$\n");
assert.equal(normalizeMathDelimiters("`\\(literal\\)` and \\(math\\)"), "`\\(literal\\)` and $$math$$");

// Money is never rewritten: chat renders with single-dollar math OFF, and the
// normalizer must not manufacture math out of prices either (owner screenshot
// 2026-08-04: "$0.20 per million input tokens and $1.20" turned italic).
const prices = "GPT-5.6 Luna drops 80% to $0.20 per million input tokens and $1.20 per million output tokens.";
assert.equal(normalizeMathDelimiters(prices), prices);

// The regression the owner photographed twice: on a surface with single-dollar math ON,
// remark-math pairs the two `$` and renders "0.87 to 3.96" as one italic formula.
assert.equal(escapeCurrencyDollars("It ranges from $0.87 to $3.96 a dose."), "It ranges from \\$0.87 to \\$3.96 a dose.");
assert.equal(escapeCurrencyDollars(prices), "GPT-5.6 Luna drops 80% to \\$0.20 per million input tokens and \\$1.20 per million output tokens.");
assert.equal(escapeCurrencyDollars("Rent is $1,250.50 a month."), "Rent is \\$1,250.50 a month.");
assert.equal(escapeCurrencyDollars("Costs $5."), "Costs \\$5.");

// 🔴 AND THE MATHS THE CANVAS TURNED THE FLAG ON FOR SURVIVES UNTOUCHED. A letter, an
// exponent, a TeX command or a closing `$` after the digits all mean someone opened maths.
for (const maths of ["$k$", "$x^2$", "$2x + 1$", "$100$", "$2^n$", "$\\frac{1}{2}$", "$2 + 3$", "$$3x$$"]) {
  assert.equal(escapeCurrencyDollars(maths), maths, maths);
}

// Already escaped stays escaped, and code spans are never rewritten.
assert.equal(escapeCurrencyDollars("\\$5"), "\\$5");
assert.equal(escapeCurrencyDollars("`$5 in code` and $5 in prose"), "`$5 in code` and \\$5 in prose");

// 🔴🔴🔴 A FORMULA THAT BEGINS WITH A NUMBER IS NOT A PRICE, AND FOR MONTHS IT WAS TREATED AS ONE.
// The owner photographed this line on the live app, 2026-08-25: the canvas printed the raw source
// because `escapeCurrencyDollars` escaped the opening `$`. Its old test was "does the span contain
// a letter", and every variable and every LaTeX command IS a letter.
for (const maths of [
  "$0 < r < \\pi/2$",
  "$0 \\le x \\le 1$",
  "$2 \\pi r$",
  "$5 \\times 10^3$",
  "$5 \\text{kg}$",
  "$3 + 4 = 7$",
  "$0 < r < 1$",
  "$1.57 \\approx \\pi/2$",
]) {
  assert.equal(escapeCurrencyDollars(maths), maths, `maths escaped as money: ${maths}`);
}

// 🔴 THE WHOLE SENTENCE THE OWNER SAW, IN CONTEXT. Every span here is well formed, and every one of
// them used to be eaten because it starts with a digit and a space.
assert.equal(
  escapeCurrencyDollars("For $0 < r < \\pi/2$: $z$ rises to $1$ at $r = \\pi/2 \\approx 1.57$."),
  "For $0 < r < \\pi/2$: $z$ rises to $1$ at $r = \\pi/2 \\approx 1.57$.",
);

// 🔴🔴🔴 AND MONEY IS STILL MONEY. This is the pair the whole function exists for, and widening the
// maths test must never cost it. `$5 \\text{kg}$` above and `$5 and the total` here differ only in
// whether the letters are notation or words.
const MONEY: ReadonlyArray<readonly [string, string]> = [
  ["It costs $0.87 to $3.96 per run.", "It costs \\$0.87 to \\$3.96 per run."],
  ["The fee is $5 and the total is $1,000.50.", "The fee is \\$5 and the total is \\$1,000.50."],
  ["Between $10 and $20 a month.", "Between \\$10 and \\$20 a month."],
  // 🔴 A PRICE AND AN EQUALS SIGN IN ONE SENTENCE. Treating any `=` as proof of maths would have
  // swallowed this whole clause; the test is whether the WORDS are notation, not whether an
  // operator appears somewhere.
  ["It was $50 for the x = 3 case and $60 for the other.", "It was \\$50 for the x = 3 case and \\$60 for the other."],
];
for (const [prose, escaped] of MONEY) {
  assert.equal(escapeCurrencyDollars(prose), escaped, prose);
}

// 🔴 A SENTENCE THE MODEL WRAPPED IN `$…$` BY MISTAKE STAYS READABLE TEXT. Measured in production
// on the same turn. Rendering it as a formula would run every word together into one italic smear;
// leaving it alone is ugly and legible, which is the better of two bad outcomes.
const misdelimited = "For $0 < r < \\pi/2: z rises smoothly to its maximum of 1 at r = \\pi/2 \\approx 1.57$.";
assert.equal(escapeCurrencyDollars(misdelimited), misdelimited.replace("$0", "\\$0"));

console.log("markdown-math.test.ts OK");
