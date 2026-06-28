import assert from "node:assert/strict";
import { composerModeLabel } from "./ask-mode-label";

assert.equal(composerModeLabel({ label: "Fast" }), "fast");
assert.equal(composerModeLabel({ label: "Thorough" }), "thorough");
assert(!composerModeLabel({ label: "Fast" }).includes("live"));
assert(!composerModeLabel({ label: "Thorough" }).includes("live"));

console.log("ask-mode-label.test.ts OK");
