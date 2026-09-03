import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { chunksAsMaterial, excerptsInChunks, inventoryNote, retrievalNote, type RetrievedChunk } from "./canvas-retrieval";
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

// ---------------------------------------------------------------- the inventory

const TEN = Array.from({ length: 10 }, (_, index) => ({
  excerpts: [{ id: `s${index + 1}:e1`, label: null, text: `Contents of lecture ${index + 1}.` }],
  id: `s${index + 1}`,
  kind: "pdf",
  title: `Lecture ${index + 1}`,
})) as unknown as CanvasSource[];

test("🔴 every attached document is named, even the ones this question did not match", () => {
  // Owner, 2026-09-03, ten lecture files attached and ALL TEN indexed (479 passages). Asked to list
  // them, Nemesis said: "I do not have access to ten distinct file contents: only four syllabi and
  // one readme are present in what you gave me." Scrupulously honest about what it had been SHOWN,
  // and wrong about what EXISTS — because retrieval had been allowed to narrow the inventory too.
  const note = inventoryNote(TEN, TEN.slice(0, 4));
  for (const source of TEN) assert.ok(note.includes(source.title), `${source.title} is missing from the inventory`);
  assert.ok(note.includes("10 documents"), "the count is not stated");
});

test("a document with no matching passage is marked as attached, not as missing", () => {
  const note = inventoryNote(TEN, TEN.slice(0, 4));
  assert.ok(/attached and readable/.test(note), "an unmatched document is not marked as still attached");
  // 🔴 THE INVARIANT, NOT THE SENTENCE. This quoted the wording verbatim and went red when the note
  // grew a second case (a file that genuinely did not read, which the model MUST say is unusable).
  // What must stay true is that a readable document with no matching passage is never reported as
  // missing.
  assert.ok(/[Nn]ever tell the learner/.test(note), "nothing stops the model reporting an attached file as missing");
  assert.ok(/is missing, unavailable/.test(note), "the three words the model must not use are no longer named");
  assert.ok(!note.includes("Lecture 1 (attached and readable"), "a document that WAS shown is marked as unmatched");
  assert.ok(note.includes("Lecture 9 (attached and readable"), "a document that was NOT shown is unmarked");
});

test("no attachments means no inventory block at all", () => {
  assert.equal(inventoryNote([], []), "", "an empty canvas emits an inventory heading with nothing under it");
});

test("both lanes carry the inventory, not just one", () => {
  // The bug was one narrowing applied in two places. The fix has to reach both or the next report is
  // "the study guide only covered four of my ten lectures".
  const chat = readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8");
  const deliverables = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(chat, /inventoryNote\(canvas\.sources, focused\.sources\)/, "the chat turn lost the inventory");
  assert.match(deliverables, /inventoryNote\(canvas\.sources, shown\)/, "the deliverable brief lost the inventory");
});

// ---------------------------------------------------------------- what was not read

/** A source shaped the way a scanned handout arrives: attached, one blob, nothing indexable. */
function source(over: Partial<CanvasSource> & { id: string; title: string }): CanvasSource {
  return {
    excerpts: [{ id: `${over.id}:e1`, label: null, text: "Some readable paragraph of the lecture." }],
    kind: "pdf",
    ...over,
  } as unknown as CanvasSource;
}

