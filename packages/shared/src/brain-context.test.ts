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
  // A question that IS about the schedule and about weak spots, so every
  // surface is in play at once.
  const text = formatBrainContext(context, "What should I study before my exam?");
  assert.match(text, /Semantically matching Library notes/);
  assert.match(text, /Upcoming Calendar events/);
  assert.match(text, /repeated misses/);
  assert.match(text, /<<<NEMESIS-SOURCE-MATERIAL>>>/);
  assert.match(text, /prerequisite_of/);
});

// 🔴 THE DECOY. Calendar rows and worst-scoring cards used to ride along on
// every single turn, so a request about something the conversation had just
// produced sat next to a list of unrelated deadlines.
const NOISY_CONTEXT = brainContextFrom({
  events: [{ course: "Biochemistry", date: "2026-08-01", id: "e", title: "Biochem exam" }],
  weakCards: [{ front: "Which drug prolongs QT?", id: "c", lapses: 4 }],
});

test("unrelated deadlines and weak cards stay out of an unrelated request", () => {
  const text = formatBrainContext(NOISY_CONTEXT, "Can you make flashcards and a test from this?");
  assert.doesNotMatch(text, /Upcoming Calendar events/);
  assert.doesNotMatch(text, /Study concepts with repeated misses/);
  assert.doesNotMatch(text, /QT/);
  // Nothing survived, so there is no packet at all — not an empty header.
  assert.equal(text, "");
});

test("asking about the schedule brings the calendar back", () => {
  const text = formatBrainContext(NOISY_CONTEXT, "What have I got due next week?");
  assert.match(text, /Upcoming Calendar events/);
  assert.match(text, /Biochem exam/);
  // Still not the weak cards — that was a different question.
  assert.doesNotMatch(text, /Study concepts with repeated misses/);
});

test("asking what to work on brings the weak cards back", () => {
  const text = formatBrainContext(NOISY_CONTEXT, "What am I struggling with most?");
  assert.match(text, /Study concepts with repeated misses/);
  assert.doesNotMatch(text, /Upcoming Calendar events/);
});

test("naming the subject is enough on its own, with no schedule wording", () => {
  // No "due", no "exam", no "study" — just the course name. The row earns its
  // place on shared vocabulary alone.
  const text = formatBrainContext(NOISY_CONTEXT, "Summarise what biochemistry covers");
  assert.match(text, /Biochem exam/);
});

test("the filter reads structure, not any one field's vocabulary", () => {
  // The same rule, three disciplines, no keyword list behind any of them.
  const context = brainContextFrom({
    events: [
      { date: "2026-08-01", id: "a", title: "Torts moot court" },
      { date: "2026-08-02", id: "b", title: "Thermodynamics lab report" },
      { date: "2026-08-03", id: "c", title: "Kiln firing" },
    ],
  });
  assert.match(formatBrainContext(context, "help me prep the moot court"), /Torts moot court/);
  assert.doesNotMatch(formatBrainContext(context, "help me prep the moot court"), /Thermodynamics/);
  assert.match(formatBrainContext(context, "thermodynamics second law"), /Thermodynamics lab report/);
  assert.match(formatBrainContext(context, "what temperature for the kiln firing"), /Kiln firing/);
});

test("a shared filler word is not a match", () => {
  const context = brainContextFrom({
    events: [{ date: "2026-08-01", id: "a", title: "Something about the reading" }],
  });
  // "about" and "the" overlap; neither means the event is relevant.
  assert.equal(formatBrainContext(context, "What about the weather"), "");
});

test("brain recall skips acknowledgements but searches substantive prompts", () => {
  assert.equal(shouldRecallBrain("thanks!"), false);
  assert.equal(shouldRecallBrain("What am I weakest on before Friday?"), true);
});

