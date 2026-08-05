import assert from "node:assert/strict";
import { test } from "node:test";

import {
  containsToolMarkup,
  safeStreamPrefix,
  sanitizeAssistantText,
  stripToolMarkup,
  TOOL_MARKUP_FALLBACK,
} from "@/lib/workspace/chat-tool-markup";

/** Copied from what the owner actually saw in production on 2026-08-05, twice:
 *  once for "Clean up my Library" and once for the cross-page test. */
const LEAKED = [
  "< |  | DSML |  | tool_calls> < |  | DSML |  | invoke name=\"search_library\">",
  "< |  | DSML |  | parameter name=\"query\" string=\"true\">Beta Blockers</ |  | DSML |  | parameter>",
  "</ |  | DSML |  | invoke> </ |  | DSML |  | tool_calls>",
].join(" ");

test("the production leak is detected", () => {
  assert.equal(containsToolMarkup(LEAKED), true);
});

test("a whole reply of markup becomes the clean fallback", () => {
  const { contaminated, text } = sanitizeAssistantText(LEAKED);
  assert.equal(contaminated, true);
  assert.equal(text, TOOL_MARKUP_FALLBACK);
  assert.doesNotMatch(text ?? "", /DSML|tool_calls|invoke name=/i);
});

test("mixed prose plus leaked markup keeps the prose and drops the markup", () => {
  const mixed = `I now have a full picture. Let me check the root notes and the cardio folder structure so I know everything I'm working with before reorganizing.\n\n${LEAKED}`;
  const { contaminated, text } = sanitizeAssistantText(mixed);
  assert.equal(contaminated, true);
  assert.match(text ?? "", /I now have a full picture/);
  assert.doesNotMatch(text ?? "", /DSML|tool_calls|invoke name=|parameter name=/i);
  assert.match(text ?? "", /ran out of steps/);
});

test("an ordinary answer is passed through untouched", () => {
  const clean = "Nothing is on the calendar for today, August 5. Your next events are on August 11.";
  const { contaminated, text } = sanitizeAssistantText(clean);
  assert.equal(contaminated, false);
  assert.equal(text, clean);
});

test("prose that merely contains a less-than sign survives", () => {
  const clean = "Anything under 20 mg is a low dose, so 15 < 20 counts.";
  assert.equal(containsToolMarkup(clean), false);
  assert.equal(sanitizeAssistantText(clean).text, clean);
});

test("each marker the owner named is cut on its own", () => {
  for (const marker of ["<|begin|>", "DSML", "tool_calls", "invoke name=\"x\"", "parameter name=\"q\""]) {
    const stripped = stripToolMarkup(`Real answer here. ${marker} rest`);
    assert.equal(stripped, "Real answer here. ", `expected ${marker} to be cut`);
  }
});

test("nothing is painted while a marker is still arriving token by token", () => {
  // The student watches the answer stream in, so the completed string is too
  // late — this is the frame-by-frame version of the production leak.
  const frames = ["Let me check", "Let me check.", "Let me check. <", "Let me check. < |", "Let me check. < |  | DSML |  | tool_calls>"];
  for (const frame of frames) {
    assert.doesNotMatch(safeStreamPrefix(frame), /DSML|tool_calls|<\s*\|/i, `leaked while streaming: ${frame}`);
  }
  assert.equal(safeStreamPrefix(frames[frames.length - 1] ?? ""), "Let me check. ");
});

test("streaming never paints text it later has to retract", () => {
  const full = `Here is the plan for Pharmacology. ${LEAKED}`;
  let previous = "";
  for (let cut = 1; cut <= full.length; cut += 1) {
    const shown = safeStreamPrefix(full.slice(0, cut));
    assert.ok(shown.startsWith(previous) || previous.startsWith(shown), "visible text jumped backwards mid-stream");
    if (shown.length > previous.length) previous = shown;
  }
  assert.doesNotMatch(previous, /DSML|tool_calls|invoke name=/i);
});
