import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── the Examiner package's wiring ────────────────────────────────────────────
//
// Owner, 2026-08-31, adopting the post-exam report: escalate difficulty instead
// of concluding "finished", bring old material back mixed with new, and make
// every miss say WHY it was missed. The pure halves are value-tested in
// lib/workspace/study-artifact-content.test.ts; what remains provable here is
// the dialog wiring, which wraps hooks and a cloud store.

const dialogs = readFileSync(new URL("./study-artifact-dialogs.tsx", import.meta.url), "utf8");

test("🔴 an aced paper offers a HARDER one, gated on actually acing it", () => {
  // Calibration: lower the gate to a plain button on every review and this
  // reddens. The report's rule is "increase the difficulty, not conclude that
  // you're finished".
  assert.match(dialogs, /reviewAttempt\.score \/ reviewAttempt\.total >= 0\.8/, "the harder offer lost its acing gate");
  assert.match(dialogs, /hardenedMaterial\(artifact\.title, questions\)/, "the harder paper no longer builds from the aced facts");
});

test("🔴 the dialogs hand the model a RECORD in sentences, never flags or recipes", () => {
  // Owner 2026-08-31: "it should not be hardcoded — DeepSeek should know what
  // to do based on the given prompts." Both callers describe the situation and
  // leave the composition to the examiner charter. Calibration: bring back a
  // challenge/difficulty flag on testOpts and the no-flags assertion reddens.
  assert.match(dialogs, /record:\s*\n?\s*`The student just scored \$\{reviewAttempt\.score\} of \$\{reviewAttempt\.total\}/, "the harder button stopped describing and started commanding");
  assert.match(dialogs, /record:\s*\n?\s*`The student asked for one mixed review/, "the mixed source stopped describing and started commanding");
  assert.ok(!/challenge:|reasksMissed:/.test(dialogs), "a recipe flag crept back into a dialog");
});

test("🔴 mixed review spans every deck and note, and carries the misses back", () => {
  assert.match(dialogs, /Mixed review/, "the source option is gone");
  assert.match(dialogs, /missedFacts\(content\.questions, content\.attempts\)/, "earlier misses no longer feed the paper");
  assert.match(dialogs, /mixedReviewMaterial\(parts, missed\)/, "the material is no longer the shared builder");
});

test("🔴 a miss diagnosis is one tap, answers instantly, and is stamped onto the STORED attempt", () => {
  // Local state answers the tap; the same value goes to the artifact so the
  // diagnosis outlives the screen. An attempt the artifact prop has not
  // round-tripped yet is appended, never lost.
  assert.match(dialogs, /setMissWhys\(\(current\) => \(\{ \.\.\.current, \[questionIndex\]: why \}\)\)/, "the tap no longer answers locally");
  assert.match(dialogs, /known\s*\? content\.attempts\.map/, "a known attempt is no longer updated in place");
  assert.match(dialogs, /: \[\.\.\.content\.attempts, stamped\]/, "an un-round-tripped attempt would be lost");
  // Both question shapes get the chips.
  const chipMounts = dialogs.match(/<MissWhyChips /g) ?? [];
  assert.equal(chipMounts.length, 2, "one of the two review branches lost its chips");
});
