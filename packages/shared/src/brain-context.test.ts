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

// 🔴 ONE FLAG WHERE THERE WERE TWO KEYWORD LISTS, AND THE TRADE IS DELIBERATE. SCHEDULE_ASK and
// PROGRESS_ASK told the calendar rows and the weak cards apart, so "what's due" got deadlines and
// "what am I weak on" got cards. That precision was real, and it is gone: a turn about the
// student's own workspace now gets both. What it cost was everything the lists could not see —
// they were English-only, and the file's own comment records having to REMOVE "exam", "test" and
// "quiz" from the schedule list because "make me a practice test" then dragged in the whole
// calendar as a decoy. Both sections are capped (8 events, 6 cards), so the worst case for a
// workspace turn is a few extra lines of the student's own data; the worst case for the lists was
// a question phrased in the wrong words getting nothing at all.
test("a turn about their own workspace brings back both halves of it", () => {
  const text = formatBrainContext(NOISY_CONTEXT, "What have I got due next week?", true);
  assert.match(text, /Upcoming Calendar events/);
  assert.match(text, /Biochem exam/);
  assert.match(text, /Study concepts with repeated misses/);
});

test("a turn that is not about their workspace still brings back neither", () => {
  // The decoy this filter exists for: "make flashcards from this recording" used to put a list of
  // unrelated deadlines and someone's worst cards nearest to the request.
  const text = formatBrainContext(NOISY_CONTEXT, "make flashcards from this recording", false);
  assert.doesNotMatch(text, /Upcoming Calendar events/);
  assert.doesNotMatch(text, /Study concepts with repeated misses/);
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

// 🔴 A SUBJECT, NOT A WORD LIST. This used to be a set of twenty-three English acknowledgements,
// which meant "gracias" and "lol ok whatever" each bought a semantic search over the student's
// whole Library. A turn with no subject and nothing to do with their workspace has nothing to look
// up, and the turn's own decision already says both.
test("brain recall needs something to look up", () => {
  assert.equal(shouldRecallBrain({ topic: null, workspaceTurn: false }), false);
  assert.equal(shouldRecallBrain({ topic: "   ", workspaceTurn: false }), false);
  assert.equal(shouldRecallBrain({ topic: "pharmacokinetics", workspaceTurn: false }), true);
  // A workspace turn is worth a lookup even when the model named no subject: "what's due?" is
  // about their data, and the subject is the data itself.
  assert.equal(shouldRecallBrain({ topic: null, workspaceTurn: true }), true);
});

