import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasFromRow, canvasToRow, isMissingTableError, mergeSourceIntoCanvas } from "./canvas-store";
import { quotedExcerpt } from "./canvas-grounding";
import { emptyCanvas, type CanvasSource, type LearningCanvas, type SourceRef } from "./canvas-model";

const NOW = "2026-08-06T00:00:00.000Z";

function sample(): LearningCanvas {
  return {
    ...emptyCanvas("c1", NOW),
    title: "Cardiac action potentials",
    state: "learn",
    level: "exam",
    blocks: [{ id: "b1", type: "paragraph", content: "Charge moves.", conceptIds: ["k1"] }],
    concepts: [{ id: "k1", label: "Ion gradients" }],
    activeMs: 90_000,
  };
}

test("🔴 a canvas captured mid-run RESOLVES to reading, and the stored row is not touched", () => {
  // 🔴 THE MIGRATION THAT IS DELIBERATELY NOT A MIGRATION. Two of the owner's six canvases sit in a
  // legacy evidence stage (`test`, `recall`). With the six-stage machine retired they would be
  // stranded in a state nothing routes to and nothing paints.
  //
  // The obvious fix is an UPDATE setting `state`. That is a data change made to correct a
  // projection, on the owner's own rows, and it is not reversible — there is no backup to restore
  // from if the judgement is wrong. Resolving on READ leaves the document exactly as written, so
  // being wrong costs one function instead of the rows.
  const row = {
    id: "c9",
    title: "Captured mid-test",
    state: "test",
    level: null,
    document: { blocks: [{ id: "b1", type: "paragraph", content: "Charge moves." }], questions: [], answers: [] },
    active_ms: 0,
    created_at: NOW,
    updated_at: NOW,
  };

  const canvas = canvasFromRow(row);
  assert.equal(canvas.state, "learn", "a captured canvas opens on its reading material");
  assert.equal(row.state, "test", "🔴 the stored row is untouched — this is a read-path resolution");
  assert.equal(canvas.blocks.length, 1, "and the document it already had is still there");

  // Every legacy evidence stage resolves, not just the one in the screenshot.
  for (const state of ["recall", "test", "retest", "diagnose", "complete"]) {
    assert.equal(canvasFromRow({ ...row, state }).state, "learn", `${state} must resolve to reading`);
  }
  // States that were never part of the retired machine are left exactly alone.
  for (const state of ["empty", "sources_attached", "orient", "learn", "targeted_relearn"]) {
    assert.equal(canvasFromRow({ ...row, state }).state, state, `${state} must be untouched`);
  }
});

test("a canvas survives a round trip through the row shape unchanged", () => {
  const before = sample();
  // `updated_at` is stamped by the table's trigger, not sent by the client, so the read side
  // supplies it the way the server would.
  const row = { ...(canvasToRow(before, "u1") as Record<string, unknown>), updated_at: NOW };
  assert.deepEqual(canvasFromRow(row as never), before);
});

