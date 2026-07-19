import assert from "node:assert/strict";

import { toNotebook, toNotebookSource } from "./parse";

// toNotebook: a valid row maps snake_case → camelCase.
{
  const n = toNotebook({ id: "n1", name: "Cardio", description: null, instructions: "quiz me", updated_at: "2026-07-18" });
  assert.deepEqual(n, { id: "n1", name: "Cardio", description: null, instructions: "quiz me", updatedAt: "2026-07-18" });
}

// toNotebook: rejects a missing id / missing name / non-object.
{
  assert.equal(toNotebook({ name: "x" }), null);
  assert.equal(toNotebook({ id: "n1" }), null);
  assert.equal(toNotebook(null), null);
  assert.equal(toNotebook("nope"), null);
}

// toNotebook: a missing updated_at degrades to "" and optional text fields to null.
{
  const n = toNotebook({ id: "n1", name: "x" });
  assert.equal(n?.updatedAt, "");
  assert.equal(n?.description, null);
  assert.equal(n?.instructions, null);
}

// toNotebookSource: a library row keeps its path; source_url + bytes default to null.
{
  const s = toNotebookSource({ id: "s1", notebook_id: "n1", kind: "library", name: "ACE", content: "body", library_path: "Pharm/ACE.md" });
  assert.deepEqual(s, {
    id: "s1",
    notebookId: "n1",
    kind: "library",
    name: "ACE",
    content: "body",
    sourceUrl: null,
    libraryPath: "Pharm/ACE.md",
    bytes: null,
    createdAt: "",
  });
}

// toNotebookSource: a url row keeps source_url + bytes.
{
  const s = toNotebookSource({ id: "s2", notebook_id: "n1", kind: "url", name: "MedlinePlus", content: "text", source_url: "https://x.test/a", bytes: 1234 });
  assert.equal(s?.sourceUrl, "https://x.test/a");
  assert.equal(s?.bytes, 1234);
  assert.equal(s?.kind, "url");
}

// toNotebookSource: every new extractor kind is accepted.
{
  for (const kind of ["pdf", "docx", "pptx", "youtube"] as const) {
    const s = toNotebookSource({ id: "s", notebook_id: "n1", kind, name: kind, content: "t" });
    assert.equal(s?.kind, kind);
  }
}

// toNotebookSource: rejects an unknown kind + missing ids + non-object.
{
  assert.equal(toNotebookSource({ id: "s1", notebook_id: "n1", kind: "file", name: "x" }), null);
  assert.equal(toNotebookSource({ id: "s1", kind: "text", name: "x" }), null);
  assert.equal(toNotebookSource({ notebook_id: "n1", kind: "text", name: "x" }), null);
  assert.equal(toNotebookSource(null), null);
}

// toNotebookSource: a missing name falls back to "Untitled source".
{
  const s = toNotebookSource({ id: "s3", notebook_id: "n1", kind: "text" });
  assert.equal(s?.name, "Untitled source");
}

console.log("notebooks/parse.test.ts: all assertions passed");
