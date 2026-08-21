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

console.log("markdown-math.test.ts OK");