test("🔴 every populated field reaches the row — the by-hand list is the trap", () => {
  // `canvasToRow` enumerates the document's fields by hand rather than spreading, so a new field
  // is persisted only when someone remembers to add a line. The round-trip test above uses an
  // EMPTY canvas, which passes whether or not the line exists — both sides produce []. This one
  // populates the fields that were added late, which is the only version that can fail.
  const before: LearningCanvas = {
    ...sample(),
    blocks: [
      {
        id: "b1",
        type: "paragraph",
        content: "Charge moves down its electrochemical gradient.",
        conceptIds: ["k1"],
        terms: [{ term: "electrochemical gradient", conceptId: "k1" }],
      },
    ],
    outputs: [{ id: "o1", title: "Summary.docx", kind: "document", createdAt: NOW }],
    events: [{ id: "e1", type: "definition_opened", at: NOW, selectedText: "gradient", activeElapsedMs: 90_000 }],
    // A pasted-link source — the newest field on CanvasSource, and the same trap `events` already
    // fell into once: `sources` rides through as a whole array today, but nothing stops a future
    // edit from rebuilding each entry field-by-field the way `canvasToRow`'s document already does
    // at the top level.
    sources: [
      { id: "s1", title: "FDA label", kind: "text", excerpts: [], sourceUrl: "https://example.com/label.html" },
    ],
  };

  const row = { ...(canvasToRow(before, "u1") as Record<string, unknown>), updated_at: NOW };
  const after = canvasFromRow(row as never);

  assert.deepEqual(after.outputs, before.outputs, "outputs must survive the write");
  assert.deepEqual(after.events, before.events, "events must survive the write");
  // Blocks are serialised whole, so `terms` rides along — asserted so that a future hand-rebuilt
  // block object (which is how `{content, title}` dropped new fields once already) fails here.
  assert.deepEqual(after.blocks[0]?.terms, before.blocks[0]?.terms, "block terms must survive the write");
  assert.equal(after.sources[0]?.sourceUrl, before.sources[0]?.sourceUrl, "a pasted link's URL must survive the write");
  assert.deepEqual(after, before);
});

test("the row carries the canvas's real birthday, so one started offline keeps it", () => {
  assert.equal((canvasToRow(sample(), "u1") as Record<string, unknown>).created_at, NOW);
});

test("the row never sends updated_at — the database owns it", () => {
  assert.equal("updated_at" in (canvasToRow(sample(), "u1") as Record<string, unknown>), false);
});

test("the row keeps title, state, level and time in real columns, not buried in the document", () => {
  // So the list query and any later analysis can read them without parsing JSON.
  const row = canvasToRow(sample(), "u1") as Record<string, unknown>;
  assert.equal(row.title, "Cardiac action potentials");
  assert.equal(row.state, "learn");
  assert.equal(row.level, "exam");
  assert.equal(row.active_ms, 90_000);
  assert.equal(row.user_id, "u1");
});

test("a row written by an older version still loads, with the missing parts empty", () => {
  const canvas = canvasFromRow({
    id: "c9",
    title: "Old",
    state: "learn",
    level: null,
    document: { blocks: [{ id: "b1", type: "paragraph", content: "x" }] },
    active_ms: 0,
    created_at: NOW,
    updated_at: NOW,
  } as never);
  assert.equal(canvas.blocks.length, 1);
  assert.deepEqual(canvas.concepts, []);
  assert.deepEqual(canvas.recall, []);
  assert.deepEqual(canvas.weakConceptIds, []);
});

test("a row whose state is not one we recognise loads as a lesson rather than crashing", () => {
  const canvas = canvasFromRow({
    id: "c9", title: "T", state: "nonsense", level: "made_up",
    document: {}, active_ms: 0, created_at: NOW, updated_at: NOW,
  } as never);
  assert.equal(canvas.state, "learn");
  assert.equal(canvas.level, null);
});

test("a document column that is not an object does not take the page down", () => {
  const canvas = canvasFromRow({
    id: "c9", title: "T", state: "learn", level: null,
    document: "corrupted", active_ms: 0, created_at: NOW, updated_at: NOW,
  } as never);
  assert.deepEqual(canvas.blocks, []);
});

// -------------------------------------------------- recognising a missing table

test("a missing table is recognised from the PostgREST code", () => {
  assert.equal(isMissingTableError({ code: "PGRST205", message: "" }), true);
});

test("a missing table is recognised from the Postgres undefined-table code", () => {
  assert.equal(isMissingTableError({ code: "42P01", message: "" }), true);
});

test("a missing table is recognised from the message when no code is given", () => {
  assert.equal(
    isMissingTableError({ message: "Could not find the table 'public.learning_canvases' in the schema cache" }),
    true,
  );
});

test("a permission error is NOT mistaken for a missing table", () => {
  // Falling back to the browser on a real auth failure would hide a genuine bug.
  assert.equal(isMissingTableError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingTableError(null), false);
});

