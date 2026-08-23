import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_PLAYBACK_RATE,
  formatClock,
  nextPlaybackRate,
  PLAYBACK_RATES,
  progressFraction,
  readPlaybackRate,
  scrubTarget,
  SEEK_STEP_SECONDS,
  seekTarget,
  writePlaybackRate,
} from "./playback";

// ── Moving through audio that already exists ─────────────────────────────────────────────────
//
// Owner, 2026-08-22: *"Changing playback speed should not regenerate the audio."*

test("🔴🔴 the speed control is playback, not synthesis — nothing here can reach a provider", () => {
  // Calibration: import anything that fetches into playback.ts and this reddens.
  const SOURCE = readFileSync(new URL("./playback.ts", import.meta.url), "utf8");
  assert.ok(!/fetch\(|import .*tts-request|supabase/.test(SOURCE), "the playback module can reach the network");
});

test("🔴 the rates are the ones the reference offers, and they go below 1 now", () => {
  // Owner: *"0.75× / 1× / 1.25× / 1.5× / 2×"*. Under-1 was refused while this was a SYNTHESIS rate
  // — a synthesiser slowed down teaches a rhythm nobody speaks — and that argument does not apply
  // to a listener slowing a recording. Calibration: drop 0.75 and this reddens.
  assert.deepEqual([...PLAYBACK_RATES], [0.75, 1, 1.25, 1.5, 2]);
  assert.equal(DEFAULT_PLAYBACK_RATE, 1);
});

test("🔴 the cycle wraps, so the control is never a dead end", () => {
  let at = DEFAULT_PLAYBACK_RATE;
  const seen = new Set<number>();
  for (let i = 0; i < PLAYBACK_RATES.length; i += 1) { seen.add(at); at = nextPlaybackRate(at); }
  assert.equal(seen.size, PLAYBACK_RATES.length, "the cycle does not visit every rate");
  assert.equal(at, DEFAULT_PLAYBACK_RATE, "the cycle does not return to where it started");
});

test("🔴 the stored rate survives, and an edited one falls back rather than being trusted", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  writePlaybackRate(storage, 1.5);
  assert.equal(readPlaybackRate(storage), 1.5);
  // A hand-edited "4" would otherwise play every answer at quadruple speed with nothing to say why.
  assert.equal(readPlaybackRate({ getItem: () => "4" }), DEFAULT_PLAYBACK_RATE);
  assert.equal(readPlaybackRate({ getItem: () => "nonsense" }), DEFAULT_PLAYBACK_RATE);
  assert.equal(readPlaybackRate(null), DEFAULT_PLAYBACK_RATE);
});

test("🔴🔴 the old reading-speed key is reused, so nobody's setting was reset by the move", () => {
  // Its stored values were 1, 1.5 and 2 — every one still a rate on this list. A new key would have
  // silently put everybody back to 1 in exchange for nothing.
  const SOURCE = readFileSync(new URL("./playback.ts", import.meta.url), "utf8");
  assert.match(SOURCE, /PLAYBACK_RATE_KEY = "nemesis\.canvas\.voice-speed\.v1"/);
});

test("🔴 the jump is ten seconds, which is what the reference actually uses", () => {
  assert.equal(SEEK_STEP_SECONDS, 10);
});

test("🔴🔴 a seek is clamped to what can actually be PLAYED, not to the eventual duration", () => {
  // While bytes are still arriving, seeking past what has arrived stalls the element rather than
  // waiting for it. `reach` is however much is playable right now.
  assert.equal(seekTarget(5, 10, 12), 12, "a forward jump ran past the buffered edge");
  assert.equal(seekTarget(4, -10, 60), 0, "a rewind ran off the front");
  assert.equal(seekTarget(30, 10, 0), 0, "a seek with nothing buffered went somewhere");
  assert.equal(seekTarget(Number.NaN, 10, 60), 0);
});

test("scrubbing lands where the bar was pressed, clamped the same way", () => {
  assert.equal(scrubTarget(0.5, 60), 30);
  assert.equal(scrubTarget(2, 60), 60);
  assert.equal(scrubTarget(-1, 60), 0);
  assert.equal(scrubTarget(0.5, 0), 0);
});

test("🔴 progress is 0 while nothing is known, so a bar never renders as full by accident", () => {
  assert.equal(progressFraction(0, 0), 0);
  assert.equal(progressFraction(10, Number.POSITIVE_INFINITY), 0);
  assert.equal(progressFraction(30, 60), 0.5);
  assert.equal(progressFraction(90, 60), 1);
});

test("🔴 an unknown length prints a dash, never 0:00", () => {
  // `0:00` on a clip that is still arriving says "this is empty", which is the one thing it is not.
  assert.equal(formatClock(Number.NaN), "–:––");
  assert.equal(formatClock(-1), "–:––");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(9), "0:09");
  assert.equal(formatClock(75), "1:15");
  assert.equal(formatClock(605), "10:05");
});