test("🔴 a document that did not read is not listed as though it did", () => {
  // Measured on production 2026-09-03: `44 ippe exam prep` carried parseQuality "degraded", ONE
  // excerpt for the whole document and ZERO passages in the search index. Nemesis knew, recorded
  // it, and said nothing to anyone. On screen it was indistinguishable from a clean parse.
  const all = [
    source({ excerpts: [{ id: "s1:e1", label: null, text: "Real content." }, { id: "s1:e2", label: null, text: "More." }], id: "s1", title: "Good lecture" }),
    source({ excerpts: [], id: "s2", title: "Scanned handout" }),
    source({ id: "s3", parseQuality: "degraded", title: "Half-read deck" } as never),
  ];
  const note = inventoryNote(all, [all[0]!]);
  assert.match(note, /Scanned handout \(ATTACHED BUT NOT READ/, "a file with nothing in it reads as ordinary");
  assert.match(note, /Half-read deck \(ATTACHED BUT ONLY PARTLY READ/, "a degraded parse reads as ordinary");
  assert.ok(!/Good lecture \(ATTACHED BUT/.test(note), "a clean parse was marked as broken");
});

test("the model is told it cannot answer from a file that did not read", () => {
  // 🔴 THE MARKING ALONE IS NOT ENOUGH. Without this the model sees "ATTACHED BUT NOT READ" and
  // still answers about the document from general knowledge, which is the exact pretence the owner
  // asked us to stop: "It should not pretend that it read something it did not parse successfully."
  const note = inventoryNote([source({ excerpts: [], id: "s1", title: "Scanned handout" })], []);
  assert.match(note, /You do not have that content and cannot answer from it/, "nothing stops the model answering anyway");
  assert.match(note, /did not read properly/, "the model is not told what to say to the learner");
  assert.match(note, /Never include such a document in a claim to have covered their material/, "a coverage claim can still include it");
});

test("a canvas where everything read cleanly carries no warning paragraph", () => {
  // 🔴 A WARNING THAT IS ALWAYS THERE IS A WARNING NOBODY READS.
  const clean = [source({ excerpts: [{ id: "s1:e1", label: null, text: "One." }, { id: "s1:e2", label: null, text: "Two." }], id: "s1", title: "Lecture" })];
  const note = inventoryNote(clean, clean);
  assert.ok(!/ATTACHED BUT/.test(note), "a clean canvas is being warned about");
  assert.ok(!/cannot answer from it/.test(note), "the unread paragraph appears with nothing unread");
});

test("the panel and the model apply the SAME test", () => {
  // Two owners of one judgement is how a panel comes to say "partly read" beside an answer that
  // claims full coverage. Both read parseQuality and count usable excerpts, the same way.
  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /function sourceReadWarning/, "the source row no longer says when a file did not read");
  assert.match(controls, /parseQuality === "degraded"/, "the panel stopped reading the recorded parse quality");
  const retrieval = readFileSync(new URL("./canvas-retrieval.ts", import.meta.url), "utf8");
  assert.match(retrieval, /parseQuality === "degraded"/, "the model's inventory stopped reading parse quality");
});

test("🔴 the sources panel speaks to the learner, not to the model", () => {
  // Measured on production 2026-09-03, on 22 sources. Beside their own file name, in a 10px amber
  // label, a learner was shown: "Incomplete source: 8 pictures were not read. If the student's
  // question depends on what is missing, say so plainly rather than answering as though you read
  // the whole document." An instruction, written for the model, referring to the reader in the
  // third person. The function that builds it is literally called `coverageNoticeForModel`.
  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /source\.coverageLabel \?\? source\.coverageNote/, "the panel is back to printing the model's copy");
  // 🔴 THE FALLBACK STAYS. A canvas written before the label existed has only the model's sentence,
  // and a clumsy disclosure beats a silent upgrade from partial to whole.
  assert.match(controls, /coverageNote!\.replace/, "an older canvas now shows no disclosure at all");
});

test("one parsed coverage, two spellings, read once", () => {
  // 🔴 TWO READS WOULD BE TWO ANSWERS to "what did this document miss", against a row that changes
  // in the background as the figure pass improves it.
  const shared = readFileSync(new URL("../../../../packages/shared/src/extraction-coverage.ts", import.meta.url), "utf8");
  assert.match(shared, /export function coverageNoticeForLearner/, "the learner rendering is gone");
  assert.match(shared, /export function coverageNoticeForModel/, "the model rendering is gone");
  const sources = readFileSync(new URL("./canvas-sources.ts", import.meta.url), "utf8");
  assert.match(sources, /export async function storedCoverage\(/, "the two spellings are read separately again");
});

test("the reading pane does not spend three quarters of itself on a contents list", () => {
  // Measured on production 2026-09-03: the canvas pane is 360px at `xl`, the reader's outline rail
  // opened by default and is about 270px, so the document the learner asked to read got roughly 90.
  const reader = readFileSync(new URL("../../components/workspace/reader/document-reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /useState\(!isDialog && !dense\)/, "the outline rail opens by default in the narrow pane again");
});
