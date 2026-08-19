import assert from "node:assert/strict";
import { test } from "node:test";

import { expositionOfReply, readingTimeMs } from "./turn-exposition";

// What this file proves, and what it deliberately does not.
//
// 🔴 IT DOES NOT PROVE THAT A GIVEN SENTENCE GETS THE RIGHT WEIGHT. That is a claim about the
// model — `turn-router.ts`'s `weight` — and it is measured against the real model, not asserted
// here. What is deterministic, and what breaks silently when it goes wrong, is the mapping from a
// weight to a behaviour: which replies vanish, which wait, and that no reply can end up with
// neither.

test("🔴 a micro reply vanishes and a reading reply waits — the owner's rule, as behaviour", () => {
  // > "Trivial things vanish. Meaningful things wait for the learner."
  const micro = expositionOfReply({ say: "Exactly.", weight: "micro" });
  assert.equal(micro.mode, "transient", "an acknowledgement is asking the learner to press something");

  const reading = expositionOfReply({ say: "ACE also breaks down bradykinin, so blocking ACE raises it.", weight: "reading" });
  assert.equal(reading.mode, "deliberate", "material is being taken away on a timer");
});

test("🔴 a deliberate reply carries NO duration — the field does not exist on it", () => {
  // The whole reason this returns the policy's own union rather than `{ mode, ms }`: a screen that
  // waits for the learner has no window, so there is no field for a later edit to fill in. Someone
  // putting a timer on material the learner controls would have to change the type to do it.
  const reading = expositionOfReply({ say: "A long explanation of a mechanism.", weight: "reading" });
  assert.ok(!("exposureMs" in reading), "a deliberate exposition grew a duration");
});

test("🔴 length moves a reply INSIDE its band and can never move it between bands", () => {
  // The owner's rule as an ordering property rather than as two numbers: *"do not base this only on
  // raw word count. Use semantic importance."* A long pleasantry must not outstay a short fact.
  const longMicro = expositionOfReply({
    say: "No problem at all, happy to go over that again whenever you want to come back to it.",
    weight: "micro",
  });
  const shortBrief = expositionOfReply({ say: "Angiotensin-converting enzyme.", weight: "brief" });
  assert.equal(longMicro.mode, "transient");
  assert.equal(shortBrief.mode, "transient");
  assert.ok(
    longMicro.mode === "transient" && shortBrief.mode === "transient"
      && longMicro.exposureMs < shortBrief.exposureMs,
    "a long acknowledgement is being held longer than a short fact — length has escaped its band",
  );
});

test("🔴 both bounds actually bind, in both directions", () => {
  // A floor that never applies and a ceiling that never applies are two numbers nobody is
  // enforcing. Each is checked with input that would blow through it.
  const shortest = expositionOfReply({ say: "Yes.", weight: "brief" });
  const longest = expositionOfReply({ say: "word ".repeat(400), weight: "brief" });
  assert.ok(shortest.mode === "transient" && longest.mode === "transient");
  assert.ok(
    shortest.mode === "transient" && shortest.exposureMs > readingTimeMs("Yes."),
    "the floor is not applied — a two-word reply is gone before it registers as having appeared",
  );
  assert.ok(
    longest.mode === "transient" && longest.exposureMs < readingTimeMs("word ".repeat(400)),
    "the ceiling is not applied — a model that mislabels a paragraph as brief freezes the canvas on it",
  );
  // And the ceiling is a real number of seconds rather than a formality. Anything past this is not
  // "brief", it is material the model should have marked `reading`.
  assert.ok(longest.mode === "transient" && longest.exposureMs <= 6000, `a brief reply may not hold the canvas for ${longest.mode === "transient" ? longest.exposureMs : 0}ms`);
});

test("🔴 a one-word reply still gets long enough to be SEEN, not just read", () => {
  // At a pure reading rate "✓" computes to a third of a second, which is under the time it takes to
  // notice the surface changed at all. The line would be gone before it was seen — indistinguishable
  // from the reply never arriving, which is indistinguishable from the product being broken.
  const tick = expositionOfReply({ say: "✓", weight: "micro" });
  assert.ok(tick.mode === "transient" && tick.exposureMs >= 800, "a one-glyph reply is not on screen long enough to register");
});

test("🔴 nothing said is NOT a zero-length transient", () => {
  // A timer racing an element that was never painted. `none` is the honest answer and
  // `readingRequirementOf` already reads it as "nothing is being taken in", so it produces neither
  // a window nor a button — which is correct, because there is no screen.
  assert.equal(expositionOfReply({ say: "", weight: "micro" }).mode, "none");
  assert.equal(expositionOfReply({ say: "   ", weight: "reading" }).mode, "none");
});

test("🔴🔴 every weight that says something resolves to an exit — no reply can be a dead end", () => {
  // The invariant the rest of this file is in service of. A reply that is neither `transient` (so it
  // ends itself) nor `deliberate` (so `continueOwner` gives it the button) is a screen the learner
  // cannot leave, and the canvas has already shipped one of those once.
  for (const weight of ["micro", "brief", "reading"] as const) {
    const exposition = expositionOfReply({ say: "Something Nemesis said.", weight });
    assert.notEqual(exposition.mode, "none", `a \`${weight}\` reply with text resolved to no exit at all`);
  }
});
