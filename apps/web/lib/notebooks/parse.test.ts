import assert from "node:assert/strict";

import { toNotebook, toNotebookChat, toNotebookChatMessage, toNotebookSource } from "./parse";

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

// toNotebookChat: a valid row maps; missing title → "New chat", missing updated_at → "".
{
  const c = toNotebookChat({ id: "c1", notebook_id: "n1", title: "Beta blockers", updated_at: "2026-07-18" });
  assert.deepEqual(c, { id: "c1", notebookId: "n1", title: "Beta blockers", updatedAt: "2026-07-18" });
  const d = toNotebookChat({ id: "c2", notebook_id: "n1" });
  assert.equal(d?.title, "New chat");
  assert.equal(d?.updatedAt, "");
}

// toNotebookChat: rejects a missing id / missing notebook_id / non-object.
{
  assert.equal(toNotebookChat({ notebook_id: "n1" }), null);
  assert.equal(toNotebookChat({ id: "c1" }), null);
  assert.equal(toNotebookChat(null), null);
}

// toNotebookChatMessage: a valid row maps snake_case → camelCase.
{
  const m = toNotebookChatMessage({ id: "m1", chat_id: "c1", role: "assistant", content: "hi", created_at: "2026-07-18" });
  assert.deepEqual(m, { id: "m1", chatId: "c1", role: "assistant", content: "hi", createdAt: "2026-07-18" });
}

// toNotebookChatMessage: rejects an unknown role, missing content, missing id, non-object.
{
  assert.equal(toNotebookChatMessage({ id: "m", chat_id: "c", role: "bogus", content: "x" }), null);
  assert.equal(toNotebookChatMessage({ id: "m", chat_id: "c", role: "user" }), null);
  assert.equal(toNotebookChatMessage({ chat_id: "c", role: "user", content: "x" }), null);
  assert.equal(toNotebookChatMessage(null), null);
}

// toNotebookChatMessage: empty-string content is a valid message (not treated as missing).
{
  const m = toNotebookChatMessage({ id: "m", chat_id: "c", role: "user", content: "" });
  assert.equal(m?.content, "");
}

console.log("notebooks/parse.test.ts: all assertions passed");
