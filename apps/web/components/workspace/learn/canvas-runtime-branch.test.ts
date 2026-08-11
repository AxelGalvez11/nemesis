import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// The one failure this file exists to catch cannot be caught by testing a function, because it
// does not live in one: "the policy decided retrieve, and the Learn stage painted anyway". That is
// a fact about the JSX — about whether the six-stage machine is behind ONE branch or behind six
// conditions that each have to remember to say "unless the policy owns this".
//
// So this reads the component's source. Crude, and the alternative is a DOM test harness this app
// does not have; the property being checked is structural, and structure is what the source says.

const SOURCE = readFile(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

/** Every renderer belonging to the six-stage runtime. */
const STAGES = [
  "<CanvasEmpty",
  "<SourcesAttached",
  "<CanvasDocument",
  "<CanvasRecall",
  "<CanvasTest",
  "<CanvasDiagnosis",
  "<CanvasComplete",
];

test("🔴 every legacy stage renders INSIDE the single policy branch", async () => {
  const source = await SOURCE;
  const opens = source.indexOf("{policyOwns ? (");
  assert.notEqual(opens, -1, "the branch itself is gone");
  const closes = source.indexOf("</>\n        )}", opens);
  assert.notEqual(closes, -1, "the branch's else arm is gone");

  for (const stage of STAGES) {
    // 🔴 EVERY OCCURRENCE, NOT THE FIRST ONE. Checking only the first is a guard that cannot see
    // the defect it is for: the realistic regression ADDS a second render site outside the branch
    // — `{!policyOwns && canvas.state === "recall" && <CanvasRecall …>}` as a sibling — and leaves
    // the original in place. This was calibrated with exactly that edit, and the first-occurrence
    // version stayed green through it.
    const sites: number[] = [];
    for (let at = source.indexOf(stage); at !== -1; at = source.indexOf(stage, at + 1)) sites.push(at);
    assert.notEqual(sites.length, 0, `${stage} is no longer rendered at all`);
    for (const at of sites) {
      assert.ok(
        at > opens && at < closes,
        `${stage} renders outside the policy branch — the policy would decide and this would paint anyway`,
      );
    }
  }
});

test("🔴 a canvas whose knowledge is still resolving paints NEITHER runtime", async () => {
  // Defaulting to "not the policy" while the round trip is in flight does not merely flicker: the
  // stage machine's own effects run, and it starts generating a lesson for a canvas the policy is
  // about to take over.
  const source = await SOURCE;
  const guard = source.indexOf('policy.status === "loading"');
  assert.notEqual(guard, -1, "the loading state is no longer waited for");
  assert.ok(guard < source.indexOf("{policyOwns ? ("), "the wait must come before anything renders");
});

test("the composer answers the policy's task when the policy owns the canvas", async () => {
  // A second answer box for the policy would be the one thing the composer's own header says it
  // exists to prevent.
  const source = await SOURCE;
  assert.match(source, /task=\{policyOwns \? policyTask : session\.activeTask\}/);
  assert.match(source, /policy\.submit\(text, via, tookMs\)/);
});
