import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { docAction } from "./doc-action.ts";

Deno.test("an edited note is re-indexed", () => {
  assertEquals(docAction({ deleted: false }, "old", "new"), "reindex");
});

Deno.test("a note never indexed before is re-indexed", () => {
  assertEquals(docAction({ deleted: false }, null, "fresh"), "reindex");
});

Deno.test("a note that was touched but not edited is only re-stamped", () => {
  assertEquals(docAction({ deleted: false }, "same", "same"), "restamp");
});

// The bug this file exists for: a deleted note still holds its text, so its hash
// still differs from whatever was last indexed. Deciding on the hash first would
// re-embed a note the student deleted instead of forgetting it.
Deno.test("a deleted note is purged, not re-embedded, even though its text changed", () => {
  assertEquals(docAction({ deleted: true }, "old", "new"), "purge");
});

Deno.test("a deleted note whose text never changed is still purged", () => {
  assertEquals(docAction({ deleted: true }, "same", "same"), "purge");
});

// This function is deployed one step ahead of the migration that supplies the
// column, so for that window `deleted` is absent. It must behave exactly as the
// indexer does today rather than treating "unknown" as "deleted".
Deno.test("an absent deleted flag behaves exactly as before the column existed", () => {
  assertEquals(docAction({}, "same", "same"), "restamp");
  assertEquals(docAction({}, "old", "new"), "reindex");
  assertEquals(docAction({ deleted: null }, "old", "new"), "reindex");
});
