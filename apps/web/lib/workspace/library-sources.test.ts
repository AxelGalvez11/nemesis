import assert from "node:assert/strict";
import { test } from "node:test";

import { loadNoteSources } from "./library-provenance";
import {
  PREVIEW_LIBRARY_SOURCES,
  formatSourceSize,
  librarySourceKind,
  librarySourceKindIcon,
  librarySourceKindLabel,
  sourcesInFolder,
} from "./library-sources";

test("librarySourceKind judges files by extension, case-insensitively", () => {
  assert.equal(librarySourceKind("Lecture 1 - Hypertension.pdf"), "pdf");
  assert.equal(librarySourceKind("Week 3.PPTX"), "slides");
  assert.equal(librarySourceKind("Notes-final-v2.docx"), "document");
  assert.equal(librarySourceKind("whiteboard.HEIC"), "image");
  assert.equal(librarySourceKind("Week 3 Recording.mp3"), "audio");
  assert.equal(librarySourceKind("dataset.csv"), "file");
  assert.equal(librarySourceKind("no-extension"), "file");
});

test("every kind has a label and an icon", () => {
  for (const name of ["a.pdf", "a.pptx", "a.docx", "a.png", "a.m4a", "a.zip"]) {
    const kind = librarySourceKind(name);
    assert.ok(librarySourceKindLabel(kind).length > 0);
    assert.ok(librarySourceKindIcon(kind).length > 0);
  }
});

test("formatSourceSize speaks bytes, KB and MB — and stays quiet on junk", () => {
  assert.equal(formatSourceSize(null), null);
  assert.equal(formatSourceSize(-1), null);
  assert.equal(formatSourceSize(Number.NaN), null);
  assert.equal(formatSourceSize(900), "900 B");
  assert.equal(formatSourceSize(320_000), "313 KB");
  assert.equal(formatSourceSize(2_460_000), "2.3 MB");
});

test("sourcesInFolder returns files filed directly under that folder only", () => {
  const conlaw = sourcesInFolder(PREVIEW_LIBRARY_SOURCES, "Constitutional law/Commerce power");
  assert.deepEqual(
    conlaw.map((source) => source.fileName),
    ["Con Law – Week 4 slides.pdf", "Lecture 9 — commerce power.m4a"],
  );
  // Parent folder does not inherit its children's files, and stray slashes
  // or spaces in the asked-for path are forgiven.
  assert.equal(sourcesInFolder(PREVIEW_LIBRARY_SOURCES, "Constitutional law").length, 0);
  assert.equal(sourcesInFolder(PREVIEW_LIBRARY_SOURCES, "/Constitutional law/Commerce power/").length, 2);
  assert.equal(sourcesInFolder(PREVIEW_LIBRARY_SOURCES, "Nowhere").length, 0);
});

test("preview pill source_ids resolve to preview source files — the demo loop stays whole", async () => {
  const fixtureIds = new Set(PREVIEW_LIBRARY_SOURCES.map((source) => source.id));
  for (const noteId of ["preview-commerce", "preview-beams"]) {
    const pills = await loadNoteSources(noteId, { preview: true });
    assert.ok(pills.length > 0);
    for (const pill of pills) {
      assert.ok(pill.sourceId, `pill ${pill.id} on ${noteId} should point at a source file`);
      assert.ok(fixtureIds.has(pill.sourceId), `pill ${pill.id} points at unknown source ${pill.sourceId}`);
    }
  }
});
