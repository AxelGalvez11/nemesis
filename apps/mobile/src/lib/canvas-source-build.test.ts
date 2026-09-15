// Deno unit tests (repo convention) for building a CanvasSource on the phone.
// Run: deno test --no-check --unstable-sloppy-imports apps/mobile/src/lib/canvas-source-build.test.ts
//
// 🔴 WHY THIS FILE NEVER IMPORTS `@/learn/sources`. That module reaches
// `apps/web/lib/sources/source-context.ts` through canvas-grounding.ts's own `@/lib/...` import
// — an alias Deno's resolver has no mapping for (see canvas-source-build.ts's header). Every
// excerpt list below is a small literal instead of a real `buildExcerpts(...)` call, which is
// exactly why `excerptSourceFor` exists as its own pinned function: the ORDER of the three-tier
// choice is tested here even though the functions it chooses between cannot be.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFileCanvasSource,
  buildNoteCanvasSource,
  excerptSourceFor,
  nextSourceId,
} from "./canvas-source-build.ts";

const EXCERPT = { id: "s1:e1", label: null, text: "Some text." };

Deno.test("nextSourceId mints s1 for an empty canvas", () => {
  assertEquals(nextSourceId({ sources: [] }), "s1");
});

Deno.test("nextSourceId counts against whatever sources are already on the canvas", () => {
  assertEquals(nextSourceId({ sources: [{}, {}] as never }), "s3");
});

Deno.test("excerptSourceFor prefers the canonical parse over everything else", () => {
  assertEquals(excerptSourceFor(true, true), "canonical");
  assertEquals(excerptSourceFor(true, false), "canonical");
});

Deno.test("excerptSourceFor falls back to the response's own model when there is no canonical parse", () => {
  assertEquals(excerptSourceFor(false, true), "model");
});

Deno.test("excerptSourceFor falls back to flat text only when neither the canonical parse nor a model exists", () => {
  assertEquals(excerptSourceFor(false, false), "text");
});

Deno.test("a file is titled by its own filename when it is an image, never by the extracted caption", () => {
  const source = buildFileCanvasSource(
    "s1",
    "IMG_4821.HEIC",
    { title: "An illustration of three bars.", kind: "image", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals(source.title, "IMG_4821.HEIC");
});

// `documentTitle`'s own precedence (document-title.ts, 2026-09-01): the file name the learner
// chose wins whenever it "names something" (>=2 words or >=12 characters) — a `lecture-3.pdf`
// beats even a good extracted title, on purpose (owner: two files both extracted as "Integrated
// Pharmacotherapy 4" were indistinguishable in the sidebar). The extracted title is only used
// when the file name is a STUB like "doc.pdf" — which both fixtures below use, so what this
// builder actually has to get right (candidate accepted vs. rejected by shape) is what is under
// test, not `documentTitle`'s own filename-precedence rule.
Deno.test("a non-image file with a stub filename takes the extractor's own title, via documentTitle's shape rules", () => {
  const source = buildFileCanvasSource(
    "s1",
    "doc.pdf",
    { title: "Immunology: Innate Defenses", kind: "pdf", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals(source.title, "Immunology: Innate Defenses");
});

Deno.test("a non-image file with a stub filename falls back to that stub when the extracted title is a row of cells", () => {
  const source = buildFileCanvasSource(
    "s1",
    "doc.pdf",
    { title: "Class | Generic | Dosage | Monitoring", kind: "pdf", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals(source.title, "doc");
});

Deno.test("a filed source is durable and carries its librarySourceId; an unfiled one is ephemeral and carries neither", () => {
  const filed = buildFileCanvasSource(
    "s1",
    "a.pdf",
    { title: "A", kind: "pdf", librarySourceId: "lib-1" },
    [EXCERPT],
    "full",
    null,
  );
  assertEquals(filed.durability, "durable");
  assertEquals(filed.librarySourceId, "lib-1");
  assertEquals(filed.parseQuality, "full");

  const unfiled = buildFileCanvasSource(
    "s1",
    "a.pdf",
    { title: "A", kind: "pdf", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals(unfiled.durability, "ephemeral");
  assertEquals("librarySourceId" in unfiled, false);
  assertEquals("parseQuality" in unfiled, false);
});

Deno.test("a coverage note is carried only when one was given", () => {
  const withNote = buildFileCanvasSource(
    "s1",
    "a.pdf",
    { title: "A", kind: "pdf", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    "8 pictures were not read.",
  );
  assertEquals(withNote.coverageNote, "8 pictures were not read.");

  const withoutNote = buildFileCanvasSource(
    "s1",
    "a.pdf",
    { title: "A", kind: "pdf", librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals("coverageNote" in withoutNote, false);
});

Deno.test("a missing kind falls back to text, matching the web's own extracted.kind ?? \"text\"", () => {
  const source = buildFileCanvasSource(
    "s1",
    "a.md",
    { title: "A", kind: undefined, librarySourceId: undefined },
    [EXCERPT],
    undefined,
    null,
  );
  assertEquals(source.kind, "text");
});

Deno.test("a note becomes a text-kind, ephemeral source named after itself", () => {
  const source = buildNoteCanvasSource("s2", { title: "Lecture 3 notes" }, [EXCERPT]);
  assertEquals(source.title, "Lecture 3 notes");
  assertEquals(source.kind, "text");
  assertEquals(source.durability, "ephemeral");
  assertEquals("librarySourceId" in source, false);
  assertEquals(source.excerpts.length, 1);
});

Deno.test("an untitled note falls back to a plain label rather than an empty title", () => {
  const source = buildNoteCanvasSource("s2", { title: "   " }, [EXCERPT]);
  assertEquals(source.title, "Untitled note");
});
