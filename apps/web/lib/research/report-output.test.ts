import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// How a finished report reaches the learner, and the two rules it has to obey to get there.

const controls = () =>
  readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");

test("🔴 a report row in the outputs panel actually opens", () => {
  // The panel used to link a row only when `kind === "note"`. A research report carries a notePath
  // but a different kind, so it would have landed in the list as a row nothing happens when you
  // click. That is precisely the defect this file's own comment warns about: "a list of made things
  // that cannot be opened is the sources panel's old defect all over again". Matched on what the
  // output HAS, not on what it is called, so the next note-shaped output works without an edit.
  const source = controls();
  assert.match(source, /if \(output\.notePath\) \{/, "the note link is keyed to a kind again");
  assert.ok(
    !/output\.kind === "note" && output\.notePath/.test(source),
    "🔴 the row only opens for one named kind, so any other note-shaped output is a dead row",
  );
  assert.match(source, /Research · cited, in your Library/, "a report row does not say what it is");
});

test("🔴 there is still no button that makes a report", () => {
  // Owner 2026-08-24: "remove the make flash cards, make slide, make summary note from the output
  // section", and §38 wants "a phrase to the composer, not a control". Research obeys the same
  // rule: the learner types "research X". Adding a tidy little button here would quietly reverse a
  // decision that was made deliberately, and it is exactly the kind of thing that looks like an
  // improvement while it is being written.
  const source = controls();
  for (const tempting of ["Research this", "Make research", "Run research", "Deep dive"]) {
    assert.ok(!source.includes(tempting), `a "${tempting}" control appeared in the outputs panel`);
  }
});
