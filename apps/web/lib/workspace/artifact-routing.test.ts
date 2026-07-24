import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RECORDINGS_FOLDER,
  RESEARCH_FOLDER,
  SLIDES_FOLDER,
  libraryFolderFor,
  routeArtifact,
  type ArtifactKind,
} from "./artifact-routing";

test("study material stays on the Study page, not the Library", () => {
  for (const kind of ["flashcards", "test", "mindmap"] as const) {
    assert.deepEqual(routeArtifact(kind), { surface: "study" }, kind);
    assert.equal(libraryFolderFor(kind), null, kind);
  }
});

test("producible deliverables each get their own Library folder", () => {
  assert.deepEqual(routeArtifact("recording"), { surface: "library", folder: RECORDINGS_FOLDER });
  assert.deepEqual(routeArtifact("slides"), { surface: "library", folder: SLIDES_FOLDER });
  assert.deepEqual(routeArtifact("report"), { surface: "library", folder: RESEARCH_FOLDER });
});

test("libraryFolderFor returns the folder name for Library-bound kinds", () => {
  assert.equal(libraryFolderFor("recording"), "Recordings");
  assert.equal(libraryFolderFor("slides"), "Slides");
  assert.equal(libraryFolderFor("report"), "Research");
});

test("the folders are distinct so kinds never collide in one folder", () => {
  const folders = new Set([RECORDINGS_FOLDER, SLIDES_FOLDER, RESEARCH_FOLDER]);
  assert.equal(folders.size, 3);
});

test("every kind is routed (exhaustive switch, no undefined fall-through)", () => {
  const kinds: ArtifactKind[] = ["flashcards", "test", "mindmap", "recording", "slides", "report"];
  for (const kind of kinds) assert.ok(routeArtifact(kind), kind);
});
