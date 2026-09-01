import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Source with comments stripped, so prose ABOUT a rule is never mistaken for the rule. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const shell = code(readFileSync(new URL("./workspace-shell.tsx", import.meta.url), "utf8"));
const sidebar = code(readFileSync(new URL("./chat-sidebar.tsx", import.meta.url), "utf8"));
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

test("🔴🔴 both states are mounted and cross-fade — the swap WAS the abruptness", () => {
  // Owner, 2026-09-01: *"the sidebar should close and open smoothly like in chatgpt."* The column
  // had transitioned since 2026-08-21; the CONTENT had not. `railVisible ? <NavRail/> :
  // <ChatSidebar/>` traded one for the other at frame 0, so the 260px sidebar vanished instantly
  // and the learner spent the next 240ms watching an empty gap close beside a 52px rail.
  //
  // Measured on chatgpt.com the same day: `#stage-slideover-sidebar` is `overflow-hidden` and
  // holds BOTH at once — a `nav#stage-sidebar-tiny-bar` at `absolute inset-0` over the learner's
  // own 260px panel in normal flow — trading opacity over 150ms while the width travels.
  assert.ok(
    !/railVisible \? \(\s*<NavRail/.test(shell),
    "the rail and the sidebar went back to replacing each other, so the slide has nothing in it",
  );
  assert.match(shell, /\{\(railVisible \|\| sidebarVisible\) && \(/, "the column stopped mounting both states together");
  assert.match(shell, /motion-safe:transition-opacity motion-safe:duration-150/, "the cross-fade is gone or is no longer the reference's 150ms");
  // 🔴 THE RAIL CUTS, IT DOES NOT FADE, AND THE DIRECTION IS THE WHOLE TRICK. `steps(1,start)` on
  // the collapsed state paints the rail at t=0 when closing; `steps(1,end)` on the expanded state
  // holds it until t=150ms when opening. Either way the leftmost 52px — the one part of the column
  // that never moves — is painted for the whole travel and never flickers. A plain fade there
  // shows the panel's own left edge through the rail.
  assert.match(shell, /opacity-100 motion-safe:ease-\[steps\(1,start\)\]/, "the rail fades in now, so the left edge dissolves");
  assert.match(shell, /opacity-0 motion-safe:ease-\[steps\(1,end\)\]/, "the rail leaves early, so the panel's left edge shows through mid-slide");
  // 🔴 AND THE ONE THAT IS NOT THERE IS OUT OF THE TAB ORDER. Mounted-but-invisible controls still
  // take focus, and a keyboard learner would land in an unpainted sidebar with nothing on screen
  // to say where they went.
  assert.equal((shell.match(/inert=\{!(sidebarVisible|railVisible)\}/g) ?? []).length, 2, "a hidden pane is back in the tab order");
  // 🔴 AND NEITHER IS MOUNTED WHEN THE COLUMN IS 0px. Inside a canvas the column has no width at
  // all; mounting the sidebar there would run its canvas-list query behind a pane nobody can see.
  const gate = shell.indexOf("{(railVisible || sidebarVisible) && (");
  assert.equal((shell.match(/<ChatSidebar\b/g) ?? []).length, 1, "the sidebar is rendered from more than one place");
  assert.ok(shell.indexOf("<ChatSidebar") > gate && shell.indexOf("<NavRail") > gate, "a pane mounts outside the has-width gate");
});

test("🔴🔴 exactly one thing decides whether the sidebar is visible", () => {
  // `ChatSidebar` used to hide ITSELF — `sidebarOpen ? "opacity-100" : "opacity-0"`, with
  // `transition-none` — from the days when the shell swapped it out for the rail entirely. Once
  // the shell kept both panes mounted to cross-fade them, the two rules fought and the inner one
  // won: the wrapper faded over 150ms while the pane snapped to zero on the first frame, which is
  // the abrupt disappearance the fade exists to remove.
  //
  // 🔴 THE FAILURE WAS INVISIBLE FROM OUTSIDE. The wrapper's own computed opacity interpolated
  // correctly the whole way through, so anything measuring the element the shell controls saw a
  // clean 150ms fade over a pane that had already gone.
  assert.ok(!/sidebarOpen/.test(sidebar), "the sidebar decides its own visibility again, and it will fight the shell's fade");
  assert.ok(!/opacity-0/.test(sidebar), "something inside the sidebar hides the whole pane on its own");
  assert.equal((shell.match(/opacity-0/g) ?? []).length, 2, "the shell no longer owns hiding for exactly the two panes");
});

test("motion is off for a learner who asked for less of it", () => {
  const guard = css.slice(css.indexOf("[data-pane-shell][data-pane-shell-animate"));
  assert.match(guard, /prefers-reduced-motion: reduce[\s\S]{0,160}transition:\s*none/);
});

console.log("sidebar-collapse-is-animated.test.ts OK");
