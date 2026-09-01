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

// 🔴🔴 A FORMULA ALONE ON ITS LINE IS A DISPLAY EQUATION, NOT INLINE MATH.
// The owner spotted this in a canvas answer (2026-09-01): the half-life formula sat small and hard
// against the left margin under a paragraph about it. Cause: remark-math only opens a math BLOCK
// when `$$` sit on lines of their own. `$$x$$` written on ONE line — which is what models emit
// constantly — parses as inline math, so KaTeX sets it at body size in the paragraph flow instead
// of centred and larger. The two forms are indistinguishable in the source.
//
// Measured through the real pipeline before and after: the one-line form produced `class="katex"`,
// the block form produced `katex-display`.
assert.equal(normalizeMathDelimiters("$$E = mc^2$$"), "\n$$\nE = mc^2\n$$\n");
assert.equal(normalizeMathDelimiters("   $$E = mc^2$$   "), "\n$$\nE = mc^2\n$$\n");
assert.equal(normalizeMathDelimiters("Text.\n\n$$a+b$$\n\nAfter."), "Text.\n\n\n$$\na+b\n$$\n\n\nAfter.");

// 🔴🔴 AND INLINE `$$…$$` INSIDE A SENTENCE STAYS INLINE. This is not a nicety: it is what `\(…\)`
// is rewritten to above, precisely because chat runs with single-dollar math OFF and `$$…$$` is the
// inline shape remark-math still honours there. Expanding these would push every inline variable
// onto its own centred line, turning "where $$V_d$$ is the volume" into three paragraphs.
assert.equal(normalizeMathDelimiters("Where $$V_d$$ is the volume."), "Where $$V_d$$ is the volume.");
assert.equal(normalizeMathDelimiters("$$a$$ and $$b$$"), "$$a$$ and $$b$$");

// A real block's own fence lines are `$$` with nothing after them. Rewriting one would nest a block
// inside a block and lose the formula between them.
assert.equal(normalizeMathDelimiters("$$\na+b\n$$"), "$$\na+b\n$$");
