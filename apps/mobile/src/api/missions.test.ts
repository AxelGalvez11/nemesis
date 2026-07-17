// Deno unit tests (repo convention) for the missions API's pure helpers.
// Run: deno test --no-check apps/mobile/src/api/missions.test.ts
//
// Imports ONLY from missions-helpers.ts, never missions.ts — missions.ts pulls in
// the supabase client, which throws at module load without EXPO_PUBLIC_SUPABASE_URL
// and imports react-native, which does not parse outside Metro. The helpers are
// dependency-free by design so this file loads clean under Deno, like derive.test.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { statusLabel, titleFromPrompt, type Mission, type MissionStatus } from "./missions-helpers.ts";

Deno.test("titleFromPrompt: multiline prompt uses the first line, trimmed", () => {
  assertEquals(titleFromPrompt("  Summarize PHCY 1205 slides  \nsecond line\nthird"), "Summarize PHCY 1205 slides");
});

Deno.test("titleFromPrompt: a 200-char first line is capped at 80 chars + an ellipsis", () => {
  const longLine = "x".repeat(200);
  const result = titleFromPrompt(longLine);
  assertEquals(result, `${"x".repeat(80)}…`);
  assertEquals(result.length, 81);
});

Deno.test("titleFromPrompt: a first line at exactly 80 chars is not truncated", () => {
  const exact = "x".repeat(80);
  assertEquals(titleFromPrompt(exact), exact);
});

Deno.test("titleFromPrompt: empty/whitespace-only prompt falls back to 'New mission'", () => {
  assertEquals(titleFromPrompt(""), "New mission");
  assertEquals(titleFromPrompt("   \n   "), "New mission");
});

function mission(status: MissionStatus): Pick<Mission, "status"> {
  return { status };
}

Deno.test("statusLabel: queued + desktop online -> 'Queued'", () => {
  assertEquals(statusLabel(mission("queued"), true), "Queued");
});

Deno.test("statusLabel: queued + desktop offline -> 'Waiting for your Mac'", () => {
  assertEquals(statusLabel(mission("queued"), false), "Waiting for your Mac");
});

Deno.test("statusLabel: claimed -> 'Starting on your Mac' (desktopOnline is irrelevant once claimed)", () => {
  assertEquals(statusLabel(mission("claimed"), true), "Starting on your Mac");
  assertEquals(statusLabel(mission("claimed"), false), "Starting on your Mac");
});

Deno.test("statusLabel: running -> 'Running on your Mac'", () => {
  assertEquals(statusLabel(mission("running"), true), "Running on your Mac");
});

Deno.test("statusLabel: needs_review -> 'Ready for review'", () => {
  assertEquals(statusLabel(mission("needs_review"), true), "Ready for review");
});

Deno.test("statusLabel: done -> 'Done'", () => {
  assertEquals(statusLabel(mission("done"), true), "Done");
});

Deno.test("statusLabel: failed -> 'Failed'", () => {
  assertEquals(statusLabel(mission("failed"), true), "Failed");
});

Deno.test("statusLabel: cancelled -> 'Cancelled'", () => {
  assertEquals(statusLabel(mission("cancelled"), true), "Cancelled");
});
