import assert from "node:assert/strict";
import { ASK_EXAMPLE_PROMPTS, askPlaceholderFor } from "./ask-examples";

assert.ok(
  ASK_EXAMPLE_PROMPTS.includes("is lisinopril safe with spironolactone?"),
  "Expected the interaction example to be available for the empty chat composer.",
);
assert.equal(askPlaceholderFor(0), "is lisinopril safe with spironolactone?");
assert.equal(askPlaceholderFor(ASK_EXAMPLE_PROMPTS.length), ASK_EXAMPLE_PROMPTS[0]);
assert.equal(askPlaceholderFor(-1), ASK_EXAMPLE_PROMPTS[ASK_EXAMPLE_PROMPTS.length - 1]);

console.log("ask-examples.test.ts OK");
