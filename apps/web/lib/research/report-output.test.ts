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
  // 2026-09-06: the outputs rows live in the Outputs/Sources card (work-panel.tsx).
  const source = readFileSync(new URL("../../components/workspace/learn/work-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(output\.notePath\) return true;/, "the note link is keyed to a kind again");
  assert.ok(
    !/output\.kind === "note" && output\.notePath/.test(source),
    "🔴 the row only opens for one named kind, so any other note-shaped output is a dead row",
  );
  // 🔴 THE SENTENCE MOVED ONTO THE ICON — owner, 2026-08-25: *"remove description for outputs,
  // inputs and sources."* Every output row is one line now, so "Research · cited, in your Library"
  // is gone with the other second lines. What this guard actually cares about survives: a report is
  // still distinguishable from a note at a glance, and it still opens. `report: "book"` is that
  // distinction, and `notePath` is what makes the row openable.
  // 2026-09-06: the row draws the artifact card's marks (artifact-card.tsx), where a report is `book`.
  const marks = readFileSync(new URL("../../components/workspace/learn/artifact-card.tsx", import.meta.url), "utf8");
  assert.match(marks, /report: \{ extension: "", icon: "book"/, "a report row is no longer told apart from a note");
  assert.match(source, /OUTPUT_KIND_MARKS\[output\.kind\]/, "the row does not draw the kind's mark");
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
