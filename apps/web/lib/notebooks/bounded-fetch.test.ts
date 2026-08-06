// Run: npx tsx --test apps/web/lib/notebooks/bounded-fetch.test.ts
//
// 🔴 THESE TESTS ASSERT WHAT WAS ACTUALLY TRANSFERRED, NOT WHAT WAS RETURNED.
//
// The defect being guarded is invisible to a test that only checks the verdict:
// the OLD code also returned "too-large" for an oversized object. It just
// downloaded the whole thing first. So every test here counts the bytes the
// stream actually produced, because "refused" and "refused cheaply" are the
// entire difference between the bug and the fix.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declaredLength, readBounded } from "./bounded-fetch";

const CAP = 1_000;

/** A body that reports how much of it was really pulled. `chunks` is what the
 *  producer offers; `pulled` counts only what the consumer accepted before it
 *  cancelled — the number that maps to bytes over the wire. */
function countingBody(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      state.cancelled = true;
    },
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i++]!;
      state.pulled += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  return { state, stream };
}

const filled = (n: number, byte = 7) => new Uint8Array(n).fill(byte);

test("a body within the cap comes back whole and byte-exact", async () => {
  const body = countingBody([filled(100, 1), filled(150, 2)]);
  const read = await readBounded(body.stream, CAP, 250);
  assert.equal(read.ok, true);
  assert.equal(read.ok && read.bytes.byteLength, 250);
  // Order matters: a reader that mis-offsets would still produce 250 bytes.
  assert.equal(read.ok && read.bytes[0], 1);
  assert.equal(read.ok && read.bytes[99], 1);
  assert.equal(read.ok && read.bytes[100], 2);
  assert.equal(read.ok && read.bytes[249], 2);
});

test("🔴 an oversized body is ABANDONED PART-WAY, not drained and then judged", async () => {
  // Ten chunks of 200 against a cap of 1,000. A correct reader stops after the
  // sixth (1,200 > 1,000) having pulled 1,200 bytes; the old shape would have
  // pulled all 2,000 before saying a word.
  const body = countingBody(Array.from({ length: 10 }, () => filled(200)));
  const read = await readBounded(body.stream, CAP, null);

  assert.equal(read.ok, false);
  assert.equal(read.ok === false && read.reason, "too-large");
  assert.ok(
    body.state.pulled <= CAP + 200,
    `pulled ${body.state.pulled} bytes; a bounded read must stop within one chunk of the cap`,
  );
  assert.ok(body.state.pulled < 2_000, "the whole body was transferred before refusing");
  assert.equal(body.state.cancelled, true, "the transfer was left running");
});

test("🔴 a partial read is never returned as if it were the document", async () => {
  // The tempting "fix" is to keep the first CAP bytes. That is the Office
  // image-stripping defect wearing different clothes: an incomplete source
  // presented as a complete one.
  const body = countingBody([filled(600), filled(600)]);
  const read = await readBounded(body.stream, CAP, null);
  assert.equal(read.ok, false);
  assert.ok(!("bytes" in read), "a truncated document was handed onward");
});

test("a body that exceeds its own content-length is refused, not trusted", async () => {
  // Declared 100, delivers 300. Pre-allocating from a claim and then writing
  // past it is a buffer overrun in any language that would let you.
  const body = countingBody([filled(100), filled(200)]);
  const read = await readBounded(body.stream, CAP, 100);
  assert.equal(read.ok, false);
  assert.equal(read.ok === false && read.reason, "unavailable");
  assert.equal(body.state.cancelled, true);
});

test("a body that stops short of its content-length is a broken transfer, not a small file", async () => {
  const body = countingBody([filled(40)]);
  const read = await readBounded(body.stream, CAP, 100);
  assert.equal(read.ok, false);
  assert.equal(read.ok === false && read.reason, "unavailable");
});

test("a body with no content-length still works, and is still bounded", async () => {
  const ok = await readBounded(countingBody([filled(300)]).stream, CAP, null);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.bytes.byteLength, 300);

  const over = await readBounded(countingBody([filled(1_500)]).stream, CAP, null);
  assert.equal(over.ok, false);
  assert.equal(over.ok === false && over.reason, "too-large");
});

test("exactly at the cap is accepted — the limit is a maximum, not a near-miss", async () => {
  const read = await readBounded(countingBody([filled(CAP)]).stream, CAP, CAP);
  assert.equal(read.ok, true);
  assert.equal(read.ok && read.bytes.byteLength, CAP);

  const over = await readBounded(countingBody([filled(CAP + 1)]).stream, CAP, null);
  assert.equal(over.ok, false);
});

test("a stream that breaks mid-transfer reports unavailable, never a short document", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(filled(50));
      controller.error(new Error("connection reset"));
    },
  });
  const read = await readBounded(stream, CAP, 500);
  assert.equal(read.ok, false);
  assert.equal(read.ok === false && read.reason, "unavailable");
});

test("declaredLength distinguishes 'absent' from 'zero'", () => {
  // 🔴 Returning 0 for a missing header would let an unlabelled object skip the
  // cheap refusal AND look like an empty file.
  assert.equal(declaredLength(new Headers()), null);
  assert.equal(declaredLength(new Headers({ "content-length": "0" })), 0);
  assert.equal(declaredLength(new Headers({ "content-length": "123799463" })), 123_799_463);
  for (const bad of ["", "abc", "-5", "1.5", "1e9"]) {
    assert.equal(declaredLength(new Headers({ "content-length": bad })), null, bad);
  }
});
