import assert from "node:assert/strict";

import { normalizeMathDelimiters } from "./markdown-math";

assert.equal(normalizeMathDelimiters("Use \\(x^2\\) here."), "Use $x^2$ here.");
assert.equal(normalizeMathDelimiters("\\[x+y=z\\]"), "\n$$\nx+y=z\n$$\n");
assert.equal(normalizeMathDelimiters("`\\(literal\\)` and \\(math\\)"), "`\\(literal\\)` and $math$");

console.log("markdown-math.test.ts OK");
