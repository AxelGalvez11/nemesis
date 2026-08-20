import assert from "node:assert/strict";
import test from "node:test";

import {
  EXAM_RULES_PLACEHOLDER,
  toolDescription,
  WEB_WORKSPACE_AGENT_TOOL_NAMES,
  WORKSPACE_AGENT_TOOL_NAMES,
  WORKSPACE_TOOL_DESCRIPTIONS,
} from "./workspace-agent-tools.ts";

// ── 🔴 the steering is the prompt, so it cannot live in two files ────────────
//
// The names in this module have always been shared, under a comment promising that "the advertised
// capability set must remain identical". The DESCRIPTIONS were not, and 17 of the 25 shared tools
// had drifted — each side missing rules the other had. These hold the merge.

test("the phone's catalog is a subset of the web's, and both are named here", () => {
  for (const name of WORKSPACE_AGENT_TOOL_NAMES) {
    assert.ok(
      (WEB_WORKSPACE_AGENT_TOOL_NAMES as readonly string[]).includes(name),
      `${name} is a cross-platform tool the web no longer advertises`,
    );
  }
});

test("every advertised tool has steering, and it says something", () => {
  for (const name of WEB_WORKSPACE_AGENT_TOOL_NAMES) {
    const description = WORKSPACE_TOOL_DESCRIPTIONS[name];
    assert.ok(description, `${name} is advertised to the model with no description at all`);
    assert.ok(
      description.trim().length >= 40,
      `${name}'s description is ${description.trim().length} chars — tool_choice is never sent, so this is the only thing telling the model when to reach for it`,
    );
  }
});

test("no description is left holding an unsubstituted placeholder", () => {
  // `toolDescription` is the only way to read one, and it substitutes. A caller that reached into
  // the record directly would ship the literal token to the model.
  const filled = toolDescription("add_practice_test", "WRITE GOOD ITEMS.");
  assert.ok(!filled.includes(EXAM_RULES_PLACEHOLDER), "the exam rules were never substituted");
  assert.match(filled, /WRITE GOOD ITEMS\./);
  // A tool with no placeholder comes back untouched.
  assert.equal(
    toolDescription("search_library", "IGNORED"),
    WORKSPACE_TOOL_DESCRIPTIONS.search_library,
  );
});

// 🔴 THE RULES EACH SIDE USED TO BE MISSING. Named individually rather than diffed, because a diff
// test goes green the moment somebody deletes the rule from both files.
test("the merged descriptions kept what each surface alone had lost", () => {
  // The phone's, which the web lacked: the app re-seats options after saving, so "option B" in an
  // explanation becomes wrong.
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.add_practice_test, /re-seats the options/);
  assert.ok(WORKSPACE_TOOL_DESCRIPTIONS.add_practice_test.includes(EXAM_RULES_PLACEHOLDER));
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.add_flashcards, /minimum-information principle/);
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_study_decks, /NEVER show the 'Folder::Deck' form/);
  // The web's, which the phone lacked.
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events, /start_date\/end_date/);
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events, /recurring/);
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.create_library_note, /\?source=/);
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.create_library_note, /DETAILED notes/);
});

// A surface noun is the one difference that is genuinely per-platform. Baking one in here would
// have the phone telling a student to look at a "page" it does not have.
test("no description names a surface only one of the two apps has", () => {
  for (const name of WEB_WORKSPACE_AGENT_TOOL_NAMES) {
    assert.doesNotMatch(
      WORKSPACE_TOOL_DESCRIPTIONS[name],
      /\b(?:Study screen|Calendar tab|Library tab)\b/,
      `${name} names a surface the other app does not have`,
    );
  }
});
