// The answer and the composer, pinned to the numbers measured off the reference.
//
// 🔴 THE OWNER'S BAR, AND IT IS NOT A STYLE PREFERENCE (2026-08-26): *"compare the font, spacing
// and coloring of the output, also the chat composer, because it just feels a bit too wide right
// now. compare with ChatGPT."* Two days earlier, unprompted: *"Don't just measure with vision.
// Make sure that you actually grab the numbers too."*
//
// 🔴 WHAT THIS SUITE IS AND IS NOT. Every number below was read out of a real browser — the
// reference's own `.markdown` container cloned and fed an identical fragment, then the same
// fragment fed to ours at the same viewport. That is recorded in `docs/chatgpt-reference.md`. This
// file cannot re-run that; a Node test has no cascade. What it CAN do is refuse a silent revert of
// the declarations those measurements produced, which is the failure mode that actually happens:
// somebody tidies a stylesheet, a gap goes back to 20px, and nothing anywhere says it moved.
//
// After the change, measured in real headless Chrome against the local build:
//
//     paragraph → paragraph  16   heading → paragraph  8    bullet → bullet  0
//     paragraph → heading    16   paragraph → list     4    list → paragraph 8
//     body 16px / 26px / #0d0d0d      h2 20 / 600 / 28      inline code 14 / r4 / 2.4 x 4.8
//
// Every one of those equals the reference exactly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const CHROME = read("../../app/styles/desktop-chrome.css");
const UI = read("../../app/styles/desktop-ui.css");
const GLOBALS = read("../../app/globals.css");
const MARKDOWN = read("./chat-markdown.tsx");
const HOME = read("../../components/workspace/learn/canvas-home.tsx");
const COMPOSER = read("../../components/workspace/learn/canvas-composer.tsx");
const DOC = read("../../../../docs/chatgpt-reference.md");