// ------------------------------------------------------------ attaching a source

const SOURCE: CanvasSource = {
  id: "s1",
  title: "Lecture.pdf",
  kind: "pdf",
  excerpts: [{ id: "s1:e1", label: null, text: "one" }],
};

test("attaching the first source moves an empty canvas along and names it", () => {
  const after = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), SOURCE);
  assert.equal(after.state, "sources_attached");
  assert.equal(after.sources.length, 1);
  assert.equal(after.title, "Lecture.pdf");
});

test("attaching a second source does not rename a canvas that already has a title", () => {
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), SOURCE);
  const after = mergeSourceIntoCanvas(first, { ...SOURCE, id: "s2", title: "Slides.pptx" });
  assert.equal(after.title, "Lecture.pdf");
  assert.equal(after.sources.length, 2);
});

test("attaching mid-lesson keeps the lesson and the state", () => {
  const learning = { ...sample(), sources: [SOURCE] };
  const after = mergeSourceIntoCanvas(learning, { ...SOURCE, id: "s2", title: "Slides.pptx" });
  assert.equal(after.state, "learn");
  assert.equal(after.blocks.length, 1);
});

test("attaching the same source twice replaces it rather than duplicating it", () => {
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), SOURCE);
  const after = mergeSourceIntoCanvas(first, { ...SOURCE, title: "Lecture (re-read).pdf" });
  assert.equal(after.sources.length, 1);
  assert.equal(after.sources[0]?.title, "Lecture (re-read).pdf");
});

test("attaching never mutates the canvas it was given", () => {
  const before = emptyCanvas("c1", NOW);
  const snapshot = JSON.stringify(before);
  mergeSourceIntoCanvas(before, SOURCE);
  assert.equal(JSON.stringify(before), snapshot);
});

// ------------------------------ the duplicate a REAL caller produces (canvas 186d0749)
//
// 🔴 THE TEST ABOVE — "attaching the same source twice replaces it" — PASSES FOR A REASON
// THAT NEVER HAPPENS IN PRODUCTION. It hands `mergeSourceIntoCanvas` the same `id`, and the
// only caller never does: `use-canvas-session.ts` mints `s${sources.length + 1}`, a fresh
// ordinal on every attach. So the guard below it —
//
//     canvas.sources.findIndex((candidate) => candidate.id === source.id)
//
// — could never fire, and a test asserted the opposite by supplying the one input the caller
// cannot produce. That is a guard calibrated against itself.
//
// Measured in production: canvas `186d0749` holds ONE document three times, as `s2`/`s3`/`s4`.
// The cost is not merely a repeated card. `emptyCoverage(canvas.sources.length)` sizes the
// coverage denominator from this array, and coverage is DISCLOSED TO THE LEARNER — so a
// document attached twice tells a student we understood a smaller fraction of their material
// than we did. A source-accounting error becomes a claim about them.

const DURABLE: CanvasSource = {
  id: "s1",
  title: "Top 300 drugs.pdf",
  kind: "pdf",
  excerpts: [
    { id: "s1:e1", label: null, text: "atenolol" },
    { id: "s1:e2", label: null, text: "losartan" },
  ],
  durability: "durable",
  librarySourceId: "lib-aaa",
};

/** The SAME document, as the caller actually re-offers it: a new ordinal, excerpts re-keyed to it. */
const AGAIN: CanvasSource = {
  ...DURABLE,
  id: "s2",
  excerpts: [
    { id: "s2:e1", label: null, text: "atenolol" },
    { id: "s2:e2", label: null, text: "losartan" },
  ],
};

test("🔴 one document attached twice is ONE source, not two", () => {
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), DURABLE);
  const after = mergeSourceIntoCanvas(first, AGAIN);
  assert.equal(after.sources.length, 1, "the same library row must not occupy two slots");
  assert.equal(after.sources[0]?.librarySourceId, "lib-aaa");
});

