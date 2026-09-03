import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  bestPerDocument,
  chunksAsMaterial,
  documentsWithout,
  everyDocumentPresent,
  excerptsInChunks,
  inventoryNote,
  perDocumentCap,
  questionIsSpecific,
  retrievalIsBroad,
  retrievalNote,
  retrieveInDocuments,
  type RetrievalRpc,
  type RetrievedChunk,
} from "./canvas-retrieval";
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
  const note = retrievalNote(12, 24, { documents: 12 });
  assert.ok(note.includes("all 12 attached documents"), "the note does not say how much material there was");
  assert.ok(/not all of it/i.test(note), "the note does not say this is a subset");
  assert.ok(/not in the material/i.test(note), "the model is not told what to do when the answer is absent");
  assert.ok(/never claim to have covered/i.test(note), "nothing stops a claim of end-to-end coverage");
  // 🔴 RE-ARGUED 2026-09-03. This asserted `retrievalNote(1, 3)` says "the attached document", and
  // that sentence was a bug: the 1 was the number of documents the passages CAME FROM, not the
  // number attached, so a canvas holding seven was described as holding one and the model answered
  // that there was only one document it could read. Singular is right only when the note knows
  // that one document is attached; a note without the total claims nothing about it.
  assert.ok(retrievalNote(1, 3, { documents: 1 }).includes("the attached document"), "one attached document is described as a plural");
  assert.ok(!retrievalNote(1, 3).includes("the attached document"), "a note that does not know the total claims there is one document");
});

