import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readingRequirementOf } from "@/lib/learn/canvas-continue";
import { advancesItself, expositionFor } from "@/lib/learn/cognitive-mode";

// 🔴🔴🔴 A WRONG ANSWER LEFT THE LEARNER WITH NO WAY FORWARD AT ALL.
//
// Measured in a browser against production, on the owner's real pharmacokinetics lecture: a typed
// answer judged `incorrect` produced *"Here's the one to fix. Constant → Amount removed/time"* and
// then nothing. No Continue, no timer, no control but the sidebar — surviving a reload. The canvas
// was over, and the multiple-choice path behind it (which needs two consecutive unresolved attempts
// on ONE objective) was unreachable by construction.
//
// 🔴 BOTH HALVES WERE INDIVIDUALLY CORRECT, WHICH IS WHY NOTHING CAUGHT IT. §39 says a one-line
// association is `transient` — it ends itself after about a second — so `readingRequirementOf`
// rightly withholds the Continue, because a button on a screen that is already leaving is a button
// that does nothing. But "ends itself" was implemented inside `FeedbackScreen` and DECLARED by four
// screens. A screen that names a timer to a component with no timer has no exit.

test("🔴🔴 the exact trap: a correction that gets no button MUST end itself", () => {
  // The real exposition for the real objective shape this was found on — a glossary term recalled.
  const exposition = expositionFor({ capability: "recall", kind: "correction", knowledgeType: "association" });
  assert.equal(exposition.mode, "transient", "§39: one line, read in about a second");
  assert.equal(
    readingRequirementOf(exposition.mode).requiresReading,
    false,
    "so no Continue is offered — correctly, because the screen is already leaving",
  );
  assert.equal(
    advancesItself(exposition),
    true,
    "which makes the timer the ONLY exit: a renderer that does not implement it strands the learner",
  );
});

test("a deliberate exposition is the other half of the rule, and asks for the button", () => {
  const exposition = expositionFor({ capability: "explain", kind: "correction", knowledgeType: "causal" });
  assert.equal(exposition.mode, "deliberate");
  assert.equal(readingRequirementOf(exposition.mode).requiresReading, true);
  assert.equal(advancesItself(exposition), false);
});

// ── Every screen that declares an exposition implements both exits ──────────

const SOURCE = readFileSync(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");

/** The `<Frame …>` opening tag that a given branch renders. */
function frameFor(branch: string): string {
  const at = SOURCE.indexOf(branch);
  assert.notEqual(at, -1, `the ${branch} branch is gone`);
  const open = SOURCE.indexOf("<Frame", at);
  assert.notEqual(open, -1, `the ${branch} branch no longer renders a Frame`);
  return SOURCE.slice(open, SOURCE.indexOf(">", SOURCE.indexOf("sharing={sharing}", open)));
}

for (const branch of [
  'decision.action.type === "show_correction"',
  'decision.action.type === "teach" || decision.action.type === "simplify"',
  'decision.action.type === "contrast"',
]) {
  test(`🔴 ${branch} passes its own way out`, () => {
    assert.match(
      frameFor(branch),
      /advance=\{\{/,
      "this screen can be given a transient exposition and no Continue — without `advance` it is a dead end",
    );
  });
}

test("🔴 the verdict screen hands its exit to the same rule, not to a private timer", () => {
  const feedback = SOURCE.slice(SOURCE.indexOf("function FeedbackScreen"), SOURCE.indexOf("interface ScreenExit"));
  assert.match(feedback, /advance=\{\{/, "the verdict is exempting itself again");
  assert.equal(
    /setTimeout/.test(feedback),
    false,
    "a second timer has grown back inside one screen — that split is what made the correction a dead end",
  );
});

test("🔴 Frame runs the shared exit rule", () => {
  const frame = SOURCE.slice(SOURCE.indexOf("function Frame("));
  assert.match(frame, /useScreenExit\(advance\)/, "Frame no longer runs the exit rule, so `advance` is decorative");
});