test("🔴 ...and every citation into it still resolves — the half that costs a learner", () => {
  // 🔴 DEDUPING AND ORPHANING AN ANCHOR WOULD PASS THE TEST ABOVE. The canvas-local id is what
  // `quotedExcerpt` matches, so a merge that keeps the INCOMING entry silently invalidates every
  // citation already written against the surviving one. The merge must keep the id the existing
  // anchors use and re-key the arriving excerpts onto it.
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), DURABLE);
  const cited: SourceRef = { sourceId: "s1", excerptId: "s1:e2" };
  assert.ok(quotedExcerpt(first.sources, cited), "precondition: the citation resolves before the merge");

  const after = mergeSourceIntoCanvas(first, AGAIN);

  // 🔴 THE PRECONDITION IS PART OF THE TEST, NOT SCENERY. Without it every assertion below
  // passes on the UNFIXED code — the duplicate is simply appended, so the original `s1` sits
  // untouched at index 0 and its anchors resolve perfectly. A test that cannot fail before the
  // fix cannot witness the fix. With it, this also fails on the plausible WRONG fix: replacing
  // the existing entry with the arriving one dedupes correctly and orphans every anchor.
  assert.equal(after.sources.length, 1, "precondition: the duplicate was actually merged");

  const resolved = quotedExcerpt(after.sources, cited);
  assert.ok(resolved, "a citation written before the duplicate arrived must still resolve");
  assert.equal(resolved.excerpt.text, "losartan", "and it must resolve to the SAME text, not a neighbour");
  assert.equal(after.sources[0]?.id, "s1", "the surviving source keeps the id anchors already point at");
  assert.ok(
    after.sources[0]?.excerpts.every((e) => e.id.startsWith("s1:")),
    "arriving excerpts are re-keyed onto the surviving id",
  );
});

test("a re-attach still REFRESHES what we know about the document", () => {
  // Deduping must not mean ignoring. A second read that recovered more is the better record.
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), { ...DURABLE, parseQuality: "degraded" });
  const after = mergeSourceIntoCanvas(first, { ...AGAIN, parseQuality: "full" });
  assert.equal(after.sources[0]?.parseQuality, "full");
});

test("🔴 a re-attach whose parse CHANGED never re-points an existing citation at other text", () => {
  // 🔴 THE HAZARD IN THE OBVIOUS FIX. Re-keying arriving excerpts by position onto the surviving
  // id is sound only while the two lists agree. If the stored parse changed between attaches —
  // different boundaries, a recovered table, a page that finally read — then `s1:e2` would still
  // RESOLVE and would resolve to different words. A dangling citation is visible and fixable; a
  // silently redirected one is a false claim about what the source says.
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), DURABLE);
  const reparsed: CanvasSource = {
    ...AGAIN,
    excerpts: [
      { id: "s2:e1", label: null, text: "atenolol" },
      { id: "s2:e2", label: null, text: "SOMETHING ELSE ENTIRELY" },
    ],
  };
  const after = mergeSourceIntoCanvas(first, reparsed);

  assert.equal(after.sources.length, 1);
  const resolved = quotedExcerpt(after.sources, { sourceId: "s1", excerptId: "s1:e2" });
  assert.equal(resolved?.excerpt.text, "losartan", "the cited text must survive a divergent re-read");
});

test("an entry with nothing cited against it DOES take the arriving text", () => {
  // Nothing can point at an empty excerpt list, so there is nothing to protect and the arriving
  // text is strictly better. The re-key must land on the surviving id, not the arriving one.
  const bare = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), { ...DURABLE, excerpts: [] });
  const after = mergeSourceIntoCanvas(bare, AGAIN);
  assert.equal(after.sources.length, 1);
  assert.deepEqual(
    after.sources[0]?.excerpts.map((e) => e.id),
    ["s1:e1", "s1:e2"],
  );
  assert.ok(quotedExcerpt(after.sources, { sourceId: "s1", excerptId: "s1:e1" }));
});