test("🔴🔴 the note counts documents against the pile, and names the unmatched ones as attached", () => {
  // Measured 2026-09-03: seven documents attached, one matched, and the note said "the attached
  // document". Named in the inventory is not enough; the note that introduces the passages has to
  // say how many of the pile they came from and what the rest are.
  const note = retrievalNote(5, 24, { documents: 7, openings: true });
  assert.ok(note.includes("5 of the 7 attached documents"), "the note does not say how many of the attached documents contributed");
  assert.match(note, /The other 2 matched nothing for this question\./, "the unmatched documents are not counted");
  assert.match(note, /listed in the inventory above/, "the unmatched documents are not pointed at the inventory");
  assert.match(note, /only their opening lines appear below/, "the note does not say the openings are there");
  assert.match(note, /Never describe them as missing, unavailable or not uploaded/, "nothing forbids calling them missing");
  assert.ok(!/opening lines/.test(retrievalNote(5, 24, { documents: 7 })), "a packet with no openings claims to have them");
  assert.ok(!/matched nothing/.test(retrievalNote(7, 24, { documents: 7 })), "a full match invents unmatched documents");
  // One unmatched document is written in the singular.
  assert.match(retrievalNote(2, 5, { documents: 3, openings: true }), /The other 1 matched nothing for this question\. It is attached and readable/);
  // A caller without the total (the deliverable lane) claims nothing about it, and still forbids
  // "missing".
  const legacy = retrievalNote(4, 60);
  assert.match(legacy, /4 of the documents attached to this canvas because they bear on what you were asked\. The complete list of what is attached is above\./);
  assert.match(legacy, /must not be described as missing, unavailable or not uploaded/);
  // And no em dash reaches the packet from here (the characters are escaped so this file carries none).
  for (const text of [note, legacy]) assert.ok(!/[\u2014\u2015]/.test(text), "the note carries an em dash into the packet");
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
  assert.match(controls, /\{source\.coverageLabel && \(/, "the panel's disclosure left the learner's copy");
  // 🔴🔴 AND THE FALLBACK IS GONE, WHICH IS A REVERSAL OF THE LINE THAT STOOD HERE. It read: *"THE
  // FALLBACK STAYS. A canvas written before the label existed has only the model's sentence, and a
  // clumsy disclosure beats a silent upgrade from partial to whole."* That was defensible while the
  // learner's copy was empty only for an OLD row. Hours later the owner ruled picture counts out of
  // it entirely — so empty became the normal state for a picture-only gap, and the fallback put
  // "Source read in full: the te…" in amber on three of his lecture rows. Caught on production.
  //
  // The case it was protecting is answered by `refreshedCoverageNotes`, which recomputes the label
  // on open. Calibration: restore the `??` and `model-copy-stays-with-the-model.test.ts` reddens.
  assert.ok(!/coverageNote!\.replace/.test(controls), "the model's sentence is back on the learner's row");
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

// ---------------------------------------------------------------- every document gets a seat

/** A row the way PostgREST returns one from match_canvas_chunks. */
const row = (doc: string, similarity: number, index = 0) => ({
  chunk_index: index,
  content: `${doc} passage ${index}`,
  heading_path: null,
  parsed_document_id: doc,
  similarity,
  title: `Lecture ${doc}`,
  unit_label: null,
});

/** A stand-in for the two RPCs, scripted per call, that records what it was asked. */
function scripted(answer: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: RetrievalRpc = async (fn, args) => {
    calls.push({ fn, args });
    return answer(fn, args);
  };
  return { calls, rpc };
}

const EMBEDDING = [0.1, 0.2, 0.3];

test("the per-document cap is each document's share of the limit, never below two, absent for one", () => {
  assert.equal(perDocumentCap(24, 50), 2, "fifty documents: two each, a hundred candidates for twenty-four seats");
  assert.equal(perDocumentCap(24, 7), 4);
  assert.equal(perDocumentCap(60, 7), 9);
  assert.equal(perDocumentCap(24, 1), 0, "one document needs no cap, and zero is the function's old behaviour");
});

test("🔴🔴🔴 a document the first page had no room for gets its one best passage", async () => {
  // Three documents, a limit of four: the cap is two per document, and A and B fill the page
  // between them. Before this, C was "attached and readable; no passage from it matched", which
  // was false: it matched, it ranked fifth.
  const { calls, rpc } = scripted((fn, args) => {
    if (fn === "embed_teaching_query") return { data: EMBEDDING, error: null };
    const ids = args.parsed_document_ids as string[];
    if (ids.length === 3) return { data: [row("a", 0.9), row("a", 0.8, 1), row("b", 0.7), row("b", 0.6, 1)], error: null };
    return { data: [row("c", 0.4)], error: null };
  });
  const chunks = await retrieveInDocuments(["a", "b", "c"], "the question", 4, rpc);
  assert.equal(calls.length, 3, "embed, first page, second pass: no more, no fewer");
  assert.equal(calls[1]?.args.per_document, 2, "the first page is not capped per document");
  assert.equal(calls[1]?.args.match_count, 4);
  assert.deepEqual(calls[2]?.args.parsed_document_ids, ["c"], "the second pass is not restricted to the documents that got nothing");
  assert.equal(calls[2]?.args.per_document, 1);
  assert.equal(calls[2]?.args.match_count, 1);
  assert.deepEqual(new Set(chunks?.map((chunk) => chunk.parsedDocumentId)), new Set(["a", "b", "c"]));
  assert.equal(chunks?.length, 5, "the second pass is additive: the first page keeps its seats");
});

test("🔴 a short first page means the threshold excluded them, and no second call is spent", async () => {
  // Two rows back from a limit of four: nothing was cut by the limit, so a document with no row has
  // no passage above the threshold, and a second call would come back empty for it.
  const { calls, rpc } = scripted((fn) =>
    fn === "embed_teaching_query" ? { data: EMBEDDING, error: null } : { data: [row("a", 0.9), row("b", 0.5)], error: null },
  );
  const chunks = await retrieveInDocuments(["a", "b", "c"], "the question", 4, rpc);
  assert.equal(calls.length, 2, "a second pass was spent on a page the limit did not cut");
  assert.equal(chunks?.length, 2);
});

test("🔴🔴 an older database that does not know per_document is retried flat, once, and the turn survives", async () => {
  // The migration is applied by the owner; until then PostgREST refuses the five-argument call.
  // Nothing may break: the flat retrieval that shipped the day before is the answer.
  const { calls, rpc } = scripted((fn, args) => {
    if (fn === "embed_teaching_query") return { data: EMBEDDING, error: null };
    if ("per_document" in args) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    const ids = args.parsed_document_ids as string[];
    if (ids.length === 3) return { data: [row("a", 0.9), row("a", 0.8, 1), row("a", 0.7, 2), row("a", 0.6, 3)], error: null };
    // The flat shape cannot cap per document, so the second pass brings several rows of one document.
    return { data: [row("c", 0.5), row("c", 0.3, 1), row("b", 0.45)], error: null };
  });
  const chunks = await retrieveInDocuments(["a", "b", "c"], "the question", 4, rpc);
  assert.deepEqual(
    calls.map((call) => "per_document" in call.args),
    [false, true, false, false],
    "after one refusal the flat shape is used for the rest of the turn, without re-probing",
  );
  assert.equal(calls[3]?.args.match_count, 8, "the flat second pass asks for more rows, because it cannot cap per document");
  const byDocument = new Map<string, number>();
  for (const chunk of chunks ?? []) byDocument.set(chunk.parsedDocumentId, (byDocument.get(chunk.parsedDocumentId) ?? 0) + 1);
  assert.equal(byDocument.get("a"), 4, "the first page lost its seats");
  assert.equal(byDocument.get("c"), 1, "the flat second pass is not thinned to one passage per document");
  assert.equal(byDocument.get("b"), 1);
  assert.equal(chunks?.find((chunk) => chunk.parsedDocumentId === "c")?.similarity, 0.5, "and the one kept is not the best");
});

test("a failed second pass keeps the first page rather than failing the turn", async () => {
  // The first page (all three ids) is full at a limit of two; the second pass (just C) times out on
  // both shapes. The turn still has its two passages.
  const { calls, rpc } = scripted((fn, args) => {
    if (fn === "embed_teaching_query") return { data: EMBEDDING, error: null };
    const ids = args.parsed_document_ids as string[];
    if (ids.length === 3) return { data: [row("a", 0.9), row("b", 0.8)], error: null };
    return { data: null, error: { message: "timeout" } };
  });
  const chunks = await retrieveInDocuments(["a", "b", "c"], "the question", 2, rpc);
  assert.equal(chunks?.length, 2, "a second pass that failed took the first page down with it");
  assert.equal(calls.length, 4, "embed, first page, second pass, and its one flat retry: never more");
});

test("the documents with no passage are found in canvas order, once each, and a pass is thinned to its best", () => {
  assert.deepEqual(documentsWithout(["a", "b", "a", "c"], [chunk({ chunkIndex: 0, content: "x", parsedDocumentId: "b" })]), ["a", "c"]);
  const thinned = bestPerDocument([
    chunk({ chunkIndex: 0, content: "x", similarity: 0.3 }),
    chunk({ chunkIndex: 1, content: "y", similarity: 0.6 }),
    chunk({ chunkIndex: 2, content: "z", parsedDocumentId: "doc-b", similarity: 0.2 }),
  ]);
  assert.deepEqual(thinned.map((entry) => [entry.parsedDocumentId, entry.chunkIndex]), [["doc-a", 1], ["doc-b", 2]]);
});

test("🔴 the fairness ships as a migration that REPLACES the old function rather than overloading it", () => {
  const migration = new URL("../../../../supabase/migrations/20260903T20_match_canvas_chunks_per_doc.sql", import.meta.url);
  const sql = readFileSync(migration, "utf8");
  // `create or replace` only replaces a function with the same argument list. A new parameter makes
  // a second overload, and PostgREST then refuses every call as ambiguous.
  assert.match(
    sql,
    /drop function if exists public\.match_canvas_chunks\(vector, uuid\[\], integer, double precision\);/,
    "the four-argument function would survive as an ambiguous overload",
  );
  assert.match(sql, /per_document integer default 0/, "the cap is not optional, so the old call shape breaks");
  assert.match(sql, /row_number\(\) over \(partition by s\.parsed_document_id order by s\.similarity desc\)/, "the cap is not per document");
  assert.match(sql, /where r\.rank_in_document <= per_document/, "the cap is computed and never applied");
  assert.match(sql, /c\.parsed_document_id = any\(parsed_document_ids\)/, "the canvas scoping is gone");
  assert.equal((sql.match(/> match_threshold/g) ?? []).length, 2, "the threshold is not applied on both paths");
  assert.ok(!/security definer/i.test(sql), "the function became SECURITY DEFINER");
  // The code asks for the cap, and the retry drops exactly that one argument.
  const retrieval = readFileSync(new URL("./canvas-retrieval.ts", import.meta.url), "utf8");
  assert.match(retrieval, /per_document: perDocument/, "the code never asks for the cap");
  assert.match(retrieval, /fair = false;/, "an older database is not retried without the cap");
});

// ---------------------------------------------------------------- the pile, or the part

test("🔴 a question asked of the pile is told apart from a question asked of something in it", () => {
  // No subject-matter list: the count of distinctive words is the whole rule, so it reads the same
  // for a law student and an engineer.
  for (const pile of ["help me learn this", "summarize all of these documents", "what is in here?", ""]) {
    assert.equal(questionIsSpecific(pile), false, `"${pile}" was taken as specific`);
  }
  for (const specific of [
    "what does the court say about consideration in contract formation",
    "derive the moment of inertia for a hollow cylinder about its central axis",
  ]) {
    assert.equal(questionIsSpecific(specific), true, `"${specific}" was taken as a question about the pile`);
  }
});

test("half the pile is the line between a narrowed packet and the whole material", () => {
  assert.equal(retrievalIsBroad(7, 4), true);
  assert.equal(retrievalIsBroad(7, 3), false);
  assert.equal(retrievalIsBroad(1, 1), true);
  assert.equal(retrievalIsBroad(0, 0), false);
});

test("🔴🔴 every attached document is physically in the packet, matched or not", () => {
  const long = (id: string): CanvasSource =>
    ({
      excerpts: [
        { id: `${id}:e1`, label: null, text: `Opening of ${id}.` },
        { id: `${id}:e2`, label: null, text: `Middle of ${id}.` },
        { id: `${id}:e3`, label: null, text: `End of ${id}.` },
      ],
      id,
      kind: "pdf",
      title: `Lecture ${id}`,
    }) as unknown as CanvasSource;
  const all = [long("s1"), long("s2"), long("s3")];
  const narrowed = { ...all[1]!, excerpts: [all[1]!.excerpts[2]!] };
  const present = everyDocumentPresent(all, [narrowed]);
  assert.deepEqual(present.map((source) => source.id), ["s1", "s2", "s3"], "canvas order, every source");
  assert.equal(present[1], narrowed, "the matched source is the retrieved one, not the whole document");
  assert.deepEqual(present[0]?.excerpts.map((excerpt) => excerpt.id), ["s1:e1"], "an unmatched source rides with its opening only, id intact");
  // A source with nothing readable has no opening to show; the inventory marks it instead.
  const unreadable = { ...long("s4"), excerpts: [{ id: "s4:e1", label: null, text: "   " }] };
  assert.deepEqual(everyDocumentPresent([unreadable, all[0]!], []).map((source) => source.id), ["s1"]);
});
