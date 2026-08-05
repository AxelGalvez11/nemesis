import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmLabel,
  DESTRUCTIVE_TOOLS,
  describeTarget,
  destructiveSpec,
  isDestructiveTool,
  pendingDeleteInstruction,
} from "./destructive-tools.ts";
import { WEB_WORKSPACE_AGENT_TOOL_NAMES } from "./workspace-agent-tools.ts";

// 🔴 THE STRUCTURAL GUARD. The gate reads DESTRUCTIVE_TOOLS; a delete tool that
// is not in that map is a delete with NO confirmation at all. This is the test
// that makes forgetting impossible — add a delete_* tool to the catalogue
// without describing it here and the suite goes red. Checked against the WEB
// list because web is where new tools land first; the core list is a subset.
test("every delete tool in the catalogue is behind the gate", () => {
  const deleting = WEB_WORKSPACE_AGENT_TOOL_NAMES.filter((name) => /delete|remove|destroy|wipe/i.test(name));
  assert.deepEqual(
    deleting.slice().sort(),
    Object.keys(DESTRUCTIVE_TOOLS).sort(),
    "a destructive tool exists that the confirmation gate does not know about",
  );
});

test("nothing that only reads or edits is gated", () => {
  // The gate costs the student a tap. Putting a rename or a search behind it
  // would train them to approve without reading, which is how a confirmation
  // step stops being one.
  for (const name of ["search_library", "rename_study_deck", "edit_flashcard", "update_calendar_event"]) {
    assert.equal(isDestructiveTool(name), false, name);
  }
});

test("only the Library's soft deletes are described as recoverable", () => {
  // Everything else is a hard row delete. Saying "you can get it back" about a
  // flashcard would be a lie told at the exact moment it matters most. Notes
  // and folders both trash via the `deleted` flag, so both honestly recover.
  const recoverable = Object.entries(DESTRUCTIVE_TOOLS)
    .filter(([, spec]) => spec.recoverable)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(recoverable, ["delete_library_folder", "delete_library_note"]);
});

test("every spec names an argument the card can be built from", () => {
  for (const [name, spec] of Object.entries(DESTRUCTIVE_TOOLS)) {
    assert.ok(spec.handle.length > 0, `${name} has no handle argument`);
    assert.ok(spec.noun.length > 0, `${name} has no noun`);
    // table: null means the argument itself is the label (a deck's name), so a
    // label column would be meaningless; every other spec needs one.
    if (spec.table) assert.ok(spec.labelColumn.length > 0, `${name} has no label column`);
  }
});

test("a target reads like a sentence, with or without a label", () => {
  assert.equal(describeTarget("the note", "Pharm Ch. 4"), "the note “Pharm Ch. 4”");
  assert.equal(describeTarget("the note", ""), "the note");
  assert.equal(describeTarget("the note", "   "), "the note");
});

test("a long label is trimmed rather than allowed to run off the card", () => {
  const front = "What is the mechanism of action of angiotensin converting enzyme inhibitors in heart failure?";
  const shown = confirmLabel(front);
  assert.ok(shown.length <= 81, `label was ${shown.length} chars`);
  assert.ok(shown.endsWith("…"));
  // A card's whole job is recognition, so the start has to survive intact.
  assert.ok(shown.startsWith("What is the mechanism"));
});

test("a multi-line flashcard front becomes one line", () => {
  assert.equal(confirmLabel("front\n\n  second   line "), "front second line");
});

test("the model is told plainly that nothing happened", () => {
  const text = pendingDeleteInstruction("the deck “Cardio”", false);
  assert.match(text, /NOTHING HAS BEEN DELETED/);
  // The two failure modes this wording exists to prevent.
  assert.match(text, /Do NOT call this tool again/);
  assert.match(text, /Do NOT say it is deleted/);
  assert.match(text, /cannot be undone/);
});

test("a recoverable delete says so instead of warning", () => {
  const text = pendingDeleteInstruction("the note “Kant”", true);
  assert.match(text, /trash/);
  assert.doesNotMatch(text, /cannot be undone/);
});

test("a spec lookup is null for anything not gated", () => {
  assert.equal(destructiveSpec("search_library"), null);
  assert.ok(destructiveSpec("delete_flashcard"));
});
