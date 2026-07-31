import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarEventPatch,
  deckDeletionVerdict,
  isPatchFailure,
  noteReplacementBody,
  workspaceId,
} from "./workspace-commands.ts";

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

test("a handle is only a handle when it is really a uuid", () => {
  assert.equal(workspaceId(UUID), UUID);
  assert.equal(workspaceId(`  ${UUID.toUpperCase()}  `), UUID);
  // Every one of these is a shape a model reaches for when it does not have the
  // id: the human-readable name, a position, a prefix of a real id. None may
  // reach a delete.
  assert.equal(workspaceId("Cardiovascular exam"), null);
  assert.equal(workspaceId("2"), null);
  assert.equal(workspaceId(UUID.slice(0, 8)), null);
  assert.equal(workspaceId(""), null);
  assert.equal(workspaceId(undefined), null);
  assert.equal(workspaceId(null), null);
  assert.equal(workspaceId({ id: UUID }), null);
});

test("an edit changes ONLY the fields it named", () => {
  // "move that exam to 3pm" — one field in, one field out. If title, note or
  // course appear in this patch they will be written, and whatever the student
  // had there is gone.
  const patch = calendarEventPatch({ time: "15:00" });
  assert.ok(!isPatchFailure(patch));
  assert.deepEqual(patch, { time: "15:00" });
  assert.equal("title" in patch, false);
  assert.equal("note" in patch, false);
  assert.equal("course" in patch, false);
  assert.equal("date" in patch, false);
  assert.equal("kind" in patch, false);
});

test("a field named but left empty is cleared, not skipped", () => {
  // "it's all day, drop the time" has to be expressible.
  const patch = calendarEventPatch({ note: "", time: "" });
  assert.ok(!isPatchFailure(patch));
  assert.deepEqual(patch, { note: null, time: null });
});

test("a rename and a reschedule travel together", () => {
  const patch = calendarEventPatch({ date: "2026-08-14", title: "  Pharmacology final  " });
  assert.ok(!isPatchFailure(patch));
  assert.deepEqual(patch, { date: "2026-08-14", title: "Pharmacology final" });
});

test("an edit that would empty the title is refused", () => {
  const patch = calendarEventPatch({ title: "   " });
  assert.ok(isPatchFailure(patch));
});

test("a date that is not a real day is refused, not silently shifted", () => {
  // new Date("2026-02-31") rolls forward to March 3rd. A deadline that quietly
  // moves is worse than an edit that fails out loud.
  assert.ok(isPatchFailure(calendarEventPatch({ date: "2026-02-31" })));
  assert.ok(isPatchFailure(calendarEventPatch({ date: "2026-13-01" })));
  assert.ok(isPatchFailure(calendarEventPatch({ date: "14 August 2026" })));
  assert.ok(!isPatchFailure(calendarEventPatch({ date: "2026-02-28" })));
});

test("an unknown kind is refused rather than coerced to other", () => {
  assert.ok(isPatchFailure(calendarEventPatch({ kind: "midterm" })));
  const patch = calendarEventPatch({ kind: "EXAM" });
  assert.ok(!isPatchFailure(patch));
  assert.deepEqual(patch, { kind: "exam" });
});

test("an edit naming nothing is refused", () => {
  assert.ok(isPatchFailure(calendarEventPatch({})));
  // An id is the handle, not a change — passing it alone still edits nothing.
  assert.ok(isPatchFailure(calendarEventPatch({ event_id: UUID } as Record<string, unknown>)));
});

test("a deck with cards in it cannot be deleted from chat", () => {
  const verdict = deckDeletionVerdict(42);
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason ?? "", /42 cards/);
  // The refusal has to tell the model where the student CAN do it, or it will
  // just report failure and stop.
  assert.match(verdict.reason ?? "", /Study page/);
});

test("an empty deck is safe to delete, and one card is singular", () => {
  assert.equal(deckDeletionVerdict(0).allowed, true);
  assert.equal(deckDeletionVerdict(-3).allowed, true);
  assert.match(deckDeletionVerdict(1).reason ?? "", /1 card,/);
});

test("a rewrite with nothing in it is not a rewrite", () => {
  assert.equal(noteReplacementBody("   \n\n  "), null);
  assert.equal(noteReplacementBody(""), null);
  assert.equal(noteReplacementBody(undefined), null);
  assert.equal(noteReplacementBody("# Kept\n\nbody"), "# Kept\n\nbody");
  assert.equal(noteReplacementBody("body".repeat(10), 8), "bodybody");
});
