import assert from "node:assert/strict";
import { test } from "node:test";

import { citationsToMarkdown, groupCitationRuns } from "./chat-citations";

// 🔴 MEASURED OFF CHATGPT, 2026-08-20, at the owner's request after comparing the same question on
// both products. Its inline citation is a 62x18px pill — favicon, site name at 9px, flat grey, no
// border — and a sentence citing two sources renders as ONE pill reading "Reuters+1" at 76px.
//
// Ours drew one pill per marker, so a well-cited sentence ended in a row of dots and a broad answer
// ended in ten of them. That is the clutter reported as three indistinguishable "Cnbc" pills.

const link = (n: number) => `[${n}](#nemesis-cite=${n})`;

test("🔴 a run of adjacent markers becomes one pill that counts the rest", () => {
  const grouped = groupCitationRuns(`Stripe bought OpenRouter.${link(1)}${link(2)}${link(3)}`);
  assert.equal(grouped, "Stripe bought OpenRouter.[1](#nemesis-cite=1.2)");
});

test("🔴 whitespace between markers is still one citation event", () => {
  // `[1] [2]` is how a model commonly spaces them, and it means the same thing as `[1][2]`.
  assert.equal(groupCitationRuns(`x ${link(4)} ${link(1)}`), "x [4](#nemesis-cite=4.1)");
});

test("🔴🔴 markers separated by WORDS are NOT collapsed", () => {
  // THE failure to avoid. Collapsing these would attach the second page to a sentence that never
  // cited it — a claim about provenance that is simply false.
  //
  // Calibration: drop `\\s*` to `[\\s\\S]*` in the run pattern and this reddens.
  const apart = `The ECB warned of a correction${link(4)} and later Anthropic reported profit${link(6)}`;
  assert.equal(groupCitationRuns(apart), apart);
});

test("a lone marker is untouched", () => {
  assert.equal(groupCitationRuns(`one source${link(2)}`), `one source${link(2)}`);
});

test("🔴 the leading number survives for a renderer that never learned about the suffix", () => {
  // The extra count rides as `n.extra`, and `Number.parseInt` stops at the dot. An older renderer
  // resolves source 1 and simply does not draw the "+2" — degraded, never broken.
  const grouped = groupCitationRuns(`${link(1)}${link(5)}${link(9)}`);
  const href = /#nemesis-cite=([^)]+)/.exec(grouped)?.[1] ?? "";
  assert.equal(Number.parseInt(href, 10), 1);
  assert.equal(href, "1.2");
});

test("🔴 grouping runs AFTER conversion, over real prose, and leaves code alone", () => {
  // `citationsToMarkdown` already refuses to touch fenced or inline code; grouping runs on its
  // output, so that refusal is inherited rather than restated.
  const converted = citationsToMarkdown("See [1][2] and `const x = arr[1]` here.", 3);
  const grouped = groupCitationRuns(converted);
  assert.match(grouped, /\[1\]\(#nemesis-cite=1\.1\)/);
  assert.match(grouped, /`const x = arr\[1\]`/, "a bracket inside code was rewritten");
});

test("an out-of-range marker is gone by the time the grouper runs", () => {
  // 🔴 THIS USED TO ASSERT `[9]` SURVIVED AS TEXT, on the reasoning that "a pill pointing at
  // nothing is worse than a bare number". The owner rejected the premise on 2026-08-31 — *"it's
  // also made up citations"*, *"citations should only show up as the pill form"* — so an
  // unresolvable marker is deleted upstream and the grouper never sees one. Both are true at once:
  // no pill points at nothing, AND no bracket number reaches the reader.
  const converted = citationsToMarkdown("a [1] b [9]", 3);
  assert.equal(groupCitationRuns(converted), "a [1](#nemesis-cite=1) b");
});