/** The stylesheet with comments stripped, so a number quoted in prose cannot satisfy an assertion. */
const rules = CHROME.replace(/\/\*[\s\S]*?\*\//g, "");

test("🔴 every block gap in an answer is the reference's, to the pixel", () => {
  // One margin per adjacent PAIR, never a margin on each block: two blocks that both carry one
  // collapse to the larger in normal flow and do not collapse at all inside a flex or grid parent,
  // so the same stylesheet would render different gaps depending on a container it cannot see.
  assert.match(rules, /\.aui-md\.aui-md > \* \+ \* \{\s*margin-top: 16px;/, "the default block gap moved");
  assert.match(rules, /> h1 \+ \*,\s*\.aui-md\.aui-md > h2 \+ \*,[\s\S]{0,120}margin-top: 8px;/, "the gap under a heading moved");
  assert.match(rules, /> p \+ ul,\s*\.aui-md\.aui-md > p \+ ol \{\s*margin-top: 4px;/, "a list stopped belonging to the sentence above it");
  assert.match(rules, /> ul \+ \*,\s*\.aui-md\.aui-md > ol \+ \* \{\s*margin-top: 8px;/, "the gap after a list moved");
  // 🔴 BULLETS DO NOT BREATHE. Ours were 8px top AND bottom against the reference's zero, so a
  // six-bullet list stood 40px taller than the same list beside it. Single biggest contributor to
  // the answer reading as sprawling.
  assert.match(rules, /\.aui-md\.aui-md :where\(li\) \{\s*margin-top: 0;\s*margin-bottom: 0;/);
});

test("🔴 the doubled selector stays, because a single class only ties", () => {
  // Typography writes its defaults through `:where(...)` (zero specificity), but the markdown host
  // carries its own utilities, which are plain classes — so one class would be settled by
  // stylesheet order rather than by intent.
  const singles = rules.match(/^\.aui-md > /gm);
  assert.equal(singles, null, "a rule dropped back to a single .aui-md and can now be beaten by a utility");
});

test("🔴 the heading scale is the reference's size AND weight", () => {
  for (const [tag, size, line] of [["h1", 24, 32], ["h2", 20, 28], ["h3", 18, 28], ["h4", 16, 24]] as const) {
    const block = new RegExp(`:where\\(${tag}\\) \\{\\s*font-size: ${size}px;\\s*font-weight: 600;\\s*line-height: ${line}px;`);
    assert.match(rules, block, `${tag} left the reference's scale`);
  }
  // Ours ran a step large and a weight heavy — h2 at 24/700 — which made every section break shout.
  assert.equal(/:where\(h2\) \{\s*font-size: 24px/.test(rules), false, "h2 is a step too large again");
});

test("🔴🔴 no rem where the reference states a pixel", () => {
  // `html { font-size: 112.5% }`, so one rem is 18px and every rem value renders 12.5% larger than
  // it reads. This is the third separate lane it has bitten (Library `max-w-3xl` → 864px, the
  // attachment card, and now the answer): `1rem` heading margins drew 20px, `0.89rem` body text
  // drew 16.02px on a 26.03px line, and `0.25rem` code corners drew 4.5px.
  assert.match(UI, /--conversation-text-font-size: 16px;/, "the conversation size went back to a rem");
  assert.equal(/--paragraph-gap:\s*[\d.]+rem/.test(UI), false, "the rem-based paragraph gap is back");
  const scoped = rules.match(/\.aui-md\.aui-md[^{]*\{[^}]*\}/g) ?? [];
  for (const block of scoped) {
    assert.equal(/\d+(\.\d+)?rem/.test(block), false, `a rem crept into a measured rule: ${block.slice(0, 70)}`);
  }
  // The utilities that fought these rules were REMOVED rather than left to lose quietly.
  for (const dead of ["[&>*+*]:mt-(--paragraph-gap)", "prose-code:rounded-[0.25rem]", "prose-code:text-[0.9em]", "prose-code:px-[0.1875rem]"]) {
    assert.equal(MARKDOWN.includes(`"${dead}`) || MARKDOWN.includes(` ${dead} `), false, `${dead} is back in the class list`);
  }
});

test("🔴🔴 the composer's edge is one list of measured layers, not a shadow plus a ring", () => {
  // The width was never the fault: both composers measure exactly 768px at the same viewport. The
  // edge was. Ours drew `ring-1 ring-(--ui-stroke-tertiary)` — rgba(13,13,13,0.08) — OVER the first
  // layer of its own shadow, so the composite hairline was twice the reference's 0.04 and the pill
  // read as a drawn box. A drawn box announces its full width.
  assert.match(GLOBALS, /--composer-edge:\s*\n?\s*0 0 0 1px rgba\(0, 0, 0, 0\.04\),/);
  assert.match(GLOBALS, /0 2px 8px 0 rgba\(0, 0, 0, 0\.04\),/);
  assert.match(GLOBALS, /0 4px 80px 8px rgba\(0, 0, 0, 0\.024\);/);
  // The reference drops the drop shadow entirely in dark and keeps one inset hairline.
  assert.match(GLOBALS, /:root\[data-theme='dark'\] \{\s*--composer-edge: inset 0 0 1px 0 rgba\(255, 255, 255, 0\.2\);/);
  // 🔴 AND THE FILL IS PURE WHITE, WHICH IS THE OTHER HALF OF THE SAME READING. `--ui-bg-elevated`
  // computes to #fdfdfd — ONE unit off the #fcfcfc page instead of the reference's three. A pill
  // barely lighter than its ground stops reading as raised and starts reading as a marked-out
  // region, and a region is read by its outline. Measured after the change: light `rgb(255,255,255)`,
  // dark `rgb(33,33,33)` — and #212121 is the reference's own dark surface.
  assert.match(GLOBALS, /--composer-fill: #ffffff;/);
  assert.match(GLOBALS, /--composer-fill: #212121;/);
  for (const [name, src] of [["front door", HOME], ["canvas", COMPOSER]] as const) {
    assert.match(src, /bg-\(--composer-fill\)/, `the ${name} composer stopped reading the fill token`);
  }
  // 🔴 IT IS NOT CALLED `--composer-shadow`. That name is taken by the legacy `.box` composer in
  // shell.css; a second declaration of it in the same `:root` would silently restyle a surface
  // nobody was looking at.
  assert.match(GLOBALS, /--composer-shadow: 0 12px 32px/, "the legacy composer token was renamed or removed");
  // Both composers, still one shape — they fly into each other at the route swap.
  //
  // 🔴 THE NEGATIVE HALF NAMES THE OLD SHADOW, NOT `ring-1`, and the first version of this test was
  // wrong for a reason worth recording: `ring-1 ring-(--ui-stroke-tertiary)` is still used, legitimately,
  // by the capability chip that sits above the input. Banning the utility file-wide reddened on an
  // element that was never part of the complaint. What must not come back is the doubled edge ON
  // THE PILL, and the old two-layer shadow is its fingerprint.
  for (const [name, src] of [["front door", HOME], ["canvas", COMPOSER]] as const) {
    assert.match(src, /shadow-\[var\(--composer-edge\)\]/, `the ${name} composer stopped reading the token`);
    assert.equal(
      /shadow-\[0_1px_2px_rgba\(0,0,0,0\.03\)/.test(src),
      false,
      `the ${name} composer went back to its own two-layer shadow`,
    );
  }
});

test("the measurements are committed, not just applied", () => {
  // A number in a stylesheet with no note is a number nobody can re-check. The owner asked twice
  // for real measurement; the reference file is where the readings live.
  assert.match(DOC, /## The conversation surface/);
  assert.match(DOC, /paragraph → paragraph \| \*\*16\*\*/);
  assert.match(DOC, /The width already matched exactly/);
});
