import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { docBlocks } from "@/lib/export/doc-blocks";

import { RAIL_MIN_HEADINGS, railHeadings } from "./document-rail";

const code = (name: string) => readFileSync(join(import.meta.dirname, name), "utf8");

test("the rail's entries are the document's headings, in order, addressed by block", () => {
  const blocks = docBlocks("# Executive summary\n\nSome prose here.\n\n## Market\n\nMore prose.\n\n### Vendors\n");
  const headings = railHeadings(blocks);
  assert.deepEqual(headings.map((h) => h.text), ["Executive summary", "Market", "Vendors"]);
  // 🔴 THE INDEX IS THE BLOCK'S POSITION, because that is the `data-comment-block` address the rail
  // uses to find the element again. Numbering the headings 0,1,2 instead would point at prose.
  for (const heading of headings) assert.equal(blocks[heading.index]?.kind, "heading");
});

test("🔴 a heading with no words is not an entry — it would be an unlabelled tick", () => {
  const blocks = [{ kind: "heading", text: "   " }, { kind: "heading", text: "Real" }];
  assert.deepEqual(railHeadings(blocks).map((h) => h.text), ["Real"]);
});

test("🔴 EVERY level counts, not just the top one", () => {
  // A report whose sections are all `##` would otherwise get an empty rail. Which level an author
  // reached for says nothing about what a reader wants to jump to.
  const blocks = docBlocks("## One\n\ntext\n\n## Two\n\ntext\n\n## Three\n");
  assert.equal(railHeadings(blocks).length, 3);
});

test("🔴🔴 the rail is full screen only, and only above a floor — both measured decisions", () => {
  // Owner 2026-08-31 asked for ChatGPT's rail; measured in `docs/chatgpt-reference.md`. Two rules
  // came out of that measurement and both are easy to lose in a refactor.
  const preview = code("output-preview.tsx");
  // 🔴 Their report has NO rail in the conversation card — it exists only in the expanded view. And
  // docked, our sheet leaves a 58px gutter, which a 287px panel cannot open into without covering
  // the document it indexes.
  assert.match(preview, /\{full && !deck && !output\.sheet && <DocumentRail/, "the rail now draws docked, where its panel cannot fit beside the document");
  // 🔴 A SIBLING OF THE SCROLLER. Inside it, `absolute` resolves against the scrolled content and
  // the marks slide up the page with the text — a position indicator that does not hold position.
  assert.match(preview, /<DocumentRail[\s\S]{0,160}<div className="min-h-0 flex-1 overflow-auto/, "the rail moved inside the scroller and will scroll away with the document");
  assert.match(preview, /overflow-auto[^"]*" ref=\{setScroller\}/, "the rail lost the element it measures against");
  assert.equal(RAIL_MIN_HEADINGS, 3, "the floor moved; a document with one or two headings has no navigation problem");
});

test("🔴 the measured numbers are in the markup, not approximated", () => {
  // From the reference: marks 3px tall, 19px inactive / 25px active, 12px gap (15px pitch);
  // panel 287 wide, 12px radius, 20px padding, entries 16px on 24px.
  const rail = code("document-rail.tsx");
  assert.match(rail, /h-\[3px\]/, "the tick height moved off the measurement");
  assert.match(rail, /w-\[25px\] bg-\(--ui-text-primary\)/, "the active mark is no longer 25px and dark");
  assert.match(rail, /w-\[19px\]/, "the inactive mark is no longer 19px");
  assert.match(rail, /gap-\[12px\]/, "the 15px pitch (3px mark + 12px gap) moved");
  assert.match(rail, /w-\[287px\]/, "the panel width moved off the measurement");
  assert.match(rail, /leading-\[24px\]/, "the entry line-height moved off the measurement");
  // 🔴 §46.3: sizes come from the five declared tokens, never a px literal.
  assert.ok(!/text-\[\d+px\]/.test(rail), "a literal font size crept in — the Canvas has five declared steps");
});
