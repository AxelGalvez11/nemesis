import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FAINT_AFTER_MS,
  initialMicHealth,
  micHealthMessage,
  type MicHealthState,
  SILENT_AFTER_MS,
  stepMicHealth,
} from "./mic-health.ts";

/** Feed a run of identical readings, one per `stepMs`, starting at `from`. */
function feed(state: MicHealthState, level: number, forMs: number, from = 0, stepMs = 250): MicHealthState {
  let next = state;
  for (let t = stepMs; t <= forMs; t += stepMs) next = stepMicHealth(next, level, from + t);
  return next;
}

Deno.test("assumes it can hear before any audio has arrived", () => {
  assertEquals(initialMicHealth().health, "hearing");
});

Deno.test("real speech reads as hearing", () => {
  assertEquals(stepMicHealth(initialMicHealth(), 0.6, 1_000).health, "hearing");
});

// THE ONE THAT MATTERS. A pause between sentences must not trip the warning —
// this is the difference between a useful indicator and one the student learns
// to ignore.
Deno.test("a natural pause shorter than the grace window says nothing", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  const paused = feed(talking, 0, SILENT_AFTER_MS - 500, 0);
  assertEquals(paused.health, "hearing");
});

Deno.test("sustained silence eventually warns", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  const quiet = feed(talking, 0, SILENT_AFTER_MS + 500, 0);
  assertEquals(quiet.health, "silent");
});

Deno.test("audible but weak reads as faint, not silent", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  // Above the silence ceiling, below the speech floor — someone far away.
  const weak = feed(talking, 0.1, FAINT_AFTER_MS + 500, 0);
  assertEquals(weak.health, "faint");
});

// Faint must outlast the silence deadline without being called silence: the two
// have different advice, and telling a student their phone is muted when it is
// merely far away sends them to the wrong fix.
Deno.test("weak audio is never reported as silence", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  const weak = feed(talking, 0.1, SILENT_AFTER_MS + 1_000, 0);
  assertEquals(weak.health, "hearing", "still inside the faint grace window");
  const longer = feed(weak, 0.1, FAINT_AFTER_MS + 1_000, 0);
  assertEquals(longer.health, "faint");
});

// Recovery is instant and unconditional — a warning that lingers after we can
// hear again is simply false.
Deno.test("one real sample clears a warning immediately", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  const silent = feed(talking, 0, SILENT_AFTER_MS + 500, 0);
  assertEquals(silent.health, "silent");
  const recovered = stepMicHealth(silent, 0.6, SILENT_AFTER_MS + 750);
  assertEquals(recovered.health, "hearing");
  assertEquals(recovered.belowSince, null, "the quiet spell is forgotten, not paused");
});

// A second pause after recovering must serve the FULL grace window again, not
// resume a part-spent one.
Deno.test("the grace window restarts after recovery", () => {
  let state = stepMicHealth(initialMicHealth(), 0.7, 0);
  state = feed(state, 0, SILENT_AFTER_MS + 500, 0);
  state = stepMicHealth(state, 0.6, 10_000);
  const shortPause = feed(state, 0, SILENT_AFTER_MS - 500, 10_000);
  assertEquals(shortPause.health, "hearing");
});

Deno.test("a garbage reading is treated as silence, never as speech", () => {
  const talking = stepMicHealth(initialMicHealth(), 0.7, 0);
  assertEquals(stepMicHealth(talking, Number.NaN, 100).belowSince, 100);
  // Out-of-range highs clamp to 1 and still count as hearing.
  assertEquals(stepMicHealth(talking, 99, 100).health, "hearing");
});

Deno.test("each state has its own advice, and hearing does not nag", () => {
  assertEquals(micHealthMessage("hearing"), "Listening");
  const silent = micHealthMessage("silent");
  const faint = micHealthMessage("faint");
  assertEquals(silent === faint, false, "the two need different fixes");
  // Faint is the one fixed by moving the phone; silence is not.
  assertEquals(faint.includes("closer"), true);
});
