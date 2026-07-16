// Pure-logic tests for the missions API module. Run: npx tsx --test src/api/missions.test.ts
// (node:test, per the iOS dispatch plan's Global Constraints — NOT the Deno convention
// used by the other apps/mobile/src/api/*.test.ts files. That's a deliberate split:
// these two helpers are pure and RN-free by design, see missions-helpers.ts.)
//
// Imports ONLY from missions-helpers.ts, never missions.ts — missions.ts pulls in
// the supabase client, which throws at module load without EXPO_PUBLIC_SUPABASE_URL
// and imports react-native, which does not parse under plain Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLabel, titleFromPrompt, type Mission, type MissionStatus } from "./missions-helpers";

test("titleFromPrompt: multiline prompt uses the first line, trimmed", () => {
  assert.equal(titleFromPrompt("  Summarize PHCY 1205 slides  \nsecond line\nthird"), "Summarize PHCY 1205 slides");
});

test("titleFromPrompt: a 200-char first line is capped at 80 chars + an ellipsis", () => {
  const longLine = "x".repeat(200);
  const result = titleFromPrompt(longLine);
  assert.equal(result, `${"x".repeat(80)}…`);
  assert.equal(result.length, 81);
});

test("titleFromPrompt: a first line at exactly 80 chars is not truncated", () => {
  const exact = "x".repeat(80);
  assert.equal(titleFromPrompt(exact), exact);
});

test("titleFromPrompt: empty/whitespace-only prompt falls back to 'New mission'", () => {
  assert.equal(titleFromPrompt(""), "New mission");
  assert.equal(titleFromPrompt("   \n   "), "New mission");
});

function mission(status: MissionStatus): Pick<Mission, "status"> {
  return { status };
}

test("statusLabel: queued + desktop online -> 'Queued'", () => {
  assert.equal(statusLabel(mission("queued"), true), "Queued");
});

test("statusLabel: queued + desktop offline -> 'Waiting for your Mac'", () => {
  assert.equal(statusLabel(mission("queued"), false), "Waiting for your Mac");
});

test("statusLabel: claimed -> 'Starting on your Mac' (desktopOnline is irrelevant once claimed)", () => {
  assert.equal(statusLabel(mission("claimed"), true), "Starting on your Mac");
  assert.equal(statusLabel(mission("claimed"), false), "Starting on your Mac");
});

test("statusLabel: running -> 'Running on your Mac'", () => {
  assert.equal(statusLabel(mission("running"), true), "Running on your Mac");
});

test("statusLabel: needs_review -> 'Ready for review'", () => {
  assert.equal(statusLabel(mission("needs_review"), true), "Ready for review");
});

test("statusLabel: done -> 'Done'", () => {
  assert.equal(statusLabel(mission("done"), true), "Done");
});

test("statusLabel: failed -> 'Failed'", () => {
  assert.equal(statusLabel(mission("failed"), true), "Failed");
});

test("statusLabel: cancelled -> 'Cancelled'", () => {
  assert.equal(statusLabel(mission("cancelled"), true), "Cancelled");
});
