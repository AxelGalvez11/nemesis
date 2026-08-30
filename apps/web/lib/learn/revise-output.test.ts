import assert from "node:assert/strict";
import test from "node:test";

import { applyRevision, docReviseMessages, undoRevision, UNDO_DEPTH } from "./revise-output";

// Nemesis revising ITS OWN work — owner 2026-08-28, naming the panel's two jobs: sources are for
// pointing and asking; Nemesis-built documents the user can "ask for edits on". The learner never
// gets a text cursor anywhere; the line is that Nemesis rewrites what NEMESIS made, never theirs.

test("🔴 the revise packet carries the whole document, the note, and the spot's own words", () => {
  const messages = docReviseMessages({
    ask: { body: "make this section half the length", spot: "paragraph 3", spotText: "Thermal runaway begins when…" },
    markdown: "# Title\n\nOne.\n\nTwo.",
    title: "Heat transfer, briefly",
  });
  assert.equal(messages[0]?.role, "system");
  // 🔴 THE COMPLETE DOCUMENT GOES, because "apply the note, keep the rest" is only checkable by a
  // model that HAS the rest. And the pointed-at words go too, so "make this shorter" cannot land
  // on the wrong paragraph after a reflow renumbers them.
  assert.match(messages[1]!.content, /# Title/);
  assert.match(messages[1]!.content, /on paragraph 3, which currently says: "Thermal runaway begins when…"/);
  assert.match(messages[1]!.content, /"make this section half the length"/);
  // The system prompt demands the COMPLETE revised document back — a diff or a summary is how a
  // document silently becomes a sentence about itself.
  assert.match(messages[0]!.content, /COMPLETE revised document/);
  assert.match(messages[0]!.content, /Never use em dashes/);
});

test("🔴 a revision keeps the outgoing state, and undo pops it back", () => {
  const original = { id: "o1", markdown: "the first draft", revisions: undefined as undefined | { at: string; markdown?: string }[] };
  const revised = applyRevision(original, { markdown: "the second draft" }, "2026-08-28T00:00:00Z");
  assert.equal(revised.markdown, "the second draft");
  assert.deepEqual(revised.revisions, [{ at: "2026-08-28T00:00:00Z", markdown: "the first draft" }]);

  const undone = undoRevision(revised);
  assert.equal(undone.markdown, "the first draft");
  assert.deepEqual(undone.revisions, []);
  // Nothing left to undo → the output comes back untouched, never a throw.
  assert.equal(undoRevision(undone), undone);
});

test("🔴 the history is bounded, and it is the OLDEST states that fall off", () => {
  let output: { id: string; markdown: string; revisions?: { at: string; markdown?: string }[] } = { id: "o1", markdown: "v0" };
  for (let round = 1; round <= UNDO_DEPTH + 3; round += 1) {
    output = applyRevision(output, { markdown: `v${round}` }, `t${round}`);
  }
  assert.equal(output.revisions?.length, UNDO_DEPTH, "a document revised forty times carries forty copies of itself");
  // The newest kept state is the one Undo restores first.
  assert.equal(output.revisions?.at(-1)?.markdown, `v${UNDO_DEPTH + 2}`);
});
