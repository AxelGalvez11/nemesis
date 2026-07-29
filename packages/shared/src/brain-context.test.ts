import assert from "node:assert/strict";
import test from "node:test";

import {
  brainContextFrom,
  formatBrainContext,
  shouldRecallBrain,
} from "./brain-context.ts";

test("brain context parser drops malformed rows", () => {
  const context = brainContextFrom({
    events: [{ date: "2026-08-01", id: "e", title: "Exam" }, { id: "bad" }],
    notes: [
      {
        content: "ATP synthase",
        document_id: "n",
        path: "Bio/ATP.md",
        similarity: 0.9,
        title: "ATP",
      },
      { content: "", document_id: "bad", path: "" },
    ],
  });
  assert.equal(context?.notes.length, 1);
  assert.equal(context?.events.length, 1);
});

test("formatter includes all three second-brain surfaces and fences note text", () => {
  const context = brainContextFrom({
    connections: [{
      id: "l",
      relation: "prerequisite_of",
      source_document_id: "n",
      target_document_id: "m",
      target_ref: "Mitochondria",
    }],
    events: [{ date: "2026-08-01", id: "e", title: "Biochem exam" }],
    linkedNotes: [{
      content: "Membrane potential",
      id: "m",
      path: "Bio/Mitochondria.md",
      title: "Mitochondria",
    }],
    notes: [{
      content: "ATP synthase",
      document_id: "n",
      path: "Bio/ATP.md",
      similarity: 0.9,
      title: "ATP",
    }],
    weakCards: [{ front: "Complex IV?", id: "c", lapses: 3 }],
  });
  const text = formatBrainContext(context);
  assert.match(text, /Semantically matching Library notes/);
  assert.match(text, /Upcoming Calendar events/);
  assert.match(text, /repeated misses/);
  assert.match(text, /<<<NEMESIS-SOURCE-MATERIAL>>>/);
  assert.match(text, /prerequisite_of/);
});

test("brain recall skips acknowledgements but searches substantive prompts", () => {
  assert.equal(shouldRecallBrain("thanks!"), false);
  assert.equal(shouldRecallBrain("What am I weakest on before Friday?"), true);
});

