// 🔴 THREE TESTS WERE REMOVED HERE, AND WHAT THEY PINNED WENT WITH THEM. One asserted that web
// advertised the canonical cross-client set — 39 tools spanning Library-as-files and Study, both
// surfaces the product no longer has. One pinned the two study-creation lanes. One pinned that the
// recording tools explained why `search_library` could not find a transcript, which mattered when a
// student was told their transcript "appears to have been lost"; a Canvas recording becomes a
// canvas source directly now and never reaches the table those tools read.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mergeLibraryHits } from "./library-search-merge";
import { AGENT_TOOL_NAMES, AGENT_TOOLS } from "./agent-tools";

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
// A recording's transcript is not, and has never been, a Library note. Whenever
// that stops being obvious from the schema text, the model goes back to
// searching the Library for one and concluding it is gone.
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
