import assert from "node:assert/strict";

import { normalizeGraphCssColor } from "./graph-palette";

assert.equal(normalizeGraphCssColor("color(srgb 0.5 0.25 1)", "fallback"), "rgb(128, 64, 255)");
assert.equal(normalizeGraphCssColor("color(srgb 0.1 0.2 0.3 / 0.4)", "fallback"), "rgba(26, 51, 77, 0.4)");
assert.equal(normalizeGraphCssColor("rgb(1, 2, 3)", "fallback"), "rgb(1, 2, 3)");
assert.equal(normalizeGraphCssColor("color(srgb nope)", "fallback"), "fallback");

console.log("graph-palette.test.ts OK");
