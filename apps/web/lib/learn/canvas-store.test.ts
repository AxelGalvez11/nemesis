import assert from "node:assert/strict";
import { test } from "node:test";

import { canvasFromRow, canvasToRow, isMissingTableError, mergeSourceIntoCanvas } from "./canvas-store";
import { emptyCanvas, type CanvasSource, type LearningCanvas } from "./canvas-model";

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
  };

  const row = { ...(canvasToRow(before, "u1") as Record<string, unknown>), updated_at: NOW };
  const after = canvasFromRow(row as never);

  assert.deepEqual(after.outputs, before.outputs, "outputs must survive the write");
  assert.deepEqual(after.events, before.events, "events must survive the write");
  // Blocks are serialised whole, so `terms` rides along — asserted so that a future hand-rebuilt
  // block object (which is how `{content, title}` dropped new fields once already) fails here.
  assert.deepEqual(after.blocks[0]?.terms, before.blocks[0]?.terms, "block terms must survive the write");
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
