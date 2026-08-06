import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mergeLibraryHits } from "./library-search-merge";
import { AGENT_TOOL_NAMES, AGENT_TOOLS } from "./agent-tools";

test("web advertises the canonical cross-client workspace tool set", () => {
  assert.deepEqual(
    AGENT_TOOLS.map((tool) => tool.function.name).sort(),
    [...AGENT_TOOL_NAMES].sort(),
  );
});

// 🔴 AN ADVERTISED TOOL WITH NO EXECUTOR IS WORSE THAN NO TOOL. The model does
// not experience a missing capability as a missing capability — it experiences
// it as missing DATA, and it reports that to the student as loss. A student
// asked for notes from a lecture Nemesis had recorded and transcribed; there was
// no recording tool, so the model searched the Library, where transcripts have
// never lived, and told them the transcript "appears to have been lost". It was
// sitting on chat_recording_artifacts, 34,250 characters of it.
//
// The name list and the schema list already had to agree (above). Nothing made
// either agree with the code that RUNS them, so this reads the dispatch itself.
test("every advertised tool has a case in the dispatch", () => {
  const source = readFileSync(new URL("./agent-tools.ts", import.meta.url), "utf8");
  const missing = AGENT_TOOL_NAMES.filter((name) => !source.includes(`case "${name}":`));
  assert.deepEqual(missing, [], `advertised with no executor: ${missing.join(", ")}`);
});

// 🔴 THE HOP THAT MAKES SOURCE FILING REAL. Where an attached lecture lives is
// resolved once per turn and handed to the study lanes through the dispatch. If
// that argument is ever dropped, nothing fails: the folder simply arrives empty
// and both lanes go back to guessing from the material's own words, which is
// exactly the state that filed one lecture's note under the student's own
// "Pharmacy" and its deck under an invented "Pharmacology" in the same turn.
//
// Read from the source in the same way the dispatch-coverage test above does,
// because these two lines are plumbing: there is no behaviour to observe, only
// a value that is either passed or silently lost.
test("the two study creation lanes are handed the turn's filing signals", () => {
  const source = readFileSync(new URL("./agent-tools.ts", import.meta.url), "utf8");
  for (const name of ["add_flashcards", "add_practice_test"]) {
    const line = source.split("\n").find((row) => row.includes(`case "${name}":`)) ?? "";
    assert.match(line, /\boptions\b/, `${name} no longer receives the turn's filing signals`);
  }
  // And each lane actually READS all three. Passing the object through while
  // quietly dropping one field is the same silent failure by another door:
  // without askText nothing can be vouched, without sourceAttached an unsorted
  // attachment looks like no attachment, without sourceFolder there is nothing
  // to inherit.
  for (const field of ["askText", "modelFolder", "sourceAttached", "sourceFolder"]) {
    const uses = source.split(`${field}:`).length - 1;
    assert.ok(uses >= 2, `only ${uses} of the two study lanes build signals with ${field}`);
  }
});

// A recording's transcript is not, and has never been, a Library note. Whenever
// that stops being obvious from the schema text, the model goes back to
// searching the Library for one and concluding it is gone.
test("the recording tools say plainly that search_library cannot find a transcript", () => {
  const list = AGENT_TOOLS.find((tool) => tool.function.name === "list_recordings");
  assert.ok(list, "list_recordings is missing from AGENT_TOOLS");
  assert.match(list.function.description, /never a Library note/i);
  assert.match(list.function.description, /search_library will never find one/i);
});

// A tool's schema description rides EVERY turn, so it outranks anything the
// reply-side prompt asks for. This one closed with "Tell the student what you
// added and when", and a 51-date syllabus import duly read all 51 dates back
// into chat (owner 2026-07-28: "syllabus and calendar events should not be
// outputted into chat"). Guarding the description, not just the prompt.
test("the calendar tool never asks for the event to be read back", () => {
  const addEvent = AGENT_TOOLS.find((tool) => tool.function.name === "add_calendar_event");
  assert.ok(addEvent, "add_calendar_event is missing from AGENT_TOOLS");
  assert.doesNotMatch(addEvent.function.description, /tell the student what you added/i);
  assert.match(addEvent.function.description, /do not read the event back/i);
});

// The tool's contract under a dead semantic arm: an empty semantic list must
// still yield today's substring results, in today's shape. This is the guarantee
// that shipping semantic search cannot make the agent WORSE at finding notes.
// (searchLibrary itself imports the browser Supabase client, so the invariant is
// asserted here against the pure merge it delegates to.)
test("a dead semantic arm degrades to exactly the lexical results", () => {
  const lexical = [
    { path: "Pharmacology/ACE inhibitors.md", title: "ACE inhibitors", snippet: "block angiotensin" },
    { path: "PHCY 1205/Week 3.md", title: "Week 3", snippet: "renal dosing" },
  ];
  const merged = mergeLibraryHits([], lexical, 30);
  assert.deepEqual(
    merged.map(({ path, snippet, title }) => ({ path, snippet, title })),
    lexical,
  );
});

test("semantic results outrank a lexical-only match", () => {
  const merged = mergeLibraryHits(
    [{ path: "a.md", title: "A", content: "about blood pressure", similarity: 0.71 }],
    [{ path: "z.md", title: "Z", snippet: "literal token" }],
    30,
  );
  assert.deepEqual(merged.map((h) => h.path), ["a.md", "z.md"]);
});
