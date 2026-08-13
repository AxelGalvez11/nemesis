import assert from "node:assert/strict";
import test from "node:test";

import { clearPending, putPending, takePending } from "./pending-attachment";

const file = (name: string) => new File(["x"], name, { type: "text/plain" });

test("files chosen on the landing page reach the canvas that mounts next", () => {
  clearPending();
  putPending([file("lecture.pdf")]);
  const taken = takePending();
  assert.equal(taken?.length, 1);
  assert.equal(taken?.[0]?.name, "lecture.pdf");
});

test("🔴 taking clears — a second canvas must not inherit the first one's material", () => {
  clearPending();
  putPending([file("a.pdf")]);
  assert.equal(takePending()?.length, 1);
  // The defect this guards: attach a file, go back, open a DIFFERENT canvas, and the file follows.
  // Material silently duplicated into a body of knowledge it does not belong to.
  assert.equal(takePending(), null, "a second read must not return the same files again");
});

test("nothing waiting reads as null, not as an empty attachment", () => {
  clearPending();
  assert.equal(takePending(), null);
  // An empty picker selection is the same as not choosing anything — it must not arm a handoff
  // that a later canvas then "consumes" as if the learner had attached something.
  putPending([]);
  assert.equal(takePending(), null);
});

test("a second selection replaces the first rather than accumulating", () => {
  clearPending();
  putPending([file("first.pdf")]);
  putPending([file("second.pdf")]);
  const taken = takePending();
  assert.equal(taken?.length, 1);
  assert.equal(taken?.[0]?.name, "second.pdf");
});