test("🔴 two DIFFERENT documents are never merged", () => {
  // Calibration in the other direction: a fix that over-merges would delete a learner's material.
  const first = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), DURABLE);
  const other = { ...DURABLE, id: "s2", title: "Syllabus.pdf", librarySourceId: "lib-bbb" };
  assert.equal(mergeSourceIntoCanvas(first, other).sources.length, 2);
});

test("🔴 two ephemeral sources stay separate — absent is UNKNOWN, never 'the same thing'", () => {
  // Neither has a library row, so nothing identifies them as one document. Collapsing them on
  // shared absence would silently drop a file the learner attached.
  const a: CanvasSource = { id: "s1", title: "Notes A.md", kind: "text", excerpts: [], durability: "ephemeral" };
  const b: CanvasSource = { id: "s2", title: "Notes B.md", kind: "text", excerpts: [], durability: "ephemeral" };
  const after = mergeSourceIntoCanvas(mergeSourceIntoCanvas(emptyCanvas("c1", NOW), a), b);
  assert.equal(after.sources.length, 2);
});

// ------------------------------------------- shape changes and stored canvases

test("a canvas saved before free response existed still loads", () => {
  // 🔴 The regression this guards: `responses` did not exist when these documents were written,
  // and the test stage calls .find on it. Without a default here the page throws on a canvas
  // the learner made last week.
  const canvas = canvasFromRow({
    id: "c1",
    title: "Old canvas",
    state: "test",
    level: "basics_known",
    document: {
      questions: [{ id: "q1", q: "?", options: ["a", "b"], answer: 0, why: "", conceptId: "k1" }],
      answers: [{ questionId: "q1", picked: 0, correct: true }],
    },
    active_ms: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  });
  assert.deepEqual(canvas.responses, []);
  assert.equal(canvas.questions[0]?.format, "choice", "a question with no format was multiple choice");
});

