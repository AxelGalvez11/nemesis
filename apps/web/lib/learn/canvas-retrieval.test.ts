import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { chunksAsMaterial, excerptsInChunks, retrievalNote, type RetrievedChunk } from "./canvas-retrieval";
import type { CanvasSource } from "./canvas-model";

// Retrieval is the twenty-document fix: ask the index which passages bear on the question rather
// than reading every attached document in order until a character budget runs out. The I/O half is
// three RPCs and is proved on production; these are the pure halves, where the real traps live.

function chunk(over: Partial<RetrievedChunk> & { chunkIndex: number; content: string }): RetrievedChunk {
  return {
    headingPath: null,
    parsedDocumentId: "doc-a",
    similarity: 0.5,
    title: "Lecture",
    unitLabel: null,
    ...over,
  };
}

test("retrieved passages are put back into reading order, grouped by document", () => {
  // 🔴 RANKED FOR SELECTION, ORDERED FOR READING. Retrieval hands back best-first, and a study
  // guide written in that order opens on the conclusion, then defines a term from page one.
  const material = chunksAsMaterial([
    chunk({ chunkIndex: 9, content: "In summary, stopping smoking is the hallmark.", similarity: 0.91 }),
    chunk({ chunkIndex: 2, content: "GOLD guidelines are for COPD.", similarity: 0.88 }),
    chunk({ chunkIndex: 4, content: "Protease activity causes alveolar destruction.", similarity: 0.71 }),
  ]);
  const gold = material.indexOf("GOLD guidelines");
  const protease = material.indexOf("Protease activity");
  const summary = material.indexOf("In summary");
  assert.ok(gold < protease && protease < summary, "passages are still in rank order, not reading order");
});

test("two documents stay two documents, each under its own title", () => {
  const material = chunksAsMaterial([
    chunk({ chunkIndex: 1, content: "Insulin lowers blood glucose.", parsedDocumentId: "doc-b", title: "Diabetes" }),
    chunk({ chunkIndex: 3, content: "Bronchodilators increase FEV1.", parsedDocumentId: "doc-a", title: "COPD" }),
    chunk({ chunkIndex: 0, content: "Glucagon raises it.", parsedDocumentId: "doc-b", title: "Diabetes" }),
  ]);
  assert.ok(material.includes("### COPD"), "a document lost its title");
  assert.ok(material.includes("### Diabetes"), "a document lost its title");
  assert.ok(
    material.indexOf("Glucagon raises it.") < material.indexOf("Insulin lowers blood glucose."),
    "passages within one document are not in reading order",
  );
});

/** A canvas source whose excerpts are paragraphs of the same document the chunks were cut from. */
const SOURCE: CanvasSource = {
  excerpts: [
    { id: "s1:e1", label: null, text: "GOLD guidelines are for COPD." },
    { id: "s1:e2", label: null, text: "Protease activity causes alveolar destruction." },
    { id: "s1:e3", label: null, text: "Nothing in any retrieved passage says this sentence." },
  ],
  id: "s1",
  kind: "text",
  title: "Lecture",
} as unknown as CanvasSource;

test("an excerpt inside a retrieved passage keeps its citation id", () => {
  // 🔴 THIS IS WHAT KEEPS RETRIEVAL FROM BREAKING CITATIONS. Chunks and excerpts are two different
  // cuts of one document, and only excerpts carry the [s1:e4] ids a rendered answer resolves.
  // Retrieval chooses; the excerpts keep their names.
  const { sources, omitted } = excerptsInChunks(
    [SOURCE],
    [chunk({ chunkIndex: 0, content: "GOLD guidelines are for COPD.\n\nProtease activity causes alveolar destruction." })],
  );
  assert.equal(sources.length, 1);
  assert.deepEqual(
    sources[0]?.excerpts.map((excerpt) => excerpt.id),
    ["s1:e1", "s1:e2"],
  );
  assert.equal(omitted, 1, "the excerpt no passage contained is not reported as omitted");
});

