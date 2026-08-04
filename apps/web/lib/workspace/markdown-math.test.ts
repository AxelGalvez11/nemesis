import assert from "node:assert/strict";

import { normalizeMathDelimiters } from "./markdown-math";

assert.equal(normalizeMathDelimiters("Use \\(x^2\\) here."), "Use $$x^2$$ here.");
assert.equal(normalizeMathDelimiters("\\[x+y=z\\]"), "\n$$\nx+y=z\n$$\n");
assert.equal(normalizeMathDelimiters("`\\(literal\\)` and \\(math\\)"), "`\\(literal\\)` and $$math$$");

// Money is never rewritten: chat renders with single-dollar math OFF, and the
// normalizer must not manufacture math out of prices either (owner screenshot
// 2026-08-04: "$0.20 per million input tokens and $1.20" turned italic).
const prices = "GPT-5.6 Luna drops 80% to $0.20 per million input tokens and $1.20 per million output tokens.";
assert.equal(normalizeMathDelimiters(prices), prices);

console.log("markdown-math.test.ts OK");
