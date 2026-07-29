import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLiveEvent,
  folderPathsOf,
  libraryRowToNote,
  mergeLiveNotes,
  removeLiveFolder,
  repairSelection,
  upsertLiveFolder,
} from "./library-live";
import type { CloudLibraryNote } from "./library-tree";

function note(overrides: Partial<CloudLibraryNote> & { id: string; path: string }): CloudLibraryNote {
  return {
    title: overrides.path.split("/").pop() ?? overrides.path,
    content: "",
    updatedAt: "2026-07-21T10:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

// --- libraryRowToNote ---------------------------------------------------------

test("libraryRowToNote parses a row and falls back created_at to updated_at", () => {
  const parsed = libraryRowToNote({
    id: "n1",
    path: "Pharm/ACE inhibitors.md",
    title: "ACE inhibitors",
    content: "body",
    updated_at: "2026-07-21T10:00:00.000Z",
  });
  assert.deepEqual(parsed, {
    id: "n1",
    path: "Pharm/ACE inhibitors.md",
    title: "ACE inhibitors",
    content: "body",
    updatedAt: "2026-07-21T10:00:00.000Z",
    createdAt: "2026-07-21T10:00:00.000Z",
    // A row that has never been dragged carries no position — null, not absent,
    // so "My order" can sort it to the end without special-casing missing keys.
    position: null,
  });
});

test("libraryRowToNote keeps the hand-arranged position the phone wrote", () => {
  const parsed = libraryRowToNote({ id: "n1", path: "Pharm/ACE.md", title: "ACE", content: "", position: 2.5 });
  assert.equal(parsed?.position, 2.5);
  // A non-numeric position is treated as "never dragged" rather than trusted.
  assert.equal(libraryRowToNote({ id: "n2", path: "b.md", title: "b", content: "", position: "3" })?.position, null);
});

test("libraryRowToNote derives a title from the path when the column is blank", () => {
  const parsed = libraryRowToNote({ id: "n1", path: "Pharm/Beta blockers.md", title: "  ", content: "x" });
  assert.equal(parsed?.title, "Beta blockers");
});

test("libraryRowToNote rejects rows without an id or path", () => {
  assert.equal(libraryRowToNote(null), null);
  assert.equal(libraryRowToNote({ path: "a.md" }), null);
  assert.equal(libraryRowToNote({ id: "n1" }), null);
});

// --- classifyLiveEvent --------------------------------------------------------

test("classifyLiveEvent maps a hard DELETE to remove-by-id", () => {
  assert.deepEqual(classifyLiveEvent({ eventType: "DELETE", newRow: {}, oldRow: { id: "n1" } }), {
    kind: "remove",
    id: "n1",
  });
});

test("classifyLiveEvent asks for a resync when a DELETE has no id", () => {
  assert.deepEqual(classifyLiveEvent({ eventType: "DELETE", newRow: {}, oldRow: {} }), { kind: "resync" });
});

test("classifyLiveEvent treats a soft delete (deleted flag) as remove", () => {
  assert.deepEqual(
    classifyLiveEvent({ eventType: "UPDATE", newRow: { id: "n1", kind: "note", deleted: true }, oldRow: {} }),
    { kind: "remove", id: "n1" },
  );
});

test("classifyLiveEvent maps live note inserts/updates to note-touch", () => {
  for (const eventType of ["INSERT", "UPDATE"]) {
    assert.deepEqual(
      classifyLiveEvent({ eventType, newRow: { id: "n1", kind: "note", deleted: false }, oldRow: {} }),
      { kind: "note-touch", id: "n1", updatedAt: "" },
    );
  }
});

test("classifyLiveEvent carries the event's server stamp on note-touch", () => {
  assert.deepEqual(
    classifyLiveEvent({
      eventType: "UPDATE",
      newRow: { id: "n1", kind: "note", deleted: false, updated_at: "2026-07-21T12:00:00.000Z" },
      oldRow: {},
    }),
    { kind: "note-touch", id: "n1", updatedAt: "2026-07-21T12:00:00.000Z" },
  );
});

test("classifyLiveEvent normalizes folder paths on folder upserts", () => {
  assert.deepEqual(
    classifyLiveEvent({
      eventType: "INSERT",
      newRow: { id: "f1", kind: "folder", deleted: false, path: "Pharmacology\\Cardio " },
      oldRow: {},
    }),
    { kind: "folder-upsert", id: "f1", path: "Pharmacology/Cardio" },
  );
});

test("classifyLiveEvent resyncs on malformed rows and unknown event types", () => {
  assert.deepEqual(classifyLiveEvent({ eventType: "UPDATE", newRow: null, oldRow: {} }), { kind: "resync" });
  assert.deepEqual(classifyLiveEvent({ eventType: "UPDATE", newRow: { kind: "note" }, oldRow: {} }), {
    kind: "resync",
  });
  assert.deepEqual(
    classifyLiveEvent({ eventType: "INSERT", newRow: { id: "f1", kind: "folder", path: "???" }, oldRow: {} }),
    { kind: "resync" },
  );
  assert.deepEqual(classifyLiveEvent({ eventType: "TRUNCATE", newRow: {}, oldRow: {} }), { kind: "resync" });
});

test("classifyLiveEvent ignores kinds the Library does not render", () => {
  assert.deepEqual(
    classifyLiveEvent({ eventType: "INSERT", newRow: { id: "x1", kind: "attachment" }, oldRow: {} }),
    { kind: "ignore" },
  );
});

// --- folder map helpers -------------------------------------------------------

test("upsertLiveFolder adds and updates without mutating, and no-ops on same path", () => {
  const empty = new Map<string, string>();
  const one = upsertLiveFolder(empty, "f1", "Pharm");
  assert.deepEqual([...one.entries()], [["f1", "Pharm"]]);
  assert.equal(empty.size, 0, "input map is not mutated");

  const renamed = upsertLiveFolder(one, "f1", "Pharmacology");
  assert.deepEqual([...renamed.entries()], [["f1", "Pharmacology"]]);
  assert.equal(one.get("f1"), "Pharm", "input map is not mutated");

  assert.equal(upsertLiveFolder(renamed, "f1", "Pharmacology"), renamed, "same path returns the same reference");
});

test("removeLiveFolder drops an entry and returns the same reference when absent", () => {
  const map = upsertLiveFolder(new Map(), "f1", "Pharm");
  const removed = removeLiveFolder(map, "f1");
  assert.equal(removed.size, 0);
  assert.equal(map.size, 1, "input map is not mutated");
  assert.equal(removeLiveFolder(map, "nope"), map);
});

test("folderPathsOf dedupes while keeping first-seen order", () => {
  const map = new Map([
    ["f1", "Pharm"],
    ["f2", "Immuno"],
    ["f3", "Pharm"],
  ]);
  assert.deepEqual(folderPathsOf(map), ["Pharm", "Immuno"]);
});

// --- mergeLiveNotes -----------------------------------------------------------

test("mergeLiveNotes replaces an existing note and re-sorts by updatedAt desc", () => {
  const a = note({ id: "a", path: "A.md", updatedAt: "2026-07-21T10:00:00.000Z" });
  const b = note({ id: "b", path: "B.md", updatedAt: "2026-07-21T09:00:00.000Z" });
  const freshB = note({ id: "b", path: "B.md", content: "edited on phone", updatedAt: "2026-07-21T11:00:00.000Z" });

  const merged = mergeLiveNotes([a, b], "A.md", [freshB], new Set());
  assert.equal(merged.changed, true);
  assert.deepEqual(merged.notes.map((n) => n.id), ["b", "a"]);
  assert.equal(merged.notes[0]?.content, "edited on phone");
  assert.equal(merged.selectedPath, "A.md", "selection stays put");
});

test("mergeLiveNotes adds a brand-new note into sorted position", () => {
  const a = note({ id: "a", path: "A.md", updatedAt: "2026-07-21T10:00:00.000Z" });
  const fresh = note({ id: "c", path: "C.md", updatedAt: "2026-07-21T12:00:00.000Z" });
  const merged = mergeLiveNotes([a], "A.md", [fresh], new Set());
  assert.deepEqual(merged.notes.map((n) => n.id), ["c", "a"]);
});

test("mergeLiveNotes removes ids and moves selection to the first remaining note", () => {
  const a = note({ id: "a", path: "A.md", updatedAt: "2026-07-21T10:00:00.000Z" });
  const b = note({ id: "b", path: "B.md", updatedAt: "2026-07-21T09:00:00.000Z" });
  const merged = mergeLiveNotes([a, b], "A.md", [], new Set(["a"]));
  assert.deepEqual(merged.notes.map((n) => n.id), ["b"]);
  assert.equal(merged.selectedPath, "B.md");
});

test("mergeLiveNotes follows a rename of the selected note", () => {
  const a = note({ id: "a", path: "Old name.md", updatedAt: "2026-07-21T10:00:00.000Z" });
  const renamed = note({ id: "a", path: "New name.md", updatedAt: "2026-07-21T11:00:00.000Z" });
  const merged = mergeLiveNotes([a], "Old name.md", [renamed], new Set());
  assert.equal(merged.selectedPath, "New name.md");
});

test("mergeLiveNotes reports no change (same array reference) for an identical echo", () => {
  const a = note({ id: "a", path: "A.md", updatedAt: "2026-07-21T10:00:00.000Z" });
  const notes = [a];
  const echo = { ...a };
  const merged = mergeLiveNotes(notes, "A.md", [echo], new Set());
  assert.equal(merged.changed, false);
  assert.equal(merged.notes, notes, "unchanged merges return the input array");
  assert.equal(merged.selectedPath, "A.md");

  const noopRemove = mergeLiveNotes(notes, "A.md", [], new Set(["ghost"]));
  assert.equal(noopRemove.changed, false);
  assert.equal(noopRemove.notes, notes);
});

test("mergeLiveNotes adopts the first note when nothing was selected", () => {
  const fresh = note({ id: "a", path: "A.md" });
  const merged = mergeLiveNotes([], null, [fresh], new Set());
  assert.equal(merged.selectedPath, "A.md");
});

test("mergeLiveNotes lets a fresh row win over a simultaneous removal", () => {
  const a = note({ id: "a", path: "A.md" });
  const fresh = note({ id: "a", path: "A.md", content: "still here" });
  const merged = mergeLiveNotes([a], "A.md", [fresh], new Set(["a"]));
  assert.deepEqual(merged.notes.map((n) => n.content), ["still here"]);
});

// --- repairSelection ----------------------------------------------------------

test("repairSelection keeps a still-valid selection", () => {
  const next = [note({ id: "a", path: "A.md" })];
  assert.equal(repairSelection([], next, "A.md"), "A.md");
});

test("repairSelection follows the selected note's id when its path changed", () => {
  const prev = [note({ id: "a", path: "Old.md" })];
  const next = [note({ id: "a", path: "New.md" })];
  assert.equal(repairSelection(prev, next, "Old.md"), "New.md");
});

test("repairSelection falls back to the first note, and to null when empty", () => {
  const prev = [note({ id: "a", path: "Gone.md" })];
  const next = [note({ id: "b", path: "B.md" })];
  assert.equal(repairSelection(prev, next, "Gone.md"), "B.md");
  assert.equal(repairSelection(prev, [], "Gone.md"), null);
  assert.equal(repairSelection([], next, null), "B.md");
});
