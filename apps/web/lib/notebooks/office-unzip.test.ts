// Run: npx tsx --test apps/web/lib/notebooks/office-unzip.test.ts
//
// A REAL zip is built here rather than a stub, because the thing under test is
// what fflate does with a hostile archive, and a stub would only test the mock.
// The bomb is small on disk and enormous open — which is the entire point: the
// route's 25 MB upload check passes it, and nothing downstream used to care.
import assert from "node:assert/strict";
import { test } from "node:test";

import { zipSync } from "fflate";

import { MAX_SOURCE_BYTES } from "@nemesis/shared";

import { extractDocxText, UNZIP_MAX_ENTRIES, UNZIP_MAX_TOTAL_BYTES, unzipBounded } from "./office";

/** A zip whose contents inflate to `megabytes`, from almost nothing on disk.
 *  Zeroes compress at roughly 1000:1, so this is what a crafted upload looks
 *  like — a few hundred kilobytes that opens into gigabytes. */
function bomb(megabytes: number): Uint8Array {
  return zipSync({ "word/document.xml": new Uint8Array(megabytes * 1024 * 1024) });
}

test("an ordinary Word file still opens", () => {
  const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Beta blockers</w:t></w:r></w:p></w:body></w:document>';
  const bytes = zipSync({ "word/document.xml": new TextEncoder().encode(xml) });
  assert.match(extractDocxText(bytes).text, /Beta blockers/);
});

test("a zip bomb is refused instead of eating the instance", () => {
  const huge = bomb(Math.ceil(UNZIP_MAX_TOTAL_BYTES / (1024 * 1024)) + 8);
  // Compressed, this is TINY — well under the route's 25 MB upload ceiling, which
  // is exactly why an input-side check never caught it.
  assert.ok(huge.byteLength < 25 * 1024 * 1024, `bomb was ${huge.byteLength} bytes compressed`);
  assert.throws(() => unzipBounded(huge), /too large once unpacked/);
});

test("the refusal reaches the caller as a readable message, not a crash", () => {
  const huge = bomb(Math.ceil(UNZIP_MAX_TOTAL_BYTES / (1024 * 1024)) + 8);
  assert.throws(() => extractDocxText(huge), (error: unknown) => {
    assert.ok(error instanceof Error);
    // The route turns a throw into the message the student sees, so it has to
    // say something they can act on.
    assert.match(error.message, /too large once unpacked|split it up/i);
    return true;
  });
});

test("a zip that attacks by COUNT is refused too", () => {
  // A million empty entries costs nothing to compress and a great deal to
  // allocate — a size cap alone does not see this one coming.
  const many: Record<string, Uint8Array> = {};
  for (let i = 0; i < UNZIP_MAX_ENTRIES + 50; i += 1) many[`ppt/slides/slide${i}.xml`] = new Uint8Array(1);
  assert.throws(() => unzipBounded(zipSync(many)), /too many parts/);
});

test("🔴 the unpack budget can never fall below what the product accepts", () => {
  // The one relationship that MUST hold, pinned because the obvious "tidy-up"
  // breaks it silently.
  //
  // A zip entry can be STORED rather than deflated — the owner's real 118 MiB
  // lecture stores all 68 of its media parts at method 0 — so a source sitting
  // exactly at the upload ceiling can legitimately inflate to its own size. If
  // this budget were ever below MAX_SOURCE_BYTES, the product would accept an
  // upload and then refuse to open it, which reads to a student as "it just
  // doesn't work".
  //
  // This is why UNZIP_MAX_TOTAL_BYTES is NOT written as `N * MAX_SOURCE_BYTES`.
  // Deriving it looks tidier and couples a MEMORY limit to a PRODUCT limit: at
  // the 50 MiB ceiling, `2 *` would have quietly cut the budget from 400 MiB to
  // 100 MiB and started refusing decks that work today.
  assert.ok(
    UNZIP_MAX_TOTAL_BYTES >= MAX_SOURCE_BYTES,
    `unpack budget ${UNZIP_MAX_TOTAL_BYTES} is below the ${MAX_SOURCE_BYTES}-byte upload ceiling: ` +
      "a file at the ceiling would upload and then fail to open",
  );
});
