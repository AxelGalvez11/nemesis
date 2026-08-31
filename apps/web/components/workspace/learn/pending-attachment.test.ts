import assert from "node:assert/strict";
import test from "node:test";

import { clearPending, putPending, takePending } from "./pending-attachment";

// 🔴 AN ENTRY IS A FILE PLUS THE READ ALREADY RUNNING FOR IT (see the module's own comment). The
// read is null here because these tests are about the handoff, not about ingestion; the "the read
// travels with the file" test below is the one that pins the pairing.
const file = (name: string) => new File(["x"], name, { type: "text/plain" });
const entry = (name: string) => ({ file: file(name), read: null });

test("files chosen on the landing page reach the canvas that mounts next", () => {
  clearPending();
  putPending([entry("lecture.pdf")]);
  const taken = takePending();
  assert.equal(taken?.length, 1);
  assert.equal(taken?.[0]?.file.name, "lecture.pdf");
});

test("🔴 taking clears — a second canvas must not inherit the first one's material", () => {
  clearPending();
  putPending([entry("a.pdf")]);
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
  putPending([entry("first.pdf")]);
  putPending([entry("second.pdf")]);
  const taken = takePending();
  assert.equal(taken?.length, 1);
  assert.equal(taken?.[0]?.file.name, "second.pdf");
});

test("🔴🔴 the read travels with its own file, not beside the list", async () => {
  // Owner, 2026-08-31: "read them on drop, like chatgpt." The front door starts `extractFile` when
  // material lands and hands the in-flight call over here. Pairing them by object rather than by a
  // parallel array is what stops file A's parse being claimed as file B's after a dedupe or a
  // removal reorders the staged list.
  clearPending();
  const readA = Promise.resolve({ text: "A", title: null } as never);
  const readB = Promise.resolve({ text: "B", title: null } as never);
  putPending([
    { file: file("a.pdf"), read: readA },
    { file: file("b.pdf"), read: readB },
  ]);
  const taken = takePending();
  assert.equal(await (taken?.[0]?.read as Promise<{ text: string }>)?.then((r) => r.text), "A");
  assert.equal(await (taken?.[1]?.read as Promise<{ text: string }>)?.then((r) => r.text), "B");
  assert.equal(taken?.[1]?.file.name, "b.pdf");
});
