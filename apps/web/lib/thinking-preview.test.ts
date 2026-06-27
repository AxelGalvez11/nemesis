// Ad hoc pure-copy test:
//   pnpm --filter @pharmaorb/web exec tsx lib/thinking-preview.test.ts
import assert from "node:assert/strict";
import { buildThinkingPreview, summarizeQuestionFocus } from "./thinking-preview";

assert.equal(
  summarizeQuestionFocus("Is Celsius lethal if I drink it with lisinopril?"),
  "Is Celsius lethal if I drink it with lisinopril?",
);

assert.equal(
  summarizeQuestionFocus("   ".padEnd(180, "semaglutide muscle loss ")),
  "semaglutide muscle loss semaglutide muscle loss semaglutide...",
);

const first = buildThinkingPreview("Is Celsius lethal?", 0);
assert.equal(first.title, "Thinking");
assert.equal(first.current, "Understanding what you are asking");
assert.match(first.preview, /You are asking about "Is Celsius lethal\?"/);
assert.match(first.preview, /identifying the topic/i);

const ranking = buildThinkingPreview("semaglutide muscle loss", 2);
assert.equal(ranking.current, "Ranking the evidence");
assert.match(ranking.preview, /source strength/i);
assert.equal(ranking.steps.length, 4);

console.log("thinking-preview.test.ts OK");
