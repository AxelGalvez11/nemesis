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

// 🔴 THE EXAM-RULES PLACEHOLDER AND ITS TESTS ARE GONE WITH `add_practice_test`. That tool wrote
// to the Study page, which the product no longer has. `toolDescription` stays because it is the
// only way a catalog reads a description, and a future tool may need substitution again.
test("toolDescription returns a description untouched when there is nothing to substitute", () => {
  assert.equal(
    toolDescription("list_calendar_events", "IGNORED"),
    WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events,
  );
  assert.ok(!WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events.includes(EXAM_RULES_PLACEHOLDER));
});

// 🔴 WHAT THE MERGE SAVED, ON THE TOOLS THAT SURVIVED. The web and the phone each carried their own
// copy of every description and 17 of 25 had drifted. Only the calendar ones are left, and this is
// the rule the phone was missing on the one that matters most.
test("the merged calendar descriptions kept what each surface alone had lost", () => {
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events, /start_date\/end_date/);
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events, /recurring/);
  // The phone said "upcoming", so it never knew it could ask for last month or a whole semester.
  assert.match(WORKSPACE_TOOL_DESCRIPTIONS.list_calendar_events, /past or future/);
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
