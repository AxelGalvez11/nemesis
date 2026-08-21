import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Source with comments stripped, so prose ABOUT a rule is never mistaken for the rule. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const shell = code(readFileSync(new URL("./workspace-shell.tsx", import.meta.url), "utf8"));
const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

// Owner, 2026-08-21: *"add a collapse microanimation to the sidebar so it smoothly collapses
// instead of abrupt collapse."* Three things have to hold together for that to be true, and each
// one of them is silently undoable by a later edit that looks reasonable on its own.

test("🔴 the nav column transitions rather than snapping", () => {
  assert.match(css, /\[data-pane-shell\]\[data-pane-shell-animate="true"\][\s\S]{0,200}transition:\s*grid-template-columns/);
  assert.match(shell, /data-pane-shell-animate=/, "the shell no longer publishes the gate the rule needs");
});

test("🔴 and it is off for the first paint, so a page load does not slide", () => {
  // `useResponsiveSidebar` reads the learner's stored preference in an effect, so an open sidebar
  // renders collapsed for one frame and corrects. Transitioning that frame turns a restore into an
  // animation nobody asked for, on every single load.
  assert.match(shell, /requestAnimationFrame\([\s\S]{0,120}requestAnimationFrame\(/,
    "the gate no longer waits for a painted frame, so the restore itself will animate");
  assert.match(shell, /animateNav && !narrowViewport/, "the gate is no longer conditional on being mounted and wide");
});

// 🔴🔴 THE ONE THAT WILL ROT. `--sidebar-width` was an alias for the grid column, which was
// harmless while the column snapped between two numbers. Once it slides, `Sidebar`'s
// `w-(--sidebar-width)` would re-measure every label on every frame: a reflow storm, worst exactly
// where the labels are narrowest. The pane must keep its own width and be CLIPPED by the column.
test("🔴 the sidebar's own width is its destination, not the column it is being clipped by", () => {
  assert.doesNotMatch(
    shell,
    /"--sidebar-width" as string\]:\s*"var\(--pane-chat-sidebar-width\)"/,
    "the pane width follows the animated column again, so its content will re-wrap every frame",
  );
  assert.match(shell, /"--sidebar-width" as string\]: narrowViewport \? "min\(84vw, 18rem\)" : "var\(--nav-sidebar-width\)"/);
  // And the thing that does the clipping is still there.
  assert.match(shell, /data-pane-id="chat-sidebar"/);
  const pane = shell.slice(shell.indexOf('data-pane-id="chat-sidebar"') - 400, shell.indexOf('data-pane-id="chat-sidebar"'));
  assert.match(pane, /overflow-hidden/, "the column stopped clipping, so a wider pane will spill over the surface");
});

test("motion is off for a learner who asked for less of it", () => {
  const guard = css.slice(css.indexOf("[data-pane-shell][data-pane-shell-animate"));
  assert.match(guard, /prefers-reduced-motion: reduce[\s\S]{0,160}transition:\s*none/);
});

console.log("sidebar-collapse-is-animated.test.ts OK");