test("blank lines between passages do not hide an excerpt", () => {
  // 🔴 THE SILENT ONE. The chunker keeps the document's own blank lines and buildExcerpts trims
  // them, so a raw `includes` misses nearly every excerpt in a transcript. The failure looks
  // exactly like "retrieval found nothing", which is the fallback path, so nothing would look wrong.
  const spaced = excerptsInChunks(
    [SOURCE],
    [chunk({ chunkIndex: 0, content: "GOLD   guidelines\n\n   are for COPD." })],
  );
  assert.equal(spaced.sources[0]?.excerpts.length, 1, "whitespace between words hid a real match");
});

test("a source with nothing retrieved drops out rather than arriving empty", () => {
  const { sources } = excerptsInChunks([SOURCE], [chunk({ chunkIndex: 0, content: "Entirely unrelated material." })]);
  assert.equal(sources.length, 0, "an empty source is being handed to a writer as if it were material");
});

test("the model is told it holds a subset, and told not to fill the gap", () => {
  // Owner, 2026-09-02: "It shouldn't, like, uh, hallucinate or say that it has it when it really
  // doesn't have it."
  const note = retrievalNote(12, 24);
  assert.ok(note.includes("12 attached documents"), "the note does not say how much material there was");
  assert.ok(/not all of it/i.test(note), "the note does not say this is a subset");
  assert.ok(/not in the material/i.test(note), "the model is not told what to do when the answer is absent");
  assert.ok(/never claim to have covered/i.test(note), "nothing stops a claim of end-to-end coverage");
  assert.ok(retrievalNote(1, 3).includes("the attached document"), "one document is described as a plural");
});

test("retrieval failing falls back to reading the material, and never throws", () => {
  // 🔴 THE NORMAL PATH FOR A FRESH ATTACHMENT, NOT AN EDGE CASE. Chunking and embedding happen
  // after a parse, so a file dropped in ten seconds ago genuinely has no rows yet. Every reason
  // retrieval can fail returns null, and the caller reads the material in order the way it always
  // did — as good as yesterday, never worse.
  const source = readFileSync(new URL("./canvas-retrieval.ts", import.meta.url), "utf8");
  assert.match(source, /if \(documentIds\.length === 0\) return null/, "no attached documents no longer falls back");
  assert.match(source, /if \(embedded\.error \|\| !embedding\) return null/, "an embedding failure no longer falls back");
  assert.match(source, /matched\.error \|\| !Array\.isArray\(matched\.data\)/, "a match failure no longer falls back");

  const deliverables = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(deliverables, /if \(!retrieved\) return canvasBrief\(canvas\)/, "the deliverable lost its fallback");
  assert.match(deliverables, /if \(!material\) return canvasBrief\(canvas\)/, "an empty retrieval no longer falls back");
});

test("every maker retrieves — the fix is not just for documents", () => {
  // The bug was one function feeding all six makers. The fix has to reach all six too, or the next
  // report is "the flashcards are about the title" instead of "the document is".
  const deliverables = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  const calls = deliverables.match(/await canvasBriefFor\(canvas/g) ?? [];
  assert.ok(calls.length >= 5, `only ${calls.length} makers retrieve; flashcards, notes, document, sheet and slides all must`);
});

test("🔴 the migration ships with the code that needs it", () => {
  // The function is applied to production by hand; the file is how a fresh database gets it. A
  // deployment whose database lacks it degrades to reading the material in order — correct, but
  // silently back to the twenty-document bug.
  const migration = new URL("../../../../supabase/migrations/20260902T10_match_canvas_chunks.sql", import.meta.url);
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /create or replace function public\.match_canvas_chunks/, "the function is not in its migration");
  assert.match(sql, /parsed_document_ids uuid\[\]/, "the canvas scoping argument is gone — this would search the whole library");
  assert.match(sql, /c\.parsed_document_id = any\(parsed_document_ids\)/, "the scoping argument is accepted and never applied");
  assert.ok(!/security definer/i.test(sql), "the function became SECURITY DEFINER — RLS no longer scopes rows to the caller");
});