test("free responses survive a round trip to the row and back", () => {
  // canvasToRow lists the document's fields by hand, so a new field is persisted only if
  // someone added a line for it. This is the test that notices when nobody did.
  const canvas: LearningCanvas = {
    ...emptyCanvas("c1", "2026-08-10T00:00:00.000Z"),
    concepts: [{ id: "k1", label: "A concept" }],
    responses: [
      {
        questionId: "q1",
        text: "what the learner actually said",
        via: "spoken",
        evaluation: {
          verdict: "partial",
          confidence: 0.6,
          demonstrated: ["a"],
          missing: ["b"],
          misconceptions: [],
          feedback: "Add b.",
        },
      },
    ],
  };
  const row = canvasToRow(canvas, "user-1") as { document: Record<string, unknown> };
  const back = canvasFromRow({
    id: "c1",
    title: "",
    state: "test",
    level: null,
    document: row.document,
    active_ms: 0,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(back.responses[0]?.text, "what the learner actually said");
  assert.equal(back.responses[0]?.evaluation?.verdict, "partial");
});

test("a stored judgement that no longer holds up is dropped on read", () => {
  // It was checked when written, but a document also round-trips through localStorage, which
  // anyone can edit. An unverifiable verdict must not reach the diagnosis.
  const back = canvasFromRow({
    id: "c1",
    title: "",
    state: "test",
    level: null,
    document: {
      concepts: [{ id: "k1", label: "A concept" }],
      responses: [
        { questionId: "q1", text: "…", via: "typed", evaluation: { verdict: "brilliant", feedback: "x" } },
      ],
    },
    active_ms: 0,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(back.responses[0]?.evaluation, undefined);
  assert.equal(back.responses[0]?.text, "…", "the learner's own words are kept either way");
});

test("evidence carries its own objective and time, so it survives the question that produced it", () => {
  // 🔴 The migration hazard this guards. `responses` is keyed by questionId, and questions are
  // replaced wholesale on every new round — so an evidence record that can only name its
  // objective by joining to `questions` becomes a dangling id the moment the round turns over.
  // Both fields are captured at write time because neither can be reconstructed afterwards at
  // any price, and the eventual LearningEvent/Evidence shape needs exactly these two.
  const canvas: LearningCanvas = {
    ...emptyCanvas("c1", "2026-08-10T00:00:00.000Z"),
    concepts: [{ id: "k1", label: "A concept" }],
    // Note: no `questions` at all. The evidence still knows what it is about.
    responses: [
      {
        questionId: "q_gone",
        objectiveIds: ["k1"],
        at: "2026-08-10T09:30:00.000Z",
        text: "what they said",
        via: "spoken",
      },
    ],
    recallResults: [
      { cardId: "r_gone", conceptId: "k1", at: "2026-08-10T09:31:00.000Z", grade: "good" },
    ],
  };
  const row = canvasToRow(canvas, "user-1") as { document: Record<string, unknown> };
  const back = canvasFromRow({
    id: "c1",
    title: "",
    state: "test",
    level: null,
    document: row.document,
    active_ms: 0,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  });
  assert.deepEqual(back.responses[0]?.objectiveIds, ["k1"]);
  assert.equal(back.responses[0]?.at, "2026-08-10T09:30:00.000Z");
  assert.equal(back.recallResults[0]?.at, "2026-08-10T09:31:00.000Z");
});

test("evidence written before we captured time is honestly undated, not backfilled", () => {
  const back = canvasFromRow({
    id: "c1",
    title: "",
    state: "test",
    level: null,
    document: { responses: [{ questionId: "q1", text: "…", via: "typed" }] },
    active_ms: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(back.responses[0]?.at, undefined);
  assert.equal(back.responses[0]?.objectiveIds, undefined);
});

// ── the open reads what it uses, and nothing else, 2026-09-02 ───────────────────────────────────

test("🔴 loading a canvas selects exactly the columns `canvasFromRow` reads", () => {
  // `loadCanvas` used `select("*")`, so every open of every canvas also fetched `territory` — the
  // serialised knowledge territory — and discarded it, because `CanvasRow` does not declare that
  // column and `canvasFromRow` never touches it. Measured on production 2026-09-02 against the
  // largest saved canvas: `select=*` returned 1391 KB of JSON in a median 685 ms; the same read
  // without the territory returned 1375 KB in 528 ms.
  //
  // 🔴 THE ASSERTION IS "THE TWO LISTS AGREE", NOT "THE STRING IS THIS". A column added to
  // `CanvasRow` and forgotten in the select comes back `undefined`, and every normaliser in this
  // file tolerates a missing field — so the failure is silent data loss, exactly the shape the
  // `events` and `moments` comments in `canvasFromRow` already record. Comparing the two by name
  // is what makes forgetting one a red test rather than a quiet bug.
  const source = readFileSync(new URL("./canvas-store.ts", import.meta.url), "utf8");
  const columns = /const CANVAS_COLUMNS = "([^"]+)";/.exec(source)?.[1];
  assert.ok(columns, "CANVAS_COLUMNS is gone — the open is selecting something this test cannot see");

  const declared = /export interface CanvasRow \{([\s\S]*?)\n\}/.exec(source)?.[1];
  assert.ok(declared, "CanvasRow is gone or reshaped");
  const fields = [...declared.matchAll(/^\s{2}([a-z_]+)[?]?:/gm)].map((m) => m[1]).sort();

  assert.deepEqual(columns.split(",").sort(), fields, "the select and CanvasRow disagree about the columns a canvas is made of");
  assert.match(source, /\.select\(CANVAS_COLUMNS\)/, "loadCanvas is not using the narrow column list");
  assert.ok(!/\.select\("\*"\)/.test(source), "a select(\"*\") is back: it ships the territory jsonb on every canvas open");
});
