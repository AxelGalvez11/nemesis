// Ad hoc source-level behavior test:
//   pnpm --filter @pharmaorb/web exec tsx lib/ask-thinking-gate.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/app/ask/page.tsx", import.meta.url), "utf8");

assert.match(source, /if \(!busy\) \{ setShowThinking\(false\); return; \}\s+setShowThinking\(true\);/s);
assert.doesNotMatch(source, /setTimeout\(\(\) => setShowThinking\(true\),\s*550\)/);
assert.match(source, /const MIN_THINKING_PREVIEW_MS = 650;/);
assert.match(source, /const minThinkingPreview = wait\(MIN_THINKING_PREVIEW_MS\);/);
assert.match(source, /await minThinkingPreview;\s+setLast\(\{ a: res \}\);/s);
assert.match(source, /<Thinking stage=\{3\} question=\{t\.q\} complete \/>/);

console.log("ask-thinking-gate.test.ts OK");
