// Ad hoc style regression test:
//   pnpm --filter @pharmaorb/web exec tsx lib/ask-ui-css.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/styles/shell.css", import.meta.url), "utf8");

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  const body = match?.[1];
  assert.ok(body, `Missing CSS block for ${selector}`);
  return body;
}

function fontSizePx(selector: string): number {
  const match = block(selector).match(/font-size:\s*([0-9.]+)px/);
  assert.ok(match, `Missing font-size for ${selector}`);
  return Number(match[1]);
}

const userBubble = fontSizePx(".bubble");

assert.ok(fontSizePx(".ai-body p") <= userBubble, "Base answer paragraph should not be larger than the user prompt.");
assert.ok(fontSizePx(".ai-body p.lead") <= userBubble, "Answer lead should not be larger than the user prompt.");
assert.ok(fontSizePx(".ai-para") <= userBubble, "Answer body paragraphs should not be larger than the user prompt.");
assert.ok(fontSizePx(".ai-body .ai-list li") <= userBubble, "Answer list items should not be larger than the user prompt.");

console.log("ask-ui-css.test.ts OK");
