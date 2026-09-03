// The mind map view, read as text: every box is a button, no colour but the app's own tokens, the
// chat-column shape stays small, and the door to the panel exists only when there is a panel.
//
// 🔴 SOURCE-LEVEL, LIKE EVERY GUARD IN THIS FOLDER. There is no DOM here to click a box in. What
// can be held is that the file keeps the shape that makes a box clickable, keyboard-reachable and
// readable to a screen reader, and that a colour literal never lands in it. The geometry is proven
// next to the layout, in `lib/learn/mindmap-tree.test.ts`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
/** Comments stripped: the notes explaining an absence necessarily quote the shape being searched for. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/^\s*\/\/.*$/gmu, " ");

const VIEW = read("./mindmap-view.tsx");
const TREE = read("../../../lib/learn/mindmap-tree.ts");
const CSS = read("../../../app/styles/desktop-ui.css");
const CODE = code(VIEW);

test("🔴🔴 every box is a button: role, a tab stop, aria-expanded when it can fold, Enter and Space", () => {
  assert.match(CODE, /<g\s/, "the box is not an SVG group any more");
  assert.match(CODE, /role="button"/, "the box lost its button role");
  assert.match(CODE, /tabIndex=\{0\}/, "the box is not in the tab order");
  assert.match(CODE, /aria-expanded=\{hasChildren \? node\.expanded : undefined\}/, "aria-expanded is not tied to the box's own state");
  assert.match(CODE, /event\.key !== "Enter" && event\.key !== " "/, "the keyboard cannot open a box");
  assert.match(CODE, /onClick=\{\(\) => activate\(node\)\}/, "a click does not reach the box");
  // A leaf is picked, a branch folds: one function decides, so the two cannot drift apart.
  assert.match(CODE, /if \(node\.childCount > 0\) toggle\(node\.id\);\s*else onSelect\?\.\(/);
});

test("🔴🔴 no colour literal anywhere: no hex, no rgb, no hsl, no named colour", () => {
  assert.doesNotMatch(CODE, /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, "a hex colour is in the view");
  assert.doesNotMatch(CODE, /\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/, "a computed colour is in the view");
  assert.doesNotMatch(CODE, /"(?:black|white|red|green|blue|gray|grey|orange|yellow|currentColor)"/, "a named colour is in the view");
});

test("🔴 every token the view reads is a --ui- token that desktop-ui.css actually declares", () => {
  const tokens = new Set(CODE.match(/--[a-z][a-z0-9-]*/g) ?? []);
  assert.ok(tokens.size >= 5, "the view stopped reading the app's tokens");
  for (const token of tokens) {
    // The canvas's five type steps are app tokens too: `learn-heading.test.ts` (§46.3) refuses
    // any pixel size on this surface that is not one of them.
    assert.ok(token.startsWith("--ui-") || token.startsWith("--canvas-text-"), `${token} is not an app token`);
    assert.ok(CSS.includes(`${token}:`), `${token} is not declared in desktop-ui.css`);
  }
  // Every fill and stroke on the drawing is a token or nothing.
  for (const [, value] of CODE.matchAll(/\b(?:fill|stroke)=(\{[^}]*\}|"[^"]*")/g)) {
    assert.match(value!, /^"(?:none|var\(--ui-[a-z-]+\))"$|^\{.*var\(--ui-[a-z-]+\).*\}$/s, `${value} is not a token`);
  }
});

test("🔴🔴 the accent reaches the focus ring and nothing else (owner, 2026-09-03)", () => {
  const lines = CODE.split("\n").filter((line) => line.includes("--ui-action"));
  assert.ok(lines.length >= 1, "the focus ring lost the accent");
  for (const line of lines) {
    assert.match(line, /focus-visible/, `--ui-action is on something that is not a focus ring: ${line.trim()}`);
  }
  // The root is told apart by weight, not by an accent stroke.
  assert.match(CODE, /strokeWidth=\{isRoot \? 1\.5 : 1\}/);
  assert.match(CODE, /fontWeight=\{isRoot \? 600 : 400\}/);
});

test("🔴 the fade is 160ms of opacity and stops under prefers-reduced-motion", () => {
  assert.match(VIEW, /\.mindmap-enter \{ animation: mindmap-fade 160ms ease-out; \}/);
  assert.match(VIEW, /@keyframes mindmap-fade \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  const reduced = VIEW.slice(VIEW.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.length > 0, "there is no reduced-motion rule");
  assert.match(reduced, /\.mindmap-enter \{ animation: none; \}/, "the fade ignores a reduced-motion preference");
  // One stylesheet per page, not one per map.
  assert.match(CODE, /<style href=\{STYLE_HREF\} precedence="default">/);
});

test("🔴 the inline shape is capped, and the cap is the number the chat column was given", () => {
  assert.match(CODE, /const INLINE_MAX_HEIGHT = 360;/);
  assert.match(CODE, /maxHeight: variant === "inline" \? INLINE_MAX_HEIGHT : undefined/);
  assert.match(CODE, /className="w-full overflow-auto"/, "the capped box does not scroll, so a tall map is cut off");
});

test("🔴 \"Open the map\" is offered once, in the inline shape, and only when there is somewhere to open it", () => {
  const at = CODE.indexOf("Open the map");
  assert.notEqual(at, -1, "the door to the panel is gone");
  assert.equal(CODE.indexOf("Open the map", at + 1), -1, "the door is drawn twice");
  const inlineBranch = CODE.lastIndexOf('variant === "inline" && (', at);
  assert.notEqual(inlineBranch, -1, "the door is outside the inline shape");
  assert.ok(!CODE.slice(inlineBranch, at).includes('variant === "panel"'), "the door is in the panel shape");
  assert.match(CODE.slice(inlineBranch, at), /\{onOpen && <TextButton onClick=\{onOpen\}>$/, "the door is drawn without an onOpen to walk through");
  // And the caption beside it is the whole map's size, from the stats, not a count of what is showing.
  assert.match(CODE, /\{caption\(stats\)\}/);
  assert.match(CODE, /"idea" : "ideas"/);
  assert.match(CODE, /"level" : "levels"/);
});

test("the panel shape carries the two bulk controls and no cap", () => {
  const panel = CODE.indexOf('variant === "panel" && (');
  assert.notEqual(panel, -1);
  const block = CODE.slice(panel, CODE.indexOf("</div>", CODE.indexOf("Collapse to the top")));
  assert.match(block, /Expand all/);
  assert.match(block, /Collapse to the top/);
  assert.match(block, /replace\(everything\)/);
  assert.match(block, /replace\(topExpanded\(root\)\)/);
});

test("the folded badge counts direct children, so it says what one click reveals", () => {
  assert.match(CODE, /\{hasChildren && !node\.expanded && \(/);
  assert.match(CODE, /\+\{node\.childCount\}/);
});

test("🔴 no em dash in the map, its tree, or this file", () => {
  for (const [name, source] of [
    ["mindmap-view.tsx", VIEW],
    ["mindmap-tree.ts", TREE],
    ["mindmap-view.test.ts", read("./mindmap-view.test.ts")],
    ["mindmap-tree.test.ts", read("../../../lib/learn/mindmap-tree.test.ts")],
  ] as const) {
    // Spelled as escapes so this file is not the one carrying the character it forbids.
    assert.doesNotMatch(source, /[\u2014\u2015]/, `${name} carries an em dash`);
  }
});
