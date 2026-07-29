import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeLibraryHits } from "./library-search-merge";
import { AGENT_TOOL_NAMES, AGENT_TOOLS } from "./agent-tools";

test("web advertises the canonical cross-client workspace tool set", () => {
  assert.deepEqual(
    AGENT_TOOLS.map((tool) => tool.function.name).sort(),
    [...AGENT_TOOL_NAMES].sort(),
  );
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
