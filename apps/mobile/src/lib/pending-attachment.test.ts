// Deno unit tests (repo convention) for the phone's front-door attachment stash.
// Run: deno test --no-check --unstable-sloppy-imports apps/mobile/src/lib/pending-attachment.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearPending, extractedFrom, putPending, takePending, type PendingAttachmentItem } from "./pending-attachment.ts";

function fileItem(uri: string): PendingAttachmentItem {
  return { kind: "file", uri, name: `${uri}.pdf`, size: 10, mimeType: "application/pdf", read: null };
}

Deno.test("takePending returns null when nothing was staged", () => {
  clearPending();
  assertEquals(takePending(), null);
});

Deno.test("putPending then takePending hands back exactly what was staged", () => {
  clearPending();
  const items = [fileItem("a")];
  putPending(items);
  const held = takePending();
  assertEquals(held?.length, 1);
  assertEquals(held?.[0], items[0]);
});

Deno.test("takePending is single-use: a second call finds nothing", () => {
  clearPending();
  putPending([fileItem("a")]);
  takePending();
  assertEquals(takePending(), null);
});

Deno.test("putPending replaces whatever was already waiting, rather than appending", () => {
  clearPending();
  putPending([fileItem("a"), fileItem("b")]);
  putPending([fileItem("c")]);
  const held = takePending();
  assertEquals(held?.length, 1);
  assertEquals(held?.[0].kind === "file" && held[0].uri, "c");
});

Deno.test("putPending with an empty list clears any pending material", () => {
  clearPending();
  putPending([fileItem("a")]);
  putPending([]);
  assertEquals(takePending(), null);
});

Deno.test("clearPending forgets material without returning it", () => {
  clearPending();
  putPending([fileItem("a")]);
  clearPending();
  assertEquals(takePending(), null);
});

Deno.test("extractedFrom maps a ReadDocument-shaped result, dropping unset optionals rather than storing them as undefined", () => {
  const extracted = extractedFrom({
    extractedTitle: "Immunology",
    librarySourceId: "lib-1",
    text: "body",
  });
  assertEquals(extracted, { text: "body", title: "Immunology", librarySourceId: "lib-1" });
  assertEquals("kind" in extracted, false);
  assertEquals("coverage" in extracted, false);
  assertEquals("model" in extracted, false);
});

Deno.test("extractedFrom carries a null librarySourceId as absent, matching CanvasSource's own optional field", () => {
  const extracted = extractedFrom({ extractedTitle: null, librarySourceId: null, text: "body" });
  assertEquals("librarySourceId" in extracted, false);
  assertEquals(extracted.title, null);
});

Deno.test("a note item round-trips as-is", () => {
  clearPending();
  const note: PendingAttachmentItem = {
    kind: "note",
    note: { id: "n1", path: "n1", title: "Lecture 3", content: "body", updatedAt: "", createdAt: "", position: null },
  };
  putPending([note]);
  const held = takePending();
  assertEquals(held?.[0], note);
});
